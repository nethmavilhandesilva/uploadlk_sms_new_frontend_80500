import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import Select from "react-select";
import Layout from "../Layout/Layout";
import '../../App.css';
import api from "../../api";


const routes = {
    markPrinted: "/sales/mark-printed",
    getLoanAmount: "/get-loan-amount",
    markAllProcessed: "/sales/mark-all-processed",
    givenAmount: "/sales",
    sales: "/sales",
    customers: "/customers",
    items: "/items",
    suppliers: "/suppliers",
    getCustomerGivenAmount: "/sales/customer/given-amount",
    getSalesByBillNo: "/sales/by-bill",
    latestBillNo: "/sales/latest-bill-no",
};

// Hard cap on every API request so a hung network call can never leave the page
// stuck waiting forever during an all-day session.
const API_TIMEOUT_MS = 15000;
// POS submit must fail/recover fast — operators press Enter hundreds of times a day.
const SUBMIT_TIMEOUT_MS = 20000;
// Create/update persist: stay with the request long enough for a busy server.
// A short axios timeout cancelled in-flight POSTs and dropped rows from the DB.
const PERSIST_TIMEOUT_MS = 60000;
const PERSIST_RETRY_MS = 800;
const PENDING_PERSIST_STORAGE_KEY = 'touromni:pendingSalePersists:v1';
// Only ignore key-repeat / accidental double-tap (same physical Enter bounce).
// Must stay short — same item entered twice in a row is a normal POS pattern.
const SUBMIT_DEDUP_MS = 180;
// Only debounce accidental double-F1 taps. Never block a later intentional F1 press.
const PRINT_LOCK_MAX_MS = 400;
// Hard ceiling for "waiting on markPrinted" — after this, F1 must work again.
const PRINT_AWAIT_MAX_MS = 6000;
// Print dialog opens immediately. Background markPrinted waits this long for POSTs to yield real ids.
const PRINT_SAVE_WAIT_MS = 120;
const PRINT_SAVE_POLL_MS = 20;
const MARK_IDS_WAIT_MS = 22000;
const MARK_IDS_POLL_MS = 40;
const MARK_IDS_LEFTOVER_WAIT_MS = 12000;
// Module-level F1 entry so remount gaps never leave F1 unbound mid-day.
let latestSalesEntryF1Handler = null;

// Bill numbers: latest bill_no from sales (or sales_history if sales is empty) + 1.
// Floor 4500 only when both tables have no bill_no yet.
const BILL_NO_FLOOR = 4500;
const BILL_NO_SEQ_KEY = 'touromni:frontendBillSeq:v4500';
const issuedFrontendBillNos = new Set();
let lastFrontendBillNo = 0;
let lastDbBillNo = 0;
let salesNotifyFromSelf = false;
const parseCustomerBillNo = (value) => {
    const n = parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
};
const persistFrontendBillNo = (n) => {
    if (n <= 0) return;
    const value = String(n);
    try { localStorage.setItem(BILL_NO_SEQ_KEY, value); } catch (_) { /* ignore */ }
    try { sessionStorage.setItem(BILL_NO_SEQ_KEY, value); } catch (_) { /* ignore */ }
};
const rememberFrontendBillNo = (value) => {
    const n = parseCustomerBillNo(value);
    if (n <= 0) return;
    issuedFrontendBillNos.add(n);
    if (n > lastFrontendBillNo) {
        lastFrontendBillNo = n;
        persistFrontendBillNo(n);
    }
    if (n > lastDbBillNo) lastDbBillNo = n;
};
const harvestBillNosFromSales = (list) => {
    if (!Array.isArray(list)) return;
    let max = 0;
    for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s) continue;
        const n = Math.max(parseCustomerBillNo(s.bill_no), parseCustomerBillNo(s.customer_bill_no));
        if (n > max) max = n;
    }
    if (max > 0) rememberFrontendBillNo(max);
};
const loadFrontendBillSeq = () => {
    let stored = 0;
    try { stored = Math.max(stored, parseCustomerBillNo(localStorage.getItem(BILL_NO_SEQ_KEY))); } catch (_) { /* ignore */ }
    try { stored = Math.max(stored, parseCustomerBillNo(sessionStorage.getItem(BILL_NO_SEQ_KEY))); } catch (_) { /* ignore */ }
    if (stored > 0) rememberFrontendBillNo(stored);
};
loadFrontendBillSeq();
const allocateNextCustomerBillNo = () => {
    loadFrontendBillSeq();
    const base = Math.max(lastFrontendBillNo, lastDbBillNo, BILL_NO_FLOOR - 1);
    let next = base + 1;
    while (issuedFrontendBillNos.has(next)) next += 1;
    rememberFrontendBillNo(next);
    persistFrontendBillNo(next);
    return String(next);
};
// Cross-tab-safe wrapper. allocateNextCustomerBillNo() above is only safe against
// collisions within ONE browser tab — two calls in the same tab can never overlap
// because JS runs one to completion before the next starts. But if this app is ever
// open in two tabs/windows on the SAME computer at once, both tabs keep their own
// in-memory counter and only see each other's numbers via localStorage, which is not
// atomic: both tabs can read the same "last used" value a fraction of a second apart,
// before either has written its own new number back, and both compute the same "next"
// number. The Web Locks API (supported in all current browsers) lets every tab/window
// of this browser+origin take turns through this function, so that can no longer
// happen — the moment one tab is inside the lock, every other tab's allocation call
// simply waits its turn (near-instant when nothing is contending, so this adds no
// perceptible delay to the normal single-tab "print immediately" flow).
const allocateNextCustomerBillNoAtomic = async () => {
    if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
        try {
            return await navigator.locks.request('touromni:frontendBillNoLock:v1', () => allocateNextCustomerBillNo());
        } catch (_) {
            // Lock API present but failed for some reason (e.g. unsupported context) —
            // fall back to the plain allocator rather than blocking printing entirely.
            return allocateNextCustomerBillNo();
        }
    }
    return allocateNextCustomerBillNo();
};
let latestPrintDialogClosedHandler = null;
let lastPrintDialogClosedAt = 0;
const notifyPrintDialogClosed = () => {
    const now = Date.now();
    if (now - lastPrintDialogClosedAt < 400) return;
    lastPrintDialogClosedAt = now;
    if (typeof latestPrintDialogClosedHandler === 'function') {
        latestPrintDialogClosedHandler();
    }
};
const pruneOldestMapEntries = (map, maxSize) => {
    if (!map || map.size <= maxSize) return;
    const extra = map.size - maxSize;
    const iter = map.keys();
    for (let i = 0; i < extra; i++) {
        const next = iter.next();
        if (next.done) break;
        map.delete(next.value);
    }
};
const pruneAgedMap = (map, maxAgeMs, now = Date.now()) => {
    if (!map || map.size === 0) return;
    map.forEach((value, key) => {
        const at = typeof value === 'number' ? value : Number(value?.at || 0);
        if (!at || now - at > maxAgeMs) map.delete(key);
    });
};
// Sidebar / lock watchdog tick for all-day sessions without refresh.
const POS_WATCHDOG_MS = 5000;
const SIDEBAR_POLL_MS = 700;
// Keep a just-posted unprinted bill on the sidebar until several healthy GETs omit it.
const SIDEBAR_UNPRINTED_HOLD_MS = 60000;
const SIDEBAR_DROP_STREAK = 4;
// Prefer just-submitted local rows over a stale GET for this window.
const RECENT_SALE_TRUST_MS = 8000;
// After F1 print, block these sale ids from reappearing in the middle unprinted table.
const PRINTED_ID_BLOCK_MS = 120000;
const notifySalesDataUpdated = () => {
    salesNotifyFromSelf = true;
    try { localStorage.setItem('salesDataUpdated', String(Date.now())); } catch (_) { /* ignore */ }
    try { window.dispatchEvent(new Event('salesDataUpdated')); } catch (_) { /* ignore */ }
    queueMicrotask(() => { salesNotifyFromSelf = false; });
};
const sameSaleId = (a, b) => a != null && b != null && String(a) === String(b);
const isUnprintedBillStatus = (value) => {
    const status = String(value ?? '').trim().toUpperCase();
    return status === 'N' || status === '' || status === 'NULL' || status === 'UNDEFINED';
};
const extractSalesArray = (payload) => {
    if (!payload) return null;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.sales)) return payload.sales;
    if (Array.isArray(payload.data)) return payload.data;
    const inner = payload.data;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        if (Array.isArray(inner.sales)) return inner.sales;
        if (Array.isArray(inner.data)) return inner.data;
    }
    return null;
};
const toBackendSaleId = (id) => {
    if (id == null) return null;
    const s = String(id).trim();
    if (!s || s.startsWith('tmp-')) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
};
const asMarkApiIds = (ids) => {
    const out = [];
    const seen = new Set();
    (ids || []).forEach((id) => {
        const backend = toBackendSaleId(id);
        if (backend == null) return;
        const key = String(backend);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(backend);
    });
    return out;
};
const isDeletedSaleId = (deletedSet, id) => {
    if (id == null || !deletedSet) return false;
    return deletedSet.has(id) || deletedSet.has(String(id));
};
const isTempOrOptimisticSale = (sale) =>
    !!(sale?._optimistic || String(sale?.id || '').startsWith('tmp-'));
// Collapse tmp + real copies of the same physical line (stops duplicate rows).
const saleContentKey = (s) => {
    if (!s) return '';
    return [
        String(s.customer_code || '').trim().toUpperCase(),
        String(s.supplier_code || '').trim().toUpperCase(),
        String(s.item_code || ''),
        String(parseFloat(s.weight) || 0),
        String(parseFloat(s.packs) || 0),
        String(parseFloat(s.price_per_kg) || 0),
        String(s.bill_no || ''),
    ].join('|');
};
const asSingleSale = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.id == null) return null;
    return value;
};
// POST/PUT often returns { sales: [all rows] }. Using that whole list as "this submit"
// mapped every row onto one temp id and could skip the row that was actually saved.
const pickSaleFromSubmitResponse = (data, { isEditing = false, editingId = null, payload = null, knownIds = null } = {}) => {
    if (!data || typeof data !== 'object') return null;
    const known = knownIds instanceof Set ? knownIds : new Set();
    const isUnknownId = (id) => {
        if (id == null) return false;
        const key = String(id);
        if (!key || key.startsWith('tmp-')) return false;
        return !known.has(key);
    };
    const preferNewest = (rows) => rows.reduce((best, s) => (Number(s.id) > Number(best.id) ? s : best));

    const direct = asSingleSale(data.sale) || asSingleSale(data.data) || (data.id != null && !Array.isArray(data) ? data : null);
    if (direct) {
        if (isEditing && editingId != null && sameSaleId(direct.id, editingId)) return direct;
        if (!isEditing && isUnknownId(direct.id)) return direct;
        if (isEditing) return direct;
    }

    const lists = [];
    if (Array.isArray(data.sales)) lists.push(data.sales);
    if (Array.isArray(data.data)) lists.push(data.data);
    for (let i = 0; i < lists.length; i++) {
        const list = lists[i].filter((s) => s && s.id != null && typeof s === 'object' && !Array.isArray(s));
        if (!list.length) continue;
        if (isEditing && editingId != null) {
            const edited = list.find((s) => sameSaleId(s.id, editingId));
            if (edited) return edited;
        }
        const unknown = list.filter((s) => isUnknownId(s.id));
        if (payload) {
            const unknownMatches = unknown.filter((s) => saleContentKey(s) === saleContentKey(payload));
            if (unknownMatches.length) return preferNewest(unknownMatches);
        }
        if (unknown.length) return preferNewest(unknown);
        // Never map this Enter onto an already-known row from a full sales list.
    }
    return direct && isUnknownId(direct.id) ? direct : null;
};
const isRetryableSubmitError = (error) => {
    if (!error) return false;
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED' || error.name === 'AbortError') return true;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ERR_NETWORK') return true;
    if (/timeout/i.test(String(error.message || ''))) return true;
    const status = Number(error.response?.status) || 0;
    if (status === 408 || status === 409 || status === 429) return true;
    if (status >= 500) return true;
    if (!error.response) return true;
    return false;
};
const readPendingPersistsFromStorage = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(PENDING_PERSIST_STORAGE_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter((job) => job && job.tempId && job.payload) : [];
    } catch (_) {
        return [];
    }
};
const writePendingPersistsToStorage = (jobs) => {
    try {
        const list = (jobs || []).slice(-80).map((job) => ({
            tempId: job.tempId,
            method: job.method || 'post',
            url: job.url || routes.sales,
            payload: job.payload,
            sale: job.sale || null,
            knownIds: Array.isArray(job.knownIds) ? job.knownIds.slice(-400) : [],
            createdAt: job.createdAt || Date.now(),
            attempts: job.attempts || 0,
        }));
        localStorage.setItem(PENDING_PERSIST_STORAGE_KEY, JSON.stringify(list));
    } catch (_) { /* ignore */ }
};
const enteredAtOf = (sale) => {
    if (!sale) return 0;
    if (sale._enteredAt) return Number(sale._enteredAt) || 0;
    const idStr = String(sale.id || '');
    if (idStr.startsWith('tmp-')) {
        const ts = parseInt(idStr.split('-')[1], 10);
        if (!Number.isNaN(ts)) return ts;
    }
    const ts = new Date(sale.created_at || sale.timestamp || sale.date || 0).getTime();
    return Number.isNaN(ts) ? 0 : ts;
};
const withEnteredAt = (sale, fallback) => {
    if (!sale) return sale;
    const fromFallback = fallback && typeof fallback === 'object' ? fallback : null;
    return {
        ...sale,
        _enteredAt: sale._enteredAt || fromFallback?._enteredAt || enteredAtOf(sale) || Date.now(),
        _entrySeq: sale._entrySeq ?? fromFallback?._entrySeq ?? 0,
    };
};

// Hidden iframe printer: opens ONLY the system print dialog (no blank popup window).
const PRINT_FRAME_ID = 'touromni-pos-print-frame';
const getPrintFrame = () => {
    let iframe = document.getElementById(PRINT_FRAME_ID);
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = PRINT_FRAME_ID;
        iframe.setAttribute('title', 'print');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(iframe);
    }
    return iframe;
};
// Opens ONLY the browser/OS print dialog via a hidden iframe — no preview popup/window.
// Recreate the iframe often — reused iframes stop showing the dialog after many all-day prints.
const writeAndPrintBill = (fullHtmlDocument) => {
    const tryPrint = (forceNew) => {
        if (forceNew) {
            const old = document.getElementById(PRINT_FRAME_ID);
            if (old) {
                try { old.remove(); } catch (_) { /* ignore */ }
            }
        }
        const iframe = getPrintFrame();
        const win = iframe?.contentWindow;
        const doc = win?.document;
        if (!win || !doc) return false;
        doc.open();
        doc.write(fullHtmlDocument);
        doc.close();
        try {
            win.removeEventListener('afterprint', notifyPrintDialogClosed);
        } catch (_) { /* ignore */ }
        try {
            win.addEventListener('afterprint', notifyPrintDialogClosed);
        } catch (_) { /* ignore */ }
        win.focus();
        win.print();
        try { window.focus(); } catch (_) { /* ignore */ }
        return true;
    };
    // Reuse the warmed iframe first so F1 is not paying create/destroy cost.
    try {
        if (tryPrint(false)) return true;
    } catch (_) { /* recreate once */ }
    try {
        return tryPrint(true);
    } catch (_) {
        return false;
    }
};
const buildPrintDocumentShell = (title, receiptHtml) =>
    `<!DOCTYPE html><html><head><title>${title}</title><meta charset="utf-8"/>` +
    `<style>html,body{margin:0;padding:0;background:#fff}body{padding:8px}` +
    `@media print{body{padding:0}}</style></head><body>${receiptHtml}</body></html>`;

// Cheap sales-list fingerprint — avoids JSON.stringify of the full array every poll.
const buildSalesSignature = (sales) => {
    if (!Array.isArray(sales) || sales.length === 0) return '0';
    let sig = String(sales.length);
    for (let i = 0; i < sales.length; i++) {
        const s = sales[i];
        if (!s) continue;
        sig += `|${s.id ?? ''}:${s.weight ?? ''}:${s.price_per_kg ?? ''}:${s.packs ?? ''}:${s.bill_printed ?? ''}:${s.given_amount ?? ''}:${s.updated_at ?? s.timestamp ?? ''}`;
    }
    return sig;
};

// Sidebar list identity only — ignore weight/price noise so printed/unprinted lists do not flicker.
const buildSidebarListSignature = (sales) => {
    if (!Array.isArray(sales) || sales.length === 0) return '0';
    const parts = [];
    for (let i = 0; i < sales.length; i++) {
        const s = sales[i];
        if (!s?.id) continue;
        parts.push([
            s.id,
            String(s.customer_code || '').toUpperCase(),
            String(s.bill_printed ?? '').trim().toUpperCase(),
            s.bill_no || s.customer_bill_no || '',
            String(s.credit_transaction ?? ''),
            String(s.given_amount_applied ?? ''),
            String(s.total ?? ''),
        ].join(':'));
    }
    parts.sort();
    return `${parts.length}|${parts.join('|')}`;
};

// Hoisted formatter: creating Intl.NumberFormat per call is expensive inside render loops.
const decimalFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const formatDecimal = (value) => decimalFormatter.format(Number(value || 0));

// Stable function identity whose body always sees the latest render's values.
// Prevents global listeners / memoized children from being torn down on every render.
const useStableCallback = (fn) => {
    const fnRef = useRef(fn);
    fnRef.current = fn;
    return useCallback((...args) => fnRef.current(...args), []);
};

// --- Sub-Components ---

const BreakdownDisplay = React.memo(({ sale, formatDecimal }) => {
    if (!sale?.breakdown_history) return null;
    let history = [];
    try {
        history = typeof sale.breakdown_history === 'string' ? JSON.parse(sale.breakdown_history) : sale.breakdown_history;
    } catch (e) { return null; }
    if (!Array.isArray(history) || history.length < 2) return null;

    return (
        <div className="mt-4 p-3 bg-white rounded-lg border-2 border-blue-500 shadow-sm" style={{ width: '450px', margin: '10px auto' }}>
            <div style={{ maxHeight: '150px' }}>
                <table className="w-full text-xs text-black" style={{ marginTop: "-6px" }}>
                    <thead>
                        <tr className="text-gray-500 border-b">
                            <th className="text-left py-1">(වේලාව)</th>
                            <th className="text-right py-1">(බර)</th>
                            <th className="text-right py-1">(මලු)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((entry, i) => (
                            <tr key={i} className="border-b border-gray-50 last:border-0">
                                <td className="py-1 text-white">{entry.time}</td>
                                <td className="py-1 text-right font-bold text-white">{formatDecimal(entry.weight)} kg</td>
                                <td className="py-1 text-right font-bold text-white">{entry.packs}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-2 pt-1 border-t-2 border-blue-200 text-right font-black text-sm text-black">
                Total: {formatDecimal(sale.weight)}kg / {sale.packs}p
            </div>
        </div>
    );
});

// --- Admin Modal Component (Popup Window) ---
const AdminDataTableModal = React.memo(({ isOpen, onClose, title, sales, type, formatDecimal, billSize = '3inch' }) => {
    if (!isOpen || !sales || sales.length === 0) return null;

    const isFarmer = type === 'farmer';
    const is4Inch = billSize === '4inch';

    // Exact width for thermal preview
    const receiptMaxWidth = is4Inch ? '4in' : '350px';

    // --- REPLICATED FORMATTING LOGIC ---
    // Farmer uses maxDecimals = 3, Customer uses fixed 2 decimals
    const formatNumber = (value) => {
        if (typeof value !== 'number' && typeof value !== 'string') return '0';
        const number = parseFloat(value);
        if (isNaN(number)) return '0';

        if (Number.isInteger(number)) {
            return number.toLocaleString('en-US');
        } else {
            const maxD = isFarmer ? 3 : 2;
            const parts = number.toFixed(maxD).split('.');
            // For farmers, we strip trailing zeros as per your getBillContent logic
            const processedDecimals = isFarmer ? parts[1].replace(/0+$/, '') : parts[1];
            const wholePart = parseInt(parts[0]).toLocaleString('en-US');
            return processedDecimals ? `${wholePart}.${processedDecimals}` : wholePart;
        }
    };

    // --- DATA PROCESSING ---
    const date = isFarmer ? new Date().toLocaleDateString('si-LK') : new Date().toLocaleDateString();
    const time = isFarmer ? new Date().toLocaleTimeString('si-LK') : new Date().toLocaleTimeString();
    const mobile = '0777672838/071437115';
    const displayName = isFarmer ? sales[0].supplier_code : (sales[0].customer_code || "").toUpperCase();
    const billNo = isFarmer ? (sales[0].supplier_bill_no || 'N/A') : (sales[0].bill_no || 'N/A');

    // Consolidated Summary Logic
    const consolidatedSummary = {};
    sales.forEach(s => {
        const itemName = s.item_name || 'Unknown';
        if (!consolidatedSummary[itemName]) consolidatedSummary[itemName] = { totalWeight: 0, totalPacks: 0 };
        consolidatedSummary[itemName].totalWeight += parseFloat(isFarmer ? s.SupplierWeight : s.weight) || 0;
        consolidatedSummary[itemName].totalPacks += parseInt(s.packs) || 0;
    });

    const totalPacksSum = Object.values(consolidatedSummary).reduce((sum, item) => sum + item.totalPacks, 0);

    // Value Calculation logic differs for Farmer vs Customer
    const totalSalesSum = sales.reduce((sum, s) => {
        const w = parseFloat(isFarmer ? s.SupplierWeight : s.weight) || 0;
        const p = parseFloat(isFarmer ? s.SupplierPricePerKg : s.price_per_kg) || 0;
        const total = isFarmer ? (parseFloat(s.SupplierTotal) || (w * p)) : (w * p);
        return sum + total;
    }, 0);

    const totalPackCost = isFarmer ? 0 : sales.reduce((sum, s) => sum + ((parseFloat(s.CustomerPackCost) || 0) * (parseFloat(s.packs) || 0)), 0);
    const finalGrandTotal = totalSalesSum + totalPackCost;

    const givenAmount = !isFarmer ? (sales.find(s => parseFloat(s.given_amount) > 0)?.given_amount || 0) : 0;
    const remaining = givenAmount > 0 ? Math.abs(givenAmount - finalGrandTotal) : 0;

    // Style Constants
    const fontSizeBody = '25px';
    const fontSizeHeader = '23px';
    const fontSizeTotal = '28px';

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', width: '95%', maxWidth: '450px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

                <div style={{ padding: '12px', background: '#111827', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold' }}>බිල්පත් පෙරදසුන ({isFarmer ? 'ගොවියා' : 'පාරිභෝගිකයා'})</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                </div>

                <div style={{ padding: '20px', overflowY: 'auto', backgroundColor: '#e5e7eb', flexGrow: 1 }}>
                    <div style={{ width: receiptMaxWidth, margin: '0 auto', padding: '10px', backgroundColor: 'white', fontFamily: "'Courier New', monospace", color: '#000', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>

                        {/* HEADER SECTION */}
                        <div style={{ textAlign: 'center', fontWeight: 'bold' }}>
                            <div style={{ fontSize: '24px' }}>මංජු සහ සහෝදරයෝ</div>
                            {!isFarmer && <div style={{ fontSize: '20px', marginBottom: '5px' }}>colombage lanka (Pvt) Ltd</div>}

                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', margin: '12px 0' }}>
                                <span style={{ border: '2.5px solid #000', padding: '5px 12px', fontSize: '22px' }}>N66</span>
                                {isFarmer ? (
                                    <div style={{ fontSize: '18px' }}>ගොවියා: <span style={{ border: '2.5px solid #000', padding: '5px 10px', fontSize: '22px' }}>{displayName}</span></div>
                                ) : (
                                    <span style={{ border: '2.5px solid #000', padding: '5px 12px', fontSize: '22px' }}>{displayName}</span>
                                )}
                            </div>

                            <div style={{ fontSize: '16px' }}>{isFarmer ? 'එළවළු තොග වෙළෙන්දෝ බණ්ඩාරවෙල' : 'එළවළු,පළතුරු තොග වෙළෙන්දෝ'}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '6px', padding: '0 5px' }}>
                                <span>බණ්ඩාරවෙල</span>
                                <span>{time}</span>
                            </div>
                        </div>

                        <div style={{ fontSize: '19px', marginTop: '10px', padding: '0 5px' }}>
                            <div style={{ fontWeight: 'bold' }}>දුර: {mobile}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                                <span>බිල් අංකය: {billNo}</span>
                                <span>දිනය: {date}</span>
                            </div>
                        </div>

                        <hr style={{ border: 'none', borderTop: '2.5px solid #000', margin: '10px 0' }} />

                        {/* ITEMS TABLE */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '32%' }} /><col style={{ width: '21%' }} /><col style={{ width: '21%' }} /><col style={{ width: '26%' }} />
                            </colgroup>
                            <thead>
                                <tr style={{ borderBottom: '2.5px solid #000', fontWeight: 'bold' }}>
                                    <th style={{ textAlign: 'left', paddingBottom: '8px', fontSize: fontSizeHeader }}>වර්ගය<br />මලු</th>
                                    <th style={{ textAlign: 'right', paddingBottom: '8px', fontSize: fontSizeHeader, position: 'relative', left: '-50px', top: '24px' }}>කිලෝ</th>
                                    <th style={{ textAlign: 'right', paddingBottom: '8px', fontSize: fontSizeHeader, position: 'relative', left: '-45px', top: '24px' }}>මිල</th>
                                    <th style={{ textAlign: 'right', paddingBottom: '8px', fontSize: fontSizeHeader }}>{isFarmer ? 'කේතය' : 'අයිතිය'}<br />අගය</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map((s, i) => {
                                    const w = parseFloat(isFarmer ? s.SupplierWeight : s.weight) || 0;
                                    const p = parseFloat(isFarmer ? s.SupplierPricePerKg : s.price_per_kg) || 0;
                                    const itemTotal = isFarmer ? (parseFloat(s.SupplierTotal) || (w * p)) : (w * p);
                                    const code = isFarmer ? s.customer_code?.toUpperCase() : s.supplier_code;

                                    return (
                                        <tr key={i} style={{ fontSize: fontSizeBody, fontWeight: 'bold', verticalAlign: 'bottom' }}>
                                            <td style={{ textAlign: 'left', padding: '10px 0', whiteSpace: 'nowrap' }}>
                                                {s.item_name}<br />{formatNumber(parseInt(s.packs))}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '10px 2px', position: 'relative', left: '-70px' }}>
                                                {formatNumber(w)}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '10px 2px', position: 'relative', left: '-65px' }}>
                                                {formatNumber(p)}
                                            </td>
                                            <td style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <div style={{ fontSize: '25px', whiteSpace: 'nowrap' }}>{code}</div>
                                                <div style={{ fontWeight: '900', whiteSpace: 'nowrap' }}>{formatNumber(itemTotal)}</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2.5px solid #000', fontWeight: 'bold' }}>
                                    <td style={{ paddingTop: '12px', fontSize: fontSizeTotal }}>{formatNumber(totalPacksSum)}</td>
                                    <td colSpan="3" style={{ paddingTop: '12px', fontSize: fontSizeTotal }}>
                                        <div style={{ textAlign: 'right', float: 'right', whiteSpace: 'nowrap' }}>{formatNumber(totalSalesSum)}</div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        {/* TOTALS SECTION */}
                        <table style={{ width: '100%', marginTop: '20px', fontWeight: 'bold', fontSize: '22px', padding: '0 5px' }}>
                            {!isFarmer && (
                                <tr>
                                    <td>මලු:</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(totalPackCost)}</td>
                                </tr>
                            )}
                            <tr>
                                <td style={{ fontSize: isFarmer ? '15px' : '20px', paddingTop: '8px', whiteSpace: 'nowrap', position: isFarmer ? 'relative' : 'static', left: isFarmer ? '-15px' : '0' }}>
                                    {isFarmer ? 'මෙම බිලට ගෙවන්න:' : 'එකතුව:'}
                                </td>
                                <td style={{ textAlign: 'right', paddingTop: '8px' }}>
                                    <span style={{ borderBottom: '5px double #000', borderTop: '2px solid #000', fontSize: fontSizeTotal, padding: '5px 10px', paddingLeft: isFarmer ? '25px' : '10px' }}>
                                        {formatNumber(isFarmer ? totalSalesSum : finalGrandTotal)}
                                    </span>
                                </td>
                            </tr>
                            {!isFarmer && givenAmount > 0 && (
                                <>
                                    <tr>
                                        <td style={{ fontSize: '18px', paddingTop: '18px' }}>දුන් මුදල:</td>
                                        <td style={{ textAlign: 'right', fontSize: '20px', paddingTop: '18px', fontWeight: 'bold' }}>{formatNumber(parseFloat(givenAmount))}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ fontSize: '22px' }}>ඉතිරිය:</td>
                                        <td style={{ textAlign: 'right', fontSize: '26px' }}>{formatNumber(remaining)}</td>
                                    </tr>
                                </>
                            )}
                        </table>

                        {/* SUMMARY GRID */}
                        <div style={{ marginTop: '25px', borderTop: '1px dashed #000', paddingTop: '10px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'center' }}>
                                <tbody>
                                    {Object.entries(consolidatedSummary).reduce((rows, key, index) => {
                                        if (index % 2 === 0) rows.push([key]);
                                        else rows[rows.length - 1].push(key);
                                        return rows;
                                    }, []).map((row, i) => (
                                        <tr key={i}>
                                            {row.map(([name, data]) => (
                                                <td key={name} style={{ padding: '6px', width: '50%', fontWeight: 'bold', whiteSpace: 'nowrap', fontSize: '14px' }}>
                                                    {name}:{formatNumber(data.totalWeight)}/{formatNumber(data.totalPacks)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* FOOTER */}
                        <div style={{ textAlign: 'center', marginTop: '25px', fontSize: '13px', borderTop: '2.5px solid #000', paddingTop: '10px' }}>
                            <p style={{ margin: '4px 0', fontWeight: 'bold' }}>භාණ්ඩ පරීක්ෂාකර බලා රැගෙන යන්න</p>
                            <p style={{ margin: '4px 0' }}>නැවත භාර ගනු නොලැබේ</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
const ImagePreviewModal = React.memo(({ isOpen, onClose, data }) => {
    if (!isOpen || !data) return null;

    const baseUrl = "https://goviraju.lk/sms_new_backend_50500/application/public/storage/";

    const formatUrl = (path) => {
        if (!path) return null;
        return path.startsWith('http') ? path : `${baseUrl}${path}`;
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: '#1f2937',
                    borderRadius: '20px',
                    width: '95%',
                    maxWidth: '1000px',
                    maxHeight: '95vh',
                    padding: '25px',
                    position: 'relative',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                    border: '1px solid #4b5563',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Area */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #374151', paddingBottom: '15px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: 0 }}>
                        {data.title} -({data.type === 'customer' ? 'ගනුදෙනුකරු' : 'සැපයුම්කරු'})
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ background: '#374151', border: 'none', color: 'white', width: '35px', height: '35px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}
                    >
                        ✕
                    </button>
                </div>

                {/* Larger Images Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.5fr', gap: '20px', overflowY: 'auto', padding: '5px' }}>
                    {/* Profile Picture */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ color: '#60a5fa', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>ප්‍රධාන රූපය</span>
                        <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '2px solid #3b82f6', backgroundColor: '#111827', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                            {data.profile ? (
                                <img src={data.profile} style={{ width: '100%', height: 'auto', display: 'block' }} alt="Profile" />
                            ) : (
                                <div style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>ඡායාරූපයක් නොමැත</div>
                            )}
                        </div>
                    </div>

                    {/* NIC Front */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>NIC ඉදිරිපස</span>
                        <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '2px solid #4b5563', backgroundColor: '#111827', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                            {data.nic_front ? (
                                <img src={formatUrl(data.nic_front)} style={{ width: '100%', height: 'auto', maxHeight: '500px', display: 'block', objectFit: 'contain' }} alt="NIC Front" />
                            ) : (
                                <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>ඡායාරූපයක් නොමැත</div>
                            )}
                        </div>
                    </div>

                    {/* NIC Back */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>NIC පසුපස</span>
                        <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '2px solid #4b5563', backgroundColor: '#111827', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                            {data.nic_back ? (
                                <img src={formatUrl(data.nic_back)} style={{ width: '100%', height: 'auto', maxHeight: '500px', display: 'block', objectFit: 'contain' }} alt="NIC Back" />
                            ) : (
                                <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>ඡායාරූපයක් නොමැත</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Area */}
                <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #374151', paddingTop: '15px' }}>
                    <button
                        onClick={onClose}
                        style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '12px 30px', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
});
const CustomerList = React.memo(({ type, searchQuery, onSearchChange, selectedPrintedCustomer, selectedUnprintedCustomer, handleCustomerClick, allSales, isCashFilterActive, toggleCashFilter }) => {
    const filteredPrintedGroups = useMemo(() => {
        if (type !== "printed") return [];

        const groups = new Map();
        allSales.forEach((sale) => {
            const printedBillNo = sale.bill_no || sale.customer_bill_no;
            if (String(sale.bill_printed ?? '').trim().toUpperCase() !== 'Y' || !printedBillNo) return;

            if (isCashFilterActive) {
                if (sale.credit_transaction !== 'Y') return;
            } else if (sale.credit_transaction !== 'N') {
                return;
            }

            const groupKey = `${sale.customer_code}-${printedBillNo}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    customerCode: sale.customer_code,
                    billNo: printedBillNo,
                    displayText: sale.customer_code,
                    hasGivenAmountApplied: false,
                    totalAmount: 0,
                    billSales: []
                });
            }

            const group = groups.get(groupKey);
            group.billSales.push(sale);
            group.totalAmount += parseFloat(sale.total) || 0;
            if (sale.given_amount_applied && sale.given_amount_applied.trim() !== '') {
                group.hasGivenAmountApplied = true;
            }
        });

        let groupsArray = Array.from(groups.values());
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            groupsArray = groupsArray.filter(g =>
                g.customerCode.toLowerCase().startsWith(lowerQuery) ||
                String(g.billNo || '').toLowerCase().startsWith(lowerQuery) ||
                g.displayText.toLowerCase().startsWith(lowerQuery)
            );
        }

        return groupsArray.sort((a, b) => (parseInt(b.billNo, 10) || 0) - (parseInt(a.billNo, 10) || 0));
    }, [allSales, type, isCashFilterActive, searchQuery]);

    const filteredUnprintedCustomers = useMemo(() => {
        if (type !== "unprinted") return [];

        const customerMap = new Map();
        allSales.forEach((sale) => {
            const status = String(sale.bill_printed ?? '').trim().toUpperCase();
            if (!(status === 'N' || status === '' || status === 'NULL' || status === 'UNDEFINED')) return;
            if (!sale.customer_code) return;

            const customerCode = sale.customer_code;
            const latestTimestamp = sale.timestamp || sale.created_at || sale.date || sale.id;
            const existing = customerMap.get(customerCode);

            if (!existing || new Date(latestTimestamp) > new Date(existing.latestTimestamp)) {
                customerMap.set(customerCode, {
                    customerCode,
                    latestTimestamp,
                    displayText: customerCode,
                    billSales: []
                });
            }
        });

        allSales.forEach((sale) => {
            const status = String(sale.bill_printed ?? '').trim().toUpperCase();
            if (!(status === 'N' || status === '' || status === 'NULL' || status === 'UNDEFINED')) return;
            if (!sale.customer_code) return;
            const existing = customerMap.get(sale.customer_code);
            if (existing) {
                existing.billSales.push(sale);
            }
        });

        let customersArray = Array.from(customerMap.values());
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            customersArray = customersArray.filter(c => c.customerCode.toLowerCase().startsWith(lower));
        }

        // CHANGE THIS LINE - Sort alphabetically A to Z
        return customersArray.sort((a, b) => a.customerCode.localeCompare(b.customerCode));
    }, [allSales, type, searchQuery]);

    const displayItems = type === "printed" ? filteredPrintedGroups : filteredUnprintedCustomers;
    const isSelected = (item) => type === "printed" ? selectedPrintedCustomer === `${item.customerCode}-${item.billNo}` : selectedUnprintedCustomer === item.customerCode;

    return (
        <div className="w-full shadow-xl rounded-xl overflow-y-auto border border-black" style={{ backgroundColor: "#1ec139ff", maxHeight: "80.5vh", overflowY: "auto" }}>
            <div style={{ backgroundColor: "#006400" }} className="p-1 rounded-t-xl">
                <div className="flex items-center justify-center gap-2 mb-1">
                    <h2 className="font-bold text-white whitespace-nowrap" style={{ fontSize: '14px' }}>
                        {type === "printed" ? "මුද්‍රණය කළ" : "මුද්‍රණය නොකළ"}
                    </h2>

                    {/* Only show the checkbox for the "printed" column */}
                    {type === "printed" && (
                        <div
                            onClick={() => toggleCashFilter()}
                            className="cursor-pointer transition-all border border-white rounded"
                            style={{
                                width: '18px',
                                height: '18px',
                                backgroundColor: isCashFilterActive ? '#2563eb' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginLeft: '90px',
                                marginTop: '-22px',
                            }}
                        >
                            {isCashFilterActive && <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                        </div>
                    )}
                </div>

                <input
                    type="text"
                    placeholder={`සෙවීම ${type === "printed" ? "බිල්පත් අංකය/කේතය..." : "ගනුදෙනු කේතය..."}`}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value.toUpperCase())}
                    className="px-4 py-0.5 border rounded-xl focus:ring-2 focus:ring-blue-300 uppercase block mx-auto"
                    style={{ width: '169px' }}
                />
            </div>
            <div className="py-1">
                {displayItems.length === 0 ? (<p className="text-gray-700 p-2 text-center text-xs">වාර්තා නොමැත.</p>) : (
                    <ul className="flex flex-col px-1">
                        {displayItems.map((item) => {
                            let customerCode, displayText, totalAmount, billSales;
                            let shouldShowRed = false; // ADD THIS LINE

                            if (type === "printed") {
                                customerCode = item.customerCode;
                                displayText = `${item.customerCode}-${item.billNo}`;
                                billSales = item.billSales;
                                totalAmount = item.totalAmount;
                                shouldShowRed = !item.hasGivenAmountApplied;
                            } else {
                                customerCode = item.customerCode;
                                displayText = item.customerCode;
                                billSales = item.billSales;
                                totalAmount = billSales.reduce((sum, sale) => sum + (parseFloat(sale.total) || 0), 0);
                            }
                            const isItemSelected = isSelected(item);
                            const buttonText = displayText.replace(/\n/g, ' ');

                            return (
                                <li key={type === "printed" ? `${item.customerCode}-${item.billNo}` : item.customerCode} className="flex">
                                    <button
                                        type="button"
                                        onMouseDown={(e) => {
                                            // Only real primary clicks — ignore keyboard/synthetic activation.
                                            if (e.button != null && e.button !== 0) return;
                                            e.preventDefault();
                                            handleCustomerClick(type, customerCode, item.billNo || null, billSales, e);
                                        }}
                                        onClick={(e) => { e.preventDefault(); }}
                                        className={`py-1 mb-2 rounded-xl border ${isItemSelected ? "border-blue-600" : "bg-gray-50 hover:bg-gray-100 border-gray-200"}`}
                                        style={isItemSelected ? { backgroundColor: '#93C5FD', paddingLeft: '05px', width: '280px', textAlign: 'left', fontSize: '12px' } : { paddingLeft: '1px', width: '280px', textAlign: 'left', fontSize: '12px' }}
                                    >
                                        <span
                                            style={{
                                                display: 'block',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                textAlign: 'inherit',
                                                width: '100%',
                                                // ADD THESE STYLES - Apply red color for printed bills without given_amount_applied
                                                color: shouldShowRed ? '#dc2626' : (isItemSelected ? 'black' : '#374151'),
                                                fontWeight: shouldShowRed ? 'bold' : 'normal'
                                            }}
                                            className={`font-semibold ${isItemSelected ? 'text-black' : 'text-gray-700'}`}
                                            title={buttonText}
                                        >
                                            {buttonText}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
});

const ItemSummary = React.memo(({ sales }) => {

    const formatWeight = (value) => {
        if (!value) return "0";
        const num = parseFloat(value);
        return num % 1 === 0 ? num.toString() : num.toFixed(1);
    };

    const formatPacks = (value) => {
        if (!value) return "0";
        return parseInt(value).toString();
    };

    const summary = useMemo(() => {
        const result = {};
        sales.forEach(sale => {
            const itemName = sale.item_name || 'Unknown';
            if (!result[itemName]) result[itemName] = { totalWeight: 0, totalPacks: 0 };
            result[itemName].totalWeight += parseFloat(sale.weight) || 0;
            result[itemName].totalPacks += parseInt(sale.packs) || 0;
        });
        return result;
    }, [sales]);

    if (Object.keys(summary).length === 0) return null;

    const items = Object.entries(summary);

    const rows = [];
    for (let i = 0; i < items.length; i += 3) {
        rows.push(items.slice(i, i + 3));
    }

    return (
        <div style={{
            width: '100%',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontFamily: "'Segoe UI', Tahoma",
            marginTop: '10px'
        }}>
            <div style={{
                textAlign: 'center',
                marginBottom: '10px'
            }}>
                <span style={{ fontSize: '18px', fontWeight: '800' }}>Item Summary</span>
            </div>

            {rows.map((row, rowIndex) => (
                <div
                    key={rowIndex}
                    style={{
                        display: 'flex',
                        gap: '10px',
                        marginBottom: '5px',
                        backgroundColor: '#ffffff'
                    }}
                >
                    {row.map(([itemName, data]) => (
                        <div key={itemName} style={{ flex: 1 }}>

                            {/* Compact format */}
                            <span style={{
                                fontSize: '16px',
                                fontWeight: '700',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: 'block'
                            }}>
                                {itemName}: {formatWeight(data.totalWeight)}kg/{formatPacks(data.totalPacks)}p
                            </span>

                        </div>
                    ))}

                    {row.length < 3 &&
                        Array.from({ length: 3 - row.length }).map((_, idx) => (
                            <div key={idx} style={{ flex: 1 }} />
                        ))
                    }
                </div>
            ))}
        </div>
    );
});


const SalesSummaryFooter = React.memo(({ sales, formatDecimal }) => {
    const totals = useMemo(() => {
        return sales.reduce((acc, s) => {
            const weight = parseFloat(s.weight) || 0;
            const price = parseFloat(s.price_per_kg) || 0;
            const packs = parseFloat(s.packs) || 0;
            const packCost = parseFloat(s.CustomerPackCost) || 0;
            const packLabour = parseFloat(s.CustomerPackLabour) || 0;
            acc.billTotal += (weight * price);
            acc.totalBagPrice += (packs * packCost);
            acc.totalLabour += (packs * packLabour);
            return acc;
        }, { billTotal: 0, totalBagPrice: 0, totalLabour: 0 });
    }, [sales]);

    const finalPayable = totals.billTotal + totals.totalBagPrice;

    return (
        <div className="flex flex-row flex-nowrap items-center justify-between w-full p-2 mt-2 rounded-xl border-2 border-blue-500 bg-gray-900 text-white font-bold shadow-lg overflow-hidden">
            <div className="flex items-center gap-4 px-3 border-r border-gray-700 flex-1 justify-center">
                <span className="text-gray-400 uppercase text-[10px] whitespace-nowrap">එකතුව:</span>
                <span className="text-white text-sm whitespace-nowrap" style={{ marginLeft: '6px' }}>
                    {formatDecimal(totals.billTotal)}
                </span>

            </div>
            <div className="flex items-center gap-2 px-3 border-r border-gray-700 flex-1 justify-center" style={{ marginLeft: '20px', transform: 'translateY(-24px)' }}>
                <span className="text-gray-400 uppercase text-[10px] whitespace-nowrap" style={{ marginLeft: '140px' }}>බෑග් මිල:</span>
                <span className="text-white text-sm whitespace-nowrap" style={{ marginLeft: '6px' }}>{formatDecimal(totals.totalBagPrice)}</span>
            </div>
            <div className="flex flex-row items-center whitespace-nowrap px-4 border-r border-gray-700 h-full ml-auto" style={{ transform: 'translateY(-48px)' }}>
                <span className="text-gray-400 uppercase text-[10px] mr-2" style={{ marginLeft: '310px' }}>කාම්කරු:</span>
                <span className="font-bold text-sm" style={{ marginLeft: '6px' }}>0</span>
            </div>
            <div className="flex flex-row items-center whitespace-nowrap px-4 border-r border-gray-700 h-full ml-auto" style={{ transform: 'translateY(-72px)' }}>
                <span className="text-gray-400 uppercase text-[10px] mr-2" style={{ marginLeft: '480px' }}>ගෙවිය:</span>
                <span className="font-bold text-sm text-yellow-400" style={{ marginLeft: '6px' }}>{formatDecimal(finalPayable)}</span>
            </div>
        </div>
    );
});

// --- Main Export Component ---
const initialFormData = { customer_code: "", customer_name: "", supplier_code: "", code: "", item_code: "", item_name: "", weight: "", price_per_kg: "", pack_due: "", total: "", packs: "", given_amount: "", pack_cost: "", telephone_no: "", };
const fieldOrder = ["telephone_no", "customer_code_input", "customer_code_select", "supplier_code", "item_code_select", "weight", "price_per_kg_grid_item", "packs", "total"];
const skipMap = { telephone_no: "customer_code_input", customer_code_input: "supplier_code", customer_code_select: "supplier_code", given_amount: "supplier_code", supplier_code: "item_code_select", item_code_select: "weight", price_per_kg: "packs", price_per_kg_grid_item: "packs" };

export default function SalesEntry() {
    const isMountedRef = useRef(true);
    const lastSubmitSignatureRef = useRef('');
    const lastSubmitAtRef = useRef(0);
    const submitGenerationRef = useRef(0);
    // Each packs-Enter gets its own controller — concurrent lines must never abort each other.
    const pendingSubmitsRef = useRef(new Map());
    const pendingSubmitStartedAtRef = useRef(new Map());
    const inFlightTempIdsRef = useRef(new Set());
    const refreshInFlightRef = useRef(false);
    const pendingForceRefreshRef = useRef(false);
    const lastRefreshAtRef = useRef(0);
    const recentSubmittedSalesRef = useRef(new Map());
    // Overlay rows for the sales table — refresh/poll must never wipe these.
    const localTableSalesRef = useRef(new Map());
    // tmp-* → real id (and reverse) so rapid POST confirm never blanks a painted row.
    const tempToRealIdRef = useRef(new Map());
    const realToTempIdRef = useRef(new Map());
    // Stable React row keys across optimistic → confirmed id swaps (stops remount flicker).
    const stableRowKeyRef = useRef(new Map());
    // Sticky center-table rows: once painted for a customer, never drop until delete/print.
    // This is the hard guard against disappear → reappear during rapid packs-Enter.
    const stickyTableSalesRef = useRef(new Map());
    // Every packs-Enter / confirmed row for the ACTIVE customer bill (id → sale).
    // Content-similar lines must NOT collapse — operators often enter the same item/weight repeatedly.
    const pinnedBillSalesRef = useRef(new Map());
    // Durable create queue: every packs-Enter stays here until the DB confirms it.
    const pendingPersistRef = useRef(new Map());
    const knownBackendSaleIdsRef = useRef(new Set());
    const persistRetryTimerRef = useRef(null);
    const persistRetryInFlightRef = useRef(false);
    const applyConfirmedCreateRef = useRef(null);
    const retryPendingPersistsRef = useRef(null);
    // saleId -> printedAt — stops just-printed rows from repopulating the middle on next bill.
    const recentlyPrintedIdsRef = useRef(new Map());
    // saleIds this terminal sent to /sales/mark-printed — unprinted sidebar only drops these.
    const locallyMarkedPrintedIdsRef = useRef(new Set());
    const locallyProcessedIdsRef = useRef(new Set());
    // saleId -> frontend-assigned bill_no so sidebars keep the printed number before GET catches up.
    const recentlyPrintedBillNoRef = useRef(new Map());
    const recentlyProcessedIdsRef = useRef(new Map());
    const sidebarMissingStreakRef = useRef(new Map());
    // After F5, GET may still list these as unprinted. Do not drop them on a stale poll.
    const sidebarKeepUnprintedIdsRef = useRef(new Map());
    const deletedSaleIdsRef = useRef(new Set());
    // Last customer code used to scope the sales table. Survives brief formData
    // flicker when react-select remounts/re-renders on item Enter.
    const tableCustomerScopeRef = useRef('');
    // Middle panel may show a bill ONLY after an explicit user action
    // (sidebar click / typing customer code / customer dropdown). Never from refresh/submit.
    const middleBillArmedRef = useRef(false);
    // Hard gate: the middle table may show rows ONLY when this is true.
    // Set only by a trusted sidebar click, a keystroke in customer_code, or
    // a real react-select "select-option". Never by GET/POST/autofill/packs-Enter.
    const middleUserOpenedRef = useRef(false);
    const customerCodeKeyUsedRef = useRef(false);
    // What owns the middle table: 'typed' | 'unprinted' | 'printed' | null
    // 'typed' = only rows entered in this session (never mix in backend unprinted leftovers).
    const middleTableSourceRef = useRef(null);
    // Ignore react-select onChange when packs-Enter / clear sets value programmatically.
    const ignoreCustomerSelectUntilRef = useRef(0);
    const refreshAbortRef = useRef(null);
    const initAbortRef = useRef(null);
    const loanAbortRef = useRef(null);
    const printInFlightRef = useRef(false);
    const printStartedAtRef = useRef(0);
    const lastPrintAtRef = useRef(0);
    const printUiClearedAtRef = useRef(0);
    const lastPrintedCustomerRef = useRef('');
    const printAwaitingBillRef = useRef(false);
    const lastF1AtRef = useRef(0);
    // BUGFIX (printed bills reverting to unprinted after refresh): F1 opens the print
    // dialog and marks the sidebar as printed instantly, but the actual server write
    // (markPrinted) happens afterward, in the background, over the network. If the user
    // reloads the page (F10, F5, closing the tab, etc.) before that request lands, the
    // browser cancels it mid-flight — the bill was physically printed, but the database
    // was never told, so a fresh load correctly (from the DB's point of view) shows it
    // as unprinted again. This counter tracks how many of those confirmations are still
    // genuinely in flight, so we can hold off a reload just long enough for them to land.
    const pendingMarkPrintedCountRef = useRef(0);
    const referenceRefreshInFlightRef = useRef(false);
    const givenAmountInFlightRef = useRef(false);
    const givenAmountStartedAtRef = useRef(0);
    const processInFlightRef = useRef(false);
    const processStartedAtRef = useRef(0);
    const customerClickGenerationRef = useRef(0);
    // Invalidates delayed post-print clears so they cannot wipe the next bill mid-entry.
    const printClearGenerationRef = useRef(0);
    const lastPrintClearGenRef = useRef(0);
    // Survives optimistic editingSaleId clear so a second Enter cannot POST a duplicate row.
    const editingSaleIdRef = useRef(null);
    const lastContentSubmitSigRef = useRef('');
    const loanCacheRef = useRef(new Map());
    const lastUserActivityAtRef = useRef(Date.now());
    const activeIntervalsRef = useRef(new Set());
    const activeTimeoutsRef = useRef(new Set());
    const referenceRefreshStartedAtRef = useRef(0);
    // Sync mirrors so F1 / + / print never wait a React render frame.
    const selectedPrintedCustomerRef = useRef(null);
    const printedBillClickRef = useRef(false);
    const selectedUnprintedCustomerRef = useRef(null);
    const allSalesRef = useRef([]);
    const displayedSalesRef = useRef([]);
    const sidebarSalesRef = useRef([]);
    const formDataRef = useRef(initialFormData);
    const billSizeRef = useRef('3inch');
    const loanAmountRef = useRef(0);
    const lastEnteredItemRef = useRef(null);
    const ignoreRowEditUntilRef = useRef(0);
    const sidebarRefreshInFlightRef = useRef(false);
    const sidebarRefreshAbortRef = useRef(null);
    const sidebarRefreshGenRef = useRef(0);
    const sidebarRefreshPendingRef = useRef(false);
    const lastSidebarRefreshAtRef = useRef(0);
    const lastSidebarSuccessAtRef = useRef(0);
    const lastSidebarSignatureRef = useRef('');
    const customerSalesFetchGenRef = useRef(0);
    const customerSalesAbortRef = useRef(null);
    const initialLoadDoneRef = useRef(false);

    // Blocks late/stale focus() calls that yank the cursor back to supplier
    // after the operator has already moved on to the item select (Enter).
    const suppressSupplierFocusUntilRef = useRef(0);

    // Single stable refs container: keeps identity constant across renders so
    // effects/listeners depending on it never re-subscribe.
    const refs = useRef({
        telephone_no: { current: null }, customer_code_input: { current: null }, customer_code_select: { current: null }, given_amount: { current: null },
        supplier_code: { current: null }, item_code_select: { current: null }, item_name: { current: null },
        weight: { current: null }, price_per_kg: { current: null }, packs: { current: null }, total: { current: null },
        price_per_kg_grid_item: { current: null },
    }).current;

    const isFocusInItemEntryFields = useCallback(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return false;

        if (
            active === refs.weight.current ||
            active === refs.price_per_kg_grid_item.current ||
            active === refs.price_per_kg.current
        ) {
            return true;
        }

        // Item react-select (or its inner input / menu)
        if (active.closest?.('.react-select-container')) return true;

        const select = refs.item_code_select.current;
        const itemInput =
            select?.inputRef ||
            select?.select?.inputRef ||
            select?.controlRef?.querySelector?.('input');
        return !!(itemInput && active === itemInput);
    }, []);

    const focusSupplierCode = useCallback(() => {
        if (Date.now() < suppressSupplierFocusUntilRef.current) return;
        // Never yank focus back if the operator already moved to item/weight/price.
        if (isFocusInItemEntryFields()) return;

        const el = refs.supplier_code.current;
        if (!el) return;
        el.focus();
        el.select?.();
    }, [isFocusInItemEntryFields]);
    const focusCustomerCodeInput = useCallback(() => {
        const el = refs.customer_code_input.current;
        if (!el) return;
        try {
            el.focus({ preventScroll: true });
            el.select?.();
        } catch (_) { /* ignore */ }
    }, [refs]);

    const focusItemCodeSelect = useCallback(() => {
        // Block late post-submit supplier.focus() for long enough to cover slow API returns.
        suppressSupplierFocusUntilRef.current = Date.now() + 2500;
        const select = refs.item_code_select.current;
        if (!select) return;

        if (typeof select.focus === 'function') {
            select.focus();
        }

        // Keep the menu open so the operator can type the item code immediately.
        if (typeof select.setState === 'function') {
            select.setState({ menuIsOpen: true });
        } else if (typeof select.onMenuOpen === 'function') {
            select.onMenuOpen();
        }

        // Focus the real <input> inside react-select (version-safe).
        const inputEl =
            select.inputRef ||
            select.select?.inputRef ||
            select.controlRef?.querySelector?.('input') ||
            document.querySelector('.react-select-container input');
        if (inputEl && typeof inputEl.focus === 'function') {
            inputEl.focus();
        }
    }, []);

    const [state, setState] = useState({
        allSales: [], sidebarSales: [], localTableSales: [], selectedPrintedCustomer: null, selectedUnprintedCustomer: null, editingSaleId: null,
        searchQueries: { printed: "", unprinted: "", farmerPrinted: "", farmerUnprinted: "" }, errors: {}, loanAmount: 0, isManualClear: false,
        middleBillArmed: false,
        isSubmitting: false, formData: initialFormData, packCost: 0, customerSearchInput: "", itemSearchInput: "",
        supplierSearchInput: "", currentBillNo: null, isLoading: false, customers: [], items: [], suppliers: [],
        isPrinting: false, billSize: '3inch', priceManuallyChanged: false,
        gridPricePerKg: "", selectedSaleForBreakdown: null, showSavePhoneButton: false,
        currentUser: null,
        isAdminModalOpen: false, modalTitle: "", modalData: [], modalType: "", isGivenAmountManuallyTouched: false, filterOnlyCash: false, isCashFilterActive: false, customerProfilePic: null, supplierProfilePic: null, customerNameDisplay: "", supplierNameDisplay: "", isImageModalOpen: false, selectedImageData: { profile: null, nic_front: null, nic_back: null, title: "" },
    });

    const setFormData = useCallback((updater) => {
        if (!isMountedRef.current) return;
        setState(prev => ({
            ...prev,
            formData: typeof updater === 'function' ? updater(prev.formData) : updater
        }));
    }, []);

    const updateState = useCallback((updates) => {
        if (!isMountedRef.current) return;
        setState(prev => {
            // Skip the re-render entirely when nothing actually changed.
            // Many effects call updateState on every keystroke with identical values.
            let changed = false;
            for (const key in updates) {
                if (!Object.is(prev[key], updates[key])) { changed = true; break; }
            }
            return changed ? { ...prev, ...updates } : prev;
        });
    }, []);

    const setManagedTimeout = useCallback((fn, delay) => {
        const id = window.setTimeout(() => {
            activeTimeoutsRef.current.delete(id);
            fn();
        }, delay);
        activeTimeoutsRef.current.add(id);
        return id;
    }, []);

    const setManagedInterval = useCallback((fn, delay) => {
        const id = window.setInterval(fn, delay);
        activeIntervalsRef.current.add(id);
        return id;
    }, []);

    const clearManagedInterval = useCallback((id) => {
        if (!id) return;
        window.clearInterval(id);
        activeIntervalsRef.current.delete(id);
    }, []);

    const { allSales, sidebarSales, localTableSales, customerSearchInput, selectedPrintedCustomer, selectedUnprintedCustomer, editingSaleId,
        searchQueries, errors, loanAmount, isManualClear, middleBillArmed, formData, packCost, isLoading, customers,
        items, suppliers, isPrinting, billSize, gridPricePerKg, selectedSaleForBreakdown, currentUser,
        isAdminModalOpen, modalTitle, modalData, modalType } = state;

    const markIdsRecentlyPrinted = useCallback((ids, assignedBillNo = '') => {
        const at = Date.now();
        const billNo = String(assignedBillNo || '').trim();
        if (billNo) rememberFrontendBillNo(billNo);
        (ids || []).forEach((id) => {
            if (id == null) return;
            const idStr = String(id);
            recentlyPrintedIdsRef.current.set(idStr, at);
            locallyMarkedPrintedIdsRef.current.add(idStr);
            if (billNo) recentlyPrintedBillNoRef.current.set(idStr, billNo);
            const mappedReal = tempToRealIdRef.current.get(idStr);
            if (mappedReal != null) {
                recentlyPrintedIdsRef.current.set(String(mappedReal), at);
                locallyMarkedPrintedIdsRef.current.add(String(mappedReal));
                if (billNo) recentlyPrintedBillNoRef.current.set(String(mappedReal), billNo);
            }
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedTemp != null) {
                recentlyPrintedIdsRef.current.set(String(mappedTemp), at);
                locallyMarkedPrintedIdsRef.current.add(String(mappedTemp));
                if (billNo) recentlyPrintedBillNoRef.current.set(String(mappedTemp), billNo);
            }
        });
    }, []);
    const applyPrintedFlagsToStores = useCallback((ids, billNo = '') => {
        const idSet = new Set();
        (ids || []).forEach((id) => {
            if (id == null) return;
            const idStr = String(id);
            idSet.add(idStr);
            const mappedReal = tempToRealIdRef.current.get(idStr);
            if (mappedReal != null) idSet.add(String(mappedReal));
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedTemp != null) idSet.add(String(mappedTemp));
        });
        if (!idSet.size) return;
        markIdsRecentlyPrinted([...idSet], billNo);
        const stamp = (s) => {
            if (!s?.id || !idSet.has(String(s.id))) return s;
            return {
                ...s,
                bill_printed: 'Y',
                bill_no: billNo || s.bill_no || s.customer_bill_no,
                customer_bill_no: billNo || s.customer_bill_no || s.bill_no,
                _optimistic: false,
            };
        };
        const nextSidebar = (sidebarSalesRef.current || []).map(stamp);
        sidebarSalesRef.current = nextSidebar;
        lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
        if (!isMountedRef.current) return;
        setState((prev) => {
            const nextAll = (prev.allSales || []).map(stamp);
            allSalesRef.current = nextAll;
            return {
                ...prev,
                sidebarSales: nextSidebar,
                allSales: nextAll,
            };
        });
    }, [markIdsRecentlyPrinted]);
    const isRecentlyPrintedId = useCallback((id) => {
        if (id == null) return false;
        const idStr = String(id);
        const at = recentlyPrintedIdsRef.current.get(idStr);
        if (!at) return false;
        if (Date.now() - at > PRINTED_ID_BLOCK_MS) {
            recentlyPrintedIdsRef.current.delete(idStr);
            return false;
        }
        return true;
    }, []);
    const expandRelatedSaleIds = useCallback((ids) => {
        const out = new Set();
        (ids || []).forEach((id) => {
            if (id == null) return;
            const idStr = String(id);
            out.add(idStr);
            const mappedReal = tempToRealIdRef.current.get(idStr);
            if (mappedReal != null) out.add(String(mappedReal));
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedTemp != null) out.add(String(mappedTemp));
        });
        return out;
    }, []);
    const markIdsRecentlyProcessed = useCallback((ids) => {
        const at = Date.now();
        expandRelatedSaleIds(ids).forEach((idStr) => {
            recentlyProcessedIdsRef.current.set(idStr, at);
            locallyProcessedIdsRef.current.add(idStr);
        });
    }, [expandRelatedSaleIds]);
    const isLocallyProcessedId = useCallback((id) => {
        if (id == null) return false;
        const idStr = String(id);
        if (locallyProcessedIdsRef.current.has(idStr)) return true;
        const mappedReal = tempToRealIdRef.current.get(idStr);
        if (mappedReal != null && locallyProcessedIdsRef.current.has(String(mappedReal))) return true;
        const mappedTemp = realToTempIdRef.current.get(idStr);
        if (mappedTemp != null && locallyProcessedIdsRef.current.has(String(mappedTemp))) return true;
        const at = recentlyProcessedIdsRef.current.get(idStr);
        return !!(at && (Date.now() - at) < PRINTED_ID_BLOCK_MS);
    }, []);
    const applyProcessedRemovalToStores = useCallback((ids) => {
        const idSet = expandRelatedSaleIds(ids);
        if (!idSet.size) return;
        markIdsRecentlyProcessed([...idSet]);
        idSet.forEach((idStr) => {
            recentSubmittedSalesRef.current.delete(idStr);
            localTableSalesRef.current.delete(idStr);
            stickyTableSalesRef.current.delete(idStr);
            pinnedBillSalesRef.current.delete(idStr);
        });
        const keep = (s) => s?.id == null || !idSet.has(String(s.id));
        const nextSidebar = (sidebarSalesRef.current || []).filter(keep);
        sidebarSalesRef.current = nextSidebar;
        lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
        allSalesRef.current = (allSalesRef.current || []).filter(keep);
        if (!isMountedRef.current) return;
        setState((prev) => ({
            ...prev,
            sidebarSales: nextSidebar,
            allSales: (prev.allSales || []).filter(keep),
        }));
    }, [expandRelatedSaleIds, markIdsRecentlyProcessed]);
    const isRecentlyProcessedId = useCallback((id) => {
        if (id == null) return false;
        const idStr = String(id);
        const at = recentlyProcessedIdsRef.current.get(idStr);
        if (!at) return false;
        if (Date.now() - at > PRINTED_ID_BLOCK_MS) {
            recentlyProcessedIdsRef.current.delete(idStr);
            return false;
        }
        return true;
    }, []);
    const isPostPrintNewRow = useCallback((sale) => {
        if (!sale) return false;
        const entered = Number(sale._enteredAt) || 0;
        return !!(entered && lastPrintAtRef.current && entered > lastPrintAtRef.current);
    }, []);
    const isJustPrintedLeftoverRow = useCallback((sale) => {
        if (!sale?.id) return false;
        if (isRecentlyPrintedId(sale.id)) return true;
        if (String(sale.bill_printed ?? '').trim().toUpperCase() === 'Y') return true;
        if (String(sale.bill_no || '').trim()) return true;
        const printedCust = String(lastPrintedCustomerRef.current || '').trim().toUpperCase();
        const saleCust = String(sale.customer_code || '').trim().toUpperCase();
        if (!printedCust || !lastPrintAtRef.current || saleCust !== printedCust) return false;
        if (isPostPrintNewRow(sale)) return false;
        return (Date.now() - lastPrintAtRef.current) < PRINTED_ID_BLOCK_MS;
    }, [isRecentlyPrintedId, isPostPrintNewRow]);

    const collectUnprintedSalesForCustomer = useCallback((code) => {
        const norm = String(code || '').trim().toUpperCase();
        if (!norm) return [];
        const seen = new Set();
        const out = [];
        const consider = (s) => {
            if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
            if (String(s.customer_code || '').trim().toUpperCase() !== norm) return;
            if (isTempOrOptimisticSale(s)) return;
            if (isRecentlyPrintedId(s.id) || isLocallyProcessedId(s.id)) return;
            if (!isUnprintedBillStatus(s.bill_printed)) return;
            const idStr = String(s.id);
            if (seen.has(idStr)) return;
            seen.add(idStr);
            out.push({ ...s, bill_printed: s.bill_printed || 'N', _optimistic: false });
        };
        (sidebarSalesRef.current || []).forEach(consider);
        (allSalesRef.current || []).forEach(consider);
        localTableSalesRef.current.forEach(consider);
        stickyTableSalesRef.current.forEach(consider);
        pinnedBillSalesRef.current.forEach(consider);
        recentSubmittedSalesRef.current.forEach((entry) => consider(entry?.sale));
        return out;
    }, [isRecentlyPrintedId, isRecentlyProcessedId]);

    const paintUnprintedRowsForCustomer = useCallback((code, rows) => {
        const norm = String(code || '').trim().toUpperCase();
        if (!norm) return [];
        if (!middleUserOpenedRef.current || !middleBillArmedRef.current) return [];
        if (String(tableCustomerScopeRef.current || '').trim().toUpperCase() !== norm) return [];
        if (middleTableSourceRef.current === 'printed') return [];

        const paintAt = Date.now();
        const nextRows = [];
        const seen = new Set();
        const keepLocal = (sale, idStr) => {
            if (!sale?.id) return;
            if (String(sale.customer_code || '').trim().toUpperCase() !== norm) return;
            if (seen.has(String(idStr))) return;
            seen.add(String(idStr));
            nextRows.push(sale);
        };
        pinnedBillSalesRef.current.forEach(keepLocal);
        stickyTableSalesRef.current.forEach(keepLocal);
        localTableSalesRef.current.forEach(keepLocal);

        let hasUnmatchedTemps = inFlightTempIdsRef.current.size > 0 || pendingPersistRef.current.size > 0;
        if (!hasUnmatchedTemps) {
            nextRows.forEach((sale) => {
                const id = String(sale?.id || '');
                if (id.startsWith('tmp-') && !tempToRealIdRef.current.has(id)) hasUnmatchedTemps = true;
            });
        }

        (rows || []).forEach((sale) => {
            if (!sale?.id || isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
            if (isRecentlyPrintedId(sale.id) || isLocallyProcessedId(sale.id)) return;
            if (isTempOrOptimisticSale(sale)) return;
            if (!isUnprintedBillStatus(sale.bill_printed) && String(sale.bill_printed ?? '').trim().toUpperCase() === 'Y') return;
            const idStr = String(sale.id);
            if (seen.has(idStr)) return;
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedTemp && seen.has(String(mappedTemp))) return;
            // Do not pin a GET copy beside an unmatched temp — that doubled then vanished.
            if (hasUnmatchedTemps && !pinnedBillSalesRef.current.has(idStr) && !mappedTemp) return;
            seen.add(idStr);
            nextRows.push({ ...sale, bill_printed: sale.bill_printed || 'N', _optimistic: false });
        });

        const dropStaleForCustomer = (map) => {
            map.forEach((sale, idStr) => {
                if (String(sale?.customer_code || '').trim().toUpperCase() !== norm) return;
                if (isTempOrOptimisticSale(sale) || String(idStr).startsWith('tmp-')) return;
                map.delete(idStr);
            });
        };
        dropStaleForCustomer(pinnedBillSalesRef.current);
        dropStaleForCustomer(stickyTableSalesRef.current);
        dropStaleForCustomer(localTableSalesRef.current);

        nextRows.forEach((sale) => {
            const idStr = String(sale.id);
            pinnedBillSalesRef.current.set(idStr, sale);
            stickyTableSalesRef.current.set(idStr, sale);
            localTableSalesRef.current.set(idStr, sale);
            if (!isTempOrOptimisticSale(sale) && !String(idStr).startsWith('tmp-')) {
                recentSubmittedSalesRef.current.set(idStr, { sale, at: paintAt });
            }
        });
        displayedSalesRef.current = nextRows.slice();
        middleTableSourceRef.current = 'unprinted';
        middleBillArmedRef.current = true;
        selectedUnprintedCustomerRef.current = norm;
        selectedPrintedCustomerRef.current = null;
        tableCustomerScopeRef.current = norm;
        return nextRows;
    }, [isRecentlyPrintedId, isRecentlyProcessedId]);

    // Drop leftover table overlays that do not belong to this exact customer code.
    // Prefix leftovers (RAT while typing RATT) must never stay on screen.
    const dropOverlaysNotMatchingCustomer = useCallback((code) => {
        const norm = String(code || '').trim().toUpperCase();
        const keep = (sale) => !!norm && String(sale?.customer_code || '').trim().toUpperCase() === norm;
        const pruneMap = (map) => {
            map.forEach((sale, idStr) => {
                if (!keep(sale)) map.delete(idStr);
            });
        };
        pruneMap(pinnedBillSalesRef.current);
        pruneMap(stickyTableSalesRef.current);
        pruneMap(localTableSalesRef.current);
        displayedSalesRef.current = (displayedSalesRef.current || []).filter(keep);
        recentSubmittedSalesRef.current.forEach((entry, key) => {
            if (entry?.sale && !keep(entry.sale)) recentSubmittedSalesRef.current.delete(key);
        });
    }, []);

    const armMiddleBill = useCallback(() => {
        middleBillArmedRef.current = true;
        updateState({ middleBillArmed: true, isManualClear: false });
    }, [updateState]);

    const disarmMiddleBill = useCallback(() => {
        middleUserOpenedRef.current = false;
        customerCodeKeyUsedRef.current = false;
        middleBillArmedRef.current = false;
        middleTableSourceRef.current = null;
        customerClickGenerationRef.current += 1; // cancel late sidebar-click async paints
        tableCustomerScopeRef.current = '';
        selectedPrintedCustomerRef.current = null;
        selectedUnprintedCustomerRef.current = null;
        pinnedBillSalesRef.current.clear();
        updateState({
            middleBillArmed: false,
            isManualClear: true,
            selectedPrintedCustomer: null,
            selectedUnprintedCustomer: null,
            currentBillNo: null,
            customerProfilePic: null,
            customerNameDisplay: "",
            loanAmount: 0,
        });
    }, [updateState]);

    const pinBillSale = useCallback((sale) => {
        if (!sale?.id || isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
        const idStr = String(sale.id);
        const prev = pinnedBillSalesRef.current.get(idStr)
            || stickyTableSalesRef.current.get(idStr)
            || localTableSalesRef.current.get(idStr);
        const next = withEnteredAt(sale, prev);
        pinnedBillSalesRef.current.set(idStr, next);
        stickyTableSalesRef.current.set(idStr, next);
        localTableSalesRef.current.set(idStr, next);
    }, []);

    const upsertLocalTableSale = useCallback((sale) => {
        if (!sale?.id) return;
        const idStr = String(sale.id);
        const prev = pinnedBillSalesRef.current.get(idStr)
            || stickyTableSalesRef.current.get(idStr)
            || localTableSalesRef.current.get(idStr);
        const next = withEnteredAt({
            ...prev,
            ...sale,
            bill_no: sale.bill_no || prev?.bill_no,
            bill_printed: sale.bill_printed || prev?.bill_printed,
        }, prev);
        localTableSalesRef.current.set(idStr, next);
        if (!isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) {
            stickyTableSalesRef.current.set(idStr, next);
            pinnedBillSalesRef.current.set(idStr, next);
        }
    }, []);

    const removeLocalTableSale = useCallback((id) => {
        if (id == null) return;
        const idStr = String(id);
        localTableSalesRef.current.delete(idStr);
        stickyTableSalesRef.current.delete(idStr);
        pinnedBillSalesRef.current.delete(idStr);
    }, []);

    const rememberBackendSaleId = useCallback((id) => {
        if (id == null) return;
        const idStr = String(id);
        if (!idStr || idStr.startsWith('tmp-')) return;
        knownBackendSaleIdsRef.current.add(idStr);
    }, []);

    const collectKnownBackendIds = useCallback(() => {
        const ids = new Set(knownBackendSaleIdsRef.current);
        const add = (id) => {
            if (id == null) return;
            const idStr = String(id);
            if (!idStr || idStr.startsWith('tmp-')) return;
            ids.add(idStr);
            knownBackendSaleIdsRef.current.add(idStr);
        };
        (allSalesRef.current || []).forEach((s) => add(s?.id));
        (sidebarSalesRef.current || []).forEach((s) => add(s?.id));
        localTableSalesRef.current.forEach((s) => add(s?.id));
        pinnedBillSalesRef.current.forEach((s) => add(s?.id));
        stickyTableSalesRef.current.forEach((s) => add(s?.id));
        tempToRealIdRef.current.forEach((realId) => add(realId));
        return ids;
    }, []);

    const persistPendingJobsToStorage = useCallback(() => {
        writePendingPersistsToStorage(Array.from(pendingPersistRef.current.values()));
    }, []);

    const completePersistJob = useCallback((tempId) => {
        if (tempId == null) return;
        const tKey = String(tempId);
        pendingPersistRef.current.delete(tKey);
        inFlightTempIdsRef.current.delete(tKey);
        persistPendingJobsToStorage();
    }, [persistPendingJobsToStorage]);

    const queuePersistJob = useCallback((job) => {
        if (!job?.tempId || !job?.payload) return;
        const tKey = String(job.tempId);
        if (pendingPersistRef.current.get(tKey)?.confirmed) return;
        const knownIds = Array.from(job.knownIds instanceof Set ? job.knownIds : (job.knownIds || collectKnownBackendIds()));
        pendingPersistRef.current.set(tKey, {
            tempId: tKey,
            method: job.method || 'post',
            url: job.url || routes.sales,
            payload: job.payload,
            sale: job.sale || null,
            knownIds,
            createdAt: job.createdAt || Date.now(),
            attempts: job.attempts || 0,
            confirmed: false,
            inFlight: !!job.inFlight,
        });
        persistPendingJobsToStorage();
    }, [collectKnownBackendIds, persistPendingJobsToStorage]);

    const schedulePersistRetry = useCallback((delayMs = PERSIST_RETRY_MS) => {
        if (persistRetryTimerRef.current) return;
        persistRetryTimerRef.current = window.setTimeout(() => {
            persistRetryTimerRef.current = null;
            const retry = retryPendingPersistsRef.current;
            if (typeof retry === 'function') void retry();
        }, delayMs);
        activeTimeoutsRef.current.add(persistRetryTimerRef.current);
    }, []);

    const applyConfirmedCreate = useCallback((tempId, rawSale) => {
        if (!tempId || !rawSale?.id) return null;
        const tKey = String(tempId);
        const rKey = String(rawSale.id);
        if (isDeletedSaleId(deletedSaleIdsRef.current, rawSale.id) || isDeletedSaleId(deletedSaleIdsRef.current, tKey)) {
            completePersistJob(tKey);
            return null;
        }
        const existingTempForReal = realToTempIdRef.current.get(rKey);
        if (existingTempForReal && existingTempForReal !== tKey) {
            return null;
        }
        const prevTemp = stickyTableSalesRef.current.get(tKey)
            || pinnedBillSalesRef.current.get(tKey)
            || localTableSalesRef.current.get(tKey)
            || recentSubmittedSalesRef.current.get(tKey)?.sale
            || null;
        const merged = withEnteredAt({
            ...(prevTemp || {}),
            ...rawSale,
            bill_printed: rawSale.bill_printed ?? prevTemp?.bill_printed ?? 'N',
            bill_no: rawSale.bill_no ?? prevTemp?.bill_no ?? null,
            customer_code: rawSale.customer_code || prevTemp?.customer_code,
            item_name: rawSale.item_name || prevTemp?.item_name,
            _optimistic: false,
        }, prevTemp);
        tempToRealIdRef.current.set(tKey, rKey);
        realToTempIdRef.current.set(rKey, tKey);
        const stable = stableRowKeyRef.current.get(tKey) || tKey;
        stableRowKeyRef.current.set(tKey, stable);
        stableRowKeyRef.current.set(rKey, stable);
        rememberBackendSaleId(rKey);

        const trackAt = Date.now();
        recentSubmittedSalesRef.current.set(rKey, { sale: merged, at: trackAt });
        recentSubmittedSalesRef.current.set(merged.id, { sale: merged, at: trackAt });
        recentSubmittedSalesRef.current.set(tKey, {
            sale: { ...merged, id: tempId, _optimistic: false, _pendingRealId: merged.id },
            at: trackAt,
        });
        completePersistJob(tKey);

        const scope = String(tableCustomerScopeRef.current || '').trim().toUpperCase();
        const saleCust = String(merged.customer_code || '').trim().toUpperCase();
        const canPaint = !!(middleUserOpenedRef.current && middleBillArmedRef.current && middleTableSourceRef.current)
            && (!scope || !saleCust || scope === saleCust);

        if (canPaint) {
            stickyTableSalesRef.current.set(rKey, merged);
            pinnedBillSalesRef.current.set(rKey, merged);
            localTableSalesRef.current.set(rKey, merged);
            stickyTableSalesRef.current.delete(tKey);
            pinnedBillSalesRef.current.delete(tKey);
            localTableSalesRef.current.delete(tKey);
        }

        if (!isMountedRef.current) return merged;
        setState((prev) => {
            const drop = (s) => s && !sameSaleId(s.id, tempId) && !sameSaleId(s.id, merged.id);
            const nextAll = [merged, ...(prev.allSales || []).filter(drop)];
            allSalesRef.current = nextAll;
            if (!canPaint) {
                return {
                    ...prev,
                    allSales: nextAll,
                    localTableSales: (prev.localTableSales || []).filter(drop),
                };
            }
            const nextLocal = [merged, ...(prev.localTableSales || []).filter(drop)];
            return { ...prev, allSales: nextAll, localTableSales: nextLocal };
        });
        return merged;
    }, [completePersistJob, rememberBackendSaleId]);
    applyConfirmedCreateRef.current = applyConfirmedCreate;

    const adoptUnmappedServerSaleForJob = useCallback((serverSales, job, claimedIds) => {
        if (!job?.payload || !Array.isArray(serverSales)) return null;
        const known = new Set([
            ...(job.knownIds || []),
            ...knownBackendSaleIdsRef.current,
        ]);
        const unused = serverSales.filter((s) => {
            if (!s?.id) return false;
            const idStr = String(s.id);
            if (idStr.startsWith('tmp-')) return false;
            if (known.has(idStr) || claimedIds.has(idStr)) return false;
            if (realToTempIdRef.current.has(idStr)) return false;
            if (isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return false;
            return saleContentKey(s) === saleContentKey(job.payload);
        });
        if (!unused.length) return null;
        unused.sort((a, b) => Number(a.id) - Number(b.id));
        return unused[0];
    }, []);

    const reconcilePendingPersistsWithServerSales = useCallback((serverSales) => {
        if (!Array.isArray(serverSales) || pendingPersistRef.current.size === 0) return;
        const claimed = new Set();
        const jobs = Array.from(pendingPersistRef.current.values())
            .filter((job) => job && !job.confirmed)
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        jobs.forEach((job) => {
            const adopted = adoptUnmappedServerSaleForJob(serverSales, job, claimed);
            if (!adopted?.id) return;
            claimed.add(String(adopted.id));
            applyConfirmedCreateRef.current?.(job.tempId, adopted);
        });
    }, [adoptUnmappedServerSaleForJob]);

    const retryPendingPersists = useCallback(async () => {
        if (persistRetryInFlightRef.current) return;
        if (pendingPersistRef.current.size === 0) return;
        persistRetryInFlightRef.current = true;
        try {
            const jobs = Array.from(pendingPersistRef.current.values())
                .filter((job) => job && !job.confirmed && !job.inFlight)
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            if (!jobs.length) return;

            let serverSales = null;
            try {
                const res = await api.get(routes.sales, { timeout: API_TIMEOUT_MS });
                serverSales = extractSalesArray(res.data) || [];
                serverSales.forEach((s) => rememberBackendSaleId(s?.id));
                reconcilePendingPersistsWithServerSales(serverSales);
            } catch (_) {
                serverSales = null;
            }

            for (const job of jobs) {
                const live = pendingPersistRef.current.get(String(job.tempId));
                if (!live || live.confirmed) continue;
                if (isDeletedSaleId(deletedSaleIdsRef.current, job.tempId)) {
                    completePersistJob(job.tempId);
                    continue;
                }
                if (tempToRealIdRef.current.has(String(job.tempId))) {
                    completePersistJob(job.tempId);
                    continue;
                }
                if (serverSales) {
                    const claimed = new Set(knownBackendSaleIdsRef.current);
                    const adopted = adoptUnmappedServerSaleForJob(serverSales, live, claimed);
                    if (adopted?.id) {
                        applyConfirmedCreateRef.current?.(live.tempId, adopted);
                        continue;
                    }
                }

                // 2xx already returned for this Enter — never POST again (would duplicate).
                if (live.postSucceeded) {
                    schedulePersistRetry(Math.min(8000, PERSIST_RETRY_MS * Math.max(1, live.attempts || 1)));
                    continue;
                }

                live.inFlight = true;
                live.attempts = (live.attempts || 0) + 1;
                pendingPersistRef.current.set(String(live.tempId), live);
                persistPendingJobsToStorage();
                try {
                    const response = await api[live.method || 'post'](live.url || routes.sales, live.payload, {
                        timeout: PERSIST_TIMEOUT_MS,
                    });
                    const known = new Set(live.knownIds || []);
                    const picked = pickSaleFromSubmitResponse(response.data, {
                        payload: live.payload,
                        knownIds: known,
                    });
                    if (picked?.id) {
                        const mappedOther = realToTempIdRef.current.get(String(picked.id));
                        if (!mappedOther || mappedOther === String(live.tempId)) {
                            applyConfirmedCreateRef.current?.(live.tempId, picked);
                            continue;
                        }
                    }
                    live.inFlight = false;
                    pendingPersistRef.current.set(String(live.tempId), live);
                    persistPendingJobsToStorage();
                    schedulePersistRetry(Math.min(8000, PERSIST_RETRY_MS * Math.max(1, live.attempts)));
                } catch (error) {
                    live.inFlight = false;
                    pendingPersistRef.current.set(String(live.tempId), live);
                    persistPendingJobsToStorage();
                    if (isRetryableSubmitError(error) || Number(error?.response?.status) === 409) {
                        schedulePersistRetry(Math.min(8000, PERSIST_RETRY_MS * Math.max(1, live.attempts)));
                    } else {
                        // Keep the row on screen and keep retrying slowly — never drop a painted Enter.
                        schedulePersistRetry(5000);
                    }
                }
            }
        } finally {
            persistRetryInFlightRef.current = false;
            if (pendingPersistRef.current.size > 0) {
                const stillOpen = Array.from(pendingPersistRef.current.values()).some((job) => job && !job.confirmed);
                if (stillOpen) schedulePersistRetry(PERSIST_RETRY_MS * 2);
            }
        }
    }, [
        adoptUnmappedServerSaleForJob,
        completePersistJob,
        persistPendingJobsToStorage,
        reconcilePendingPersistsWithServerSales,
        rememberBackendSaleId,
        schedulePersistRetry,
    ]);
    retryPendingPersistsRef.current = retryPendingPersists;

    // --- Logic for Farmer Lists (Admin View) ---
    const printedFarmers = useMemo(() => {
        const groups = {};
        allSales.filter(s => s.supplier_bill_printed === 'Y').forEach(sale => {
            const code = sale.supplier_code;
            if (code && !groups[code]) groups[code] = { supplier_code: code };
        });
        return Object.values(groups);
    }, [allSales]);
    const unprintedFarmers = useMemo(() => {
        const groups = {};
        allSales.filter(s => s.supplier_bill_printed === 'N' || !s.supplier_bill_printed).forEach(sale => {
            const code = sale.supplier_code;
            if (code && !groups[code]) groups[code] = { supplier_code: code };
        });
        return Object.values(groups);
    }, [allSales]);

    const { newSales, printedSales, unprintedSales } = useMemo(() => ({
        // Include pending 'N' rows so packs-Enter optimistic lines appear instantly
        // even before a sidebar customer is selected.
        newSales: allSales.filter((s) => {
            const status = String(s.bill_printed ?? '').trim().toUpperCase();
            return s.id && status !== 'Y';
        }),
        printedSales: allSales.filter((s) => String(s.bill_printed ?? '').trim().toUpperCase() === 'Y'),
        unprintedSales: allSales.filter((s) => {
            const status = String(s.bill_printed ?? '').trim().toUpperCase();
            return status === 'N' || status === '' || status === 'NULL' || status === 'UNDEFINED';
        })
    }), [allSales]);

    const filterCustomers = (sales, query, searchByBillNo = false) => {
        const allCustomers = [...new Set(sales.map(s => s.customer_code))];
        if (!query) return allCustomers;
        const lowerQuery = query.toLowerCase();
        if (searchByBillNo) {
            const byBillNo = sales.filter(s => (s.bill_no?.toString() || '').toLowerCase().includes(lowerQuery)).map(s => s.customer_code);
            const byCode = allCustomers.filter(code => code.toLowerCase().includes(lowerQuery));
            return [...new Set([...byBillNo, ...byCode])];
        }
        return allCustomers.filter(code => code.toLowerCase().includes(lowerQuery));
    };

    const unprintedCustomers = useMemo(() => filterCustomers(unprintedSales, searchQueries.unprinted), [unprintedSales, searchQueries.unprinted]);

    const displayedSales = useMemo(() => {
        const normalizeCode = (value) => String(value || '').trim().toUpperCase();
        const normalizedStatus = (sale) => String(sale?.bill_printed ?? '').trim().toUpperCase();
        const isPrintedSale = (sale) => normalizedStatus(sale) === 'Y';
        const isPendingSale = (sale) => !isPrintedSale(sale);

        const tableSource = middleTableSourceRef.current;
        // Absolute rule: no click / no typed customer code / no dropdown pick → empty table.
        if (!middleUserOpenedRef.current) return [];
        if (!middleBillArmed && !middleBillArmedRef.current) return [];
        if (!tableSource) return [];

        const hasPins = pinnedBillSalesRef.current.size > 0 || stickyTableSalesRef.current.size > 0;
        const inputCustomer = normalizeCode(formData.customer_code);
        const sidebarUnprinted = normalizeCode(selectedUnprintedCustomer);
        let printedCustomer = '';
        let printedBillNo = '';
        if (selectedPrintedCustomer) {
            if (selectedPrintedCustomer.includes('-')) {
                const separatorIndex = selectedPrintedCustomer.lastIndexOf('-');
                printedCustomer = normalizeCode(selectedPrintedCustomer.slice(0, separatorIndex));
                printedBillNo = String(selectedPrintedCustomer.slice(separatorIndex + 1) || '').trim();
            } else {
                printedCustomer = normalizeCode(selectedPrintedCustomer);
            }
        }

        const scopedFallback = normalizeCode(tableCustomerScopeRef.current);
        const isPrintedView = tableSource === 'printed';
        const activeCustomerCode = inputCustomer || sidebarUnprinted || (isPrintedView ? printedCustomer : '') || scopedFallback;
        if (!activeCustomerCode) return [];

        // Printed view ONLY when the operator clicked a printed sidebar bill.
        // Inferring it from leftover selectedPrintedCustomer (same customer code)
        // was filtering out new Enter rows (no bill_no) and emptying the table.
        let hasPostPrintPins = false;
        if (lastPrintAtRef.current) {
            pinnedBillSalesRef.current.forEach((sale) => {
                if (sale?._enteredAt && sale._enteredAt > lastPrintAtRef.current) hasPostPrintPins = true;
            });
        }

        const isRowDeleted = (id) => {
            if (id == null) return true;
            if (isDeletedSaleId(deletedSaleIdsRef.current, id)) return true;
            const idStr = String(id);
            const mappedReal = tempToRealIdRef.current.get(idStr);
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedReal != null && isDeletedSaleId(deletedSaleIdsRef.current, mappedReal)) return true;
            if (mappedTemp != null && isDeletedSaleId(deletedSaleIdsRef.current, mappedTemp)) return true;
            return false;
        };
        // Typed-only (new bill): stay on operator-entered pins. Do not flip to
        // "live unprinted" just because our own POSTs started appearing in GET —
        // that mixed tmp + real copies of the same line into the table.
        const isTypedEntryView = !isPrintedView
            && (tableSource === 'typed' || (hasPostPrintPins && tableSource !== 'unprinted'));

        const isPinnedId = (id) => {
            if (id == null) return false;
            const idStr = String(id);
            return pinnedBillSalesRef.current.has(idStr) || stickyTableSalesRef.current.has(idStr);
        };

        const matchesScope = (s) => {
            if (!s?.id || isRowDeleted(s.id)) return false;
            const sameCustomer = normalizeCode(s.customer_code) === activeCustomerCode;
            if (!sameCustomer) return false;

            // Printed sidebar bill — stay on this bill until the same bill is clicked again or F6.
            if (isPrintedView && !isPostPrintNewRow(s)) {
                const saleBillNo = String(s.bill_no ?? '').trim();
                if (saleBillNo) return saleBillNo === printedBillNo;
                return isPinnedId(s.id) || isPinnedId(String(s.id));
            }

            const idStr = String(s.id);
            // Pinned lines the operator entered stay until F1 / F5 / delete.
            if (isPinnedId(s.id) || isPinnedId(idStr)) return true;

            // After F1 only — drop just-printed ids, never a line entered after that print.
            if ((isRecentlyPrintedId(s.id) || isRecentlyPrintedId(idStr)) && !isPostPrintNewRow(s)) return false;

            // Typed new-bill entry: ONLY pinned/sticky/local rows the operator entered.
            if (isTypedEntryView) {
                return localTableSalesRef.current.has(idStr)
                    || !!(s._optimistic || String(s.id).startsWith('tmp-'));
            }

            // Unprinted sidebar selection: include live unprinted backend rows for that customer.
            if (!isPendingSale(s)) return false;
            const livePrinted = (allSales || []).find((x) => String(x?.id) === idStr && isPrintedSale(x))
                || (sidebarSales || []).find((x) => String(x?.id) === idStr && isPrintedSale(x));
            if (livePrinted) return false;
            return true;
        };

        // Soft-prune sticky/pins: wrong customer, deleted, or F1-printed — never refresh blinks.
        // NOTE: this only decides whether a row is INCLUDED in this render — it must never
        // mutate stickyTableSalesRef/pinnedBillSalesRef here. activeCustomerCode can be
        // transiently wrong for a single render (state lag between formData/selected*
        // and tableCustomerScopeRef), and permanently deleting on a bad render was the
        // cause of rows vanishing then reappearing before any F1/F5/delete action.
        // Real cleanup of stale pins happens only in the explicit action handlers
        // (customer change / F1 print / F5 / delete), which already .clear() these maps.
        const shouldDropPinned = (sale, idStr) => {
            if (isRowDeleted(idStr) || isRowDeleted(sale?.id)) return true;
            if (!sale?.id) return true;
            if (!activeCustomerCode) return false;
            if (normalizeCode(sale.customer_code) !== activeCustomerCode) return true;
            if (isPostPrintNewRow(sale)) return false;
            if (isPrintedView) {
                const saleBillNo = String(sale.bill_no ?? '').trim();
                if (!saleBillNo) return false;
                return saleBillNo !== printedBillNo;
            }
            return false;
        };

        // Local overlay + refs first — React state can lag one frame behind packs-Enter / POST.
        const candidates = [];
        const pushCandidate = (sale) => {
            if (!sale?.id || isRowDeleted(sale.id)) return;
            if (!matchesScope(sale)) return;
            candidates.push(sale);
        };
        // Pinned bill rows ALWAYS contribute (every packs-Enter line for this customer).
        pinnedBillSalesRef.current.forEach((sale) => pushCandidate(sale));
        stickyTableSalesRef.current.forEach((sale) => pushCandidate(sale));
        (localTableSales || []).forEach(pushCandidate);
        localTableSalesRef.current.forEach((sale) => pushCandidate(sale));
        recentSubmittedSalesRef.current.forEach((entry) => {
            if (entry?.sale && ((Date.now() - (entry.at || 0)) < RECENT_SALE_TRUST_MS || pendingPersistRef.current.has(String(entry.sale.id)))) {
                pushCandidate(entry.sale);
            }
        });
        const hasUnmatchedTemps = (() => {
            let found = inFlightTempIdsRef.current.size > 0 || pendingPersistRef.current.size > 0;
            if (found) return true;
            const check = (sale, idStr) => {
                const id = String(idStr || sale?.id || '');
                if (!id.startsWith('tmp-')) return;
                if (!tempToRealIdRef.current.has(id)) found = true;
            };
            pinnedBillSalesRef.current.forEach(check);
            stickyTableSalesRef.current.forEach(check);
            localTableSalesRef.current.forEach(check);
            return found;
        })();
        const pushBackendCandidate = (sale) => {
            if (!sale?.id) return;
            const idStr = String(sale.id);
            if (idStr.startsWith('tmp-') || sale._optimistic) {
                pushCandidate(sale);
                return;
            }
            if (realToTempIdRef.current.has(idStr) || isPinnedId(idStr) || isPinnedId(sale.id)) {
                pushCandidate(sale);
                return;
            }
            // Unmapped GET row while this bill still has unmatched temps: skip.
            // Showing it is what made the same line appear twice then vanish.
            if (hasUnmatchedTemps) return;
            pushCandidate(sale);
        };
        // Unprinted sidebar / typed-code match: keep the table on live unprinted rows
        // from BOTH sidebar and allSales so a stale 8s allSales poll cannot hide older lines.
        if (!isTypedEntryView && !isPrintedView) {
            (sidebarSalesRef.current || []).forEach(pushBackendCandidate);
            (sidebarSales || []).forEach(pushBackendCandidate);
            (allSalesRef.current || []).forEach(pushBackendCandidate);
            (allSales || []).forEach(pushBackendCandidate);
        }
        if (isPrintedView && printedBillNo) {
            (sidebarSalesRef.current || []).forEach(pushBackendCandidate);
            (sidebarSales || []).forEach(pushBackendCandidate);
            (allSales || []).forEach(pushBackendCandidate);
        }

        const slotKeyFor = (id) => {
            if (id == null) return '';
            const idStr = String(id);
            const stable = stableRowKeyRef.current.get(idStr);
            if (stable) return stable;
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedTemp) return stableRowKeyRef.current.get(String(mappedTemp)) || String(mappedTemp);
            return idStr;
        };
        const putRow = (sale) => {
            if (!sale?.id || isRowDeleted(sale.id)) return;
            const key = slotKeyFor(sale.id);
            if (!key) return;
            const incoming = withEnteredAt(sale);
            const prev = byId.get(key);
            if (!prev) {
                byId.set(key, incoming);
                return;
            }
            // Same physical line (tmp + real): merge in place — never remove then re-add.
            byId.set(key, {
                ...prev,
                ...incoming,
                _enteredAt: prev._enteredAt || incoming._enteredAt,
                _entrySeq: prev._entrySeq ?? incoming._entrySeq,
                _pendingRealId: incoming._pendingRealId
                    || prev._pendingRealId
                    || (!String(incoming.id).startsWith('tmp-') ? incoming.id : null),
            });
        };

        const byId = new Map();
        candidates.forEach((sale) => {
            if (!sale?.id || isRowDeleted(sale.id)) return;
            const pinned = pinnedBillSalesRef.current.get(String(sale.id))
                || stickyTableSalesRef.current.get(String(sale.id));
            const recent = recentSubmittedSalesRef.current.get(String(sale.id))
                || recentSubmittedSalesRef.current.get(sale.id);
            if (recent?.sale && (Date.now() - recent.at) < RECENT_SALE_TRUST_MS) {
                if (isRowDeleted(recent.sale.id)) return;
                const base = pinned || sale;
                const mergedRecent = withEnteredAt({
                    ...base,
                    ...recent.sale,
                    customer_code: recent.sale.customer_code || base.customer_code,
                    bill_printed: recent.sale.bill_printed ?? base.bill_printed ?? 'N',
                    bill_no: recent.sale.bill_no ?? base.bill_no,
                    item_name: recent.sale.item_name || base.item_name,
                    ...(isPrintedView ? {} : { bill_printed: 'N' }),
                }, base);
                if (matchesScope(mergedRecent)) putRow(mergedRecent);
                return;
            }
            if (pinned && matchesScope(pinned)) {
                putRow({ ...pinned, bill_printed: isPrintedView ? pinned.bill_printed : 'N' });
                return;
            }
            putRow(sale);
        });

        // Collapse mapped tmp + real into ONE stable slot (never delete-then-add).
        tempToRealIdRef.current.forEach((realId, tempId) => {
            const tKey = String(tempId);
            const rKey = String(realId);
            const sKey = slotKeyFor(tKey) || slotKeyFor(rKey) || tKey;
            if (isRowDeleted(tKey) || isRowDeleted(rKey)) {
                byId.delete(tKey);
                byId.delete(rKey);
                byId.delete(sKey);
                stickyTableSalesRef.current.delete(tKey);
                pinnedBillSalesRef.current.delete(tKey);
                if (isRowDeleted(rKey)) {
                    stickyTableSalesRef.current.delete(rKey);
                    pinnedBillSalesRef.current.delete(rKey);
                }
                return;
            }
            const keep = byId.get(sKey) || byId.get(tKey) || byId.get(rKey);
            const realSale = recentSubmittedSalesRef.current.get(rKey)?.sale
                || stickyTableSalesRef.current.get(rKey)
                || pinnedBillSalesRef.current.get(rKey)
                || byId.get(rKey);
            if (keep && realSale && rKey !== sKey) {
                putRow(withEnteredAt({
                    ...keep,
                    ...realSale,
                    bill_printed: isPrintedView ? realSale.bill_printed : 'N',
                }, keep));
                byId.delete(rKey);
            } else if (keep) {
                putRow(keep);
            }
        });

        // Hard stick: re-add every surviving pin into its stable slot (never a second row).
        const rePin = (sale, idStr) => {
            if (shouldDropPinned(sale, idStr)) {
                // Exclude from THIS render only — never delete the pin here (see note above).
                byId.delete(slotKeyFor(idStr));
                byId.delete(idStr);
                return;
            }
            putRow(isPrintedView ? sale : { ...sale, bill_printed: sale.bill_printed || 'N' });
        };
        stickyTableSalesRef.current.forEach(rePin);
        pinnedBillSalesRef.current.forEach(rePin);

        const sortNewestFirst = (a, b) => {
            const byTime = enteredAtOf(b) - enteredAtOf(a);
            if (byTime !== 0) return byTime;
            return (Number(b._entrySeq) || 0) - (Number(a._entrySeq) || 0);
        };
        const rows = Array.from(byId.values()).sort(sortNewestFirst);
        // Pin floor: only while this bill is still user-armed.
        if (rows.length === 0 && hasPins && activeCustomerCode && (middleBillArmed || middleBillArmedRef.current) && tableSource) {
            const pinRows = [];
            const takePin = (sale) => {
                if (!sale?.id || isRowDeleted(sale.id)) return;
                if (normalizeCode(sale.customer_code) !== activeCustomerCode) return;
                pinRows.push(withEnteredAt(isPrintedView ? sale : { ...sale, bill_printed: sale.bill_printed || 'N' }));
            };
            pinnedBillSalesRef.current.forEach(takePin);
            stickyTableSalesRef.current.forEach(takePin);
            if (pinRows.length > 0) return pinRows.sort(sortNewestFirst);
        }
        return rows;
    }, [localTableSales, selectedUnprintedCustomer, selectedPrintedCustomer, formData.customer_code, middleBillArmed, sidebarSales, allSales]);

    const autoCustomerCode = useMemo(() => {
        if (!middleBillArmed || isManualClear) return "";

        // STRICT: Never pull customer code into entry inputs from printed bills/sources
        if (middleTableSourceRef.current === 'printed' || selectedPrintedCustomer || selectedPrintedCustomerRef.current) {
            return "";
        }

        if (selectedUnprintedCustomer && middleTableSourceRef.current === 'unprinted') {
            return String(selectedUnprintedCustomer).trim().toUpperCase();
        }

        return String(formData.customer_code || '').trim().toUpperCase();
    }, [middleBillArmed, isManualClear, selectedPrintedCustomer, selectedUnprintedCustomer, formData.customer_code]);
    const currentBillNo = useMemo(() => {
        // Bill number only when user explicitly clicked a printed sidebar bill.
        if (!middleBillArmed || middleTableSourceRef.current !== 'printed') return "";
        if (selectedPrintedCustomer && selectedPrintedCustomer.includes('-')) return selectedPrintedCustomer.split('-')[1] || "N/A";
        if (selectedPrintedCustomer) return printedSales.find(s => s.customer_code === selectedPrintedCustomer)?.bill_no || "N/A";
        return "";
    }, [middleBillArmed, selectedPrintedCustomer, printedSales]);

    // Keep imperative mirrors current every render (F1/+ must not wait for effects).
    // Never rehydrate a printed-sidebar selection while the operator is entering a new bill.
    if (middleTableSourceRef.current === 'typed' || middleTableSourceRef.current === 'unprinted') {
        selectedPrintedCustomerRef.current = null;
    } else {
        selectedPrintedCustomerRef.current = selectedPrintedCustomer;
    }
    selectedUnprintedCustomerRef.current = selectedUnprintedCustomer;
    allSalesRef.current = allSales || [];
    if (!middleUserOpenedRef.current || !middleBillArmedRef.current || !middleTableSourceRef.current) {
        displayedSalesRef.current = [];
    } else if ((displayedSales || []).length > 0) {
        const scope = String(
            formData.customer_code || tableCustomerScopeRef.current || ''
        ).trim().toUpperCase();
        displayedSalesRef.current = scope
            ? displayedSales.filter((s) => String(s?.customer_code || '').trim().toUpperCase() === scope)
            : displayedSales;
    } else {
        // Keep same-customer pins only. Never copy leftover pins from a previous
        // code (RAT while typing RATT).
        const scope = String(
            formData.customer_code || tableCustomerScopeRef.current || ''
        ).trim().toUpperCase();
        const pinRows = [];
        if (scope) {
            pinnedBillSalesRef.current.forEach((sale) => {
                if (String(sale?.customer_code || '').trim().toUpperCase() === scope) pinRows.push(sale);
            });
        }
        displayedSalesRef.current = pinRows;
    }
    // Do not overwrite sidebarSalesRef from React state here. A packs-Enter
    // re-render can land before the latest GET setState commits and would
    // freeze both sidebars on stale data until a full reload.
    formDataRef.current = formData || initialFormData;
    billSizeRef.current = billSize || '3inch';
    loanAmountRef.current = parseFloat(loanAmount) || 0;

    useEffect(() => {
        isMountedRef.current = true;
        // Warm the hidden print iframe so the first F1 does not pay creation cost.
        try { getPrintFrame(); } catch (_) { /* ignore */ }
        const stored = readPendingPersistsFromStorage();
        stored.forEach((job) => {
            if (!job?.tempId) return;
            const tKey = String(job.tempId);
            if (pendingPersistRef.current.has(tKey)) return;
            pendingPersistRef.current.set(tKey, { ...job, inFlight: false, confirmed: false });
            if (job.sale?.id) {
                recentSubmittedSalesRef.current.set(tKey, { sale: job.sale, at: job.createdAt || Date.now() });
                stableRowKeyRef.current.set(tKey, tKey);
            }
        });
        if (pendingPersistRef.current.size > 0) {
            const id = window.setTimeout(() => {
                activeTimeoutsRef.current.delete(id);
                retryPendingPersistsRef.current?.();
            }, 250);
            activeTimeoutsRef.current.add(id);
        }
        return () => {
            if (refreshAbortRef.current) refreshAbortRef.current.abort();
            if (sidebarRefreshAbortRef.current) sidebarRefreshAbortRef.current.abort();
            if (initAbortRef.current) initAbortRef.current.abort();
            if (loanAbortRef.current) loanAbortRef.current.abort();
            // Do not abort in-flight POSTs on unmount — that dropped unsaved rows from the DB.
            pendingSubmitsRef.current.clear();
            pendingSubmitStartedAtRef.current.clear();

            activeIntervalsRef.current.forEach((id) => window.clearInterval(id));
            activeIntervalsRef.current.clear();
            activeTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
            activeTimeoutsRef.current.clear();

            isMountedRef.current = false;
        };
    }, []);
    // F6: clear middle bill selection completely (single handler — duplicate was re-arming ghosts).
    // F6: Clear middle bill selection, form fields, and sales table completely
    useEffect(() => {
        const handleF6Clear = (e) => {
            if (e.key !== "F6") return;
            e.preventDefault();

            // 1. Reset all state flags & trackers
            middleBillArmedRef.current = false;
            middleUserOpenedRef.current = false;
            customerCodeKeyUsedRef.current = false;
            middleTableSourceRef.current = null;
            customerClickGenerationRef.current += 1;
            tableCustomerScopeRef.current = '';
            selectedPrintedCustomerRef.current = null;
            printedBillClickRef.current = false;
            selectedUnprintedCustomerRef.current = null;
            editingSaleIdRef.current = null;
            lastEnteredItemRef.current = null;
            printInFlightRef.current = false;
            printAwaitingBillRef.current = false;
            printStartedAtRef.current = 0;
            lastF1AtRef.current = 0;
            givenAmountInFlightRef.current = false;
            givenAmountStartedAtRef.current = 0;
            processInFlightRef.current = false;
            processStartedAtRef.current = 0;
            ignoreCustomerSelectUntilRef.current = 0;
            refreshInFlightRef.current = false;
            sidebarRefreshInFlightRef.current = false;

            // 2. Clear all local table caches & pinned bill records
            stickyTableSalesRef.current.clear();
            localTableSalesRef.current.clear();
            pinnedBillSalesRef.current.clear();
            displayedSalesRef.current = [];
            loanCacheRef.current.clear();

            // 3. Clear direct DOM values for all input elements
            try {
                Object.keys(refs).forEach((key) => {
                    const el = refs[key]?.current;
                    if (!el) return;
                    if ('value' in el) el.value = '';
                    if (typeof el.clearValue === 'function') {
                        try { el.clearValue(); } catch (_) { /* ignore */ }
                    }
                });
            } catch (_) { /* ignore */ }

            // 4. Reset React form data
            setFormData({ ...initialFormData });

            // 5. Reset component state (empties table, resets totals & selections)
            flushSync(() => {
                updateState({
                    editingSaleId: null,
                    isManualClear: true,
                    middleBillArmed: false,
                    priceManuallyChanged: false,
                    gridPricePerKg: "",
                    selectedSaleForBreakdown: null,
                    isGivenAmountManuallyTouched: false,
                    selectedPrintedCustomer: null,
                    selectedUnprintedCustomer: null,
                    currentBillNo: null,
                    localTableSales: [],
                    searchQueries: {
                        printed: "",
                        unprinted: "",
                        farmerPrinted: "",
                        farmerUnprinted: ""
                    },
                    loanAmount: 0,
                    packCost: 0,
                    itemSearchInput: "",
                    customerSearchInput: "",
                    supplierSearchInput: "",
                    errors: {},
                    customerProfilePic: null,
                    supplierProfilePic: null,
                    customerNameDisplay: "",
                    supplierNameDisplay: "",
                    showSavePhoneButton: false,
                    isPrinting: false,
                    isSubmitting: false,
                    isLoading: false
                });
            });

            // 6. Return focus to Customer Code Input
            setManagedTimeout(() => {
                const customerInput = refs.customer_code_input.current;
                if (customerInput) {
                    customerInput.focus();
                    try { customerInput.select(); } catch (_) { /* ignore */ }
                }
            }, 50);
        };

        window.addEventListener("keydown", handleF6Clear);
        return () => window.removeEventListener("keydown", handleF6Clear);
    }, [setFormData, updateState, setManagedTimeout, refs]);

    // Clear loan cache after long inactivity to avoid stale/accumulated entries in all-day sessions.
    useEffect(() => {
        const markActivity = () => {
            lastUserActivityAtRef.current = Date.now();
        };

        const inactivityInterval = setManagedInterval(() => {
            const idleMs = Date.now() - lastUserActivityAtRef.current;
            if (idleMs >= 30 * 60 * 1000 && loanCacheRef.current.size > 0) {
                loanCacheRef.current.clear();
            }
        }, 5 * 60 * 1000);

        window.addEventListener('mousemove', markActivity);
        window.addEventListener('keydown', markActivity);
        window.addEventListener('touchstart', markActivity);
        window.addEventListener('focus', markActivity);

        return () => {
            window.removeEventListener('mousemove', markActivity);
            window.removeEventListener('keydown', markActivity);
            window.removeEventListener('touchstart', markActivity);
            window.removeEventListener('focus', markActivity);
            clearManagedInterval(inactivityInterval);
        };
    }, [setManagedInterval, clearManagedInterval]);

    const refreshStartedAtRef = useRef(0);
    const lastSalesSignatureRef = useRef('');
    // Last known non-temp sales count — used to reject empty/truncated GET payloads
    // that would wipe the table during rapid POS entry.
    const lastKnownSaleCountRef = useRef(0);

    const normalizeBackendSalesForSidebar = useCallback((rawList) => {
        if (!Array.isArray(rawList)) return null;
        return rawList.reduce((acc, sale) => {
            if (!sale || sale.id == null) return acc;
            if (isTempOrOptimisticSale(sale)) return acc;
            if (isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return acc;
            const billNo = sale.bill_no || sale.customer_bill_no || '';
            acc.push(billNo && sale.bill_no !== billNo ? { ...sale, bill_no: billNo } : sale);
            return acc;
        }, []);
    }, []);

    const applySidebarSales = useCallback((rawList) => {
        let incoming = normalizeBackendSalesForSidebar(rawList);
        if (!incoming) return false;
        const prevList = sidebarSalesRef.current || [];
        // Empty payload guard — never wipe a populated sidebar from a bad GET.
        if (incoming.length === 0 && prevList.length > 0) {
            return false;
        }

        const nowTs = Date.now();
        const isUnprintedStatus = (sale) => {
            const status = String(sale?.bill_printed ?? '').trim().toUpperCase();
            return status !== 'Y';
        };
        const isBlockedPrinted = (id) => {
            if (id == null) return false;
            const at = recentlyPrintedIdsRef.current.get(String(id));
            return !!(at && (nowTs - at) < PRINTED_ID_BLOCK_MS);
        };
        const isLocallyMarkedPrinted = (id) => {
            if (id == null) return false;
            const idStr = String(id);
            if (locallyMarkedPrintedIdsRef.current.has(idStr)) return true;
            const mappedReal = tempToRealIdRef.current.get(idStr);
            if (mappedReal != null && locallyMarkedPrintedIdsRef.current.has(String(mappedReal))) return true;
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedTemp != null && locallyMarkedPrintedIdsRef.current.has(String(mappedTemp))) return true;
            return isBlockedPrinted(id);
        };
        const isBlockedProcessed = (id) => {
            if (id == null) return false;
            const idStr = String(id);
            if ((sidebarKeepUnprintedIdsRef.current.get(idStr) || 0) > nowTs) return false;
            if (locallyProcessedIdsRef.current.has(idStr)) return true;
            const mappedReal = tempToRealIdRef.current.get(idStr);
            if (mappedReal != null && locallyProcessedIdsRef.current.has(String(mappedReal))) return true;
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (mappedTemp != null && locallyProcessedIdsRef.current.has(String(mappedTemp))) return true;
            const at = recentlyProcessedIdsRef.current.get(idStr);
            return !!(at && (nowTs - at) < PRINTED_ID_BLOCK_MS);
        };
        // Just-printed rows must stay Y so unprinted list does not bounce them back in.
        incoming = incoming.filter((s) => s?.id && !isBlockedProcessed(s.id)).map((s) => {
            if (!isLocallyMarkedPrinted(s?.id)) return s;
            const assigned = recentlyPrintedBillNoRef.current.get(String(s.id));
            return {
                ...s,
                bill_printed: 'Y',
                bill_no: s.bill_no || assigned || s.customer_bill_no,
                customer_bill_no: s.customer_bill_no || assigned || s.bill_no,
                _optimistic: false,
            };
        });

        harvestBillNosFromSales(incoming);

        const incomingIds = new Set(incoming.map((s) => String(s.id)));
        const prevUnprintedCount = prevList.filter((s) => isUnprintedStatus(s)).length;
        const incomingUnprintedCount = incoming.filter((s) => isUnprintedStatus(s)).length;
        const known = lastKnownSaleCountRef.current || 0;
        // A GET is healthy only when it is about as complete as what we already show.
        // Never treat a short list (or a GET that lost unprinted bills) as authoritative.
        const healthyGet = incoming.length > 0
            && incoming.length >= Math.max(1, Math.floor(Math.max(prevList.length, known) * 0.9))
            && incomingUnprintedCount >= Math.floor(prevUnprintedCount * 0.9);

        // Merge: keep existing unprinted rows a stale/partial GET omitted.
        const nextById = new Map();
        prevList.forEach((s) => {
            if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
            if (isBlockedProcessed(s.id)) return;
            nextById.set(String(s.id), s);
        });
        incoming.forEach((s) => {
            if (!s?.id || isBlockedProcessed(s.id)) return;
            const idStr = String(s.id);
            const prev = nextById.get(idStr);
            const markedPrinted = isLocallyMarkedPrinted(s.id);
            const incomingUnprinted = isUnprintedStatus(s);
            const assigned = recentlyPrintedBillNoRef.current.get(idStr)
                || recentlyPrintedBillNoRef.current.get(String(s.id));

            // This terminal printed it — never bounce back to unprinted from a stale GET.
            if (markedPrinted) {
                nextById.set(idStr, {
                    ...(prev || {}),
                    ...s,
                    bill_printed: 'Y',
                    bill_no: s.bill_no || assigned || prev?.bill_no || s.customer_bill_no,
                    customer_bill_no: s.customer_bill_no || assigned || prev?.customer_bill_no || s.bill_no,
                    _optimistic: false,
                });
                return;
            }

            // Typed new-bill lines must not land on the unprinted sidebar mid-entry.
            if (incomingUnprinted && middleTableSourceRef.current === 'typed') {
                const recent = recentSubmittedSalesRef.current.get(idStr)
                    || recentSubmittedSalesRef.current.get(s.id);
                if (recent && (nowTs - (recent.at || 0)) < SIDEBAR_UNPRINTED_HOLD_MS) {
                    return;
                }
            }

            // Backend says printed — move to the printed sidebar immediately (live DB).
            if (!incomingUnprinted) {
                nextById.set(idStr, {
                    ...(prev || {}),
                    ...s,
                    bill_printed: 'Y',
                    bill_no: s.bill_no || prev?.bill_no || s.customer_bill_no,
                });
                return;
            }

            // Stale GET saying N must not bounce a locally printed bill back to unprinted.
            if (prev && !isUnprintedStatus(prev) && incomingUnprinted && !healthyGet) {
                nextById.set(idStr, prev);
                return;
            }

            if (prev && isUnprintedStatus(prev) && incomingUnprinted) {
                nextById.set(idStr, {
                    ...prev,
                    ...s,
                    bill_printed: 'N',
                    _sidebarHeldAt: prev._sidebarHeldAt || nowTs,
                });
                return;
            }
            nextById.set(idStr, prev
                ? { ...prev, ...s, _sidebarHeldAt: prev._sidebarHeldAt }
                : { ...s, ...(incomingUnprinted ? { _sidebarHeldAt: nowTs } : {}) });
        });

        recentSubmittedSalesRef.current.forEach((entry, id) => {
            const sale = entry?.sale;
            if (!sale?.id || isTempOrOptimisticSale(sale)) return;
            if (isDeletedSaleId(deletedSaleIdsRef.current, sale.id) || isDeletedSaleId(deletedSaleIdsRef.current, id)) return;
            if (isBlockedPrinted(sale.id) || isBlockedPrinted(id)) return;
            if (isBlockedProcessed(sale.id) || isBlockedProcessed(id)) return;
            if (String(sale.bill_printed ?? '').trim().toUpperCase() === 'Y') return;
            if (middleTableSourceRef.current === 'typed') return;
            if ((nowTs - (entry.at || 0)) > SIDEBAR_UNPRINTED_HOLD_MS) return;
            const idStr = String(sale.id);
            if (!nextById.has(idStr)) {
                nextById.set(idStr, {
                    ...sale,
                    bill_printed: sale.bill_printed || 'N',
                    _optimistic: false,
                    _sidebarHeldAt: entry.at || nowTs,
                });
            }
        });

        // Unprinted rows stay until this terminal calls /sales/mark-printed.
        // A short/stale GET must never make a visible unprinted bill vanish and come back.
        if (healthyGet) {
            prevList.forEach((s) => {
                if (!s?.id) return;
                const idStr = String(s.id);
                if (incomingIds.has(idStr)) {
                    sidebarMissingStreakRef.current.delete(idStr);
                    return;
                }
                if (isBlockedProcessed(s.id)) {
                    nextById.delete(idStr);
                    sidebarMissingStreakRef.current.delete(idStr);
                    return;
                }
                if (isLocallyMarkedPrinted(s.id)) {
                    const existing = nextById.get(idStr) || s;
                    const assigned = recentlyPrintedBillNoRef.current.get(idStr);
                    nextById.set(idStr, {
                        ...existing,
                        bill_printed: 'Y',
                        bill_no: existing.bill_no || assigned || existing.customer_bill_no,
                    });
                    sidebarMissingStreakRef.current.delete(idStr);
                    return;
                }
                if (isUnprintedStatus(s)) {
                    const keepUntil = sidebarKeepUnprintedIdsRef.current.get(idStr) || 0;
                    if (keepUntil > nowTs) {
                        sidebarMissingStreakRef.current.delete(idStr);
                        if (!nextById.has(idStr)) nextById.set(idStr, s);
                        return;
                    }
                    const recent = recentSubmittedSalesRef.current.get(idStr)
                        || recentSubmittedSalesRef.current.get(s.id);
                    const heldAt = Number(s._sidebarHeldAt || recent?.at || 0);
                    const stillHeld = heldAt && (nowTs - heldAt) < SIDEBAR_UNPRINTED_HOLD_MS;
                    if (stillHeld) {
                        sidebarMissingStreakRef.current.delete(idStr);
                        if (!nextById.has(idStr)) nextById.set(idStr, s);
                        return;
                    }
                    const streak = (sidebarMissingStreakRef.current.get(idStr) || 0) + 1;
                    sidebarMissingStreakRef.current.set(idStr, streak);
                    if (streak < SIDEBAR_DROP_STREAK) {
                        if (!nextById.has(idStr)) nextById.set(idStr, s);
                        return;
                    }
                    nextById.delete(idStr);
                    sidebarMissingStreakRef.current.delete(idStr);
                    return;
                }
                const streak = (sidebarMissingStreakRef.current.get(idStr) || 0) + 1;
                sidebarMissingStreakRef.current.set(idStr, streak);
                if (streak < SIDEBAR_DROP_STREAK) return;
                nextById.delete(idStr);
                sidebarMissingStreakRef.current.delete(idStr);
            });
        } else {
            incomingIds.forEach((idStr) => sidebarMissingStreakRef.current.delete(idStr));
        }

        nextById.forEach((_, idStr) => {
            if (isDeletedSaleId(deletedSaleIdsRef.current, idStr)) {
                nextById.delete(idStr);
                return;
            }
            const mappedReal = tempToRealIdRef.current.get(idStr);
            const mappedTemp = realToTempIdRef.current.get(idStr);
            if (
                (mappedReal != null && isDeletedSaleId(deletedSaleIdsRef.current, mappedReal))
                || (mappedTemp != null && isDeletedSaleId(deletedSaleIdsRef.current, mappedTemp))
            ) {
                nextById.delete(idStr);
            }
        });
        const next = Array.from(nextById.values());

        const signature = buildSidebarListSignature(next);
        lastSidebarSuccessAtRef.current = Date.now();
        sidebarSalesRef.current = next;

        const mergeAllSales = (prevAll) => {
            const incomingById = new Map(next.map((s) => [String(s.id), s]));
            const out = [];
            const seen = new Set();
            (prevAll || []).forEach((s) => {
                if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
                const idStr = String(s.id);
                const inc = incomingById.get(idStr);
                if (inc) {
                    const marked = isLocallyMarkedPrinted(s.id);
                    out.push({
                        ...s,
                        ...inc,
                        bill_printed: marked ? 'Y' : (inc.bill_printed ?? s.bill_printed),
                        bill_no: inc.bill_no || s.bill_no,
                    });
                } else {
                    out.push(s);
                }
                seen.add(idStr);
            });
            next.forEach((s) => {
                const idStr = String(s.id);
                if (seen.has(idStr) || isTempOrOptimisticSale(s)) return;
                out.push(s);
                seen.add(idStr);
            });
            return out;
        };

        if (signature === lastSidebarSignatureRef.current) {
            if (isMountedRef.current) {
                setState((prev) => {
                    const have = new Set((prev.allSales || []).map((s) => String(s?.id)).filter(Boolean));
                    const missing = next.filter((s) => s?.id && !have.has(String(s.id)) && !isTempOrOptimisticSale(s));
                    const sidebarSame = buildSidebarListSignature(prev.sidebarSales) === signature;
                    if (missing.length === 0 && sidebarSame) return prev;
                    const nextAll = missing.length ? [...(prev.allSales || []), ...missing] : prev.allSales;
                    if (missing.length) allSalesRef.current = nextAll;
                    return {
                        ...prev,
                        sidebarSales: sidebarSame ? prev.sidebarSales : next,
                        allSales: nextAll,
                    };
                });
            }
            return true;
        }
        lastSidebarSignatureRef.current = signature;
        if (isMountedRef.current) {
            setState((prev) => {
                const nextAll = mergeAllSales(prev.allSales);
                allSalesRef.current = nextAll;
                return {
                    ...prev,
                    sidebarSales: next,
                    allSales: nextAll,
                };
            });
        }
        return true;
    }, [normalizeBackendSalesForSidebar]);

    const hydrateCustomerUnprintedFromDb = useCallback(async (code) => {
        const norm = String(code || '').trim().toUpperCase();
        if (!norm) return;
        const gen = ++customerSalesFetchGenRef.current;
        if (customerSalesAbortRef.current) {
            try { customerSalesAbortRef.current.abort(); } catch (_) { /* ignore */ }
        }
        const controller = new AbortController();
        customerSalesAbortRef.current = controller;
        try {
            const response = await api.get(routes.sales, {
                signal: controller.signal,
                timeout: API_TIMEOUT_MS,
            });
            if (!isMountedRef.current || gen !== customerSalesFetchGenRef.current) return;
            if (String(tableCustomerScopeRef.current || '').trim().toUpperCase() !== norm) return;
            if (middleTableSourceRef.current === 'printed') return;

            const raw = response.data.data || response.data.sales || response.data || [];
            if (!Array.isArray(raw)) return;

            const prevCount = (sidebarSalesRef.current || []).length;
            const looksComplete = raw.length >= Math.max(1, Math.floor(prevCount * 0.9));
            if (looksComplete) {
                applySidebarSales(raw);
            } else {
                const byId = new Map((sidebarSalesRef.current || []).map((s) => [String(s.id), s]));
                raw.forEach((s) => {
                    if (!s?.id || isTempOrOptimisticSale(s)) return;
                    if (isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
                    const idStr = String(s.id);
                    const prev = byId.get(idStr);
                    if (isRecentlyPrintedId(s.id) || locallyMarkedPrintedIdsRef.current.has(String(s.id))) {
                        const assigned = recentlyPrintedBillNoRef.current.get(idStr);
                        byId.set(idStr, {
                            ...(prev || {}),
                            ...s,
                            bill_printed: 'Y',
                            bill_no: s.bill_no || assigned || prev?.bill_no,
                        });
                        return;
                    }
                    byId.set(idStr, prev ? { ...prev, ...s } : s);
                });
                const nextSidebar = Array.from(byId.values());
                sidebarSalesRef.current = nextSidebar;
                lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
                if (isMountedRef.current) {
                    setState((prev) => {
                        const allById = new Map((prev.allSales || []).map((s) => [String(s.id), s]));
                        raw.forEach((s) => {
                            if (!s?.id || isTempOrOptimisticSale(s)) return;
                            allById.set(String(s.id), { ...(allById.get(String(s.id)) || {}), ...s });
                        });
                        const nextAll = Array.from(allById.values());
                        allSalesRef.current = nextAll;
                        return { ...prev, sidebarSales: nextSidebar, allSales: nextAll };
                    });
                }
            }

            const seen = new Set();
            const fromApi = [];
            raw.forEach((s) => {
                if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
                if (String(s.customer_code || '').trim().toUpperCase() !== norm) return;
                if (isTempOrOptimisticSale(s)) return;
                if (isRecentlyPrintedId(s.id) || isLocallyProcessedId(s.id)) return;
                if (!isUnprintedBillStatus(s.bill_printed)) return;
                const idStr = String(s.id);
                if (seen.has(idStr)) return;
                seen.add(idStr);
                fromApi.push({ ...s, bill_printed: s.bill_printed || 'N', _optimistic: false });
            });
            collectUnprintedSalesForCustomer(norm).forEach((s) => {
                const idStr = String(s.id);
                if (seen.has(idStr)) return;
                seen.add(idStr);
                fromApi.push(s);
            });

            if (fromApi.length > 0
                && middleUserOpenedRef.current
                && middleBillArmedRef.current
                && (middleTableSourceRef.current === 'unprinted' || middleTableSourceRef.current === 'typed')
                && String(tableCustomerScopeRef.current || '').trim().toUpperCase() === norm) {
                if (middleTableSourceRef.current !== 'printed') {
                    middleTableSourceRef.current = middleTableSourceRef.current || 'unprinted';
                }
                const painted = paintUnprintedRowsForCustomer(norm, fromApi);
                if (painted.length && isMountedRef.current) {
                    flushSync(() => {
                        setState((prev) => ({
                            ...prev,
                            selectedUnprintedCustomer: norm,
                            selectedPrintedCustomer: null,
                            currentBillNo: null,
                            isManualClear: false,
                            middleBillArmed: true,
                            localTableSales: painted.slice(),
                        }));
                    });
                }
            }
        } catch (error) {
            if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') return;
        } finally {
            if (customerSalesAbortRef.current === controller) customerSalesAbortRef.current = null;
        }
    }, [applySidebarSales, collectUnprintedSalesForCustomer, paintUnprintedRowsForCustomer, isRecentlyPrintedId, isRecentlyProcessedId]);

    // Sidebars stay on live GET /sales all day. Never abort a healthy in-flight poll —
    // aborting every tick was why printed/unprinted lists froze until a full reload.
    const refreshSidebarSales = useCallback(async (force = false) => {
        if (!isMountedRef.current) return;
        if (!initialLoadDoneRef.current) return;
        const now = Date.now();
        if (sidebarRefreshInFlightRef.current) {
            sidebarRefreshPendingRef.current = true;
            return;
        }
        if (!force && now - lastSidebarRefreshAtRef.current < 400) {
            sidebarRefreshPendingRef.current = true;
            return;
        }

        const gen = ++sidebarRefreshGenRef.current;
        const controller = new AbortController();
        sidebarRefreshAbortRef.current = controller;
        sidebarRefreshInFlightRef.current = true;
        sidebarRefreshPendingRef.current = false;
        lastSidebarRefreshAtRef.current = now;

        try {
            const response = await api.get(routes.sales, {
                signal: controller.signal,
                timeout: API_TIMEOUT_MS,
                params: { _sb: gen, _t: now },
                headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            });
            if (!isMountedRef.current || controller.signal.aborted) return;
            if (gen !== sidebarRefreshGenRef.current) return;
            const salesData = response.data.data || response.data.sales || response.data || [];
            if (applySidebarSales(salesData)) {
                lastSidebarSuccessAtRef.current = Date.now();
            }
        } catch (error) {
            if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
                return;
            }
            console.error("Failed to refresh sidebar sales:", error);
        } finally {
            if (sidebarRefreshAbortRef.current === controller) {
                sidebarRefreshAbortRef.current = null;
            }
            sidebarRefreshInFlightRef.current = false;
            if (sidebarRefreshPendingRef.current && isMountedRef.current) {
                sidebarRefreshPendingRef.current = false;
                setManagedTimeout(() => refreshSidebarSales(true), 80);
            }
        }
    }, [applySidebarSales, setManagedTimeout]);

    const refreshSalesData = useCallback(async (force = false) => {
        if (!isMountedRef.current) return;
        if (!initialLoadDoneRef.current) return;
        // Never let a poll/refresh fight in-flight packs-Enter paints.
        if (pendingSubmitsRef.current.size > 0) {
            if (force) pendingForceRefreshRef.current = true;
            return;
        }
        if (refreshInFlightRef.current) {
            if (Date.now() - refreshStartedAtRef.current < API_TIMEOUT_MS + 5000) {
                if (force) pendingForceRefreshRef.current = true;
                return;
            }
            refreshInFlightRef.current = false;
        }

        const now = Date.now();
        // Force refresh always hits the DB; background polls stay lightly throttled.
        if (!force && now - lastRefreshAtRef.current < 2000) return;

        if (refreshAbortRef.current) {
            refreshAbortRef.current.abort();
        }
        const controller = new AbortController();
        refreshAbortRef.current = controller;

        refreshInFlightRef.current = true;
        refreshStartedAtRef.current = now;
        try {
            const response = await api.get(routes.sales, { signal: controller.signal, timeout: API_TIMEOUT_MS });
            if (!isMountedRef.current) return;

            const salesData = response.data.data || response.data.sales || response.data || [];
            const nowTs = Date.now();

            // Invalid payload must never replace a populated table (common under load).
            if (!Array.isArray(salesData)) {
                pendingForceRefreshRef.current = true;
                return;
            }
            const rawList = salesData;
            rawList.forEach((s) => rememberBackendSaleId(s?.id));
            reconcilePendingPersistsWithServerSales(rawList);

            // A submit started while we were fetching — keep local overlay, retry later.
            if (pendingSubmitsRef.current.size > 0) {
                pendingForceRefreshRef.current = true;
                if (pendingPersistRef.current.size > 0) schedulePersistRetry(PERSIST_RETRY_MS);
                return;
            }

            // Empty GET while we already have rows = almost always a bad/partial response.
            // Keep UI as-is and retry; a true empty day starts with lastKnownSaleCountRef=0.
            if (rawList.length === 0 && lastKnownSaleCountRef.current > 0) {
                pendingForceRefreshRef.current = true;
                return;
            }

            // Cap tombstones if refresh has been failing
            if (deletedSaleIdsRef.current.size > 500) {
                const trimmed = [...deletedSaleIdsRef.current].slice(-250);
                deletedSaleIdsRef.current = new Set(trimmed);
            }

            // CRITICAL FIX: Filter out deleted records from server sales
            const serverSales = rawList.filter((sale) => {
                const saleId = sale?.id;
                if (saleId == null) return false;
                if (isDeletedSaleId(deletedSaleIdsRef.current, saleId)) return false;
                return true;
            });

            // Truncated payload guard (e.g. proxy/error body parsed as short array).
            const known = lastKnownSaleCountRef.current;
            if (known > 15 && serverSales.length < Math.floor(known * 0.5) && serverSales.length < known - 10) {
                pendingForceRefreshRef.current = true;
                return;
            }

            harvestBillNosFromSales(serverSales);
            applySidebarSales(serverSales);

            const baseIds = new Set(serverSales.map((s) => s?.id).filter((id) => id != null).map(String));

            // CRITICAL FIX: Remove deleted records from recentSubmittedSalesRef
            const deletedIdsToRemove = [];
            recentSubmittedSalesRef.current.forEach((entry, id) => {
                if (deletedSaleIdsRef.current.has(id) || deletedSaleIdsRef.current.has(String(id))) {
                    deletedIdsToRemove.push(id);
                }
            });
            deletedIdsToRemove.forEach(id => recentSubmittedSalesRef.current.delete(id));

            // Keep just-submitted rows for a short window (covers stale GET after POST)
            recentSubmittedSalesRef.current.forEach((entry, id) => {
                if (!entry || !id) return;
                const ageMs = nowTs - entry.at;
                if (ageMs > 60000) {
                    recentSubmittedSalesRef.current.delete(id);
                    return;
                }
                // CRITICAL FIX: Double-check this ID wasn't deleted
                if (deletedSaleIdsRef.current.has(id) || deletedSaleIdsRef.current.has(String(id))) {
                    recentSubmittedSalesRef.current.delete(id);
                    return;
                }
                const idStr = String(id);
                if (!baseIds.has(idStr) && !deletedSaleIdsRef.current.has(id) && !deletedSaleIdsRef.current.has(idStr)) {
                    serverSales.push(entry.sale);
                    baseIds.add(idStr);
                }
            });

            lastRefreshAtRef.current = Date.now();

            setState((prev) => {
                // CRITICAL FIX: Filter deleted records from overlay
                const overlayById = new Map();
                (prev.localTableSales || []).forEach((sale) => {
                    if (sale?.id == null) return;
                    const idStr = String(sale.id);
                    // Skip if deleted
                    if (deletedSaleIdsRef.current.has(sale.id) || deletedSaleIdsRef.current.has(idStr)) {
                        return;
                    }
                    overlayById.set(idStr, sale);
                });

                // CRITICAL FIX: Also filter from localTableSalesRef
                localTableSalesRef.current.forEach((sale, id) => {
                    // Skip if this id is marked as deleted
                    if (deletedSaleIdsRef.current.has(id) || deletedSaleIdsRef.current.has(String(id))) {
                        localTableSalesRef.current.delete(id);
                        return;
                    }
                    if (!overlayById.has(id)) overlayById.set(id, sale);
                });

                const mergedById = new Map();
                // Seed with ALL previous rows, then let the server overwrite.
                (prev.allSales || []).forEach((sale) => {
                    if (sale?.id == null) return;
                    const idStr = String(sale.id);
                    // Skip if deleted
                    if (deletedSaleIdsRef.current.has(sale.id) || deletedSaleIdsRef.current.has(idStr)) {
                        return;
                    }
                    mergedById.set(idStr, sale);
                });

                // Server is authoritative UNLESS we have a fresher local submit for that id.
                // Stale GETs were overwriting optimistic price/create paints and causing flicker.
                // Exception: once the backend marks a row printed (bill_no / bill_printed=Y),
                // that print status always wins — otherwise just-printed bills vanish from the table.
                serverSales.forEach((sale) => {
                    if (sale?.id == null) return;
                    const idStr = String(sale.id);
                    if (isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
                    // Stale GET can still say bill_printed=N right after F1 — keep it printed locally.
                    if (isLocallyProcessedId(sale.id) || isLocallyProcessedId(idStr)) {
                        return;
                    }
                    if (isRecentlyPrintedId(sale.id) || isRecentlyPrintedId(idStr)) {
                        const assigned = recentlyPrintedBillNoRef.current.get(idStr)
                            || recentlyPrintedBillNoRef.current.get(String(sale.id));
                        mergedById.set(idStr, {
                            ...sale,
                            bill_printed: 'Y',
                            bill_no: sale.bill_no || assigned || sale.customer_bill_no,
                            _optimistic: false,
                        });
                        return;
                    }
                    const recent = recentSubmittedSalesRef.current.get(idStr)
                        || recentSubmittedSalesRef.current.get(sale.id);
                    if (recent?.sale && (nowTs - recent.at) < RECENT_SALE_TRUST_MS) {
                        const serverPrinted = String(sale.bill_printed ?? '').trim().toUpperCase() === 'Y';
                        const recentPrinted = String(recent.sale.bill_printed ?? '').trim().toUpperCase() === 'Y';
                        if (serverPrinted && (!recentPrinted || (sale.bill_no && !recent.sale.bill_no))) {
                            const mergedPrinted = {
                                ...recent.sale,
                                ...sale,
                                bill_printed: sale.bill_printed || 'Y',
                                bill_no: sale.bill_no || recent.sale.bill_no,
                            };
                            mergedById.set(idStr, mergedPrinted);
                            recentSubmittedSalesRef.current.set(idStr, { sale: mergedPrinted, at: nowTs });
                            return;
                        }
                        mergedById.set(idStr, {
                            ...sale,
                            ...recent.sale,
                            // Never lose a server-assigned bill number under a fresher local edit.
                            bill_no: recent.sale.bill_no || sale.bill_no,
                            bill_printed: recentPrinted ? recent.sale.bill_printed : (sale.bill_printed ?? recent.sale.bill_printed),
                        });
                        return;
                    }
                    mergedById.set(idStr, sale);
                });

                // Overlay / in-flight temps always win for visibility.
                overlayById.forEach((sale, idStr) => {
                    if (isDeletedSaleId(deletedSaleIdsRef.current, idStr) || isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) {
                        return;
                    }
                    const recent = recentSubmittedSalesRef.current.get(idStr)
                        || recentSubmittedSalesRef.current.get(sale.id);
                    if (recent?.sale) {
                        mergedById.set(idStr, recent.sale);
                        return;
                    }
                    if (!mergedById.has(idStr)) mergedById.set(idStr, sale);
                });

                recentSubmittedSalesRef.current.forEach((entry, id) => {
                    if (!entry?.sale || entry.sale.id == null) return;
                    if (isDeletedSaleId(deletedSaleIdsRef.current, id) || isDeletedSaleId(deletedSaleIdsRef.current, entry.sale.id)) {
                        return;
                    }
                    const idStr = String(entry.sale.id);
                    if (isDeletedSaleId(deletedSaleIdsRef.current, idStr)) return;
                    const existing = mergedById.get(idStr);
                    if (!existing || (nowTs - entry.at) < RECENT_SALE_TRUST_MS) {
                        mergedById.set(idStr, entry.sale);
                    }
                });

                const mergedSalesData = Array.from(mergedById.values());

                // Prune local overlay carefully — NEVER drop a just-entered row during rapid entry.
                const nextLocal = [];
                const nextLocalIds = new Set();
                overlayById.forEach((sale) => {
                    if (!sale?.id) return;
                    const idStr = String(sale.id);
                    // Skip if deleted
                    if (deletedSaleIdsRef.current.has(idStr) || deletedSaleIdsRef.current.has(sale.id)) {
                        return;
                    }
                    const recent = recentSubmittedSalesRef.current.get(idStr)
                        || recentSubmittedSalesRef.current.get(sale.id);
                    const isFreshRecent = !!(recent && (nowTs - recent.at) < RECENT_SALE_TRUST_MS);
                    const isTemp = !!(sale._optimistic || idStr.startsWith('tmp-'));
                    if (isTemp) {
                        // If this temp already resolved to a real id that is present, drop the temp copy.
                        const mappedReal = tempToRealIdRef.current.get(idStr);
                        if (mappedReal && (baseIds.has(String(mappedReal)) || mergedById.has(String(mappedReal)))) {
                            return;
                        }
                        // Still waiting for this Enter to land in the database — never drop it.
                        if (pendingPersistRef.current.has(idStr) || inFlightTempIdsRef.current.has(idStr)) {
                            nextLocal.push(sale);
                            nextLocalIds.add(idStr);
                            return;
                        }
                        // Still in-flight or waiting for POST response mapping.
                        if (recent || isFreshRecent) {
                            nextLocal.push(recent?.sale && !String(recent.sale.id).startsWith('tmp-')
                                ? { ...sale } // keep temp id in overlay until React swap
                                : sale);
                            nextLocalIds.add(idStr);
                            return;
                        }
                        // Orphan temp older than 60s with no tracker — drop.
                        const createdAt = Number(String(idStr).split('-')[1]) || 0;
                        if (createdAt && Date.now() - createdAt < 60000) {
                            nextLocal.push(sale);
                            nextLocalIds.add(idStr);
                        } else if (!createdAt) {
                            nextLocal.push(sale);
                            nextLocalIds.add(idStr);
                        }
                        return;
                    }
                    // Keep confirmed local rows for the trust window even when GET also has them.
                    // Dropping them immediately was a common "disappear then reappear" flicker.
                    if (baseIds.has(idStr)) {
                        if (middleTableSourceRef.current === 'printed') {
                            const printedSel = String(selectedPrintedCustomerRef.current || '');
                            const printedBill = printedSel.includes('-') ? printedSel.slice(printedSel.lastIndexOf('-') + 1) : '';
                            nextLocal.push({
                                ...(isFreshRecent && recent?.sale ? recent.sale : sale),
                                bill_printed: 'Y',
                                bill_no: (isFreshRecent && recent?.sale?.bill_no) || sale.bill_no || printedBill || null,
                            });
                            nextLocalIds.add(idStr);
                            return;
                        }
                        if (isFreshRecent && recent?.sale) {
                            nextLocal.push(recent.sale);
                            nextLocalIds.add(idStr);
                        }
                        return;
                    }
                    nextLocal.push(isFreshRecent && recent?.sale ? recent.sale : sale);
                    nextLocalIds.add(idStr);
                });

                // Also pin every fresh recent submit into the overlay (covers state lag).
                recentSubmittedSalesRef.current.forEach((entry, id) => {
                    if (!entry?.sale?.id) return;
                    if ((nowTs - entry.at) >= RECENT_SALE_TRUST_MS) return;
                    if (isDeletedSaleId(deletedSaleIdsRef.current, id) || isDeletedSaleId(deletedSaleIdsRef.current, entry.sale.id)) return;
                    // Never re-pin just-printed rows into the middle overlay after F1 clear —
                    // unless the operator explicitly opened that printed bill in the sidebar.
                    if (middleTableSourceRef.current !== 'printed') {
                        if (isRecentlyPrintedId(id) || isRecentlyPrintedId(entry.sale.id)) return;
                        if (String(entry.sale.bill_printed ?? '').trim().toUpperCase() === 'Y') return;
                    }
                    const idStr = String(entry.sale.id);
                    if (nextLocalIds.has(idStr)) return;
                    // Prefer real id; skip dangling temp if mapped real is already listed.
                    if (String(id).startsWith('tmp-') && tempToRealIdRef.current.has(String(id))) {
                        const realId = String(tempToRealIdRef.current.get(String(id)));
                        if (nextLocalIds.has(realId) || mergedById.has(realId)) return;
                    }
                    nextLocal.push(entry.sale);
                    nextLocalIds.add(idStr);
                    if (!mergedById.has(idStr)) mergedById.set(idStr, entry.sale);
                });

                // Sync ref without clear()
                const prevLocalIds = new Set(
                    (prev.localTableSales || []).map((s) => (s?.id != null ? String(s.id) : null)).filter(Boolean)
                );
                nextLocal.forEach((sale) => {
                    // Skip if deleted
                    if (deletedSaleIdsRef.current.has(sale.id) || deletedSaleIdsRef.current.has(String(sale.id))) {
                        return;
                    }
                    localTableSalesRef.current.set(String(sale.id), sale);
                });
                prevLocalIds.forEach((id) => {
                    if (nextLocalIds.has(id)) return;
                    if (recentSubmittedSalesRef.current.has(id)) return;
                    if (pendingPersistRef.current.has(id)) return;
                    if (inFlightTempIdsRef.current.has(id)) return;
                    // Never delete a temp that still maps to an unresolved/recent real row.
                    if (String(id).startsWith('tmp-') && tempToRealIdRef.current.has(String(id))) {
                        const realId = String(tempToRealIdRef.current.get(String(id)));
                        if (recentSubmittedSalesRef.current.has(realId) || nextLocalIds.has(realId)) return;
                    }
                    localTableSalesRef.current.delete(id);
                });

                const confirmedCount = mergedSalesData.filter(
                    (s) => s?.id != null && !String(s.id).startsWith('tmp-') && !s._optimistic
                ).length;
                lastKnownSaleCountRef.current = confirmedCount;

                const signature = buildSalesSignature(mergedSalesData) + `|L${nextLocal.length}:${nextLocal.map((s) => s.id).join(',')}`;
                if (signature === lastSalesSignatureRef.current
                    && nextLocal.length === (prev.localTableSales || []).length) {
                    return prev;
                }
                lastSalesSignatureRef.current = signature;
                const tableOpen = !!(middleUserOpenedRef.current && middleBillArmedRef.current && middleTableSourceRef.current);
                return {
                    ...prev,
                    allSales: mergedSalesData,
                    localTableSales: tableOpen ? nextLocal : [],
                    middleBillArmed: tableOpen ? prev.middleBillArmed : false,
                    selectedUnprintedCustomer: tableOpen ? prev.selectedUnprintedCustomer : null,
                    selectedPrintedCustomer: tableOpen ? prev.selectedPrintedCustomer : null,
                };
            });

            try {
                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                const storedDeletes = JSON.parse(localStorage.getItem('deletedSaleIds') || '[]');
                const freshDeletes = storedDeletes.filter(item => {
                    if (item.timestamp && item.timestamp > fiveMinutesAgo) return true;
                    return deletedSaleIdsRef.current.has(item.id);
                });
                localStorage.setItem('deletedSaleIds', JSON.stringify(freshDeletes));
            } catch (e) {
                // Ignore localStorage errors
            }

        } catch (error) {
            if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
                return;
            }
            console.error("Failed to refresh sales data:", error);
        } finally {
            if (refreshAbortRef.current === controller) {
                refreshAbortRef.current = null;
            }
            refreshInFlightRef.current = false;
            if (pendingForceRefreshRef.current && isMountedRef.current && pendingSubmitsRef.current.size === 0) {
                let freshLocal = false;
                recentSubmittedSalesRef.current.forEach((entry) => {
                    if (entry && (Date.now() - entry.at) < 2500) freshLocal = true;
                });
                if (freshLocal) {
                    // Keep rows glued — retry after the trust burst, do not wipe mid-entry.
                    setManagedTimeout(() => {
                        if (pendingSubmitsRef.current.size === 0) {
                            pendingForceRefreshRef.current = false;
                            refreshSalesData(true);
                        }
                    }, 2500);
                } else {
                    pendingForceRefreshRef.current = false;
                    setManagedTimeout(() => refreshSalesData(true), 250);
                }
            }
        }
    }, [setManagedTimeout, applySidebarSales, rememberBackendSaleId, reconcilePendingPersistsWithServerSales, schedulePersistRetry]);
    // Listen for updates from PrintedBills page and cross-tab storage updates.
    useEffect(() => {
        const handleSalesUpdate = () => {
            if (salesNotifyFromSelf) return;
            refreshSalesData(true);
            refreshSidebarSales(true);
        };

        const handleStorageChange = (event) => {
            if (event.key === 'salesDataUpdated') {
                refreshSalesData(true);
                refreshSidebarSales(true);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshSalesData();
                refreshSidebarSales(true);
            }
        };

        window.addEventListener('salesDataUpdated', handleSalesUpdate);
        window.addEventListener('storage', handleStorageChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('salesDataUpdated', handleSalesUpdate);
            window.removeEventListener('storage', handleStorageChange);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [refreshSalesData, refreshSidebarSales]);

    // Keep main table synced periodically.
    useEffect(() => {
        const interval = setManagedInterval(() => {
            if (document.visibilityState === 'visible') {
                refreshSalesData();
            }
        }, 8000);

        return () => clearManagedInterval(interval);
    }, [refreshSalesData, setManagedInterval, clearManagedInterval]);

    // Sticky all-day sidebar poll. Never await the GET here — a hung request
    // used to stop this loop until a full page reload.
    useEffect(() => {
        let cancelled = false;
        let timerId = null;

        const tick = () => {
            if (cancelled) return;
            if (document.visibilityState === 'visible') {
                refreshSidebarSales(false).catch(() => { });
            }
            timerId = window.setTimeout(tick, SIDEBAR_POLL_MS);
        };

        timerId = window.setTimeout(tick, 200);
        const onWake = () => {
            if (!cancelled && document.visibilityState === 'visible') {
                refreshSidebarSales(true);
            }
        };
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);
        window.addEventListener('online', onWake);

        return () => {
            cancelled = true;
            if (timerId) window.clearTimeout(timerId);
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', onWake);
            window.removeEventListener('online', onWake);
        };
    }, [refreshSidebarSales]);

    // All-day anti-stuck watchdog: clear hung print/submit/refresh locks and keep sidebars live.
    useEffect(() => {
        const interval = setManagedInterval(() => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();

            if (printAwaitingBillRef.current && printStartedAtRef.current
                && now - printStartedAtRef.current > PRINT_AWAIT_MAX_MS) {
                printAwaitingBillRef.current = false;
                printInFlightRef.current = false;
                printStartedAtRef.current = 0;
                lastF1AtRef.current = 0;
                updateState({ isPrinting: false });
            }
            if (printInFlightRef.current && printStartedAtRef.current
                && now - printStartedAtRef.current > PRINT_LOCK_MAX_MS) {
                // Keep F1 hot all day — do not leave printInFlight stuck after the dialog.
                printInFlightRef.current = false;
                printAwaitingBillRef.current = false;
                printStartedAtRef.current = 0;
                lastF1AtRef.current = 0;
                updateState({ isPrinting: false });
            }

            if (givenAmountInFlightRef.current && givenAmountStartedAtRef.current
                && now - givenAmountStartedAtRef.current > API_TIMEOUT_MS + 5000) {
                givenAmountInFlightRef.current = false;
                givenAmountStartedAtRef.current = 0;
            }
            if (processInFlightRef.current && processStartedAtRef.current
                && now - processStartedAtRef.current > MARK_IDS_WAIT_MS + MARK_IDS_LEFTOVER_WAIT_MS + 20000) {
                processInFlightRef.current = false;
                processStartedAtRef.current = 0;
                updateState({ isSubmitting: false });
            }
            if (now >= ignoreCustomerSelectUntilRef.current) {
                ignoreCustomerSelectUntilRef.current = 0;
            }

            // Drop abandoned submit tracking so refresh is never blocked all day.
            // Never abort the request itself — cancelling POSTs lost rows from the DB.
            pendingSubmitStartedAtRef.current.forEach((startedAt, generation) => {
                if (now - startedAt <= SUBMIT_TIMEOUT_MS + 3000) return;
                pendingSubmitsRef.current.delete(generation);
                pendingSubmitStartedAtRef.current.delete(generation);
            });
            if (pendingSubmitsRef.current.size === 0 && !processInFlightRef.current) {
                updateState({ isSubmitting: false });
            }

            if (refreshInFlightRef.current
                && now - refreshStartedAtRef.current > API_TIMEOUT_MS + 5000) {
                try { refreshAbortRef.current?.abort(); } catch (_) { /* ignore */ }
                refreshInFlightRef.current = false;
            }
            if (sidebarRefreshInFlightRef.current
                && now - lastSidebarRefreshAtRef.current > API_TIMEOUT_MS + 5000) {
                try { sidebarRefreshAbortRef.current?.abort(); } catch (_) { /* ignore */ }
                sidebarRefreshInFlightRef.current = false;
                sidebarRefreshPendingRef.current = true;
            }
            if (referenceRefreshInFlightRef.current
                && now - referenceRefreshStartedAtRef.current > API_TIMEOUT_MS + 5000) {
                referenceRefreshInFlightRef.current = false;
            }

            pruneAgedMap(recentlyPrintedIdsRef.current, PRINTED_ID_BLOCK_MS, now);
            pruneAgedMap(recentlyProcessedIdsRef.current, PRINTED_ID_BLOCK_MS, now);
            sidebarKeepUnprintedIdsRef.current.forEach((until, id) => {
                if (!until || now > until) sidebarKeepUnprintedIdsRef.current.delete(id);
            });
            recentlyPrintedBillNoRef.current.forEach((_, id) => {
                if (!recentlyPrintedIdsRef.current.has(id)) recentlyPrintedBillNoRef.current.delete(id);
            });
            pruneAgedMap(recentSubmittedSalesRef.current, 60000, now);
            pendingPersistRef.current.forEach((job, tempId) => {
                if (!job?.sale) return;
                if (!recentSubmittedSalesRef.current.has(String(tempId))) {
                    recentSubmittedSalesRef.current.set(String(tempId), { sale: job.sale, at: job.createdAt || now });
                }
            });
            pruneOldestMapEntries(tempToRealIdRef.current, 1500);
            pruneOldestMapEntries(realToTempIdRef.current, 1500);
            pruneOldestMapEntries(stableRowKeyRef.current, 1500);
            pruneOldestMapEntries(deletedSaleIdsRef.current, 400);
            pruneOldestMapEntries(locallyProcessedIdsRef.current, 800);
            pruneOldestMapEntries(loanCacheRef.current, 200);

            // Recover only when the last successful DB apply is stale — never abort a healthy poll.
            const lastOk = lastSidebarSuccessAtRef.current || lastSidebarRefreshAtRef.current;
            if (!sidebarRefreshInFlightRef.current && now - lastOk > SIDEBAR_POLL_MS + 2500) {
                refreshSidebarSales(true);
            }
        }, POS_WATCHDOG_MS);

        return () => clearManagedInterval(interval);
    }, [refreshSidebarSales, updateState, setManagedInterval, clearManagedInterval]);

    // Reference data (customers/items/suppliers) also goes stale over an all-day session;
    // refresh it quietly every 10 minutes without touching the sales list or the form.
    useEffect(() => {
        const interval = setManagedInterval(async () => {
            if (document.visibilityState !== 'visible') return;
            if (referenceRefreshInFlightRef.current) {
                // Stuck-lock recovery if a prior refresh never cleared the flag.
                if (Date.now() - referenceRefreshStartedAtRef.current < API_TIMEOUT_MS + 5000) return;
                referenceRefreshInFlightRef.current = false;
            }
            referenceRefreshInFlightRef.current = true;
            referenceRefreshStartedAtRef.current = Date.now();
            const controller = new AbortController();
            try {
                const reqConfig = { signal: controller.signal, timeout: API_TIMEOUT_MS };
                const [resCustomers, resItems, resSuppliers] = await Promise.all([
                    api.get(routes.customers, reqConfig),
                    api.get(routes.items, reqConfig),
                    api.get(routes.suppliers, reqConfig)
                ]);
                if (!isMountedRef.current) return;
                updateState({
                    customers: resCustomers.data.data || resCustomers.data.customers || resCustomers.data || [],
                    items: resItems.data.data || resItems.data.items || resItems.data || [],
                    suppliers: resSuppliers.data.data || resSuppliers.data.suppliers || resSuppliers.data || [],
                });
            } catch {
                // A failed background refresh is harmless; existing data stays usable.
            } finally {
                referenceRefreshInFlightRef.current = false;
            }
        }, 10 * 60 * 1000);

        return () => clearManagedInterval(interval);
    }, [updateState, setManagedInterval, clearManagedInterval]);


    const fetchLoanAmount = useCallback(async (customerCode) => {
        if (!customerCode) return updateState({ loanAmount: 0 });

        const normalized = String(customerCode).trim().toUpperCase();
        if (loanCacheRef.current.has(normalized)) {
            updateState({ loanAmount: loanCacheRef.current.get(normalized) });
            return;
        }

        if (loanAbortRef.current) {
            loanAbortRef.current.abort();
        }
        const controller = new AbortController();
        loanAbortRef.current = controller;

        try {
            const response = await api.post(routes.getLoanAmount, { customer_short_name: customerCode }, { signal: controller.signal, timeout: API_TIMEOUT_MS });
            const value = parseFloat(response.data.total_loan_amount) || 0;
            // Prevent unbounded cache growth during long-running sessions.
            if (!loanCacheRef.current.has(normalized) && loanCacheRef.current.size >= 200) {
                const oldestKey = loanCacheRef.current.keys().next().value;
                if (oldestKey !== undefined) {
                    loanCacheRef.current.delete(oldestKey);
                }
            }
            loanCacheRef.current.set(normalized, value);
            updateState({ loanAmount: value });
        } catch (error) {
            if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
                return;
            }
            updateState({ loanAmount: 0 });
        } finally {
            if (loanAbortRef.current === controller) {
                loanAbortRef.current = null;
            }
        }
    }, [updateState]);

    const fetchInitialData = useCallback(async (attempt = 0) => {
        if (initAbortRef.current) {
            initAbortRef.current.abort();
        }
        const controller = new AbortController();
        initAbortRef.current = controller;

        try {
            let userData = null;
            try { userData = JSON.parse(localStorage.getItem('user')); } catch { /* corrupt storage should not block the page */ }
            const reqConfig = { signal: controller.signal, timeout: API_TIMEOUT_MS };
            const [resSales, resCustomers, resItems, resSuppliers] = await Promise.all([
                api.get(routes.sales, reqConfig),
                api.get(routes.customers, reqConfig),
                api.get(routes.items, reqConfig),
                api.get(routes.suppliers, reqConfig)
            ]);

            if (!isMountedRef.current) return;

            const salesData = resSales.data.data || resSales.data.sales || resSales.data || [];
            const customersData = resCustomers.data.data || resCustomers.data.customers || resCustomers.data || [];
            const itemsData = resItems.data.data || resItems.data.items || resItems.data || [];
            const suppliersData = resSuppliers.data.data || resSuppliers.data.suppliers || resSuppliers.data || [];
            const normalizedSales = Array.isArray(salesData)
                ? salesData.filter((sale) => !deletedSaleIdsRef.current.has(sale?.id) && !deletedSaleIdsRef.current.has(String(sale?.id ?? '')))
                : [];
            lastKnownSaleCountRef.current = normalizedSales.filter(
                (s) => s?.id != null && !String(s.id).startsWith('tmp-')
            ).length;
            harvestBillNosFromSales(normalizedSales);
            const sidebarNormalized = normalizeBackendSalesForSidebar(normalizedSales) || [];
            lastSidebarSignatureRef.current = buildSidebarListSignature(sidebarNormalized);
            lastSidebarSuccessAtRef.current = Date.now();
            sidebarSalesRef.current = sidebarNormalized;
            allSalesRef.current = normalizedSales;
            initialLoadDoneRef.current = true;
            updateState({
                allSales: normalizedSales,
                sidebarSales: sidebarNormalized,
                customers: customersData,
                items: itemsData,
                suppliers: suppliersData,
                isLoading: false,
                currentUser: userData,
                errors: {},
            });
        } catch (error) {
            if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
                return;
            }
            console.error("Failed to load initial sales data:", error);
            updateState({ errors: { form: 'Failed to load data. Retrying…' } });
            // Auto-retry with backoff so a brief network blip at page open doesn't leave
            // the operator with an empty screen for the rest of the day.
            if (attempt < 5 && isMountedRef.current) {
                setManagedTimeout(() => fetchInitialData(attempt + 1), Math.min(30000, 2000 * (attempt + 1)));
            } else if (isMountedRef.current) {
                updateState({ isLoading: false });
            }
        } finally {
            if (initAbortRef.current === controller) {
                initAbortRef.current = null;
            }
        }
    }, [updateState, setManagedTimeout, normalizeBackendSalesForSidebar]);

    const fetchLatestBillNoFromBackend = useCallback(async () => {
        try {
            const response = await api.get(routes.latestBillNo, { timeout: 8000 });
            const n = parseCustomerBillNo(
                response.data?.bill_no
                ?? response.data?.latest_bill_no
                ?? response.data?.data?.bill_no
            );
            if (n > 0) rememberFrontendBillNo(n);
        } catch (_) {
            // Endpoint may not exist yet — harvest from GET /sales still runs.
        }
    }, []);

    useEffect(() => {
        const interval = setManagedInterval(() => {
            if (document.visibilityState === 'visible') fetchLatestBillNoFromBackend();
        }, 20000);
        return () => clearManagedInterval(interval);
    }, [fetchLatestBillNoFromBackend, setManagedInterval, clearManagedInterval]);

    useEffect(() => {
        // Only clear given_amount when the customer selection is gone — not when
        // displayedSales briefly goes empty during a refresh/filter flicker.
        const hasCustomer = !!(formData.customer_code || autoCustomerCode || selectedUnprintedCustomer || selectedPrintedCustomer);
        if (!hasCustomer) {
            setFormData(prev => (prev.given_amount === "" ? prev : { ...prev, given_amount: "" }));
        }
    }, [formData.customer_code, autoCustomerCode, selectedUnprintedCustomer, selectedPrintedCustomer, setFormData]);
    useEffect(() => {
        // Photos only when middle bill was explicitly armed (click / typed code).
        if (!middleBillArmed) {
            updateState({ customerProfilePic: null, customerNameDisplay: "" });
            return;
        }
        const code = formData.customer_code || autoCustomerCode;

        if (code && customers.length > 0) {
            const customer = customers.find(c =>
                String(c.short_name).toUpperCase() === String(code).toUpperCase()
            );

            if (customer) {
                const baseUrl = "https://goviraju.lk/sms_new_backend_50500/application/public";
                let fileName = customer.profile_pic;
                let fullPath = null;

                if (fileName) {
                    if (fileName.startsWith('http')) {
                        fullPath = fileName;
                    } else {
                        const cleanFileName = fileName.replace('public/', '');
                        const subPath = cleanFileName.includes('customers')
                            ? cleanFileName
                            : `customers/${cleanFileName}`;

                        fullPath = `${baseUrl}/storage/${subPath}`;
                    }
                }

                updateState({
                    customerProfilePic: fullPath,
                    customerNameDisplay: customer.name || ""
                });
            } else {
                updateState({ customerProfilePic: null, customerNameDisplay: "" });
            }
        } else {
            updateState({ customerProfilePic: null, customerNameDisplay: "" });
        }
    }, [middleBillArmed, formData.customer_code, autoCustomerCode, customers, updateState]);
    // useEffect to fetch Supplier profile pic
    useEffect(() => {
        const code = formData.supplier_code;
        if (code && suppliers.length > 0) {
            const supplier = suppliers.find(s =>
                String(s.code).toUpperCase() === String(code).toUpperCase()
            );

            if (supplier) {
                // Root path where the 'storage' symlink is located
                const baseUrl = "https://goviraju.lk/sms_new_backend_50500/application/public";
                let fileName = supplier.profile_pic;

                let fullPath = null;

                if (fileName) {
                    if (fileName.startsWith('http')) {
                        // Use directly if it's already a full URL
                        fullPath = fileName;
                    } else {
                        // Check if 'suppliers/profiles' is already in the filename string from DB
                        // If not, we manually add it to match your folder structure
                        const subPath = fileName.includes('suppliers/profiles')
                            ? fileName.replace('public/', '')
                            : `suppliers/profiles/${fileName.replace('public/', '')}`;

                        fullPath = `${baseUrl}/storage/${subPath}`;
                    }
                }

                updateState({
                    supplierProfilePic: fullPath,
                    supplierNameDisplay: supplier.name || ""
                });
            } else {
                updateState({ supplierProfilePic: null, supplierNameDisplay: "" });
            }
        } else {
            updateState({ supplierProfilePic: null, supplierNameDisplay: "" });
        }
    }, [formData.supplier_code, suppliers]);
    useEffect(() => {
        const w = parseFloat(formData.weight) || 0;
        const p = parseFloat(formData.price_per_kg) || 0;
        const total = Number((w * p).toFixed(2));
        // Bail when the value is already correct so this effect doesn't trigger an extra
        // render for every keystroke in unrelated fields.
        setFormData(prev => (prev.total === total ? prev : { ...prev, total }));
        // Only mirror into the grid price when the operator typed a bulk price.
        // Copying formData.price_per_kg here re-filled the price field from leftover sales.
    }, [formData.weight, formData.price_per_kg, formData.packs, formData.pack_due]);

    useEffect(() => {
        fetchInitialData();
        fetchLatestBillNoFromBackend();
        refs.customer_code_input.current?.focus();
    }, [fetchInitialData, fetchLatestBillNoFromBackend]);

    const buildSubmissionFormData = useCallback((formOverrides = {}) => {
        const resolvedPricePerKg = refs.price_per_kg_grid_item.current?.value
            ?? refs.price_per_kg.current?.value
            ?? formData.price_per_kg;
        // Live input wins — controlled state / autoCustomerCode can lag one keystroke.
        const liveCustomer = (refs.customer_code_input.current?.value
            || formData.customer_code
            || selectedUnprintedCustomer
            || '').toString().trim().toUpperCase();
        const nextFormData = {
            ...formData,
            supplier_code: refs.supplier_code.current?.value ?? formData.supplier_code,
            weight: refs.weight.current?.value ?? formData.weight,
            price_per_kg: resolvedPricePerKg,
            packs: refs.packs.current?.value ?? formData.packs,
            ...formOverrides,
            // Keep customer_code from live input unless an override explicitly set it.
            customer_code: (formOverrides.customer_code != null && formOverrides.customer_code !== '')
                ? String(formOverrides.customer_code).trim().toUpperCase()
                : liveCustomer,
        };

        const computedTotal = (parseFloat(nextFormData.weight) || 0) * (parseFloat(nextFormData.price_per_kg) || 0);
        return {
            ...nextFormData,
            total: Number(computedTotal.toFixed(2)),
        };
    }, [formData, selectedUnprintedCustomer]);

    const handleKeyDown = async (e, currentFieldName) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();

            // Ignore key auto-repeat so one physical Enter press triggers one submit flow.
            if (e.repeat) return;

          if (currentFieldName === "price_per_kg") {
    // 1. Validation
    if (!formData.item_code) {
        refs.item_code_select.current?.focus();
        updateState({ errors: { form: 'Please select an item first' } });
        return;
    }
    if (!formData.supplier_code && !refs.supplier_code.current?.value) {
        refs.supplier_code.current?.focus();
        updateState({ errors: { form: 'Please enter supplier code' } });
        return;
    }
    if (!formData.weight) {
        refs.weight.current?.focus();
        updateState({ errors: { form: 'Please enter weight' } });
        return;
    }
    if (!formData.packs) {
        refs.packs.current?.focus();
        updateState({ errors: { form: 'Please enter packs' } });
        return;
    }

    // 2. Extract active form values
    const currentItemCode = formData.item_code;
    const currentItemName = formData.item_name;
    const currentPackDue = formData.pack_due;
    const currentSupplierCode = String(
        refs.supplier_code.current?.value || formData.supplier_code || ''
    ).trim().toUpperCase();
    const rawWeightVal = refs.weight.current?.value ?? formData.weight;
    const rawPacksVal = refs.packs.current?.value ?? formData.packs;
    const rawPriceVal = refs.price_per_kg.current?.value ?? formData.price_per_kg;
    const bulkPrice = parseFloat(rawPriceVal) || 0;
    const bulkCustomer = String(
        formData.customer_code
        || selectedUnprintedCustomer
        || selectedUnprintedCustomerRef.current
        || tableCustomerScopeRef.current
        || ''
    ).trim().toUpperCase();
    const bulkItem = String(currentItemCode || '').trim().toUpperCase();
    const paintAt = Date.now();

    // 3. Instant UI Table Update
    if (bulkPrice > 0 && bulkCustomer && bulkItem && currentSupplierCode) {
        const matchesBulk = (sale) => {
            if (!sale?.id || isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return false;
            if (String(sale.customer_code || '').trim().toUpperCase() !== bulkCustomer) return false;
            if (String(sale.item_code || '').trim().toUpperCase() !== bulkItem) return false;
            if (String(sale.supplier_code || '').trim().toUpperCase() !== currentSupplierCode) return false;
            return true;
        };

        const withBulkPrice = (sale) => {
            const weight = parseFloat(sale.weight) || 0;
            return {
                ...sale,
                price_per_kg: bulkPrice,
                total: Number((weight * bulkPrice).toFixed(2)),
            };
        };

        const slotKeyOf = (id) => {
            const idStr = String(id || '');
            if (!idStr) return '';
            return stableRowKeyRef.current.get(idStr)
                || (realToTempIdRef.current.has(idStr)
                    ? (stableRowKeyRef.current.get(String(realToTempIdRef.current.get(idStr)))
                        || String(realToTempIdRef.current.get(idStr)))
                    : '')
                || idStr;
        };

        const alreadyPinned = (id) => {
            const idStr = String(id || '');
            return pinnedBillSalesRef.current.has(idStr)
                || stickyTableSalesRef.current.has(idStr)
                || localTableSalesRef.current.has(idStr);
        };

        const sourceRows = [];
        const seenSource = new Set();
        const considerSource = (sale) => {
            if (!matchesBulk(sale)) return;
            const slot = slotKeyOf(sale.id);
            if (!slot || seenSource.has(slot)) return;
            seenSource.add(slot);
            sourceRows.push(sale);
        };
        (displayedSales || []).forEach(considerSource);
        (displayedSalesRef.current || []).forEach(considerSource);
        pinnedBillSalesRef.current.forEach(considerSource);
        stickyTableSalesRef.current.forEach(considerSource);
        localTableSalesRef.current.forEach(considerSource);

        const updatedById = new Map();
        sourceRows.forEach((sale) => {
            const updated = withBulkPrice(sale);
            const idStr = String(sale.id);
            updatedById.set(idStr, updated);
            const mappedTemp = realToTempIdRef.current.get(idStr);
            const mappedReal = tempToRealIdRef.current.get(idStr);
            if (mappedTemp) {
                const tempPrev = pinnedBillSalesRef.current.get(String(mappedTemp))
                    || stickyTableSalesRef.current.get(String(mappedTemp))
                    || localTableSalesRef.current.get(String(mappedTemp));
                updatedById.set(String(mappedTemp), withBulkPrice({ ...(tempPrev || sale), id: mappedTemp }));
            }
            if (mappedReal) {
                const realPrev = pinnedBillSalesRef.current.get(String(mappedReal))
                    || stickyTableSalesRef.current.get(String(mappedReal))
                    || localTableSalesRef.current.get(String(mappedReal));
                updatedById.set(String(mappedReal), withBulkPrice({ ...(realPrev || sale), id: mappedReal }));
            }
        });

        updatedById.forEach((updated, idStr) => {
            recentSubmittedSalesRef.current.set(idStr, { sale: updated, at: paintAt });
            if (updated?.id != null) {
                recentSubmittedSalesRef.current.set(updated.id, { sale: updated, at: paintAt });
            }
            if (alreadyPinned(idStr)) upsertLocalTableSale(updated);
        });

        flushSync(() => {
            setState((prev) => {
                const mapUpdatedList = (list) =>
                    (list || []).map((sale) => {
                        if (!sale?.id) return sale;
                        const updated = updatedById.get(String(sale.id));
                        return updated
                            ? { ...sale, price_per_kg: updated.price_per_kg, total: updated.total }
                            : sale;
                    });

                const nextAll = mapUpdatedList(prev.allSales);
                const nextSidebar = mapUpdatedList(prev.sidebarSales);
                const nextLocal = mapUpdatedList(prev.localTableSales);

                sidebarSalesRef.current = nextSidebar;
                allSalesRef.current = nextAll;
                lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);

                return {
                    ...prev,
                    allSales: nextAll,
                    localTableSales: nextLocal,
                    sidebarSales: nextSidebar,
                    priceManuallyChanged: true,
                    gridPricePerKg: rawPriceVal,
                    errors: {},
                };
            });
        });
    }

    // 4. Update Form Data & Inputs
    setFormData(prev => ({
        ...prev,
        customer_code: prev.customer_code || bulkCustomer,
        supplier_code: currentSupplierCode || prev.supplier_code,
        item_code: currentItemCode,
        item_name: currentItemName,
        pack_due: currentPackDue,
        weight: rawWeightVal,
        price_per_kg: rawPriceVal,
        packs: rawPacksVal,
    }));

    updateState({
        gridPricePerKg: rawPriceVal,
        priceManuallyChanged: true,
        errors: {},
    });

    // 5. Move Focus
    if (refs.price_per_kg_grid_item.current) {
        refs.price_per_kg_grid_item.current.value = rawPriceVal;
        refs.price_per_kg_grid_item.current.focus({ preventScroll: true });
        refs.price_per_kg_grid_item.current.select();
    }

    // 6. Backend API sync
    (async () => {
        try {
            const putSeen = new Set();
            const targetSales = [];
            const considerPut = (sale) => {
                if (!sale?.id || isTempOrOptimisticSale(sale)) return;
                if (String(sale.customer_code || '').trim().toUpperCase() !== bulkCustomer) return;
                if (String(sale.item_code || '').trim().toUpperCase() !== bulkItem) return;
                if (String(sale.supplier_code || '').trim().toUpperCase() !== currentSupplierCode) return;
                
                const realId = tempToRealIdRef.current.get(String(sale.id));
                const putId = (realId && !String(realId).startsWith('tmp-')) ? String(realId) : String(sale.id);
                if (!putId || putId.startsWith('tmp-') || putSeen.has(putId)) return;
                putSeen.add(putId);
                targetSales.push({ ...sale, id: putId });
            };
            (displayedSalesRef.current || []).forEach(considerPut);
            (displayedSales || []).forEach(considerPut);

            for (const sale of targetSales) {
                const w = parseFloat(sale.weight) || 0;
                const cleanPayload = {
                    supplier_code: currentSupplierCode,
                    customer_code: bulkCustomer,
                    customer_name: sale.customer_name || formData.customer_name || '',
                    item_code: currentItemCode,
                    item_name: currentItemName,
                    weight: w,
                    price_per_kg: bulkPrice,
                    pack_due: parseFloat(sale.pack_due || currentPackDue) || 0,
                    total: Number((w * bulkPrice).toFixed(2)),
                    packs: parseFloat(sale.packs) || 0,
                    given_amount: sale.given_amount ? parseFloat(sale.given_amount) : null,
                    update_related_price: true
                };
                await api.put(`${routes.sales}/${sale.id}`, cleanPayload, { timeout: SUBMIT_TIMEOUT_MS });
            }
        } catch (err) {
            console.error("Background price sync error:", err);
        }
    })();

    return;
}

            // 1. Handle Given Amount
            if (currentFieldName === "given_amount") {
                const snapshot = ((displayedSalesRef.current && displayedSalesRef.current.length)
                    ? displayedSalesRef.current
                    : displayedSales).slice();
                const success = await handleSubmitGivenAmount(e);
                if (success) {
                    handlePrintAndClear(null, { salesToProcess: snapshot });
                }
                return;
            }

            // 2. Packs Enter → paint the table row in THIS keydown tick, then persist to DB.
            if (currentFieldName === "packs") {
                const livePacks = (e.target?.value ?? refs.packs.current?.value ?? formData.packs ?? "").toString().trim();
                const submitFormData = buildSubmissionFormData({ packs: livePacks });

                if (!submitFormData.item_code) {
                    refs.item_code_select.current?.focus();
                    updateState({ errors: { form: 'Please select an item first' } });
                    return;
                }
                if (!String(submitFormData.supplier_code || '').trim()) {
                    refs.supplier_code.current?.focus();
                    updateState({ errors: { form: 'කරුණාකර Supplier Code ඇතුළත් කරන්න' } });
                    return;
                }
                if (!submitFormData.weight) {
                    refs.weight.current?.focus();
                    updateState({ errors: { form: 'Please enter weight' } });
                    return;
                }
                if (!submitFormData.packs || submitFormData.packs.toString().trim() === '') {
                    updateState({ errors: { form: 'Please enter packs' } });
                    refs.packs.current?.focus();
                    return;
                }

                const customerForTable = middleUserOpenedRef.current
                    ? String(
                        submitFormData.customer_code || formData.customer_code || autoCustomerCode || selectedUnprintedCustomer || ''
                    ).trim().toUpperCase()
                    : String(submitFormData.customer_code || formData.customer_code || '').trim().toUpperCase();
                if (!customerForTable) {
                    refs.customer_code_input.current?.focus();
                    updateState({ errors: { form: 'කරුණාකර Customer Code ඇතුළත් කරන්න' } });
                    return;
                }

                // Editing an existing row: reuse handleSubmit optimistic update (no new temp row).
                if (editingSaleIdRef.current ?? editingSaleId) {
                    middleBillArmedRef.current = true;
                    if (customerForTable) tableCustomerScopeRef.current = customerForTable;
                    void handleSubmit(e, { ...submitFormData, customer_code: customerForTable }, {
                        bypassSignatureThrottle: true,
                    });
                    return;
                }

                // Ignore accidental double-Enter before painting a temp row.
                const packsSubmitSig = [
                    customerForTable,
                    String(submitFormData.supplier_code || '').trim().toUpperCase(),
                    String(submitFormData.item_code || '').trim().toUpperCase(),
                    String(submitFormData.weight || '').trim(),
                    String(submitFormData.price_per_kg || '').trim(),
                    String(submitFormData.packs || '').trim(),
                ].join('|');
                const packsNow = Date.now();
                if (packsSubmitSig === lastContentSubmitSigRef.current && packsNow - lastSubmitAtRef.current < SUBMIT_DEDUP_MS) {
                    return;
                }

                // Claim signature immediately so a bounce Enter cannot paint a twin.
                lastContentSubmitSigRef.current = packsSubmitSig;
                lastSubmitAtRef.current = packsNow;

                // Instant table paint (same keydown frame) — only this customer_code.
                // Only stay on printed when the operator explicitly opened a printed bill
                // (middleTableSource === 'printed'). Leftover selectedPrintedCustomer must NOT
                // refill the form from the printed sidebar during a new typed bill.
                const stayOnPrinted = middleTableSourceRef.current === 'printed'
                    && !!(selectedPrintedCustomerRef.current || selectedPrintedCustomer);
                const instantTempId = `tmp-${packsNow}-${++submitGenerationRef.current}`;
                const weightNum = parseFloat(submitFormData.weight) || 0;
                const priceNum = parseFloat(submitFormData.price_per_kg) || 0;
                const packsNum = parseFloat(submitFormData.packs) || 0;
                const instantSale = {
                    id: instantTempId,
                    supplier_code: String(submitFormData.supplier_code || '').toUpperCase(),
                    customer_code: customerForTable,
                    customer_name: submitFormData.customer_name || formData.customer_name || '',
                    item_code: submitFormData.item_code,
                    item_name: submitFormData.item_name || '',
                    weight: weightNum,
                    price_per_kg: priceNum,
                    pack_due: parseFloat(submitFormData.pack_due) || 0,
                    total: Number((weightNum * priceNum).toFixed(2)),
                    packs: packsNum,
                    bill_printed: stayOnPrinted ? 'Y' : 'N',
                    bill_no: stayOnPrinted
                        ? (state.currentBillNo
                            || (selectedPrintedCustomer?.includes('-') ? selectedPrintedCustomer.split('-').pop() : null)
                            || null)
                        : null,
                    CustomerPackCost: packCost || 0,
                    _optimistic: true,
                    _enteredAt: packsNow,
                    _entrySeq: submitGenerationRef.current,
                };

                // Invalidate late post-print clears so they cannot erase this new line.
                printClearGenerationRef.current += 1;
                // Register BEFORE paint so any concurrent refresh cannot drop this row.
                recentSubmittedSalesRef.current.set(instantTempId, { sale: instantSale, at: packsNow });
                pinBillSale(instantSale);
                upsertLocalTableSale(instantSale);
                stableRowKeyRef.current.set(String(instantTempId), String(instantTempId));
                lastEnteredItemRef.current = {
                    item_code: instantSale.item_code,
                    item_name: instantSale.item_name || '',
                    customer_code: customerForTable,
                    at: packsNow,
                    saleId: instantTempId,
                };
                if (customerForTable) tableCustomerScopeRef.current = customerForTable;
                // Packs-Enter MUST arm the middle table immediately — otherwise the row
                // is stored but displayedSales stays [] (looks like disappear/missing).
                middleBillArmedRef.current = true;
                if (stayOnPrinted) {
                    middleTableSourceRef.current = 'printed';
                } else {
                    selectedPrintedCustomerRef.current = null;
                    selectedUnprintedCustomerRef.current = customerForTable;
                    // Keep unprinted scope if the operator typed/clicked that customer —
                    // flipping to 'typed' was wiping already-painted rows on the next render.
                    if (middleTableSourceRef.current !== 'unprinted') {
                        middleTableSourceRef.current = 'typed';
                    }
                }

                ignoreCustomerSelectUntilRef.current = Date.now() + 800;
                ignoreRowEditUntilRef.current = Date.now() + 800;
                // Start the DB write before table paint so a slow flushSync cannot delay/lose the POST.
                void handleSubmit(e, { ...submitFormData, customer_code: customerForTable }, {
                    bypassSignatureThrottle: true,
                    skipOptimistic: true,
                    preTempId: instantTempId,
                });
                flushSync(() => {
                    setState((prev) => {
                        // Do not write temps into sidebars — those stay on live GET /sales.
                        const nextLocal = [instantSale, ...(prev.localTableSales || []).filter((s) => String(s?.id) !== String(instantTempId))];
                        displayedSalesRef.current = [
                            instantSale,
                            ...(displayedSalesRef.current || []).filter((s) => {
                                if (!s?.id) return false;
                                if (String(s.id) === String(instantTempId)) return false;
                                return String(s.customer_code || '').trim().toUpperCase() === customerForTable;
                            }),
                        ];
                        return {
                            ...prev,
                            localTableSales: nextLocal,
                            formData: {
                                ...initialFormData,
                                customer_code: customerForTable,
                                customer_name: instantSale.customer_name || prev.formData.customer_name,
                                telephone_no: prev.formData.telephone_no || formData.telephone_no || '',
                                supplier_code: instantSale.supplier_code || '',
                                given_amount: stayOnPrinted ? "" : (prev.isGivenAmountManuallyTouched ? (prev.formData.given_amount || "") : ""),
                            },
                            itemSearchInput: "",
                            customerSearchInput: "",
                            editingSaleId: null,
                            isManualClear: false,
                            middleBillArmed: true,
                            currentBillNo: stayOnPrinted ? prev.currentBillNo : null,
                            errors: {},
                            priceManuallyChanged: false,
                            gridPricePerKg: '',
                            selectedSaleForBreakdown: null,
                            selectedUnprintedCustomer: stayOnPrinted
                                ? null
                                : (prev.selectedUnprintedCustomer || customerForTable),
                            // Hard-clear printed selection during typed entry so form cannot refill.
                            selectedPrintedCustomer: stayOnPrinted ? prev.selectedPrintedCustomer : null,
                        };
                    });
                });
                setManagedTimeout(() => { ignoreCustomerSelectUntilRef.current = 0; }, 800);
                if (refs.weight.current) refs.weight.current.value = '';
                if (refs.packs.current) refs.packs.current.value = '';
                if (refs.price_per_kg_grid_item.current) refs.price_per_kg_grid_item.current.value = '';
                if (refs.price_per_kg.current) refs.price_per_kg.current.value = '';
                if (refs.total.current) refs.total.current.value = '';
                suppressSupplierFocusUntilRef.current = 0;
                try {
                    const active = document.activeElement;
                    if (active && active.tagName === 'TR') active.blur();
                } catch (_) { /* ignore */ }
                focusSupplierCode();
                return;
            }

            // 3. Logic for TELEPHONE input (Reverse Lookup)
            if (currentFieldName === "telephone_no") {
                // Hide save button when navigating away
                updateState({ showSavePhoneButton: false });
                refs.customer_code_input.current?.focus();
                return;
            }

            // In the handleKeyDown function, update the customer_code_input case:
            if (currentFieldName === "customer_code_input") {
                const code = (formData.customer_code || autoCustomerCode).trim().toUpperCase();

                if (code) {
                    // LOCAL LOOKUP - ONLY on Enter key
                    const match = customers.find(c => String(c.short_name).toUpperCase() === code);

                    if (match) {
                        // Update customer_name
                        setFormData(prev => ({
                            ...prev,
                            customer_name: match.name || ""
                        }));
                        fetchLoanAmount(code);

                        // Enter on customer code arms middle + may select unprinted sidebar.
                        selectedUnprintedCustomerRef.current = code;
                        selectedPrintedCustomerRef.current = null;
                        middleBillArmedRef.current = true;
                        updateState({
                            selectedUnprintedCustomer: code,
                            selectedPrintedCustomer: null,
                            middleBillArmed: true,
                            isManualClear: false,
                        });
                    } else {
                        console.log("Customer not found in local data");
                    }
                }

                refs.supplier_code.current?.focus();
                return;
            }

            // supplier_code → item select. Defer focus until after this Enter keydown
            // fully settles; sync focus during keydown lets some browsers bounce focus
            // back to supplier (and late post-submit focusSupplierCode can too).
            if (currentFieldName === "supplier_code") {
                suppressSupplierFocusUntilRef.current = Date.now() + 2500;
                refs.supplier_code.current?.blur();
                requestAnimationFrame(() => {
                    setManagedTimeout(() => {
                        focusItemCodeSelect();
                    }, 0);
                });
                return;
            }

            // 5. General Navigation Logic
            let nextFieldName = skipMap[currentFieldName];
            if (!nextFieldName) {
                const currentIndex = fieldOrder.indexOf(currentFieldName);
                let nextIndex = currentIndex + 1;
                while (nextIndex < fieldOrder.length &&
                    ["customer_code_select", "item_name", "total"].includes(fieldOrder[nextIndex])) {
                    nextIndex++;
                }
                nextFieldName = nextIndex < fieldOrder.length ? fieldOrder[nextIndex] : "customer_code_input";
            }

            const nextRef = refs[nextFieldName];
            if (nextRef?.current) {
                if (nextFieldName === "item_code_select") {
                    focusItemCodeSelect();
                    return;
                }
                requestAnimationFrame(() => {
                    setManagedTimeout(() => {
                        nextRef.current.focus();
                        if (!nextFieldName.includes("select")) nextRef.current.select();
                    }, 0);
                });
            }
        }
    };

    const { salesTotal, packCostTotal, totalSalesValue } = useMemo(() => {
        const totals = displayedSales.reduce((acc, s) => {
            acc.sales += ((parseFloat(s.weight) || 0) * (parseFloat(s.price_per_kg) || 0));
            acc.pack += ((parseFloat(s.CustomerPackCost) || 0) * (parseFloat(s.packs) || 0));
            return acc;
        }, { sales: 0, pack: 0 });

        return {
            salesTotal: totals.sales,
            packCostTotal: totals.pack,
            totalSalesValue: totals.sales + totals.pack,
        };
    }, [displayedSales]);

    const handleInputChange = (field, value, nativeEvent = null) => {
        // A printed sidebar bill stays on the table until the same bill is clicked
        // again or F6. Typing/editing fields must never wipe that bill.
        if (field === 'price_per_kg') {
            setFormData(prev => ({ ...prev, [field]: value }));
            updateState({ priceManuallyChanged: true, gridPricePerKg: value });
        } else if (field === 'price_per_kg_grid_item') {
            setFormData(prev => ({ ...prev, 'price_per_kg': value }));
            updateState({ gridPricePerKg: value, priceManuallyChanged: false });
        } else if (field === 'telephone_no') {
            // Only allow numbers and limit to 10 digits
            const cleaned = value.replace(/\D/g, '').slice(0, 10);
            setFormData(prev => ({ ...prev, telephone_no: cleaned }));
        } else if (field === 'customer_code') {
            // Do not reset the whole form while a printed bill is on screen.
            if (middleTableSourceRef.current === 'printed' && selectedPrintedCustomerRef.current) {
                setFormData(prev => ({ ...prev, customer_code: value }));
            } else {
                setFormData({ ...initialFormData, customer_code: value });
            }
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }

        if (field === 'customer_code') {
            const trimmedValue = value.trim();
            const printedSel = selectedPrintedCustomerRef.current || selectedPrintedCustomer;
            const printedCust = printedSel && String(printedSel).includes('-')
                ? String(printedSel).slice(0, String(printedSel).lastIndexOf('-'))
                : printedSel;
            // Only leave a printed bill when the operator types a *different* customer.
            const leavingPrintedBill = middleTableSourceRef.current === 'printed'
                && !!trimmedValue
                && !!printedCust
                && String(trimmedValue).toUpperCase() !== String(printedCust).toUpperCase();
            if (leavingPrintedBill) {
                printedBillClickRef.current = false;
            }

            if (leavingPrintedBill) {
                editingSaleIdRef.current = null;
                middleTableSourceRef.current = 'unprinted';
                stickyTableSalesRef.current.clear();
                localTableSalesRef.current.clear();
                pinnedBillSalesRef.current.clear();
                displayedSalesRef.current = [];
            }

            // Typing customer code = instantly match unprinted sidebar bill and paint table/fields.
            // Autofill / programmatic writes must NOT open the table.
            const typedByUser = !!customerCodeKeyUsedRef.current;
            if (trimmedValue && typedByUser) {
                const code = trimmedValue.toUpperCase();
                middleUserOpenedRef.current = true;
                // Keep the printed sidebar bill on screen until same-bill click or F6.
                if (middleTableSourceRef.current === 'printed' && !leavingPrintedBill) {
                    const customer = customers.find(c =>
                        String(c.short_name || '').toUpperCase() === code
                    );
                    setFormData((prev) => ({
                        ...prev,
                        customer_code: code,
                        customer_name: customer?.name || prev.customer_name,
                    }));
                    return;
                }
                const prevScope = String(tableCustomerScopeRef.current || '').trim().toUpperCase();
                const customerChanged = prevScope !== code;
                printClearGenerationRef.current += 1;
                customerClickGenerationRef.current += 1;
                tableCustomerScopeRef.current = code;
                selectedPrintedCustomerRef.current = null;
                middleBillArmedRef.current = true;
                const justPrintedThisCustomer = String(lastPrintedCustomerRef.current || '').toUpperCase() === code
                    && lastPrintAtRef.current
                    && (Date.now() - lastPrintAtRef.current) < PRINTED_ID_BLOCK_MS;

                // Exact customer_code only — RAT must not stay on screen after typing RATT.
                const matchedUnprinted = collectUnprintedSalesForCustomer(code);
                const hasUnprintedMatch = matchedUnprinted.length > 0;

                if (customerChanged || leavingPrintedBill || !hasUnprintedMatch) {
                    dropOverlaysNotMatchingCustomer(code);
                }

                if (hasUnprintedMatch) {
                    selectedUnprintedCustomerRef.current = code;
                    middleTableSourceRef.current = 'unprinted';
                } else {
                    selectedUnprintedCustomerRef.current = null;
                    middleTableSourceRef.current = 'typed';
                    if (customerChanged || leavingPrintedBill || justPrintedThisCustomer) {
                        stickyTableSalesRef.current.clear();
                        localTableSalesRef.current.clear();
                        pinnedBillSalesRef.current.clear();
                        displayedSalesRef.current = [];
                    }
                }

                let paintedRows = [];
                if (hasUnprintedMatch) {
                    paintedRows = paintUnprintedRowsForCustomer(code, matchedUnprinted);
                }

                const customer = customers.find(c =>
                    String(c.short_name || '').toUpperCase() === code
                );

                try {
                    ['supplier_code', 'weight', 'packs', 'price_per_kg', 'price_per_kg_grid_item', 'total'].forEach((key) => {
                        const el = refs[key]?.current;
                        if (el && 'value' in el) el.value = '';
                    });
                } catch (_) { /* ignore */ }

                flushSync(() => {
                    setFormData((prev) => leavingPrintedBill
                        ? {
                            ...initialFormData,
                            telephone_no: customer?.telephone_no || "",
                            customer_code: code,
                            customer_name: customer?.name || "",
                        }
                        : {
                            ...prev,
                            telephone_no: customer?.telephone_no || "",
                            customer_code: code,
                            customer_name: customer?.name || prev.customer_name || "",
                        });
                    setState((prev) => ({
                        ...prev,
                        selectedUnprintedCustomer: hasUnprintedMatch ? code : null,
                        selectedPrintedCustomer: null,
                        currentBillNo: null,
                        isManualClear: false,
                        middleBillArmed: true,
                        localTableSales: hasUnprintedMatch ? paintedRows.slice() : [],
                        editingSaleId: null,
                        selectedSaleForBreakdown: null,
                        priceManuallyChanged: false,
                        gridPricePerKg: "",
                        packCost: 0,
                        errors: {},
                    }));
                });
                editingSaleIdRef.current = null;
                fetchLoanAmount(code);
                void hydrateCustomerUnprintedFromDb(code);
            } else if (trimmedValue && !typedByUser) {
                // Keep the typed characters out of the table — do not arm from autofill.
                return;
            } else if (middleTableSourceRef.current === 'printed' && selectedPrintedCustomerRef.current) {
                // Clearing the customer field must not drop a printed bill (only same-click / F6).
                return;
            } else {
                middleTableSourceRef.current = null;
                disarmMiddleBill();
                try {
                    ['supplier_code', 'weight', 'packs', 'price_per_kg', 'price_per_kg_grid_item', 'total', 'given_amount'].forEach((key) => {
                        const el = refs[key]?.current;
                        if (el && 'value' in el) el.value = '';
                    });
                } catch (_) { /* ignore */ }
                setFormData(prev => ({
                    ...initialFormData,
                    telephone_no: prev.telephone_no || "",
                }));
            }
        }

        if (field === 'supplier_code') setFormData(prev => ({ ...prev, supplier_code: value }));
        if (field === "given_amount") {
            updateState({ isGivenAmountManuallyTouched: true });
        }
    };
    const handleItemSelect = (selectedOption) => {
        if (selectedOption) {
            const { item } = selectedOption;
            if (!item) return;
            const fetchedPackDue = parseFloat(item?.pack_due) || 0;
            const fetchedPackCost = parseFloat(item?.pack_cost) || 0;

            setFormData(prev => {
                const keptCustomer = String(
                    prev.customer_code
                    || selectedUnprintedCustomer
                    || tableCustomerScopeRef.current
                    || ''
                ).trim().toUpperCase();
                if (keptCustomer) tableCustomerScopeRef.current = keptCustomer;
                return {
                    ...prev,
                    // Never let item selection wipe the active customer — that empties the table.
                    customer_code: keptCustomer || prev.customer_code,
                    item_code: item.no,
                    item_name: item.type,
                    pack_due: fetchedPackDue,
                    weight: prev.weight || "",
                    price_per_kg: prev.price_per_kg || "",
                    packs: prev.packs || "",
                    leading_sales_id: prev.leading_sales_id || "",
                    total: prev.total || ""
                };
            });

            const customerForScope = String(
                formData.customer_code
                || selectedUnprintedCustomer
                || tableCustomerScopeRef.current
                || ''
            ).trim().toUpperCase();

            updateState({
                packCost: fetchedPackCost,
                itemSearchInput: "",
                gridPricePerKg: formData.price_per_kg || "",
                isManualClear: false,
                // Do not auto-select sidebar here — table scope uses customer_code / tableCustomerScopeRef.
            });
            if (customerForScope) tableCustomerScopeRef.current = customerForScope;

            // Focus on weight field
            setManagedTimeout(() => refs.weight.current?.focus(), 100);
        } else {
            // Only clear item fields if explicitly deselecting — never touch customer/sales scope.
            setFormData(prev => ({
                ...prev,
                item_code: "",
                item_name: "",
                pack_due: "",
                weight: "",
                price_per_kg: "",
                packs: "",
                leading_sales_id: "",
                total: ""
            }));
            updateState({ packCost: 0, itemSearchInput: "", gridPricePerKg: "" });
        }
    };

    const handleCustomerSelect = (selectedOption, meta = {}) => {
        // Programmatic value changes from packs-Enter must never arm/select a sidebar bill.
        if (Date.now() < ignoreCustomerSelectUntilRef.current) return;
        const action = meta?.action;
        if (action && action !== 'select-option' && action !== 'clear') return;
        if (action === 'select-option') middleUserOpenedRef.current = true;
        const short = selectedOption ? selectedOption.value : "";
        if (middleTableSourceRef.current === 'printed' && selectedPrintedCustomerRef.current) {
            const printedSel = String(selectedPrintedCustomerRef.current);
            const printedCust = printedSel.includes('-')
                ? printedSel.slice(0, printedSel.lastIndexOf('-'))
                : printedSel;
            const nextCode = String(short || '').trim().toUpperCase();
            if (!nextCode || nextCode === String(printedCust).trim().toUpperCase()) {
                if (nextCode) {
                    const sameCustomer = customers.find(x => String(x.short_name) === String(short));
                    setFormData((prev) => ({
                        ...prev,
                        customer_code: nextCode,
                        customer_name: sameCustomer?.name || prev.customer_name,
                    }));
                }
                return;
            }
        }
        if (!short) {
            // React-select isClearable often fires null while the value is being set
            // during rapid Enter. Never wipe an in-progress bill from that.
            if (pinnedBillSalesRef.current.size > 0
                || (displayedSalesRef.current || []).length > 0
                || middleBillArmedRef.current) {
                return;
            }
            setFormData(prev => ({ ...prev, customer_code: "", customer_name: "", given_amount: "" }));
            disarmMiddleBill();
            updateState({ customerSearchInput: "" });
            return;
        }
        const customer = customers.find(x => String(x.short_name) === String(short));
        const code = String(short).trim().toUpperCase();
        // Same customer already on screen — do not wipe in-progress Enter rows
        // or a printed sidebar bill the operator is viewing.
        if (
            String(tableCustomerScopeRef.current || '').trim().toUpperCase() === code
            && (pinnedBillSalesRef.current.size > 0 || (displayedSalesRef.current || []).length > 0)
        ) {
            if (middleTableSourceRef.current === 'printed' && selectedPrintedCustomerRef.current) {
                setFormData((prev) => ({
                    ...prev,
                    customer_code: code,
                    customer_name: customer?.name || prev.customer_name,
                }));
                return;
            }
            selectedUnprintedCustomerRef.current = code;
            selectedPrintedCustomerRef.current = null;
            middleBillArmedRef.current = true;
            updateState({
                selectedUnprintedCustomer: code,
                selectedPrintedCustomer: null,
                customerSearchInput: "",
                middleBillArmed: true,
                isManualClear: false,
            });
            setFormData((prev) => ({
                ...prev,
                customer_code: code,
                customer_name: customer?.name || prev.customer_name,
            }));
            fetchLoanAmount(short);
            return;
        }
        selectedUnprintedCustomerRef.current = code;
        selectedPrintedCustomerRef.current = null;
        middleBillArmedRef.current = true;
        tableCustomerScopeRef.current = code;
        // Dropdown = same as typing: load matching unprinted sidebar bill instantly.
        const justPrintedThisCustomer = String(lastPrintedCustomerRef.current || '').toUpperCase() === code
            && lastPrintAtRef.current
            && (Date.now() - lastPrintAtRef.current) < PRINTED_ID_BLOCK_MS;
        middleTableSourceRef.current = justPrintedThisCustomer ? 'typed' : 'unprinted';
        printClearGenerationRef.current += 1;
        customerClickGenerationRef.current += 1;

        const matchedUnprinted = collectUnprintedSalesForCustomer(code);
        const rowsToPaint = justPrintedThisCustomer ? [] : paintUnprintedRowsForCustomer(code, matchedUnprinted);
        if (justPrintedThisCustomer) {
            displayedSalesRef.current = [];
        }

        try {
            ['supplier_code', 'weight', 'packs', 'price_per_kg', 'price_per_kg_grid_item', 'total'].forEach((key) => {
                const el = refs[key]?.current;
                if (el && 'value' in el) el.value = '';
            });
        } catch (_) { /* ignore */ }

        flushSync(() => {
            setFormData((prev) => ({
                ...prev,
                customer_code: code,
                customer_name: customer?.name || prev.customer_name || "",
                telephone_no: customer?.telephone_no || "",
            }));
            setState((prev) => ({
                ...prev,
                selectedUnprintedCustomer: code,
                selectedPrintedCustomer: null,
                currentBillNo: null,
                customerSearchInput: "",
                isManualClear: false,
                middleBillArmed: true,
                localTableSales: rowsToPaint.slice(),
                editingSaleId: null,
                selectedSaleForBreakdown: null,
                priceManuallyChanged: false,
                gridPricePerKg: "",
                packCost: 0,
                errors: {},
            }));
        });
        fetchLoanAmount(short);
        if (!justPrintedThisCustomer) void hydrateCustomerUnprintedFromDb(code);
    };
    //function to display customer image
    const handleImageClick = (entityType) => {
        const code = entityType === 'customer' ? (formData.customer_code || autoCustomerCode) : formData.supplier_code;
        const list = entityType === 'customer' ? customers : suppliers;

        const person = list.find(p =>
            String(entityType === 'customer' ? p.short_name : p.code).toUpperCase() === String(code).toUpperCase()
        );

        if (person) {
            updateState({
                isImageModalOpen: true,
                selectedImageData: {
                    profile: entityType === 'customer' ? state.customerProfilePic : state.supplierProfilePic,
                    nic_front: person.nic_front,
                    nic_back: person.nic_back,
                    title: person.name || code,
                    type: entityType // <--- ADD THIS LINE
                }
            });
        }
    };
    // Show Save button when telephone number has 10 digits
    useEffect(() => {
        const phoneNumber = formData.telephone_no || "";
        // Check if phone number has exactly 10 digits (only numbers)
        const isValidPhone = /^\d{10}$/.test(phoneNumber);

        // Also check if we have a customer code
        const customerCode = formData.customer_code || autoCustomerCode;

        if (isValidPhone && customerCode && !selectedPrintedCustomer) {
            updateState({ showSavePhoneButton: true });
        } else {
            updateState({ showSavePhoneButton: false });
        }
    }, [formData.telephone_no, formData.customer_code, autoCustomerCode, selectedPrintedCustomer]);

    const handleEditClick = (sale) => {
        // Rapid packs-Enter can land focus on a table row; ignore edit for a short
        // window so the next Enter cannot dump that row into the form.
        if (Date.now() < (ignoreRowEditUntilRef.current || 0)) return;
        // Printed rows may hydrate the form only after an explicit printed-sidebar click.
        if (String(sale?.bill_printed ?? '').trim().toUpperCase() === 'Y'
            && !printedBillClickRef.current) return;

        // If same record clicked again → clear fields EXCEPT customer/contact fields
        if (sameSaleId(state.editingSaleId, sale.id)) {
            setFormData((prev) => ({
                ...prev,
                customer_code: sale.customer_code || "",
                customer_name: sale.customer_name || "",
                // PRESERVE TELEPHONE:
                telephone_no: prev.telephone_no || "",
                supplier_code: "",
                item_code: "",
                item_name: "",
                weight: "",
                price_per_kg: "",
                pack_due: "",
                total: "",
                packs: ""
            }));

            updateState({
                editingSaleId: null,
                isManualClear: true,
                priceManuallyChanged: false,
                gridPricePerKg: "",
                selectedSaleForBreakdown: null
            });
            editingSaleIdRef.current = null;

            setManagedTimeout(() => {
                refs.supplier_code?.current?.focus();
                refs.supplier_code?.current?.select();
            }, 0);

            return;
        }

        // === Normal behavior when selecting a record to edit ===
        let fetchedPackDue = sale.pack_due || "";
        if (sale.item_code) {
            const matchingItem = items.find(i => String(i.no) === String(sale.item_code));
            fetchedPackDue = parseFloat(matchingItem?.pack_due) || sale.pack_due || "";
        }

        editingSaleIdRef.current = sale.id;

        setFormData((prev) => ({
            ...prev,
            item_name: sale.item_name || "",
            customer_code: sale.customer_code || prev.customer_code || "",
            customer_name: sale.customer_name || prev.customer_name || "",
            telephone_no: prev.telephone_no || sale.telephone_no || "",
            supplier_code: sale.supplier_code || "",
            item_code: sale.item_code || "",
            weight: sale.weight || "",
            price_per_kg: sale.price_per_kg || "",
            pack_due: fetchedPackDue,
            total: sale.total || "",
            packs: sale.packs || "",
        }));

        updateState({
            editingSaleId: sale.id,
            isManualClear: false,
            priceManuallyChanged: false,
            gridPricePerKg: sale.price_per_kg || "",
            selectedSaleForBreakdown: sale
        });

        // CHANGE THIS PART - Focus on price field instead of weight
        setManagedTimeout(() => {
            refs.price_per_kg_grid_item.current?.focus();
            refs.price_per_kg_grid_item.current?.select();
        }, 0);
    };

    const handleTableRowKeyDown = (e, sale) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.stopPropagation();
        // Enter is for the entry form. Click a row to edit — never load a row on Enter.
    };

    const handleClearForm = (clearBillNo = false) => {
        editingSaleIdRef.current = null;
        tableCustomerScopeRef.current = '';
        middleBillArmedRef.current = false;
        middleUserOpenedRef.current = false;
        customerCodeKeyUsedRef.current = false;
        middleTableSourceRef.current = null;
        printedBillClickRef.current = false;
        customerClickGenerationRef.current += 1;
        selectedPrintedCustomerRef.current = null;
        selectedUnprintedCustomerRef.current = null;
        stickyTableSalesRef.current.clear();
        localTableSalesRef.current.clear();
        pinnedBillSalesRef.current.clear();
        displayedSalesRef.current = [];
        setFormData(initialFormData);
        updateState({
            editingSaleId: null,
            loanAmount: 0,
            // Clearing the form must block auto-resurrect of sidebar bills into the middle.
            isManualClear: true,
            middleBillArmed: false,
            selectedPrintedCustomer: null,
            selectedUnprintedCustomer: null,
            packCost: 0,
            customerSearchInput: "",
            itemSearchInput: "",
            supplierSearchInput: "",
            priceManuallyChanged: false,
            gridPricePerKg: "",
            isGivenAmountManuallyTouched: false,
            selectedSaleForBreakdown: null,
            customerProfilePic: null,
            customerNameDisplay: "",
            ...(clearBillNo && { currentBillNo: null })
        });
        // REMOVED: setTimeout(() => { refs.supplier_code?.current?.focus(); }, 0);
    };

    const handleDeleteRecord = async (saleId) => {
        if (!saleId) {
            updateState({ errors: { form: "Invalid sale ID" } });
            return;
        }

        if (!window.confirm("Are you sure you want to delete this sales record?")) {
            return;
        }

        const removedSale =
            allSales.find((sale) => sameSaleId(sale.id, saleId))
            || (localTableSales || []).find((sale) => sameSaleId(sale.id, saleId))
            || localTableSalesRef.current.get(String(saleId))
            || null;

        if (!removedSale) {
            updateState({ errors: { form: "Record not found" } });
            return;
        }

        const idStr = String(saleId);
        const mappedReal = tempToRealIdRef.current.get(idStr);
        const mappedTemp = realToTempIdRef.current.get(idStr);
        const tombstoneIds = [saleId, idStr, mappedReal, mappedTemp, removedSale?.id]
            .filter((id) => id != null)
            .flatMap((id) => {
                const out = [id, String(id)];
                if (typeof id === 'string' && /^\d+$/.test(id)) out.push(Number(id));
                return out;
            });

        // 1. Tombstone ALL related ids immediately — refresh must never resurrect this line.
        tombstoneIds.forEach((id) => deletedSaleIdsRef.current.add(id));

        // 2. Instantly remove from every overlay/cache.
        const purgeId = (id) => {
            if (id == null) return;
            const s = String(id);
            localTableSalesRef.current.delete(id);
            localTableSalesRef.current.delete(s);
            stickyTableSalesRef.current.delete(id);
            stickyTableSalesRef.current.delete(s);
            pinnedBillSalesRef.current.delete(id);
            pinnedBillSalesRef.current.delete(s);
            recentSubmittedSalesRef.current.delete(id);
            recentSubmittedSalesRef.current.delete(s);
            pendingPersistRef.current.delete(s);
            inFlightTempIdsRef.current.delete(s);
        };
        tombstoneIds.forEach(purgeId);
        persistPendingJobsToStorage();
        if (lastEnteredItemRef.current && sameSaleId(lastEnteredItemRef.current.saleId, saleId)) {
            lastEnteredItemRef.current = null;
        }

        // 3. Store in localStorage with timestamp for cleanup/cross-tab persistence
        try {
            const deletedIds = JSON.parse(localStorage.getItem('deletedSaleIds') || '[]');
            const nowDel = Date.now();
            const seen = new Set(deletedIds.map((item) => String(item.id)));
            tombstoneIds.forEach((id) => {
                const s = String(id);
                if (seen.has(s)) return;
                seen.add(s);
                deletedIds.push({ id, timestamp: nowDel });
            });
            if (deletedIds.length > 200) {
                deletedIds.splice(0, deletedIds.length - 200);
            }
            localStorage.setItem('deletedSaleIds', JSON.stringify(deletedIds));
        } catch (e) {
            // Ignore localStorage errors
        }

        // 4. Immediately purge from UI state (all mirrors).
        const keepSale = (sale) => sale?.id != null && !isDeletedSaleId(deletedSaleIdsRef.current, sale.id);
        flushSync(() => {
            setState((prev) => ({
                ...prev,
                allSales: prev.allSales.filter(keepSale),
                sidebarSales: (prev.sidebarSales || []).filter(keepSale),
                localTableSales: (prev.localTableSales || []).filter(keepSale),
            }));
        });
        allSalesRef.current = (allSalesRef.current || []).filter(keepSale);
        displayedSalesRef.current = (displayedSalesRef.current || []).filter(keepSale);
        sidebarSalesRef.current = (sidebarSalesRef.current || []).filter(keepSale);
        lastSidebarSignatureRef.current = buildSidebarListSignature(sidebarSalesRef.current);

        // Clear form if currently editing the deleted record
        if (sameSaleId(editingSaleId, saleId) || sameSaleId(editingSaleIdRef.current, saleId)) {
            editingSaleIdRef.current = null;
            handleClearForm();
        }

        try {
            // 5. Call API with real backend id when temp id was painted.
            const apiDeleteId = (mappedReal && !String(mappedReal).startsWith('tmp-'))
                ? mappedReal
                : ((!String(saleId).startsWith('tmp-')) ? saleId : null);
            if (apiDeleteId != null) {
                await api.delete(`${routes.sales}/${apiDeleteId}`, { timeout: API_TIMEOUT_MS });
            }

            // Delay refresh so a lagging GET cannot resurrect the row before DB delete settles.
            setManagedTimeout(() => {
                refreshSidebarSales(true);
                refreshSalesData(true);
            }, 800);

        } catch (error) {
            // If delete fails, revert ALL tombstones and restore the record
            tombstoneIds.forEach((id) => deletedSaleIdsRef.current.delete(id));

            try {
                const deletedIds = JSON.parse(localStorage.getItem('deletedSaleIds') || '[]');
                const tombSet = new Set(tombstoneIds.map(String));
                const updated = deletedIds.filter((item) => !tombSet.has(String(item.id)));
                localStorage.setItem('deletedSaleIds', JSON.stringify(updated));
            } catch (e) {
                // Ignore localStorage errors
            }

            if (removedSale) {
                localTableSalesRef.current.set(idStr, removedSale);
                setState((prev) => {
                    const nextSidebar = [
                        removedSale,
                        ...(prev.sidebarSales || []).filter((sale) => !sameSaleId(sale.id, saleId)),
                    ];
                    sidebarSalesRef.current = nextSidebar;
                    lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
                    return {
                        ...prev,
                        allSales: [...prev.allSales, removedSale],
                        sidebarSales: nextSidebar,
                        localTableSales: [...(prev.localTableSales || []), removedSale],
                    };
                });
            }

            updateState({
                errors: {
                    form: error.response?.data?.message || error.message || "Failed to delete record"
                }
            });
        }
    };

    const handleSubmitGivenAmount = async (e) => {
        if (e) e.preventDefault();
        // Prevent parallel Enter presses from firing duplicate given-amount + print flows.
        if (givenAmountInFlightRef.current) {
            if (Date.now() - (givenAmountStartedAtRef.current || 0) < API_TIMEOUT_MS + 5000) return null;
            givenAmountInFlightRef.current = false;
        }
        givenAmountInFlightRef.current = true;
        givenAmountStartedAtRef.current = Date.now();
        updateState({ errors: {} });

        try {
            const customerCode = (formData.customer_code || autoCustomerCode).trim().toUpperCase();
            if (!customerCode) return null;

            const salesToUpdate = displayedSales.filter(s => s.id);
            if (salesToUpdate.length === 0) return null;

            // 1. Get the entered amount
            const currentInputAmount = parseFloat(String(formData.given_amount ?? "").replace(/,/g, "")) || 0;

            // 2. DETECT CREDIT STATUS based on your calculated logic
            // We calculate it here to know if we should block the process before the API call
            const totals = salesToUpdate.reduce((acc, s) => {
                const weight = parseFloat(s.weight) || 0;
                const price = parseFloat(s.price_per_kg) || 0;
                const packs = parseFloat(s.packs) || 0;
                const pCost = parseFloat(s.CustomerPackCost) || 0;
                const pLabour = parseFloat(s.CustomerPackLabour) || 0;
                acc.billTotal += (weight * price);
                acc.totalBagPrice += (packs * pCost);
                acc.totalLabour += (packs * pLabour);
                return acc;
            }, { billTotal: 0, totalBagPrice: 0, totalLabour: 0 });

            const autoCalculatedGrandTotal = totals.billTotal + totals.totalBagPrice;
            const isCredit = Math.abs(currentInputAmount - autoCalculatedGrandTotal) > 0.01;
            const creditTransactionStatus = isCredit ? 'Y' : 'N';

            // 4. PROCEED: Update database with the determined status
            const updatePromises = salesToUpdate.map(sale =>
                api.put(`${routes.sales}/${sale.id}/given-amount`, {
                    given_amount: currentInputAmount,
                    credit_transaction: creditTransactionStatus
                }, { timeout: API_TIMEOUT_MS })
            );

            const results = await Promise.all(updatePromises);
            if (!isMountedRef.current) return null;
            updateState({ isGivenAmountManuallyTouched: false });

            const updatedSalesFromApi = results.map(response => response.data.sale);
            const updatedSalesMap = {};
            updatedSalesFromApi.forEach(sale => { updatedSalesMap[sale.id] = sale; });

            // Functional update: `allSales` captured at render time may be stale after the
            // await above (a background refresh could have replaced it).
            setState(prev => ({
                ...prev,
                allSales: prev.allSales.map(s => updatedSalesMap[s.id] ? updatedSalesMap[s.id] : s)
            }));

            return updatedSalesFromApi;
        } catch (error) {
            if (isMountedRef.current) {
                updateState({ errors: { form: error.response?.data?.message || error.message } });
            }
            return null;
        } finally {
            givenAmountInFlightRef.current = false;
            givenAmountStartedAtRef.current = 0;
        }
    };
    const handleSubmit = async (e, formOverrides = {}, options = {}) => {
        const { bypassSignatureThrottle = false, skipOptimistic = false, preTempId = null, preserveItem = false } = options;
        if (e?.preventDefault) e.preventDefault();
        const now = Date.now();

        const effectiveFormData = buildSubmissionFormData(formOverrides);
        // Content-only signature: after an optimistic edit clears editingSaleId, a second
        // Enter must NOT look like a different "new" submit of the same line.
        const contentSubmitSignature = [
            String(effectiveFormData.customer_code || '').trim().toUpperCase(),
            String(effectiveFormData.supplier_code || '').trim().toUpperCase(),
            String(effectiveFormData.item_code || '').trim().toUpperCase(),
            String(effectiveFormData.weight || '').trim(),
            String(effectiveFormData.price_per_kg || '').trim(),
            String(effectiveFormData.packs || '').trim(),
        ].join('|');

        if (!skipOptimistic && contentSubmitSignature === lastContentSubmitSigRef.current && now - lastSubmitAtRef.current < SUBMIT_DEDUP_MS) {
            return;
        }
        if (!bypassSignatureThrottle && contentSubmitSignature === lastContentSubmitSigRef.current && now - lastSubmitAtRef.current < 1200) {
            return;
        }

        // --- 1. VALIDATION LOGIC ---
        const requiredFields = [
            { key: "customer_code", ref: "customer_code_input", label: "Customer Code" },
            { key: "supplier_code", ref: "supplier_code", label: "Supplier Code" },
            { key: "item_code", ref: "item_code_select", label: "Item" },
            { key: "weight", ref: "weight", label: "Weight" },
            { key: "packs", ref: "packs", label: "Packs" }
        ];

        for (const field of requiredFields) {
            const value = effectiveFormData[field.key];
            if (value === null || value === undefined || value.toString().trim() === "") {
                // Packs-Enter already painted this line — never abandon the DB write
                // because a focus/validation race emptied a field.
                if (skipOptimistic && preTempId) break;
                updateState({ errors: { form: `කරුණාකර ${field.label} ඇතුළත් කරන්න` } });
                const targetRef = refs[field.ref];
                if (targetRef?.current) {
                    targetRef.current.focus();
                    if (!field.ref.includes("select")) targetRef.current.select();
                }
                return;
            }
        }

        // Claim edit id BEFORE any await/setState so a second Enter cannot POST a twin.
        const editingIdAtStart = editingSaleIdRef.current ?? editingSaleId;
        editingSaleIdRef.current = null;

        // --- 2. PRE-FLIGHT PREPARATION ---
        lastContentSubmitSigRef.current = contentSubmitSignature;
        lastSubmitSignatureRef.current = `${editingIdAtStart || 'new'}|${contentSubmitSignature}`;
        lastSubmitAtRef.current = now;
        const myGeneration = ++submitGenerationRef.current;

        const customerCode = String(
            effectiveFormData.customer_code || autoCustomerCode || selectedUnprintedCustomer || ''
        ).trim().toUpperCase();
        const currentSupplierCode = effectiveFormData.supplier_code;
        const currentCustomerName = effectiveFormData.customer_name;
        const currentTelephone = effectiveFormData.telephone_no;
        const shouldUpdateRelatedPrice = state.priceManuallyChanged;
        const normalizedWeight = parseFloat(effectiveFormData.weight) || 0;
        const normalizedPricePerKg = parseFloat(effectiveFormData.price_per_kg) || 0;
        const normalizedPacks = parseFloat(effectiveFormData.packs) || 0;
        const computedTotal = Number((normalizedWeight * normalizedPricePerKg).toFixed(2));
        const applyRelatedPriceLocally = (sale) => {
            if (!shouldUpdateRelatedPrice || !sale || isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return sale;
            if (String(sale.customer_code || '').trim().toUpperCase() !== String(customerCode || '').trim().toUpperCase()) {
                return sale;
            }
            if (String(sale.item_code || '').trim().toUpperCase() !== String(effectiveFormData.item_code || '').trim().toUpperCase()) {
                return sale;
            }
            // Only touch the active bill scope (pending vs selected printed bill).
            const printedSel = selectedPrintedCustomerRef.current;
            if (printedSel && String(printedSel).includes('-')) {
                const billNo = String(printedSel).split('-').pop();
                if (String(sale.bill_no || '') !== String(billNo || '')) return sale;
            } else if (String(sale.bill_printed || '').trim().toUpperCase() === 'Y') {
                return sale;
            }
            const weight = parseFloat(sale.weight) || 0;
            return {
                ...sale,
                price_per_kg: normalizedPricePerKg,
                total: Number((weight * normalizedPricePerKg).toFixed(2)),
            };
        };
        const previousEditedSale = editingIdAtStart !== null
            ? (
                allSales.find((sale) => sameSaleId(sale.id, editingIdAtStart))
                || (localTableSales || []).find((sale) => sameSaleId(sale.id, editingIdAtStart))
                || localTableSalesRef.current.get(String(editingIdAtStart))
                || null
            )
            : null;
        const tempId = editingIdAtStart != null
            ? null
            : (preTempId || `tmp-${Date.now()}-${myGeneration}`);
        if (tempId && inFlightTempIdsRef.current.has(String(tempId))) {
            return;
        }
        if (tempId) inFlightTempIdsRef.current.add(String(tempId));
        let submitController = null;
        let submitPromise = null;

        // Capture current item values for preservation
        const currentItemCode = effectiveFormData.item_code || formData.item_code;
        const currentItemName = effectiveFormData.item_name || formData.item_name;
        const currentPackDue = effectiveFormData.pack_due || formData.pack_due;

        const clearLineEntryDom = () => {
            if (refs.weight.current) refs.weight.current.value = '';
            if (refs.packs.current) refs.packs.current.value = '';
            if (refs.price_per_kg_grid_item.current) refs.price_per_kg_grid_item.current.value = '';
            if (refs.price_per_kg.current) refs.price_per_kg.current.value = '';
            if (refs.total.current) refs.total.current.value = '';
        };

        try {
            const isEditing = editingIdAtStart != null;

            // --- 3. BILLING LOGIC (sync, no await) ---
            let billPrintedStatus = undefined, billNoToUse = null;
            if (!isEditing) {
                // Only tag a line as printed when the operator is actually on a printed sidebar bill.
                const onPrintedBill = middleTableSourceRef.current === 'printed'
                    && !!(selectedPrintedCustomerRef.current || selectedPrintedCustomer);
                if (onPrintedBill) {
                    const printedSel = selectedPrintedCustomerRef.current || selectedPrintedCustomer;
                    billPrintedStatus = 'Y';
                    billNoToUse = String(printedSel).includes('-')
                        ? String(printedSel).split('-').pop()
                        : (state.currentBillNo
                            || printedSales.find(s => s.customer_code === printedSel)?.bill_no);
                } else {
                    billPrintedStatus = 'N';
                    billNoToUse = null;
                }
            }

            const payload = {
                supplier_code: String(currentSupplierCode || '').toUpperCase(),
                customer_code: customerCode,
                customer_name: currentCustomerName,
                item_code: effectiveFormData.item_code,
                item_name: effectiveFormData.item_name,
                weight: normalizedWeight,
                price_per_kg: normalizedPricePerKg,
                pack_due: parseFloat(effectiveFormData.pack_due) || 0,
                total: computedTotal,
                packs: normalizedPacks,
                given_amount: effectiveFormData.given_amount ? parseFloat(effectiveFormData.given_amount) : null,
                ...(billPrintedStatus && { bill_printed: billPrintedStatus }),
                ...(billNoToUse && { bill_no: billNoToUse }),
                update_related_price: shouldUpdateRelatedPrice,
            };

            const url = isEditing ? `${routes.sales}/${editingIdAtStart}` : routes.sales;
            const method = isEditing ? "put" : "post";
            const knownIdsAtStart = collectKnownBackendIds();

            // Start the DB write immediately — do not wait for table paint / flushSync.
            // Never attach an abort signal we later cancel: that dropped rows from the DB.
            submitController = new AbortController();
            pendingSubmitsRef.current.set(myGeneration, submitController);
            pendingSubmitStartedAtRef.current.set(myGeneration, Date.now());
            if (!isEditing && tempId) {
                const saleSnapshot = localTableSalesRef.current.get(String(tempId))
                    || { ...payload, id: tempId, bill_printed: billPrintedStatus || 'N', _optimistic: true };
                queuePersistJob({
                    tempId,
                    method: 'post',
                    url: routes.sales,
                    payload,
                    sale: saleSnapshot,
                    knownIds: knownIdsAtStart,
                    inFlight: true,
                });
            }
            submitPromise = api[method](url, payload, {
                timeout: PERSIST_TIMEOUT_MS,
            });

            // Register pre-painted temp row so a refresh cannot drop it.
            if (!isEditing && tempId && skipOptimistic) {
                const existingOptimistic = localTableSalesRef.current.get(String(tempId))
                    || allSales.find((s) => sameSaleId(s.id, tempId));
                const saleToKeep = existingOptimistic || {
                    ...payload,
                    id: tempId,
                    bill_printed: billPrintedStatus || 'N',
                    CustomerPackCost: packCost || 0,
                    _optimistic: true,
                };
                recentSubmittedSalesRef.current.set(tempId, { sale: saleToKeep, at: Date.now() });
                upsertLocalTableSale(saleToKeep);
            }

            // --- OPTIMISTIC UI SECTION ---
            // Keep table scope on edit. billPrintedStatus is intentionally unset for edits,
            // so stayOnPrinted must NOT depend on it — that cleared selectedPrintedCustomer
            // and emptied the sales table after every edit save.
            const resolveTableScope = (prev) => {
                if (isEditing) {
                    const keepPrinted = prev.selectedPrintedCustomer || null;
                    // Do not auto-select unprinted from customerCode — only click / typed code may select.
                    const keepUnprinted = keepPrinted ? null : (prev.selectedUnprintedCustomer || null);
                    return { keepPrinted, keepUnprinted };
                }
                // Only keep printed selection when actively viewing a printed bill.
                const stayOnPrinted = middleTableSourceRef.current === 'printed'
                    && !!(prev.selectedPrintedCustomer && billPrintedStatus === 'Y');
                if (preserveItem) {
                    return {
                        keepUnprinted: stayOnPrinted ? null : prev.selectedUnprintedCustomer,
                        keepPrinted: stayOnPrinted ? prev.selectedPrintedCustomer : null,
                    };
                }
                return {
                    keepUnprinted: stayOnPrinted ? null : (prev.selectedUnprintedCustomer || null),
                    keepPrinted: stayOnPrinted ? prev.selectedPrintedCustomer : null,
                };
            };

            if (!skipOptimistic && isEditing && previousEditedSale) {
                const optimisticSale = {
                    ...previousEditedSale,
                    ...payload,
                    id: editingIdAtStart,
                    customer_code: customerCode,
                    supplier_code: currentSupplierCode,
                    item_name: effectiveFormData.item_name || previousEditedSale.item_name || '',
                    // Never lose print status on edit — payload omits bill_printed/bill_no.
                    bill_printed: previousEditedSale.bill_printed,
                    bill_no: previousEditedSale.bill_no,
                };

                if (customerCode) tableCustomerScopeRef.current = customerCode;
                recentSubmittedSalesRef.current.set(editingIdAtStart, { sale: optimisticSale, at: Date.now() });
                upsertLocalTableSale(optimisticSale);

                flushSync(() => {
                    setState((prev) => {
                        const { keepPrinted, keepUnprinted } = resolveTableScope(prev);
                        const hadEditedSale = prev.allSales.some((sale) => sameSaleId(sale.id, editingIdAtStart));
                        const mapWithRelated = (sale) => {
                            if (sameSaleId(sale.id, editingIdAtStart)) return optimisticSale;
                            return applyRelatedPriceLocally(sale);
                        };
                        const updatedAllSales = hadEditedSale
                            ? prev.allSales.map(mapWithRelated)
                            : [optimisticSale, ...(prev.allSales || []).map(applyRelatedPriceLocally)];
                        const updatedLocalSales = [
                            optimisticSale,
                            ...(prev.localTableSales || [])
                                .filter((s) => !sameSaleId(s.id, editingIdAtStart))
                                .map(applyRelatedPriceLocally),
                        ];
                        const updatedSidebarSales = (prev.sidebarSales || []).map(applyRelatedPriceLocally);
                        if (shouldUpdateRelatedPrice) {
                            const trackAt = Date.now();
                            [...updatedAllSales, ...updatedSidebarSales].forEach((s) => {
                                if (!s?.id || sameSaleId(s.id, editingIdAtStart)) return;
                                const next = applyRelatedPriceLocally(s);
                                if (next !== s || parseFloat(s.price_per_kg) === normalizedPricePerKg) {
                                    recentSubmittedSalesRef.current.set(s.id, { sale: s, at: trackAt });
                                    upsertLocalTableSale(s);
                                }
                            });
                            sidebarSalesRef.current = updatedSidebarSales;
                        }

                        return {
                            ...prev,
                            allSales: updatedAllSales,
                            localTableSales: updatedLocalSales,
                            sidebarSales: shouldUpdateRelatedPrice ? updatedSidebarSales : prev.sidebarSales,
                            formData: preserveItem ? {
                                customer_code: customerCode,
                                customer_name: currentCustomerName || prev.formData.customer_name,
                                telephone_no: currentTelephone || prev.formData.telephone_no,
                                supplier_code: currentSupplierCode || "",
                                item_code: currentItemCode,
                                item_name: currentItemName,
                                pack_due: currentPackDue,
                                weight: "",
                                price_per_kg: "",
                                packs: "",
                                total: "",
                            } : {
                                ...initialFormData,
                                customer_code: customerCode,
                                customer_name: currentCustomerName || prev.formData.customer_name,
                                telephone_no: currentTelephone || prev.formData.telephone_no,
                                supplier_code: currentSupplierCode || "",
                            },
                            editingSaleId: null,
                            isManualClear: false,
                            isSubmitting: true,
                            errors: {},
                            priceManuallyChanged: false,
                            gridPricePerKg: "",
                            selectedSaleForBreakdown: null,
                            selectedUnprintedCustomer: keepUnprinted,
                            selectedPrintedCustomer: keepPrinted,
                        };
                    });
                });
                clearLineEntryDom();
            } else if (!skipOptimistic && !isEditing && tempId) {
                const optimisticSale = {
                    ...payload,
                    id: tempId,
                    bill_printed: billPrintedStatus || 'N',
                    CustomerPackCost: packCost || 0,
                    _optimistic: true,
                    customer_code: customerCode,
                    supplier_code: currentSupplierCode,
                    item_name: effectiveFormData.item_name || '',
                };
                if (customerCode) tableCustomerScopeRef.current = customerCode;
                recentSubmittedSalesRef.current.set(tempId, { sale: optimisticSale, at: Date.now() });
                upsertLocalTableSale(optimisticSale);
                lastEnteredItemRef.current = {
                    item_code: optimisticSale.item_code,
                    item_name: optimisticSale.item_name || '',
                    customer_code: customerCode,
                    at: Date.now(),
                    saleId: tempId,
                };

                flushSync(() => {
                    setState((prev) => {
                        const { keepPrinted, keepUnprinted } = resolveTableScope(prev);
                        const nextAll = [
                            optimisticSale,
                            ...(prev.allSales || []).map(applyRelatedPriceLocally),
                        ];
                        const nextLocal = [
                            optimisticSale,
                            ...(prev.localTableSales || [])
                                .filter((s) => !sameSaleId(s.id, tempId))
                                .map(applyRelatedPriceLocally),
                        ];
                        const nextSidebar = (prev.sidebarSales || []).map(applyRelatedPriceLocally);
                        if (shouldUpdateRelatedPrice) {
                            const trackAt = Date.now();
                            [...nextAll, ...nextSidebar].forEach((s) => {
                                if (!s?.id || sameSaleId(s.id, tempId)) return;
                                if (parseFloat(s.price_per_kg) === normalizedPricePerKg) {
                                    recentSubmittedSalesRef.current.set(s.id, { sale: s, at: trackAt });
                                    upsertLocalTableSale(s);
                                }
                            });
                            sidebarSalesRef.current = nextSidebar;
                        }

                        return {
                            ...prev,
                            allSales: nextAll,
                            localTableSales: nextLocal,
                            sidebarSales: shouldUpdateRelatedPrice ? nextSidebar : prev.sidebarSales,
                            formData: preserveItem ? {
                                customer_code: customerCode,
                                customer_name: currentCustomerName || prev.formData.customer_name,
                                telephone_no: currentTelephone || prev.formData.telephone_no,
                                supplier_code: currentSupplierCode || "",
                                item_code: currentItemCode,
                                item_name: currentItemName,
                                pack_due: currentPackDue,
                                weight: "",
                                price_per_kg: "",
                                packs: "",
                                total: "",
                            } : {
                                ...initialFormData,
                                customer_code: customerCode,
                                customer_name: currentCustomerName || prev.formData.customer_name,
                                telephone_no: currentTelephone || prev.formData.telephone_no,
                                supplier_code: currentSupplierCode || "",
                            },
                            editingSaleId: null,
                            isManualClear: false,
                            isSubmitting: true,
                            errors: {},
                            priceManuallyChanged: false,
                            gridPricePerKg: "",
                            selectedUnprintedCustomer: keepUnprinted,
                            selectedPrintedCustomer: keepPrinted,
                            selectedSaleForBreakdown: null,
                        };
                    });
                });
                clearLineEntryDom();
            } else if (skipOptimistic) {
                // Row already painted on packs Enter — only mark submitting.
                // Still paint related price changes instantly when bulk price was used.
                if (shouldUpdateRelatedPrice) {
                    flushSync(() => {
                        setState((prev) => {
                            const trackAt = Date.now();
                            const nextAll = (prev.allSales || []).map((sale) => {
                                const priced = applyRelatedPriceLocally(sale);
                                if (priced !== sale && priced?.id) {
                                    recentSubmittedSalesRef.current.set(priced.id, { sale: priced, at: trackAt });
                                    upsertLocalTableSale(priced);
                                }
                                return priced;
                            });
                            const nextLocal = (prev.localTableSales || []).map(applyRelatedPriceLocally);
                            const nextSidebar = (prev.sidebarSales || []).map((sale) => {
                                const priced = applyRelatedPriceLocally(sale);
                                if (priced !== sale && priced?.id) {
                                    recentSubmittedSalesRef.current.set(priced.id, { sale: priced, at: trackAt });
                                    upsertLocalTableSale(priced);
                                }
                                return priced;
                            });
                            sidebarSalesRef.current = nextSidebar;
                            return {
                                ...prev,
                                allSales: nextAll,
                                localTableSales: nextLocal,
                                sidebarSales: nextSidebar,
                                errors: {},
                                isSubmitting: true,
                                isManualClear: false,
                            };
                        });
                    });
                } else {
                    updateState({ errors: {}, isSubmitting: true, isManualClear: false });
                }
            } else if (isEditing) {
                // Edit without a prior snapshot — still keep customer scope so the table does not blank.
                if (customerCode) tableCustomerScopeRef.current = customerCode;
                updateState({
                    errors: {},
                    isSubmitting: true,
                    isManualClear: false,
                    // Keep existing click/typed sidebar selection only — never auto-select from customerCode.
                    selectedUnprintedCustomer: selectedPrintedCustomer ? null : (selectedUnprintedCustomer || null),
                    selectedPrintedCustomer: selectedPrintedCustomer || null,
                    formData: {
                        ...initialFormData,
                        customer_code: customerCode,
                        customer_name: currentCustomerName || formData.customer_name,
                        telephone_no: currentTelephone || formData.telephone_no,
                        supplier_code: currentSupplierCode || "",
                    },
                    editingSaleId: null,
                });
                clearLineEntryDom();
            } else {
                updateState({ errors: {}, isSubmitting: true });
            }

            // Focus next field immediately — do not wait for API.
            if (!skipOptimistic) {
                suppressSupplierFocusUntilRef.current = 0;
                focusSupplierCode();
            }

            // --- 4. API EXECUTION ---
            const response = await submitPromise;

            // --- 5. DATA SYNC ---
            // Only the sale created/updated by THIS submit. A full `sales` array must
            // not be treated as new rows or mapped onto this temp id.
            let pickedSale = pickSaleFromSubmitResponse(response.data, {
                isEditing,
                editingId: editingIdAtStart,
                payload,
                knownIds: knownIdsAtStart,
            });
            if (pickedSale && tempId && !isEditing) {
                const mappedOther = realToTempIdRef.current.get(String(pickedSale.id));
                if (mappedOther && mappedOther !== String(tempId)) pickedSale = null;
                if (pickedSale && knownIdsAtStart.has(String(pickedSale.id))) pickedSale = null;
            }
            if (!isEditing && tempId) {
                const live = pendingPersistRef.current.get(String(tempId));
                if (live) {
                    live.postSucceeded = true;
                    live.inFlight = false;
                    pendingPersistRef.current.set(String(tempId), live);
                    persistPendingJobsToStorage();
                }
            }
            if (pickedSale?.id) {
                rememberBackendSaleId(pickedSale.id);
                if (tempId) completePersistJob(tempId);
            } else if (!isEditing && tempId) {
                schedulePersistRetry(400);
            }
            const updatedSalesRaw = pickedSale ? [pickedSale] : [];
            const preTempSnapshot = tempId
                ? (localTableSalesRef.current.get(String(tempId))
                    || allSales.find((s) => sameSaleId(s.id, tempId))
                    || null)
                : null;
            const updatedSales = (Array.isArray(updatedSalesRaw) ? updatedSalesRaw : [updatedSalesRaw])
                .filter((sale) => sale && sale.id != null && typeof sale === 'object' && !Array.isArray(sale))
                .filter((sale) => !isDeletedSaleId(deletedSaleIdsRef.current, sale.id))
                .map((sale) => {
                    // If the API omits print flags on PUT, keep the pre-edit values so the
                    // row does not fall out of the printed/unprinted table filter.
                    if (isEditing && previousEditedSale && sameSaleId(sale.id, editingIdAtStart)) {
                        return {
                            ...sale,
                            bill_printed: sale.bill_printed ?? previousEditedSale.bill_printed,
                            bill_no: sale.bill_no ?? previousEditedSale.bill_no,
                        };
                    }
                    // Preserve scope fields from the optimistic create so the row never
                    // vanishes from displayedSales while a refresh catches up.
                    if (preTempSnapshot && !isEditing) {
                        return {
                            ...preTempSnapshot,
                            ...sale,
                            bill_printed: sale.bill_printed ?? preTempSnapshot.bill_printed ?? 'N',
                            bill_no: sale.bill_no ?? preTempSnapshot.bill_no ?? null,
                            customer_code: sale.customer_code || preTempSnapshot.customer_code,
                            item_name: sale.item_name || preTempSnapshot.item_name,
                            _optimistic: false,
                            _enteredAt: preTempSnapshot._enteredAt || sale._enteredAt,
                            _entrySeq: preTempSnapshot._entrySeq ?? sale._entrySeq ?? 0,
                        };
                    }
                    return sale;
                });
            const trackAt = Date.now();
            const canRetireTemp = !tempId || updatedSales.length > 0;
            // Register confirmed rows FIRST. Never delete the temp from recent/local
            // before the real id is tracked — that gap made rows blink out on rapid entry.
            // Only a late POST after F1 on a NEW bill. Never wipe while viewing a printed sidebar bill.
            const printedDuringThisSubmit = middleTableSourceRef.current !== 'printed'
                && !updatedSales.some((s) => isPostPrintNewRow(s))
                && !!(
                    (tempId && isRecentlyPrintedId(tempId))
                    || (!isEditing && updatedSales.some((s) => isRecentlyPrintedId(s?.id)))
                );
            const processedDuringThisSubmit = !!(
                (tempId && isLocallyProcessedId(tempId))
                || updatedSales.some((s) => isLocallyProcessedId(s?.id))
            );
            if (processedDuringThisSubmit) {
                markIdsRecentlyProcessed([tempId, ...updatedSales.map((s) => s.id)].filter(Boolean));
            }
            const printedBillForSubmit = printedDuringThisSubmit
                ? (recentlyPrintedBillNoRef.current.get(String(tempId)) || '')
                : '';
            updatedSales.forEach((sale) => {
                if (isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
                if (processedDuringThisSubmit) {
                    markIdsRecentlyProcessed([sale.id, tempId].filter(Boolean));
                    recentSubmittedSalesRef.current.delete(String(sale.id));
                    recentSubmittedSalesRef.current.delete(sale.id);
                    if (tempId) recentSubmittedSalesRef.current.delete(String(tempId));
                    return;
                }
                if (printedDuringThisSubmit) {
                    markIdsRecentlyPrinted([sale.id], printedBillForSubmit);
                    recentSubmittedSalesRef.current.set(sale.id, {
                        sale: { ...sale, bill_printed: 'Y', bill_no: sale.bill_no || printedBillForSubmit },
                        at: trackAt,
                    });
                    recentSubmittedSalesRef.current.set(String(sale.id), {
                        sale: { ...sale, bill_printed: 'Y', bill_no: sale.bill_no || printedBillForSubmit },
                        at: trackAt,
                    });
                } else {
                    recentSubmittedSalesRef.current.set(sale.id, { sale, at: trackAt });
                    recentSubmittedSalesRef.current.set(String(sale.id), { sale, at: trackAt });
                    if (middleUserOpenedRef.current && middleBillArmedRef.current && middleTableSourceRef.current) {
                        upsertLocalTableSale(sale);
                    }
                }
                if (tempId) {
                    const tKey = String(tempId);
                    const rKey = String(sale.id);
                    tempToRealIdRef.current.set(tKey, rKey);
                    realToTempIdRef.current.set(rKey, tKey);
                    const stable = stableRowKeyRef.current.get(tKey) || tKey;
                    stableRowKeyRef.current.set(tKey, stable);
                    stableRowKeyRef.current.set(rKey, stable);
                    if (printedDuringThisSubmit || !middleUserOpenedRef.current || !middleBillArmedRef.current || !middleTableSourceRef.current) {
                        stickyTableSalesRef.current.delete(tKey);
                        pinnedBillSalesRef.current.delete(tKey);
                        localTableSalesRef.current.delete(tKey);
                        stickyTableSalesRef.current.delete(rKey);
                        pinnedBillSalesRef.current.delete(rKey);
                        localTableSalesRef.current.delete(rKey);
                    } else {
                        const prevTemp = stickyTableSalesRef.current.get(tKey)
                            || pinnedBillSalesRef.current.get(tKey)
                            || localTableSalesRef.current.get(tKey);
                        const merged = withEnteredAt(sale, prevTemp);
                        // Pin real FIRST, then drop tmp — never a gap with neither row pinned.
                        stickyTableSalesRef.current.set(rKey, merged);
                        pinnedBillSalesRef.current.set(rKey, merged);
                        localTableSalesRef.current.set(rKey, merged);
                        stickyTableSalesRef.current.delete(tKey);
                        pinnedBillSalesRef.current.delete(tKey);
                        localTableSalesRef.current.delete(tKey);
                        recentSubmittedSalesRef.current.set(rKey, { sale: merged, at: trackAt });
                        recentSubmittedSalesRef.current.set(sale.id, { sale: merged, at: trackAt });
                        recentSubmittedSalesRef.current.set(tKey, {
                            sale: {
                                ...merged,
                                id: tempId,
                                _optimistic: false,
                                _pendingRealId: sale.id,
                            },
                            at: trackAt,
                        });
                    }
                }
                if (recentSubmittedSalesRef.current.size > 250) {
                    const oldest = recentSubmittedSalesRef.current.keys().next().value;
                    if (oldest != null && String(oldest) !== String(tempId) && String(oldest) !== String(sale.id)) {
                        recentSubmittedSalesRef.current.delete(oldest);
                    }
                }
            });
            if (updatedSales[0]?.item_code) {
                lastEnteredItemRef.current = {
                    item_code: updatedSales[0].item_code,
                    item_name: updatedSales[0].item_name || lastEnteredItemRef.current?.item_name || '',
                    customer_code: String(updatedSales[0].customer_code || customerCode || '').trim().toUpperCase(),
                    at: trackAt,
                    saleId: updatedSales[0].id,
                };
            } else if (lastEnteredItemRef.current && tempId && canRetireTemp && updatedSales[0]?.id) {
                lastEnteredItemRef.current = {
                    ...lastEnteredItemRef.current,
                    saleId: updatedSales[0].id,
                    at: trackAt,
                };
            }

            if (isMountedRef.current) {
                setState(prev => {
                    const updatedSalesById = new Map(
                        updatedSales.map((sale) => [String(sale.id), sale])
                    );

                    let uniqueMergedSales = prev.allSales
                        .filter((sale) => {
                            if (isDeletedSaleId(deletedSaleIdsRef.current, sale?.id)) return false;
                            if (canRetireTemp && tempId && sameSaleId(sale.id, tempId)) {
                                return false;
                            }
                            return true;
                        })
                        .map((sale) => {
                            if (updatedSalesById.has(String(sale.id))) {
                                return updatedSalesById.get(String(sale.id));
                            }
                            return sale;
                        });

                    // Never drop the edited row just because the PUT body omitted it.
                    if (isEditing && editingIdAtStart != null) {
                        const responseHasOldId = updatedSales.some((s) => sameSaleId(s.id, editingIdAtStart));
                        if (!responseHasOldId) {
                            const matchingUpdatedSale = updatedSales.find((s) =>
                                String(s.customer_code || '').toUpperCase() === customerCode &&
                                String(s.item_code || '').toUpperCase() === String(effectiveFormData.item_code || '').toUpperCase() &&
                                parseFloat(s.weight) === normalizedWeight &&
                                parseFloat(s.price_per_kg) === normalizedPricePerKg
                            );
                            if (matchingUpdatedSale) {
                                // Replace old id with the returned row if the backend re-keyed it.
                                uniqueMergedSales = uniqueMergedSales
                                    .filter((s) => !sameSaleId(s.id, editingIdAtStart))
                                    .concat(
                                        uniqueMergedSales.some((s) => sameSaleId(s.id, matchingUpdatedSale.id))
                                            ? []
                                            : [matchingUpdatedSale]
                                    );
                            }
                            // else: keep whatever optimistic/previous row is already in uniqueMergedSales
                        }
                    }

                    const existingIds = new Set(uniqueMergedSales.map((sale) => String(sale?.id)).filter(Boolean));
                    updatedSales.forEach((sale) => {
                        if (!sale?.id || existingIds.has(String(sale.id))) return;
                        if (isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
                        uniqueMergedSales.push(sale);
                        existingIds.add(String(sale.id));
                    });

                    const currentCustomerCode = prev.formData.customer_code || customerCode;
                    // Trust the sync ref only. F1/F5/F6 clear it immediately; prev.middleBillArmed
                    // can still be true and would leak the last bill back into the table.
                    const armed = !!(middleUserOpenedRef.current && middleBillArmedRef.current && middleTableSourceRef.current);
                    let keepUnprinted = null;
                    let keepPrinted = null;

                    // Never restore a printed-sidebar selection during typed/unprinted entry.
                    // That flipped the table into printed-bill mode and wiped new Enter rows.
                    const stayOnPrinted = middleTableSourceRef.current === 'printed'
                        && !!(prev.selectedPrintedCustomer || selectedPrintedCustomerRef.current);
                    if (armed && stayOnPrinted) {
                        keepPrinted = prev.selectedPrintedCustomer || selectedPrintedCustomerRef.current;
                        keepUnprinted = null;
                    } else if (armed) {
                        keepUnprinted = prev.selectedUnprintedCustomer || selectedUnprintedCustomerRef.current || null;
                        keepPrinted = null;
                        selectedPrintedCustomerRef.current = null;
                    }

                    if (armed && currentCustomerCode) {
                        tableCustomerScopeRef.current = String(currentCustomerCode).trim().toUpperCase();
                    }

                    const updatedIdSet = new Set(updatedSales.map((s) => String(s.id)));
                    const nextLocal = [
                        ...updatedSales.filter((s) => !isDeletedSaleId(deletedSaleIdsRef.current, s?.id)),
                        ...(prev.localTableSales || []).filter((s) => {
                            if (!s?.id) return false;
                            if (isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return false;
                            // Retire temp only in this same paint as the confirmed row is added.
                            if (canRetireTemp && tempId && sameSaleId(s.id, tempId) && updatedSales.length > 0) {
                                return false;
                            }
                            if (updatedIdSet.has(String(s.id))) return false;
                            return true;
                        }),
                    ];

                    if (isEditing && editingIdAtStart != null) {
                        const editedSaleInLocal = nextLocal.some((s) => sameSaleId(s.id, editingIdAtStart));
                        if (!editedSaleInLocal) {
                            const editedSaleFromAll = uniqueMergedSales.find((s) => sameSaleId(s.id, editingIdAtStart));
                            if (editedSaleFromAll) {
                                nextLocal.push(editedSaleFromAll);
                            }
                        }
                    }

                    // Sync overlay ref AFTER building nextLocal (atomic with React state).
                    nextLocal.forEach((sale) => upsertLocalTableSale(sale));
                    // Retire temp from local list state only — keep sticky/recent until
                    // displayedSales collapses tmp→real (prevents one-frame blank).
                    if (canRetireTemp && tempId && updatedSales.length > 0) {
                        localTableSalesRef.current.delete(String(tempId));
                    }

                    lastKnownSaleCountRef.current = uniqueMergedSales.filter(
                        (s) => s?.id != null && !String(s.id).startsWith('tmp-') && !s._optimistic
                    ).length;

                    // Mirror confirmed backend rows into sidebars immediately (no temp/optimistic).
                    const sidebarById = new Map(
                        (prev.sidebarSales || [])
                            .filter((s) => s?.id != null && !isDeletedSaleId(deletedSaleIdsRef.current, s.id))
                            .map((s) => [String(s.id), s])
                    );
                    updatedSales.forEach((sale) => {
                        if (!sale?.id || isTempOrOptimisticSale(sale)) return;
                        if (isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
                        if (processedDuringThisSubmit || isLocallyProcessedId(sale.id)) {
                            sidebarById.delete(String(sale.id));
                            return;
                        }
                        // A typed new bill stays in the table only. Do not push it onto
                        // the unprinted sidebar — that made F5 look like it "removed" a
                        // bill that the database still had.
                        if (middleTableSourceRef.current === 'typed' && !printedDuringThisSubmit) {
                            return;
                        }
                        const stamped = printedDuringThisSubmit
                            ? {
                                ...sale,
                                bill_printed: 'Y',
                                bill_no: sale.bill_no || printedBillForSubmit,
                                customer_bill_no: sale.customer_bill_no || printedBillForSubmit,
                            }
                            : { ...sale, _sidebarHeldAt: Date.now() };
                        sidebarById.set(String(sale.id), stamped);
                    });
                    const nextSidebarSales = Array.from(sidebarById.values());
                    sidebarSalesRef.current = nextSidebarSales;
                    lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebarSales);

                    // A late POST after F5 must not put the processed bill back on the unprinted sidebar.
                    if (processedDuringThisSubmit) {
                        const dropProcessed = (s) => s?.id != null && !isLocallyProcessedId(s.id);
                        const cleanedSidebar = nextSidebarSales.filter(dropProcessed);
                        sidebarSalesRef.current = cleanedSidebar;
                        lastSidebarSignatureRef.current = buildSidebarListSignature(cleanedSidebar);
                        return {
                            ...prev,
                            allSales: uniqueMergedSales.filter(dropProcessed),
                            sidebarSales: cleanedSidebar,
                            localTableSales: [],
                            editingSaleId: sameSaleId(prev.editingSaleId, editingIdAtStart) ? null : prev.editingSaleId,
                            isManualClear: true,
                            middleBillArmed: false,
                            isSubmitting: pendingSubmitsRef.current.size > 1,
                            selectedUnprintedCustomer: null,
                            selectedPrintedCustomer: null,
                            searchQueries: prev.searchQueries,
                        };
                    }

                    // A late POST after F1 must not re-arm the middle table with the printed bill.
                    if (printedDuringThisSubmit) {
                        middleBillArmedRef.current = false;
                        return {
                            ...prev,
                            allSales: uniqueMergedSales,
                            sidebarSales: nextSidebarSales,
                            localTableSales: (prev.localTableSales || []).filter((s) => {
                                if (!s?.id) return false;
                                if (tempId && sameSaleId(s.id, tempId)) return false;
                                if (updatedSales.some((u) => sameSaleId(u.id, s.id))) return false;
                                return !isRecentlyPrintedId(s.id);
                            }),
                            editingSaleId: sameSaleId(prev.editingSaleId, editingIdAtStart) ? null : prev.editingSaleId,
                            isManualClear: true,
                            middleBillArmed: false,
                            isSubmitting: pendingSubmitsRef.current.size > 1,
                            selectedUnprintedCustomer: null,
                            selectedPrintedCustomer: null,
                            searchQueries: prev.searchQueries,
                        };
                    }

                    return {
                        ...prev,
                        allSales: uniqueMergedSales,
                        sidebarSales: nextSidebarSales,
                        localTableSales: armed ? nextLocal : [],
                        editingSaleId: sameSaleId(prev.editingSaleId, editingIdAtStart) ? null : prev.editingSaleId,
                        isManualClear: !armed,
                        middleBillArmed: armed,
                        isSubmitting: pendingSubmitsRef.current.size > 1,
                        selectedUnprintedCustomer: armed ? keepUnprinted : null,
                        selectedPrintedCustomer: armed ? keepPrinted : null,
                        searchQueries: prev.searchQueries,
                    };
                });
            }

            if (processedDuringThisSubmit) {
                applyProcessedRemovalToStores([tempId, ...updatedSales.map((s) => s.id)].filter(Boolean));
            }

            // Live sidebars: confirmed row is already merged locally; pull DB again shortly.
            notifySalesDataUpdated();
            setManagedTimeout(() => refreshSidebarSales(true), 80);
            setManagedTimeout(() => refreshSidebarSales(true), 600);
            // Defer full table refresh so it never fights rapid packs-Enter paints.
            setManagedTimeout(() => {
                if (pendingSubmitsRef.current.size > 0) {
                    pendingForceRefreshRef.current = true;
                    return;
                }
                // Skip while just-submitted rows are still in the trust window.
                let freshLocal = false;
                recentSubmittedSalesRef.current.forEach((entry) => {
                    if (entry && (Date.now() - entry.at) < 2500) freshLocal = true;
                });
                if (freshLocal) {
                    pendingForceRefreshRef.current = true;
                    return;
                }
                refreshSalesData(true);
            }, 4500);

            if (!isFocusInItemEntryFields()) {
                const active = document.activeElement;
                if (!active || active === document.body || active === refs.packs.current) {
                    focusSupplierCode();
                }
            }

        } catch (error) {
            const retryable = isRetryableSubmitError(error);

            // Timeouts/aborts/network drops during rapid entry must NEVER remove the
            // painted row. Keep it queued and retry until the database confirms it.
            if (tempId) {
                const live = pendingPersistRef.current.get(String(tempId));
                if (live) {
                    live.inFlight = false;
                    pendingPersistRef.current.set(String(tempId), live);
                    persistPendingJobsToStorage();
                } else {
                    queuePersistJob({
                        tempId,
                        method: 'post',
                        url: routes.sales,
                        payload: {
                            supplier_code: currentSupplierCode?.toUpperCase?.() || currentSupplierCode,
                            customer_code: customerCode,
                            customer_name: currentCustomerName,
                            item_code: effectiveFormData.item_code,
                            item_name: effectiveFormData.item_name,
                            weight: normalizedWeight,
                            price_per_kg: normalizedPricePerKg,
                            pack_due: parseFloat(effectiveFormData.pack_due) || 0,
                            total: computedTotal,
                            packs: normalizedPacks,
                            given_amount: effectiveFormData.given_amount ? parseFloat(effectiveFormData.given_amount) : null,
                        },
                        sale: localTableSalesRef.current.get(String(tempId)) || null,
                        knownIds: collectKnownBackendIds(),
                        inFlight: false,
                    });
                }
                schedulePersistRetry(retryable ? PERSIST_RETRY_MS : 2500);
                pendingForceRefreshRef.current = true;
                if (isMountedRef.current) {
                    updateState({
                        errors: retryable ? {} : {
                            form: (error.response?.data?.message || error.message || "An error occurred")
                        },
                        isSubmitting: pendingSubmitsRef.current.size > 1
                    });
                    setManagedTimeout(() => refreshSalesData(true), 300);
                    setManagedTimeout(() => refreshSidebarSales(true), 300);
                }
            } else if (retryable) {
                pendingForceRefreshRef.current = true;
                if (isMountedRef.current) {
                    updateState({
                        errors: {},
                        isSubmitting: pendingSubmitsRef.current.size > 1
                    });
                    pendingForceRefreshRef.current = true;
                    setManagedTimeout(() => refreshSalesData(true), 300);
                    setManagedTimeout(() => refreshSidebarSales(true), 300);
                }
            } else if (editingIdAtStart != null && previousEditedSale) {
                // CRITICAL FIX: On edit error, restore the previous version of the sale
                editingSaleIdRef.current = editingIdAtStart;
                upsertLocalTableSale(previousEditedSale);
                if (isMountedRef.current) {
                    setState((prev) => ({
                        ...prev,
                        allSales: prev.allSales.map((sale) =>
                            sameSaleId(sale.id, editingIdAtStart) ? previousEditedSale : sale
                        ),
                        localTableSales: [
                            previousEditedSale,
                            ...(prev.localTableSales || []).filter((sale) => !sameSaleId(sale.id, editingIdAtStart)),
                        ],
                        editingSaleId: editingIdAtStart,
                        isSubmitting: pendingSubmitsRef.current.size > 1,
                        errors: {
                            form: (error.response?.data?.message || error.message || "An error occurred")
                        },
                    }));
                }
            } else if (isMountedRef.current) {
                updateState({
                    errors: {
                        form: (error.response?.data?.message || error.message || "An error occurred")
                    },
                    isSubmitting: pendingSubmitsRef.current.size > 1
                });
            }
        } finally {
            if (tempId) inFlightTempIdsRef.current.delete(String(tempId));
            pendingSubmitsRef.current.delete(myGeneration);
            pendingSubmitStartedAtRef.current.delete(myGeneration);
            if (isMountedRef.current && pendingSubmitsRef.current.size === 0) {
                updateState({ isSubmitting: false });
                if (pendingForceRefreshRef.current) {
                    let freshLocal = false;
                    recentSubmittedSalesRef.current.forEach((entry) => {
                        if (entry && (Date.now() - entry.at) < 2500) freshLocal = true;
                    });
                    if (freshLocal) {
                        setManagedTimeout(() => {
                            if (pendingSubmitsRef.current.size > 0) return;
                            pendingForceRefreshRef.current = false;
                            refreshSalesData(true);
                        }, 2500);
                    } else {
                        pendingForceRefreshRef.current = false;
                        setManagedTimeout(() => refreshSalesData(true), 400);
                    }
                }
                // Keep sidebars on DB truth after a burst of rapid submits (deferred to avoid flicker).
                setManagedTimeout(() => refreshSidebarSales(true), 700);
            }
        }
    };
const handleCustomerClick = useStableCallback(async (type, customerCode, billNo = null, salesRecords = [], sourceEvent = null) => {
        // --- ADMIN MODAL LOGIC ---
        if (currentUser?.role === 'Admin') {
            updateState({
                isAdminModalOpen: true,
                modalType: 'customer',
                modalTitle: `Customer: ${customerCode} ${billNo ? `(Bill: ${billNo})` : ''}`,
                modalData: salesRecords
            });
            return;
        }

        const isPrinted = type === 'printed';
        const allowPrintedFormHydration = !isPrinted || sourceEvent?.isTrusted === true;
        let selectionKey = customerCode;
        if (isPrinted && billNo) selectionKey = `${customerCode}-${billNo}`;
        
        const isCurrentlySelected = isPrinted
            ? selectedPrintedCustomerRef.current === selectionKey
            : selectedUnprintedCustomerRef.current === selectionKey;

        // Hard gate: Ignore untrusted synthetic events if not already selected
        if (!isCurrentlySelected && sourceEvent && sourceEvent.isTrusted !== true) {
            return;
        }

        // Reset opposite sidebar tracking and clear previous session table caches when switching selections
        if (!isCurrentlySelected) {
            stickyTableSalesRef.current.clear();
            localTableSalesRef.current.clear();
            pinnedBillSalesRef.current.clear();
            displayedSalesRef.current = [];
            editingSaleIdRef.current = null;
        }

        // Sync refs BEFORE any await/setState so shortcuts see the selection immediately
        if (isPrinted) {
            printedBillClickRef.current = !isCurrentlySelected;
            selectedPrintedCustomerRef.current = isCurrentlySelected ? null : selectionKey;
            selectedUnprintedCustomerRef.current = null;
        } else {
            printedBillClickRef.current = false;
            selectedUnprintedCustomerRef.current = isCurrentlySelected ? null : selectionKey;
            selectedPrintedCustomerRef.current = null;
        }

        if (!isCurrentlySelected && customerCode) {
            tableCustomerScopeRef.current = String(customerCode).trim().toUpperCase();
            middleUserOpenedRef.current = true;
            middleBillArmedRef.current = true;
            middleTableSourceRef.current = isPrinted ? 'printed' : 'unprinted';
        } else if (isCurrentlySelected) {
            middleTableSourceRef.current = null;
            middleUserOpenedRef.current = false;
            customerCodeKeyUsedRef.current = false;
        }

        const customer = customers.find(x => String(x.short_name).toUpperCase() === String(customerCode).toUpperCase());

        if (!isCurrentlySelected) {
            // Prefer rows passed from the sidebar; fall back to live sidebar + allSales caches.
            const normCode = String(customerCode || '').trim().toUpperCase();
            const isPrintedStatus = (s) => String(s?.bill_printed ?? '').trim().toUpperCase() === 'Y';
            let rowsForTable = Array.isArray(salesRecords) ? salesRecords.slice() : [];
            
            if (!isPrinted) {
                const cachedUnprinted = collectUnprintedSalesForCustomer(normCode);
                const seenClickIds = new Set(rowsForTable.map((s) => String(s?.id)).filter(Boolean));
                cachedUnprinted.forEach((s) => {
                    const idStr = String(s.id);
                    if (seenClickIds.has(idStr)) return;
                    seenClickIds.add(idStr);
                    rowsForTable.push(s);
                });
            } else if (rowsForTable.length === 0) {
                rowsForTable = (sidebarSalesRef.current || []).filter((s) => {
                    if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return false;
                    if (String(s.customer_code || '').trim().toUpperCase() !== normCode) return false;
                    if (billNo) return String(s.bill_no || '') === String(billNo);
                    return true;
                });
            }

            // After F1 print, sidebar billSales can still carry stale pre-print rows.
            // Never paint those into an unprinted selection.
            if (!isPrinted) {
                rowsForTable = rowsForTable.filter((s) => s?.id && !isPrintedStatus(s));
            } else if (billNo) {
                rowsForTable = rowsForTable.filter(
                    (s) => s?.id && String(s.bill_no || '') === String(billNo)
                );
            }

            // Calculation logic for given amount
            const totals = rowsForTable.reduce((acc, s) => {
                const weight = parseFloat(s.weight) || 0;
                const price = parseFloat(s.price_per_kg) || 0;
                const packs = parseFloat(s.packs) || 0;
                const pCost = parseFloat(s.CustomerPackCost) || 0;

                acc.billTotal += (weight * price);
                acc.totalBagPrice += (packs * pCost);

                return acc;
            }, { billTotal: 0, totalBagPrice: 0, totalLabour: 0 });

            const calculatedFinal = totals.billTotal + totals.totalBagPrice;
            const clickGeneration = ++customerClickGenerationRef.current;
            const paintAt = Date.now();

            // Drop sticky/recent leftovers from the previously printed bill so they cannot
            // reappear when opening another (or the same) unprinted customer.
            if (!isPrinted) {
                stickyTableSalesRef.current.forEach((sale, idStr) => {
                    if (!sale?.id) return;
                    const sameCust = String(sale.customer_code || '').trim().toUpperCase() === normCode;
                    if (isPrintedStatus(sale) || !sameCust) {
                        stickyTableSalesRef.current.delete(idStr);
                    }
                });
                recentSubmittedSalesRef.current.forEach((entry, id) => {
                    const sale = entry?.sale;
                    if (!sale?.id) return;
                    if (isPrintedStatus(sale)) {
                        recentSubmittedSalesRef.current.delete(id);
                    }
                });
            }

            // Instant table paint from the sidebar's live bill rows (same click tick).
            flushSync(() => {
                setState((prev) => {
                    const allById = new Map(
                        (prev.allSales || [])
                            .filter((s) => s?.id != null && !isDeletedSaleId(deletedSaleIdsRef.current, s.id))
                            .map((s) => [String(s.id), s])
                    );

                    const localById = new Map();
                    if (isPrinted) {
                        (prev.localTableSales || []).forEach((s) => {
                            if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
                            if (String(s.customer_code || '').trim().toUpperCase() !== normCode) return;
                            if (billNo && String(s.bill_no || '') !== String(billNo)) return;
                            localById.set(String(s.id), s);
                        });
                    }

                    rowsForTable.forEach((sale) => {
                        if (!sale?.id || isTempOrOptimisticSale(sale)) return;
                        if (isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
                        if (!isPrinted && isPrintedStatus(sale)) return;
                        const idStr = String(sale.id);

                        const normalizedSale = (isPrinted && billNo)
                            ? {
                                ...sale,
                                bill_printed: 'Y',
                                bill_no: sale.bill_no || billNo,
                                _optimistic: false,
                            }
                            : {
                                ...sale,
                                bill_printed: sale.bill_printed || 'N',
                                bill_no: sale.bill_no || null,
                                _optimistic: false,
                            };

                        const existingAll = allById.get(idStr);
                        if (!isPrinted && existingAll && isPrintedStatus(existingAll)) return;

                        allById.set(idStr, normalizedSale);
                        localById.set(idStr, normalizedSale);
                        recentSubmittedSalesRef.current.set(idStr, { sale: normalizedSale, at: paintAt });
                        recentSubmittedSalesRef.current.set(sale.id, { sale: normalizedSale, at: paintAt });
                        upsertLocalTableSale(normalizedSale);
                    });

                    localTableSalesRef.current.clear();
                    stickyTableSalesRef.current.clear();
                    pinnedBillSalesRef.current.clear();
                    localById.forEach((sale, idStr) => {
                        localTableSalesRef.current.set(idStr, sale);
                        stickyTableSalesRef.current.set(idStr, sale);
                        pinnedBillSalesRef.current.set(idStr, sale);
                    });

                    const nextAll = Array.from(allById.values());
                    const nextLocal = Array.from(localById.values());
                    allSalesRef.current = nextAll;

                    return {
                        ...prev,
                        allSales: nextAll,
                        localTableSales: nextLocal,
                        formData: isPrinted && allowPrintedFormHydration
                            ? {
                                ...initialFormData,
                                customer_code: rowsForTable[0]?.customer_code || customerCode,
                                customer_name: rowsForTable[0]?.customer_name || customer?.name || '',
                                telephone_no: rowsForTable[0]?.telephone_no || customer?.telephone_no || '',
                                supplier_code: rowsForTable[0]?.supplier_code || '',
                                item_code: rowsForTable[0]?.item_code || '',
                                item_name: rowsForTable[0]?.item_name || '',
                                weight: rowsForTable[0]?.weight || '',
                                price_per_kg: rowsForTable[0]?.price_per_kg || '',
                                pack_due: rowsForTable[0]?.pack_due || '',
                                total: rowsForTable[0]?.total || '',
                                packs: rowsForTable[0]?.packs || '',
                                given_amount: rowsForTable[0]?.given_amount || '',
                            }
                            : {
                                ...initialFormData,
                                customer_code: customerCode,
                                customer_name: customer?.name || "",
                                telephone_no: customer?.telephone_no || "",
                                supplier_code: "",
                                item_code: "",
                                item_name: "",
                                weight: "",
                                price_per_kg: "",
                                packs: "",
                            },
                        selectedPrintedCustomer: isPrinted ? selectionKey : null,
                        selectedUnprintedCustomer: isPrinted ? null : selectionKey,
                        currentBillNo: isPrinted ? billNo : null,
                        editingSaleId: null,
                        isManualClear: false,
                        middleBillArmed: true,
                        customerSearchInput: "",
                        priceManuallyChanged: false,
                        gridPricePerKg: "",
                        selectedSaleForBreakdown: null,
                        errors: {},
                    };
                });
            });

            if (!isPrinted) {
                fetchLoanAmount(customerCode);
                setManagedTimeout(() => focusSupplierCode(), 50);
            }

            void refreshSidebarSales(true);
            if (!isPrinted) {
                void hydrateCustomerUnprintedFromDb(normCode);
            }

            return;
        } else {
            // Toggle off — clear selection + form (keep sales caches intact).
            middleBillArmedRef.current = false;
            middleUserOpenedRef.current = false;
            customerCodeKeyUsedRef.current = false;
            customerClickGenerationRef.current += 1;
            selectedPrintedCustomerRef.current = null;
            selectedUnprintedCustomerRef.current = null;
            tableCustomerScopeRef.current = '';
            handleClearForm(true);
            updateState({
                selectedPrintedCustomer: null,
                selectedUnprintedCustomer: null,
                currentBillNo: null,
                editingSaleId: null,
                isManualClear: true,
                middleBillArmed: false,
                customerSearchInput: "",
                priceManuallyChanged: false,
                gridPricePerKg: "",
                customerProfilePic: null,
                customerNameDisplay: "",
                loanAmount: 0,
            });

            // After deselect, blink cursor in customer code field.
            setManagedTimeout(() => {
                const el = refs.customer_code_input.current;
                if (!el) return;
                el.focus({ preventScroll: true });
                try { el.select(); } catch (_) { /* ignore */ }
            }, 0);
            return;
        }
    });
    // Helper function for normalizing codes
    const normalizeCode = useCallback((value) => {
        return String(value || '').trim().toUpperCase();
    }, []);
    const snapshotDisplayedTableRows = useStableCallback((opts = {}) => {
        const rows = [];
        const seen = new Set();
        const slotKey = (id) => {
            if (id == null) return '';
            const idStr = String(id);
            return stableRowKeyRef.current.get(idStr)
                || (realToTempIdRef.current.has(idStr)
                    ? (stableRowKeyRef.current.get(realToTempIdRef.current.get(idStr)) || idStr)
                    : idStr);
        };
        const activeCustomer = String(
            formDataRef.current?.customer_code
            || selectedUnprintedCustomerRef.current
            || tableCustomerScopeRef.current
            || ''
        ).trim().toUpperCase();
        const printedSel = String(selectedPrintedCustomerRef.current || '');
        const printedBill = printedSel.includes('-')
            ? printedSel.slice(printedSel.lastIndexOf('-') + 1).trim()
            : '';
        const isPrintedView = middleTableSourceRef.current === 'printed';

        const add = (sale) => {
            if (!sale?.id || isDeletedSaleId(deletedSaleIdsRef.current, sale.id)) return;
            const saleCust = String(sale.customer_code || '').trim().toUpperCase();
            if (activeCustomer && saleCust && saleCust !== activeCustomer) return;
            if (isPrintedView && printedBill) {
                const saleBill = String(sale.bill_no || sale.customer_bill_no || '').trim();
                if (saleBill && saleBill !== printedBill) return;
            }
            const key = slotKey(sale.id) || String(sale.id);
            if (seen.has(key)) {
                const idx = rows.findIndex((r) => (slotKey(r.id) || String(r.id)) === key);
                if (idx >= 0 && String(rows[idx].id).startsWith('tmp-') && !String(sale.id).startsWith('tmp-')) {
                    rows[idx] = sale;
                }
                return;
            }
            seen.add(key);
            rows.push(sale);
        };

        (displayedSalesRef.current || []).forEach(add);
        (displayedSales || []).forEach(add);
        pinnedBillSalesRef.current.forEach(add);
        stickyTableSalesRef.current.forEach(add);
        localTableSalesRef.current.forEach(add);
        pendingPersistRef.current.forEach((job) => add(job?.sale));
        if (opts.includeAllUnprinted && !isPrintedView && activeCustomer) {
            collectUnprintedSalesForCustomer(activeCustomer).forEach(add);
        }
        return rows;
    });

    const handleMarkAllProcessed = useStableCallback(async () => {
        if (processInFlightRef.current) {
            const age = Date.now() - (processStartedAtRef.current || 0);
            const hasNewRows = (displayedSalesRef.current || []).length > 0
                || pinnedBillSalesRef.current.size > 0;
            if (!hasNewRows && age < MARK_IDS_WAIT_MS + MARK_IDS_LEFTOVER_WAIT_MS + 20000) return;
        }
        processInFlightRef.current = true;
        processStartedAtRef.current = Date.now();

        // Every row currently shown in the middle table (painted + pinned).
        const snapshotRows = snapshotDisplayedTableRows();

        const customerCode = String(
            formDataRef.current?.customer_code
            || selectedUnprintedCustomerRef.current
            || tableCustomerScopeRef.current
            || ''
        ).trim().toUpperCase();

        // Clear form + focus customer code WITHOUT selecting text (select() made typing feel stuck).
        // Do NOT set lastPrintAtRef here — F5 is process, not print. Treating it as a print
        // hid the bill from the unprinted sidebar while the DB still had it.
        editingSaleIdRef.current = null;
        tableCustomerScopeRef.current = '';
        middleTableSourceRef.current = null;
        stickyTableSalesRef.current.clear();
        localTableSalesRef.current.clear();
        pinnedBillSalesRef.current.clear();
        displayedSalesRef.current = [];
        setFormData(initialFormData);
        middleBillArmedRef.current = false;
        middleUserOpenedRef.current = false;
        customerCodeKeyUsedRef.current = false;
        customerClickGenerationRef.current += 1;
        selectedPrintedCustomerRef.current = null;
        selectedUnprintedCustomerRef.current = null;
        updateState({
            editingSaleId: null,
            loanAmount: 0,
            isManualClear: true, // block autoCustomerCode from filling the input after F5
            middleBillArmed: false,
            packCost: 0,
            customerSearchInput: "",
            itemSearchInput: "",
            supplierSearchInput: "",
            priceManuallyChanged: false,
            gridPricePerKg: "",
            isGivenAmountManuallyTouched: false,
            selectedSaleForBreakdown: null,
            selectedUnprintedCustomer: null,
            selectedPrintedCustomer: null,
            currentBillNo: null,
            customerProfilePic: null,
            customerNameDisplay: "",
            isSubmitting: snapshotRows.length > 0,
            localTableSales: [],
        });

        const focusCustomerCodeNoSelect = () => {
            const el = refs.customer_code_input.current;
            if (!el) return;
            el.focus({ preventScroll: true });
            try {
                const end = el.value?.length ?? 0;
                el.setSelectionRange(end, end);
            } catch (_) { /* ignore */ }
        };
        focusCustomerCodeNoSelect();

        if (snapshotRows.length === 0) {
            processInFlightRef.current = false;
            processStartedAtRef.current = 0;
            return;
        }

        try {
            // Wait for real DB ids BEFORE touching the unprinted sidebar.
            // Removing first (on tmp-* ids) made the bill vanish, then a refresh
            // brought it back because /sales/mark-all-processed never got real ids.
            const saleIds = await waitForEveryDisplayedRowId(snapshotRows);
            const apiIds = asMarkApiIds(saleIds);
            snapshotRows.forEach((s) => {
                const mapped = s?._pendingRealId ?? tempToRealIdRef.current.get(String(s?.id));
                const backend = toBackendSaleId(mapped);
                if (backend == null) return;
                if (!apiIds.some((id) => String(id) === String(backend))) apiIds.push(backend);
            });

            if (!apiIds.length) {
                console.error("F5: no real backend sale ids — leaving unprinted sidebar unchanged");
                updateState({ isSubmitting: false, isManualClear: true });
                return;
            }

            const processPayload = (ids) => ({
                sales_ids: ids,
                sale_ids: ids,
                ids,
                customer_code: customerCode || undefined,
            });
            await api.post(routes.markAllProcessed, processPayload(apiIds), { timeout: 15000 });

            const sent = new Set(apiIds.map(String));
            const expectedProcessed = expectedDisplayedRowCount(snapshotRows);
            for (let round = 0; round < 8 && sent.size < expectedProcessed; round++) {
                const leftover = await collectLeftoverDisplayedBackendIds(snapshotRows, sent);
                if (!leftover.length) {
                    if (!displayedRowsStillSaving(snapshotRows)) break;
                    continue;
                }
                leftover.forEach((id) => sent.add(String(id)));
                await api.post(routes.markAllProcessed, processPayload(leftover), { timeout: 15000 });
            }

            // Stop holding these ids as "just submitted" so a real process can
            // leave the unprinted list on the next healthy GET. Do NOT mark them
            // locally processed — that hid bills the database still had as N.
            sent.forEach((id) => {
                recentSubmittedSalesRef.current.delete(id);
                recentSubmittedSalesRef.current.delete(Number(id));
            });
            snapshotRows.forEach((s) => {
                if (s?.id == null) return;
                recentSubmittedSalesRef.current.delete(String(s.id));
                recentSubmittedSalesRef.current.delete(s.id);
            });

            try {
                const verify = await api.get(routes.sales, {
                    timeout: API_TIMEOUT_MS,
                    params: { _t: Date.now(), _f5: 1 },
                    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
                });
                const raw = extractSalesArray(verify.data);
                if (Array.isArray(raw) && raw.length > 0) {
                    applySidebarSales(raw);
                    const stillUnprinted = [];
                    const positivelyProcessed = [];
                    sent.forEach((id) => {
                        const found = raw.find((s) => String(s?.id) === String(id));
                        // Missing from this GET is NOT proof the bill was processed.
                        // That is why F5 hid the bill and a full reload put it back.
                        if (!found) return;
                        if (isUnprintedBillStatus(found.bill_printed)) {
                            stillUnprinted.push(found);
                            return;
                        }
                        positivelyProcessed.push(id);
                    });
                    if (positivelyProcessed.length) {
                        applyProcessedRemovalToStores(positivelyProcessed);
                    }
                    if (stillUnprinted.length) {
                        const keepUntil = Date.now() + SIDEBAR_UNPRINTED_HOLD_MS;
                        stillUnprinted.forEach((s) => {
                            const idStr = String(s.id);
                            locallyProcessedIdsRef.current.delete(idStr);
                            recentlyProcessedIdsRef.current.delete(idStr);
                            sidebarMissingStreakRef.current.delete(idStr);
                            sidebarKeepUnprintedIdsRef.current.set(idStr, keepUntil);
                        });
                        const byId = new Map((sidebarSalesRef.current || []).map((s) => [String(s.id), s]));
                        stillUnprinted.forEach((s) => {
                            const prev = byId.get(String(s.id));
                            byId.set(String(s.id), {
                                ...(prev || {}),
                                ...s,
                                bill_printed: s.bill_printed || 'N',
                                _optimistic: false,
                            });
                        });
                        const nextSidebar = Array.from(byId.values());
                        sidebarSalesRef.current = nextSidebar;
                        lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
                        if (isMountedRef.current) {
                            setState((prev) => {
                                const allById = new Map((prev.allSales || []).map((row) => [String(row.id), row]));
                                stillUnprinted.forEach((s) => {
                                    allById.set(String(s.id), { ...(allById.get(String(s.id)) || {}), ...s, bill_printed: s.bill_printed || 'N' });
                                });
                                const nextAll = Array.from(allById.values());
                                allSalesRef.current = nextAll;
                                return { ...prev, sidebarSales: nextSidebar, allSales: nextAll };
                            });
                        }
                    }
                }
            } catch (_) { /* keep the unprinted sidebar as-is */ }

            updateState({ isSubmitting: false, isManualClear: true });
            setManagedTimeout(() => refreshSidebarSales(true), 400);
        } catch (err) {
            console.error("Failed to mark sales as processed:", err);
            updateState({ isSubmitting: false, isManualClear: true });
        } finally {
            processInFlightRef.current = false;
            processStartedAtRef.current = 0;
            if (isMountedRef.current) updateState({ isSubmitting: false });
        }
        // Do NOT re-focus or select after the API — that steals the caret while the operator types.
    });
    const printSingleContent = async (html, customerName) => {
        return new Promise((resolve) => {
            const ok = writeAndPrintBill(buildPrintDocumentShell(`Print Bill - ${customerName}`, html));
            if (!ok) {
                alert("Unable to open print dialog");
            }
            setManagedTimeout(resolve, 300);
        });
    };

    const buildFullReceiptHTML = (salesData, billNo, customerName, mobile, globalLoanAmount = 0, billSize = '3inch') => {
        // 1. Resolve Bill No immediately with fallback to internal record or quick sequence
        let resolvedBillNo = (billNo && billNo !== '—') ? billNo : '';
        if (!resolvedBillNo) {
            resolvedBillNo = salesData.find(s => s.bill_no)?.bill_no || '';
        }

        const formatNumber = (num) => {
            if (typeof num !== 'number' && typeof num !== 'string') return '0';
            const number = parseFloat(num);
            if (isNaN(number)) return '0';

            if (Number.isInteger(number)) {
                return number.toLocaleString('en-US');
            } else {
                const parts = number.toFixed(2).split('.');
                const wholePart = parseInt(parts[0]).toLocaleString('en-US');
                return `${wholePart}.${parts[1]}`;
            }
        };

        const date = new Date().toLocaleDateString();
        const time = new Date().toLocaleTimeString();
        let totalAmountSum = 0;
        const consolidatedSummary = {};

        salesData.forEach(s => {
            const itemName = s.item_name || 'Unknown';
            if (!consolidatedSummary[itemName]) consolidatedSummary[itemName] = { totalWeight: 0, totalPacks: 0 };
            consolidatedSummary[itemName].totalWeight += parseFloat(s.weight) || 0;
            consolidatedSummary[itemName].totalPacks += parseInt(s.packs) || 0;
            totalAmountSum += parseFloat(s.total) || 0;
        });

        const totalPacksSum = Object.values(consolidatedSummary).reduce((sum, item) => sum + item.totalPacks, 0);
        const is4Inch = billSize === '4inch';

        // CLEAN FONT SETTINGS - 80mm paper
        const receiptMaxWidth = '80mm';
        const contentWidth = '72mm';

        const fontSizeBody = '16px';
        const fontSizeHeader = '16px';
        const fontSizeTotal = '20px';
        const fontSizeSmall = '13px';
        const fontSizeXSmall = '11px';

        const itemsHtml = salesData.map(s => {
            const packs = parseInt(s.packs) || 0;
            const weight = parseFloat(s.weight) || 0;
            const price = parseFloat(s.price_per_kg) || 0;
            const value = (weight * price).toFixed(2);

            return `
<tr style="font-size:${fontSizeBody}; font-weight:900; vertical-align: middle; line-height:1.4; page-break-inside: avoid;">
    <td style="text-align:left; padding:3px 2px; white-space: nowrap;">
    <span style="font-size:${fontSizeBody};">
        ${s.item_name || ""}
    </span><br>
    <span style="font-size:${fontSizeXSmall}; font-weight:bold;">
        ${formatNumber(packs)} 
    </span>
</td>
    <td style="text-align:right; padding:3px 2px; white-space: nowrap; min-width: 25px; font-size:${fontSizeBody};">
        ${formatNumber(weight.toFixed(2))}
    </td>
    <td style="text-align:right; padding:3px 2px; white-space: nowrap; min-width: 25px; font-size:${fontSizeBody};">
        ${formatNumber(price.toFixed(2))}
    </td>
    <td style="text-align:right; padding:3px 2px; white-space: nowrap; min-width: 30px;">
        <div style="font-size:${fontSizeXSmall}; font-weight:bold; white-space:nowrap; color:#555;">${s.supplier_code || "ASW"}</div>
        <div style="font-size:${fontSizeBody}; font-weight:900; white-space:nowrap;">${formatNumber(value)}</div>
    </td>
</tr>`;
        }).join("");

        const totalSales = salesData.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseFloat(s.price_per_kg) || 0)), 0);
        const totalPackCost = salesData.reduce((sum, s) => sum + ((parseFloat(s.CustomerPackCost) || 0) * (parseFloat(s.packs) || 0)), 0);
        const finalGrandTotal = totalSales + totalPackCost;
        const givenAmount = salesData.find(s => parseFloat(s.given_amount) > 0)?.given_amount || 0;
        const remaining = givenAmount > 0 ? Math.abs(givenAmount - finalGrandTotal) : 0;

        const loanRow = globalLoanAmount !== 0 ? `
<tr>
    <td style="font-size:${fontSizeSmall}; padding-top:4px; white-space: nowrap; font-weight:bold;">පෙර ණය:</td>
    <td style="text-align:right; font-size:${fontSizeSmall}; font-weight:bold; padding-top:4px; white-space: nowrap;">
        Rs. ${formatNumber(Math.abs(globalLoanAmount).toFixed(2))}
    </td>
</tr>` : '';

        const summaryEntries = Object.entries(consolidatedSummary);
        let summaryHtmlContent = '';
        for (let i = 0; i < summaryEntries.length; i += 2) {
            const [name1, d1] = summaryEntries[i];
            const [name2, d2] = summaryEntries[i + 1] || [null, null];
            const text1 = `${name1}:${formatNumber(d1.totalWeight)}/${formatNumber(d1.totalPacks)}`;
            const text2 = d2 ? `${name2}:${formatNumber(d2.totalWeight)}/${formatNumber(d2.totalPacks)}` : '';
            const combinedText = d2 ? `${text1}  ${text2}` : text1;
            summaryHtmlContent += `
<tr>
    <td style="padding:3px 2px; width:100%; font-weight:bold; white-space:nowrap; text-align:center; font-size:${fontSizeXSmall};" colspan="2">${combinedText}</td>
</tr>`;
        }

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Print Receipt</title>
    <style>
        /* CRITICAL: Reset all margins for thermal printer */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        /* XP-80 Thermal Printer Settings */
        @page {
            size: ${receiptMaxWidth} auto;
            margin: 0;
            padding: 0;
        }
        
        @media print {
            html, body {
                margin: 0;
                padding: 0;
                width: ${receiptMaxWidth};
                background: white;
                font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .receipt-content {
                width: ${contentWidth};
                margin: 0 auto;
                padding: 3px 4px;
                background: #fff;
                font-size: ${fontSizeBody};
                box-sizing: border-box;
                overflow: hidden;
                page-break-after: avoid;
                page-break-inside: avoid;
            }
            
            .receipt-content * {
                max-width: 100%;
                box-sizing: border-box;
                font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .no-break {
                page-break-inside: avoid;
                page-break-after: avoid;
            }
            
            .total-section {
                page-break-inside: avoid;
                page-break-after: avoid;
            }
            
            table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
                page-break-inside: auto;
            }
            
            thead {
                display: table-row-group !important;
                page-break-after: avoid;
                page-break-inside: avoid;
            }
            
            tbody {
                display: table-row-group;
                page-break-inside: auto;
            }
            
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            
            td, th {
                padding: 2px 3px;
                font-size: ${fontSizeBody};
            }
            
            .divider {
                border: none;
                border-top: 2px solid #000;
                margin: 4px 0;
                width: 100%;
            }
            
            .footer-section {
                margin-top: 8px;
                padding-top: 6px;
                border-top: 2px solid #000;
                width: 100%;
                page-break-after: avoid;
                page-break-inside: avoid;
            }
            
            .cut-marker {
                text-align: center;
                font-size: 10px;
                color: #999;
                margin-top: 10px;
                padding-top: 6px;
                border-top: 1px dotted #ccc;
                letter-spacing: 2px;
                page-break-after: avoid;
            }
            
            .net-payable {
                color: #000;
                font-size: ${fontSizeTotal};
                font-weight: 900;
                border-bottom: 3px double #000;
                border-top: 2px solid #000;
                padding: 3px 8px;
                display: inline-block;
                white-space: nowrap;
                letter-spacing: 0.5px;
            }
            
            .no-extra-space {
                height: 0;
                margin: 0;
                padding: 0;
            }
            
            .space-before-footer {
                height: 8px;
                margin: 0;
                padding: 0;
            }
            
            .header-title {
                font-size: 22px;
                font-weight: 900;
                white-space: nowrap;
                letter-spacing: 1px;
            }
            
            .header-subtitle {
                font-size: ${fontSizeXSmall};
                font-weight: bold;
                font-style: italic;
                white-space: nowrap;
                color: #333;
            }
            
            .header-code {
                border: 2px solid #000;
                padding: 2px 8px;
                font-size: 24px;
                font-weight: 900;
                white-space: nowrap;
            }
            
            .header-name {
                border: 2px solid #000;
                padding: 2px 8px;
                font-size: 22px;
                font-weight: 900;
                white-space: nowrap;
                max-width: 60%;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .bill-info {
                font-size: ${fontSizeSmall};
                font-weight: bold;
                padding: 2px 2px;
                width: 100%;
            }
            
            .bill-info span {
                font-weight: normal;
            }
            
            .table-header th {
                font-size: ${fontSizeHeader};
                font-weight: 900;
                text-align: left;
                padding: 2px 2px;
                border-bottom: 2px solid #000;
            }
            
            .table-header th:not(:first-child) {
                text-align: right;
            }
            
            .summary-text {
                font-size: ${fontSizeXSmall};
                font-weight: bold;
            }
            
            .total-label {
                font-size: ${fontSizeTotal};
                font-weight: 900;
                padding: 2px 2px;
                white-space: nowrap;
            }
            
            .total-amount {
                text-align: right;
                padding: 2px 2px;
            }
            
            .footer-text {
                margin: 2px 0;
                font-weight: bold;
                white-space: nowrap;
                text-align: center;
                font-size: ${fontSizeSmall};
            }
            
            .footer-text-small {
                margin: 2px 0;
                white-space: nowrap;
                text-align: center;
                font-size: ${fontSizeXSmall};
            }
        }
        
        @media print and (min-width: 0px) {
            table {
                page-break-inside: auto;
            }
            
            tr {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
<div class="receipt-content">
    <!-- HEADER -->
    <div class="no-break">
        <div style="text-align:center; font-weight:bold; padding:2px 0; width:100%;">
            <div class="header-title">මංජු සහ සහෝදරයෝ</div>
            <div class="header-subtitle">colombage lanka (Pvt) Ltd</div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin:4px 0; width:100%;">
                <span class="header-code">N66</span>
                <span class="header-name">${(salesData[0]?.customer_code || 'CUSTOMER').toUpperCase()}</span>
            </div>
            
            <div style="font-size:${fontSizeXSmall}; white-space:nowrap; font-weight:bold; color:#444;">එළවළු, පළතුරු තොග වෙළෙන්දෝ</div>
            <div style="display:flex; justify-content:space-between; font-size:${fontSizeSmall}; padding:2px 2px; width:100%; font-weight:bold;">
                <span style="white-space:nowrap;">බණ්ඩාරවෙල</span>
                <span style="white-space:nowrap;">${time}</span>
            </div>
        </div>

        <!-- CONTACT & BILL INFO -->
        <div class="bill-info">
            <div style="font-weight:bold; white-space:nowrap;">දුර: 0777672838 / 0714371115</div>
            <div style="display:flex; justify-content:space-between; width:100%;">
                <span style="white-space:nowrap;">බිල් අං: <strong id="receipt-bill-no">${resolvedBillNo}</strong></span>
                <span style="white-space:nowrap;">දිනය: <strong>${date}</strong></span>
            </div>
        </div>

        <hr class="divider">

        <!-- ITEMS TABLE -->
        <table style="width:100%; border-collapse:collapse; font-size:${fontSizeBody}; table-layout: fixed;">
            <colgroup>
                <col style="width: 32%;">
                <col style="width: 20%;">
                <col style="width: 20%;">
                <col style="width: 28%;">
            </colgroup>
            <thead class="table-header" style="page-break-after: avoid; display: table-header-group;">
                <tr style="border-bottom:2px solid #000; font-weight:bold; page-break-after: avoid;">
                    <th style="text-align:left; padding:2px 2px;">වර්ගය<br>මලු</th>
                    <th style="text-align:right; padding:2px 2px;">කිලෝ</th>
                    <th style="text-align:right; padding:2px 2px;">මිල</th>
                    <th style="text-align:right; padding:2px 2px;">අයිතිය<br>අගය</th>
                </tr>
            </thead>
            <tbody style="page-break-inside: auto;">
                ${itemsHtml}
            </tbody>
        </table>

        <!-- SUMMARY -->
        <div style="margin-top:4px; border-top:2px solid #000; padding-top:3px; width:100%;">
            <table style="width:100%; border-collapse:collapse; font-size:${fontSizeXSmall}; text-align:center;">
                <tbody>
                    ${summaryHtmlContent || '<tr><td colspan="2" style="padding:2px; font-weight:bold;">No items</td></tr>'}
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- TOTALS -->
    <div class="total-section">
        <table style="width:100%; margin-top:4px; font-weight:bold; border-collapse:collapse;">
            <colgroup>
                <col style="width: 50%;">
                <col style="width: 50%;">
            </colgroup>
            <tbody>
                <tr>
                    <td style="font-size:${fontSizeSmall}; padding:2px 2px; white-space:nowrap;">මලු:</td>
                    <td style="text-align:right; font-size:${fontSizeSmall}; padding:2px 2px; white-space:nowrap;">
                        ${formatNumber(totalPackCost.toFixed(2))}
                    </td>
                </tr>
                <tr>
                    <td class="total-label">එකතුව:</td>
                    <td class="total-amount">
                        <span class="net-payable">Rs. ${Number(finalGrandTotal || 0).toFixed(2)}</span>
                    </td>
                </tr>
                ${loanRow}
                ${givenAmount > 0 ? `
                <tr>
                    <td style="font-size:${fontSizeSmall}; padding:2px 2px; white-space:nowrap;">දුන් මුදල:</td>
                    <td style="text-align:right; font-size:${fontSizeSmall}; padding:2px 2px; font-weight:bold; white-space:nowrap;">
                        ${formatNumber((0).toFixed(2))}
                    </td>
                </tr>
                <tr>
                    <td style="font-size:${fontSizeSmall}; white-space:nowrap;">ඉතිරිය:</td>
                    <td style="text-align:right; font-size:${fontSizeSmall}; white-space:nowrap;">${formatNumber((0).toFixed(2))}</td>
                </tr>` : ''}
            </tbody>
        </table>

        <!-- FOOTER WITH SPACE BEFORE CUT -->
        <div class="space-before-footer"></div>
        
        <div class="footer-section">
            <p class="footer-text">භාණ්ඩ පරීක්ෂාකර බලා රැගෙන යන්න</p>
            <p class="footer-text-small">නැවත භාර ගනු නොලැබේ</p>
        </div>
        
        <!-- CUT MARKER with extra space -->
        <div class="cut-marker">- - - - - - - - - - - - - - - - - - - - - -</div>
        <div style="height: 6px; margin: 0; padding: 0;"></div>
    </div>
</div>
</body>
</html>`;
    };
    const formatReceiptValue = (value) => {
        if (value === null || value === undefined || value === '') return '0.00';
        const num = parseFloat(value);
        if (isNaN(num)) return '0.00';
        return num.toFixed(2);
    };

    // Map painted tmp-* / optimistic rows to real DB ids for markPrinted + receipt.
    // After POST, the table often still shows tmp-* with `_pendingRealId` — that is printable.
    const lookupConfirmedSaleById = useStableCallback((realId) => {
        if (realId == null) return null;
        const idStr = String(realId);
        const fromLocal = localTableSalesRef.current.get(idStr) || localTableSalesRef.current.get(realId);
        if (fromLocal && !isTempOrOptimisticSale(fromLocal) && !String(fromLocal.id).startsWith('tmp-')) {
            return fromLocal;
        }
        const fromRecent = recentSubmittedSalesRef.current.get(idStr)?.sale
            || recentSubmittedSalesRef.current.get(realId)?.sale;
        if (fromRecent && !String(fromRecent.id).startsWith('tmp-') && !fromRecent._optimistic) {
            return { ...fromRecent, id: fromRecent.id, _optimistic: false };
        }
        const fromAll = (allSalesRef.current || []).find((s) => String(s?.id) === idStr);
        if (fromAll && !String(fromAll.id).startsWith('tmp-')) return fromAll;
        const fromSidebar = (sidebarSalesRef.current || []).find((s) => String(s?.id) === idStr);
        if (fromSidebar && !String(fromSidebar.id).startsWith('tmp-')) return fromSidebar;
        const fromSticky = stickyTableSalesRef.current.get(idStr);
        if (fromSticky && !String(fromSticky.id).startsWith('tmp-') && !fromSticky._optimistic) return fromSticky;
        return null;
    });

    const resolveSaleRowForPrint = useStableCallback((s) => {
        if (!s || s.id == null || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return null;
        const idStr = String(s.id);
        if (!idStr.startsWith('tmp-') && !s._optimistic) return s;

        const realId = s._pendingRealId ?? tempToRealIdRef.current.get(idStr);
        if (realId != null) {
            const confirmed = lookupConfirmedSaleById(realId);
            if (confirmed) return confirmed;
            return {
                ...s,
                id: realId,
                _optimistic: false,
                _pendingRealId: undefined,
            };
        }

        // Content match against just-confirmed rows (race: map not written yet).
        const cust = String(s.customer_code || '').trim().toUpperCase();
        const item = String(s.item_code || '');
        const weight = parseFloat(s.weight);
        const packs = parseFloat(s.packs || 0);
        let recentMatch = null;
        recentSubmittedSalesRef.current.forEach((entry) => {
            if (recentMatch) return;
            const r = entry?.sale;
            if (!r || r._optimistic || String(r.id || '').startsWith('tmp-')) return;
            if (String(r.customer_code || '').trim().toUpperCase() !== cust) return;
            if (String(r.item_code || '') !== item) return;
            if (parseFloat(r.weight) !== weight) return;
            if (parseFloat(r.packs || 0) !== packs) return;
            recentMatch = r;
        });
        return recentMatch || null;
    });

    const resolveSalesListForPrint = useStableCallback((list) => {
        const out = [];
        const seen = new Set();
        let pendingCount = 0;
        (list || []).forEach((s) => {
            if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
            const resolved = resolveSaleRowForPrint(s);
            if (!resolved) {
                if (isTempOrOptimisticSale(s) || String(s.id).startsWith('tmp-')) pendingCount += 1;
                return;
            }
            const key = String(resolved.id);
            if (seen.has(key) || String(key).startsWith('tmp-') || resolved._optimistic) {
                if (String(key).startsWith('tmp-') || resolved._optimistic) pendingCount += 1;
                return;
            }
            seen.add(key);
            out.push(resolved);
        });
        return { sales: out, pendingCount };
    });

    const collectBackendIdsFromRows = useStableCallback((rows) => {
        const ids = new Set();
        (rows || []).forEach((s) => {
            if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
            const resolved = resolveSaleRowForPrint(s);
            const mapped = resolved?.id ?? s._pendingRealId ?? tempToRealIdRef.current.get(String(s.id));
            if (mapped != null && !String(mapped).startsWith('tmp-')) ids.add(String(mapped));
            const idStr = String(s.id);
            if (!idStr.startsWith('tmp-') && !s._optimistic) ids.add(idStr);
        });
        return ids;
    });

    const expectedDisplayedRowCount = useStableCallback((snapshotRows) =>
        (snapshotRows || []).filter((s) => s?.id && !isDeletedSaleId(deletedSaleIdsRef.current, s.id)).length
    );

    const realBackendIdForTableRow = useStableCallback((s, claimedIds = null) => {
        if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return null;
        const claimed = claimedIds instanceof Set ? claimedIds : null;
        const tryClaim = (id) => {
            if (id == null) return null;
            const key = String(id);
            if (!key || key.startsWith('tmp-')) return null;
            if (claimed && claimed.has(key)) return null;
            return key;
        };

        const idStr = String(s.id);
        if (!idStr.startsWith('tmp-') && !s._optimistic) {
            const direct = tryClaim(idStr);
            if (direct) return direct;
        }
        const mapped = s._pendingRealId ?? tempToRealIdRef.current.get(idStr);
        const fromMap = tryClaim(mapped);
        if (fromMap) return fromMap;

        // Content match is a last resort and must not reuse another displayed row's id.
        // Same item/weight/packs entered twice is a normal POS pattern.
        const resolved = resolveSaleRowForPrint(s);
        return tryClaim(resolved?.id);
    });

    const collectUniqueBackendIdsForDisplayedRows = useStableCallback((snapshotRows) => {
        const ids = [];
        const claimed = new Set();
        (snapshotRows || []).forEach((s) => {
            if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
            const real = realBackendIdForTableRow(s, claimed);
            if (!real) return;
            claimed.add(real);
            ids.push(real);
        });
        return ids;
    });

    const displayedRowsStillSaving = useStableCallback((snapshotRows) =>
        (snapshotRows || []).some((s) => {
            if (!s?.id || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return false;
            const idStr = String(s.id);
            return pendingPersistRef.current.has(idStr)
                || inFlightTempIdsRef.current.has(idStr)
                || (idStr.startsWith('tmp-') && !tempToRealIdRef.current.has(idStr));
        })
    );

    const waitForDisplayedBackendIds = useStableCallback(async (snapshotRows, maxWaitMs = MARK_IDS_WAIT_MS) => {
        // One UNIQUE backend id per displayed table line. Never collapse two
        // painted rows onto the same id, and never return while a line is still saving.
        const expected = expectedDisplayedRowCount(snapshotRows);
        const collect = () => collectUniqueBackendIdsForDisplayedRows(snapshotRows);
        const unresolvedCount = () => Math.max(0, expected - collect().length);

        let waitMs = Number(maxWaitMs) > 0 ? maxWaitMs : MARK_IDS_WAIT_MS;
        if (pendingSubmitsRef.current.size > 0 || pendingPersistRef.current.size > 0 || displayedRowsStillSaving(snapshotRows)) {
            waitMs = Math.max(waitMs, PERSIST_TIMEOUT_MS + 5000);
        }
        const deadline = Date.now() + waitMs;
        let lastKick = 0;
        while (Date.now() < deadline) {
            const ids = collect();
            if (ids.length >= expected && !displayedRowsStillSaving(snapshotRows)) break;
            if (Date.now() - lastKick > 400) {
                lastKick = Date.now();
                try { retryPendingPersistsRef.current?.(); } catch (_) { /* ignore */ }
            }
            await new Promise((r) => setTimeout(r, MARK_IDS_POLL_MS));
        }
        return collect();
    });

    const collectAllSnapshotBackendIds = useStableCallback((snapshotRows) => {
        return collectUniqueBackendIdsForDisplayedRows(snapshotRows);
    });

    const waitForEveryDisplayedRowId = useStableCallback(async (snapshotRows) => {
        const expected = expectedDisplayedRowCount(snapshotRows);
        let ids = await waitForDisplayedBackendIds(snapshotRows, MARK_IDS_WAIT_MS);
        let guard = 0;
        while (ids.length < expected && guard < 6) {
            guard += 1;
            try { retryPendingPersistsRef.current?.(); } catch (_) { /* ignore */ }
            const extra = await waitForDisplayedBackendIds(snapshotRows, MARK_IDS_LEFTOVER_WAIT_MS);
            const seen = new Set(ids.map(String));
            extra.forEach((id) => {
                if (!seen.has(String(id))) {
                    seen.add(String(id));
                    ids.push(id);
                }
            });
            if (ids.length >= expected) break;
        }
        return asMarkApiIds(ids);
    });

    const collectLeftoverDisplayedBackendIds = useStableCallback(async (snapshotRows, alreadySent) => {
        const sent = alreadySent instanceof Set ? alreadySent : new Set();
        const latest = await waitForDisplayedBackendIds(snapshotRows, MARK_IDS_LEFTOVER_WAIT_MS);
        return asMarkApiIds(latest).filter((id) => !sent.has(String(id)));
    });

    // Marks `promiseFactory()` as a genuinely in-flight markPrinted confirmation for as
    // long as it's pending, so a beforeunload/F10 guard can hold off a reload just long
    // enough for the server to actually receive it (see pendingMarkPrintedCountRef above).
    // Deliberately only wraps the fast, normal-path confirmation calls — NOT the long-tail
    // keepRetryingMarkPrinted background retries, which can legitimately take minutes and
    // shouldn't block the user from navigating away.
    const withPendingMarkPrinted = useStableCallback(async (promiseFactory) => {
        pendingMarkPrintedCountRef.current += 1;
        try {
            return await promiseFactory();
        } finally {
            pendingMarkPrintedCountRef.current = Math.max(0, pendingMarkPrintedCountRef.current - 1);
        }
    });

    // BUGFIX (printed bills reverting to unprinted after refresh): the fixed 8-round
    // leftover loop used after printing gives up after roughly 1-2 minutes if a row's
    // create-POST is still slow (heavy load during fast entry). When it gives up, that
    // row's markPrinted call is simply never sent — the UI still shows it as "printed"
    // (the locallyMarkedPrintedIdsRef cache never expires) but the database still has
    // bill_printed='N', so a hard refresh (which wipes that in-memory cache) reveals the
    // real, unprinted row again. This keeps retrying in the background for much longer
    // instead of silently abandoning the row, and stamps/refreshes the sidebar as each
    // batch actually gets confirmed by the server.
    const keepRetryingMarkPrinted = useStableCallback(async ({
        snapshotRows, sentPrinted, expectedPrinted, getBillNo, telephoneNo, customerCode, customerName,
        onSent, maxMinutes = 20,
    }) => {
        const deadline = Date.now() + maxMinutes * 60 * 1000;
        let waitMs = 5000;
        let staleRounds = 0;
        while (sentPrinted.size < expectedPrinted && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            waitMs = Math.min(waitMs * 1.3, 15000);
            const leftover = await collectLeftoverDisplayedBackendIds(snapshotRows, sentPrinted);
            if (!leftover.length) {
                if (displayedRowsStillSaving(snapshotRows)) { staleRounds = 0; continue; }
                staleRounds += 1;
                // A handful of consecutive empty, non-saving rounds means nothing left CAN
                // resolve (e.g. a row's create request genuinely failed) — stop spinning.
                if (staleRounds >= 5) break;
                continue;
            }
            staleRounds = 0;
            leftover.forEach((id) => sentPrinted.add(String(id)));
            const billNo = getBillNo();
            try { onSent(leftover, billNo); } catch (_) { /* ignore */ }
            try {
                await api.post(routes.markPrinted, {
                    sales_ids: asMarkApiIds(leftover),
                    telephone_no: telephoneNo,
                    customer_code: customerCode,
                    customer_name: customerName,
                    loan_amount: 0,
                    bill_no: billNo,
                    customer_bill_no: billNo,
                }, { timeout: 15000 });
                setManagedTimeout(() => refreshSidebarSales(true), 200);
            } catch (err) {
                console.error("Retry markPrinted failed, will retry again:", err);
                // Undo the optimistic stamp attempt tracking so this batch is retried again.
                leftover.forEach((id) => sentPrinted.delete(String(id)));
            }
        }
        if (sentPrinted.size < expectedPrinted) {
            console.error(
                `markPrinted gave up after ~${maxMinutes} min with ${expectedPrinted - sentPrinted.size} row(s) still unconfirmed by the server. `
                + `These may still show as printed locally but be unprinted in the database until reprinted manually.`
            );
        }
    });

    // F1 first-print: grab whatever real ids are already on the bill. Only micro-wait
    // if every line is still tmp — never scan /sales or wait the full 8s.
    const collectDisplayedBackendIdsNow = useStableCallback((snapshotRows) => {
        return Array.from(collectBackendIdsFromRows(snapshotRows));
    });

    const waitForFirstPrintIds = useStableCallback(async (snapshotRows) => {
        return waitForEveryDisplayedRowId(snapshotRows);
    });

    const clearUiAfterPrint = useStableCallback((expectedGen = null) => {
        // Ignore stale delayed clears — they were wiping the next bill and restoring old fields.
        if (expectedGen != null && expectedGen !== printClearGenerationRef.current) return;

        // Full post-print wipe: inputs + middle table + caches (no auto-populate).
        // Sidebars keep backend data; just-printed ids stay marked Y.
        const printedCust = String(
            formDataRef.current?.customer_code
            || selectedUnprintedCustomerRef.current
            || tableCustomerScopeRef.current
            || lastPrintedCustomerRef.current
            || ''
        ).trim().toUpperCase();
        if (printedCust) lastPrintedCustomerRef.current = printedCust;
        lastPrintAtRef.current = Date.now();
        tableCustomerScopeRef.current = '';
        editingSaleIdRef.current = null;
        middleBillArmedRef.current = false;
        middleUserOpenedRef.current = false;
        customerCodeKeyUsedRef.current = false;
        middleTableSourceRef.current = null;
        customerClickGenerationRef.current += 1;
        selectedPrintedCustomerRef.current = null;
        selectedUnprintedCustomerRef.current = null;
        ignoreCustomerSelectUntilRef.current = Date.now() + 100;
        lastEnteredItemRef.current = null;
        lastSubmitSignatureRef.current = '';
        lastSubmitAtRef.current = 0;
        lastContentSubmitSigRef.current = '';
        loanAmountRef.current = 0;
        loanCacheRef.current.clear();
        stickyTableSalesRef.current.clear();
        localTableSalesRef.current.clear();
        pinnedBillSalesRef.current.clear();
        displayedSalesRef.current = [];
        // Keep temp↔real maps until markPrinted/F5 resolve finishes — clearing them here
        // left just-saved lines unmarked on the backend.
        formDataRef.current = { ...initialFormData };
        printInFlightRef.current = false;
        printAwaitingBillRef.current = false;
        printStartedAtRef.current = 0;

        // Clear every controlled/uncontrolled input DOM node used on the form.
        try {
            Object.keys(refs).forEach((key) => {
                const el = refs[key]?.current;
                if (!el) return;
                if ('value' in el) el.value = '';
                // react-select instances expose clearValue when available.
                if (typeof el.clearValue === 'function') {
                    try { el.clearValue(); } catch (_) { /* ignore */ }
                }
            });
        } catch (_) { /* ignore */ }

        flushSync(() => {
            setFormData({ ...initialFormData });
            setState((prev) => {
                const markPrinted = (s) => {
                    if (!isRecentlyPrintedId(s?.id)) return s;
                    const assigned = recentlyPrintedBillNoRef.current.get(String(s.id));
                    return {
                        ...s,
                        bill_printed: 'Y',
                        bill_no: s.bill_no || assigned || s.customer_bill_no,
                        customer_bill_no: s.customer_bill_no || assigned || s.bill_no,
                        _optimistic: false,
                    };
                };
                const nextAll = (prev.allSales || []).map(markPrinted);
                const nextSidebar = (prev.sidebarSales || []).map(markPrinted);
                allSalesRef.current = nextAll;
                sidebarSalesRef.current = nextSidebar;
                lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
                return {
                    ...prev,
                    formData: { ...initialFormData },
                    selectedPrintedCustomer: null,
                    selectedUnprintedCustomer: null,
                    currentBillNo: null,
                    isPrinting: false,
                    isManualClear: true,
                    middleBillArmed: false,
                    localTableSales: [],
                    allSales: nextAll,
                    sidebarSales: nextSidebar,
                    editingSaleId: null,
                    selectedSaleForBreakdown: null,
                    priceManuallyChanged: false,
                    gridPricePerKg: "",
                    itemSearchInput: "",
                    customerSearchInput: "",
                    supplierSearchInput: "",
                    searchQueries: {
                        printed: "",
                        unprinted: "",
                        farmerPrinted: "",
                        farmerUnprinted: "",
                    },
                    packCost: 0,
                    loanAmount: 0,
                    customerProfilePic: null,
                    supplierProfilePic: null,
                    customerNameDisplay: "",
                    supplierNameDisplay: "",
                    showSavePhoneButton: false,
                    errors: {},
                    isGivenAmountManuallyTouched: false,
                };
            });
        });
        setManagedTimeout(() => { ignoreCustomerSelectUntilRef.current = 0; }, 100);
        setManagedTimeout(() => {
            const el = refs.customer_code_input.current;
            if (!el) return;
            el.focus({ preventScroll: true });
            try {
                const end = el.value?.length ?? 0;
                el.setSelectionRange(end, end);
            } catch (_) { /* ignore */ }
        }, 0);
    });

    const wipeTableWhenPrintDialogCloses = useStableCallback(() => {
        // Hard wipe: every painted line + every input. A leftover last row was
        // surviving because late POST confirm treated it as a "new" pin.
        const leftoverIds = [];
        const collectId = (sale) => {
            if (sale?.id != null) leftoverIds.push(sale.id);
        };
        pinnedBillSalesRef.current.forEach(collectId);
        stickyTableSalesRef.current.forEach(collectId);
        localTableSalesRef.current.forEach(collectId);
        (displayedSalesRef.current || []).forEach(collectId);
        markIdsRecentlyPrinted(leftoverIds);

        printUiClearedAtRef.current = Date.now();
        lastPrintAtRef.current = Date.now();
        printClearGenerationRef.current += 1;
        lastPrintClearGenRef.current = printClearGenerationRef.current;

        pinnedBillSalesRef.current.clear();
        stickyTableSalesRef.current.clear();
        localTableSalesRef.current.clear();
        displayedSalesRef.current = [];
        middleBillArmedRef.current = false;
        middleUserOpenedRef.current = false;
        customerCodeKeyUsedRef.current = false;
        middleTableSourceRef.current = null;
        tableCustomerScopeRef.current = '';
        selectedPrintedCustomerRef.current = null;
        selectedUnprintedCustomerRef.current = null;
        editingSaleIdRef.current = null;

        clearUiAfterPrint(printClearGenerationRef.current);
        focusCustomerCodeInput();
        printInFlightRef.current = false;
        printAwaitingBillRef.current = false;
        printStartedAtRef.current = 0;
        lastF1AtRef.current = 0;
        try { window.focus(); } catch (_) { /* ignore */ }
    });
    latestPrintDialogClosedHandler = wipeTableWhenPrintDialogCloses;

    const handlePrintAndClear = useStableCallback(async (preOpenedPrintWindow = null, prefetch = null) => {
        // When F1 already opened the system print dialog, never flushSync-clear first —
        // that steals focus/CPU from the print dialog and feels slow.
        if (prefetch?.printAlreadyTriggered) {
            printInFlightRef.current = true;
            printStartedAtRef.current = Date.now();

            let salesToProcess = resolveSalesListForPrint(Array.isArray(prefetch?.salesToProcess) ? prefetch.salesToProcess : []).sales;
            let billNo = prefetch?.billNo || "";

            const finishPrintFlow = () => {
                printInFlightRef.current = false;
                printStartedAtRef.current = 0;
                printAwaitingBillRef.current = false;
                updateState({ isPrinting: false });
                focusCustomerCodeInput();
                setManagedTimeout(() => focusCustomerCodeInput(), 30);
            };

            const uiAlreadyCleared = !!prefetch?.uiAlreadyCleared;

            const finalizeUiAfterPrint = (finalBillNo) => {
                const printedIds = new Set(salesToProcess.map((s) => String(s.id)).filter(Boolean));
                markIdsRecentlyPrinted([...printedIds], finalBillNo);
                const markPrintedRow = (s) =>
                    printedIds.has(String(s.id)) || isRecentlyPrintedId(s?.id)
                        ? { ...s, bill_printed: 'Y', bill_no: finalBillNo || s.bill_no, customer_bill_no: finalBillNo || s.customer_bill_no || s.bill_no, _optimistic: false }
                        : s;
                const trackAt = Date.now();

                // Update recent-submit cache so a following GET cannot restore pre-print rows.
                printedIds.forEach((idStr) => {
                    const fromProcess = salesToProcess.find((s) => String(s.id) === idStr);
                    const base = fromProcess
                        || recentSubmittedSalesRef.current.get(idStr)?.sale
                        || localTableSalesRef.current.get(idStr);
                    if (!base) return;
                    const printedSale = markPrintedRow(base);
                    recentSubmittedSalesRef.current.set(idStr, { sale: printedSale, at: trackAt });
                    if (base.id != null) recentSubmittedSalesRef.current.set(base.id, { sale: printedSale, at: trackAt });
                    stickyTableSalesRef.current.delete(idStr);
                    localTableSalesRef.current.delete(idStr);
                    pinnedBillSalesRef.current.delete(idStr);
                });
                printInFlightRef.current = false;
                printAwaitingBillRef.current = false;
                printStartedAtRef.current = 0;

                // F1 already cleared the form/table instantly — only sync printed flags to sidebars.
                if (uiAlreadyCleared) {
                    flushSync(() => {
                        setState((prev) => {
                            const nextAll = (prev.allSales || []).map(markPrintedRow);
                            const nextLocal = (prev.localTableSales || [])
                                .map(markPrintedRow)
                                .filter((s) => !printedIds.has(String(s?.id)) && !isRecentlyPrintedId(s?.id));
                            const nextSidebar = (prev.sidebarSales || []).map(markPrintedRow);
                            allSalesRef.current = nextAll;
                            sidebarSalesRef.current = nextSidebar;
                            lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
                            return {
                                ...prev,
                                allSales: nextAll,
                                localTableSales: nextLocal,
                                sidebarSales: nextSidebar,
                            };
                        });
                    });
                    setManagedTimeout(() => refreshSidebarSales(true), 400);
                    focusCustomerCodeInput();
                    setManagedTimeout(() => focusCustomerCodeInput(), 30);
                    return;
                }

                const clearGen = ++printClearGenerationRef.current;
                flushSync(() => {
                    setState((prev) => {
                        const nextAll = prev.allSales.map(markPrintedRow);
                        const nextLocal = (prev.localTableSales || [])
                            .map(markPrintedRow)
                            .filter((s) => !printedIds.has(String(s?.id)) && !isRecentlyPrintedId(s?.id));
                        const nextSidebar = (prev.sidebarSales || []).map(markPrintedRow);
                        allSalesRef.current = nextAll;
                        sidebarSalesRef.current = nextSidebar;
                        lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
                        return {
                            ...prev,
                            allSales: nextAll,
                            localTableSales: nextLocal,
                            sidebarSales: nextSidebar,
                            formData: { ...initialFormData },
                            selectedPrintedCustomer: null,
                            selectedUnprintedCustomer: null,
                            currentBillNo: null,
                            middleBillArmed: false,
                            isManualClear: true,
                            editingSaleId: null,
                            selectedSaleForBreakdown: null,
                            gridPricePerKg: "",
                            itemSearchInput: "",
                            customerSearchInput: "",
                            loanAmount: 0,
                        };
                    });
                    setFormData({ ...initialFormData });
                });
                clearUiAfterPrint(clearGen);
                setManagedTimeout(() => {
                    refreshSidebarSales(true);
                }, 400);

                focusCustomerCodeInput();
                setManagedTimeout(() => focusCustomerCodeInput(), 30);
            };

            try {
                // BUGFIX (duplicate bill numbers under fast entry): the frontend assigns a
                // provisional bill_no optimistically (allocateNextCustomerBillNo) so the print
                // dialog never has to wait on the network. That guess can collide across
                // terminals/tabs (each keeps its own counter, synced only periodically), which
                // is exactly what showed up as "many bills with the same bill_no" until a hard
                // refresh pulled the real values from the server. The backend's markPrinted
                // response is the source of truth, so it must always win here — previously this
                // was only checked when billNo was still empty (`!billNo`), which meant it never
                // ran for the normal F1 flow because assignedNo/billNo is always already set by
                // then. Always reconcile against the server's answer instead.
                if (prefetch?.markPrintedPromise) {
                    const printResponse = await prefetch.markPrintedPromise;
                    if (printResponse?.data?.status === "success") {
                        const serverBillNo = String(
                            printResponse.data.customer_bill_no
                            ?? printResponse.data.bill_no
                            ?? ''
                        ).trim();
                        if (serverBillNo && serverBillNo !== String(billNo || '').trim()) {
                            billNo = serverBillNo;
                        }
                    }
                }
                finalizeUiAfterPrint(billNo);
            } catch (error) {
                console.error("Printing finalize error:", error);
                finishPrintFlow();
            }
            return;
        }

        // ---------------------------------------------------------------------
        // Non-prefetch path (e.g. given-amount → print): snapshot first, print now.
        // Never await GET /sales before print — that froze this path all day.
        // ---------------------------------------------------------------------
        let billNo = prefetch?.billNo || "";
        const markSnapshotRows = snapshotDisplayedTableRows();
        let salesToProcess = Array.isArray(prefetch?.salesToProcess) && prefetch.salesToProcess.length
            ? prefetch.salesToProcess.slice()
            : (markSnapshotRows.length
                ? markSnapshotRows.slice()
                : ((displayedSalesRef.current && displayedSalesRef.current.length)
                    ? displayedSalesRef.current.slice()
                    : (displayedSales || []).slice()));
        if (!billNo) {
            for (let i = 0; i < salesToProcess.length; i++) {
                const rowBill = String(salesToProcess[i]?.bill_no || salesToProcess[i]?.customer_bill_no || '').trim();
                if (rowBill) {
                    billNo = rowBill;
                    break;
                }
            }
            const printedSel = selectedPrintedCustomerRef.current || selectedPrintedCustomer;
            if (!billNo && printedSel && String(printedSel).includes('-')) {
                billNo = String(printedSel).slice(String(printedSel).lastIndexOf('-') + 1).trim();
            }
        }

        if (printInFlightRef.current) {
            if (Date.now() - printStartedAtRef.current < PRINT_LOCK_MAX_MS) {
                return;
            }
            printInFlightRef.current = false;
            updateState({ isPrinting: false });
        }

        tableCustomerScopeRef.current = '';
        editingSaleIdRef.current = null;
        selectedPrintedCustomerRef.current = null;
        selectedUnprintedCustomerRef.current = null;

        flushSync(() => {
            handleClearForm(true);
            setState(prev => ({
                ...prev,
                selectedPrintedCustomer: null,
                selectedUnprintedCustomer: null,
                currentBillNo: null,
                isPrinting: false
            }));
        });

        focusCustomerCodeInput();

        printInFlightRef.current = true;
        printStartedAtRef.current = Date.now();

        const finishPrintFlow = () => {
            printInFlightRef.current = false;
            printStartedAtRef.current = 0;
            printAwaitingBillRef.current = false;
            updateState({ isPrinting: false });
            focusCustomerCodeInput();
            setManagedTimeout(() => focusCustomerCodeInput(), 30);
        };

        let customerCode = "";
        let customerName = "";

        if (!salesToProcess.length) {
            alert("මුද්‍රණය කිරීමට දත්ත නොමැත!");
            finishPrintFlow();
            return;
        }

        {
            const resolvedList = resolveSalesListForPrint(salesToProcess);
            salesToProcess = resolvedList.sales;
        }
        if (!salesToProcess.length) {
            const waitDeadline = Date.now() + PRINT_SAVE_WAIT_MS;
            while (Date.now() < waitDeadline && (!salesToProcess.length || pendingSubmitsRef.current.size > 0)) {
                await new Promise((r) => setTimeout(r, PRINT_SAVE_POLL_MS));
                const candidates = [
                    ...(displayedSalesRef.current || []),
                    ...Array.from(localTableSalesRef.current.values()),
                    ...Array.from(stickyTableSalesRef.current.values()),
                ];
                salesToProcess = resolveSalesListForPrint(candidates).sales;
                if (pendingSubmitsRef.current.size === 0 && salesToProcess.length > 0) break;
            }
        }
        if (!salesToProcess.length) {
            alert("මුද්‍රණය කිරීමට දත්ත නොමැත!");
            finishPrintFlow();
            return;
        }

        const hasZeroOrOnePrice = salesToProcess.some(s => parseFloat(s.price_per_kg) === 0 || parseFloat(s.price_per_kg) === 1);
        if (hasZeroOrOnePrice) {
            alert("මිල 0 හෝ 1 ලෙස ඇති අයිතම මුද්‍රණය කළ නොහැක.");
            finishPrintFlow();
            return;
        }

        for (const s of salesToProcess) {
            if (parseFloat(s.price_per_kg) === parseFloat(s.SupplierPricePerKg)) {
                alert(`කේතය: ${s.supplier_code} හි කොමිස් මුදල් අඩුකර නොමැත. කරුණාකර පාරිභෝගිකයා පද්ධතියට ඇතුළත් කර අදාළ ඡායාරූප (Profile, NIC) එක් කරන්න.`);
                finishPrintFlow();
                return;
            }
        }

        customerCode = salesToProcess[0].customer_code;
        customerName = salesToProcess[0].customer_name || customerCode;
        const mobile = salesToProcess[0].mobile || "0777672838 / 071437115";
        const normalizedCustomerCode = String(customerCode || '').trim().toUpperCase();
        const currentLoan = loanCacheRef.current.has(normalizedCustomerCode)
            ? loanCacheRef.current.get(normalizedCustomerCode)
            : (parseFloat(loanAmount) || 0);

        const printReceiptNow = (finalBillNo) => {
            const receiptHtml = buildFullReceiptHTML(
                salesToProcess,
                finalBillNo,
                customerName,
                mobile,
                currentLoan,
                billSize
            );
            return writeAndPrintBill(buildPrintDocumentShell('Print Bill', receiptHtml));
        };

        const finalizeUiAfterPrint = (finalBillNo) => {
            const printedIds = new Set(salesToProcess.map((s) => String(s.id)).filter(Boolean));
            markIdsRecentlyPrinted([...printedIds], finalBillNo);
            const markPrintedRow = (s) =>
                printedIds.has(String(s.id)) || isRecentlyPrintedId(s?.id)
                    ? { ...s, bill_printed: 'Y', bill_no: finalBillNo || s.bill_no, customer_bill_no: finalBillNo || s.customer_bill_no || s.bill_no, _optimistic: false }
                    : s;
            const trackAt = Date.now();
            printedIds.forEach((idStr) => {
                const fromProcess = salesToProcess.find((s) => String(s.id) === idStr);
                const base = fromProcess
                    || recentSubmittedSalesRef.current.get(idStr)?.sale
                    || localTableSalesRef.current.get(idStr);
                if (!base) return;
                const printedSale = markPrintedRow(base);
                recentSubmittedSalesRef.current.set(idStr, { sale: printedSale, at: trackAt });
                if (base.id != null) recentSubmittedSalesRef.current.set(base.id, { sale: printedSale, at: trackAt });
                stickyTableSalesRef.current.delete(idStr);
                localTableSalesRef.current.delete(idStr);
            });
            printInFlightRef.current = false;
            printAwaitingBillRef.current = false;
            printStartedAtRef.current = 0;
            const clearGen = ++printClearGenerationRef.current;
            flushSync(() => {
                setState((prev) => {
                    const nextAll = prev.allSales.map(markPrintedRow);
                    const nextLocal = (prev.localTableSales || [])
                        .map(markPrintedRow)
                        .filter((s) => !printedIds.has(String(s?.id)) && !isRecentlyPrintedId(s?.id));
                    const nextSidebar = (prev.sidebarSales || []).map(markPrintedRow);
                    allSalesRef.current = nextAll;
                    sidebarSalesRef.current = nextSidebar;
                    lastSidebarSignatureRef.current = buildSidebarListSignature(nextSidebar);
                    return {
                        ...prev,
                        allSales: nextAll,
                        localTableSales: nextLocal,
                        sidebarSales: nextSidebar,
                        formData: { ...initialFormData },
                        selectedPrintedCustomer: null,
                        selectedUnprintedCustomer: null,
                        currentBillNo: null,
                        middleBillArmed: false,
                        isManualClear: true,
                        editingSaleId: null,
                        selectedSaleForBreakdown: null,
                        gridPricePerKg: "",
                        itemSearchInput: "",
                        customerSearchInput: "",
                        loanAmount: 0,
                    };
                });
                setFormData({ ...initialFormData });
            });
            clearUiAfterPrint(clearGen);
            setManagedTimeout(() => {
                refreshSidebarSales(true);
            }, 400);

            focusCustomerCodeInput();
            setManagedTimeout(() => focusCustomerCodeInput(), 30);
        };

        try {
            if (!billNo) {
                billNo = await allocateNextCustomerBillNoAtomic();
            }

            printReceiptNow(billNo);
            finalizeUiAfterPrint(billNo);

            const snapshotForMark = (markSnapshotRows.length ? markSnapshotRows : salesToProcess).slice();
            const liveBillNo = billNo;
            void (async () => {
                try {
                    let saleIds = await waitForEveryDisplayedRowId(snapshotForMark);
                    if (!saleIds.length) {
                        saleIds = asMarkApiIds(snapshotForMark.map((s) => s.id));
                    }
                    if (!saleIds.length) {
                        setManagedTimeout(() => refreshSidebarSales(true), 200);
                        return;
                    }
                    markIdsRecentlyPrinted(saleIds, liveBillNo);
                    applyPrintedFlagsToStores(saleIds, liveBillNo);
                    await withPendingMarkPrinted(() => api.post(routes.markPrinted, {
                        sales_ids: asMarkApiIds(saleIds),
                        telephone_no: formData.telephone_no,
                        customer_code: customerCode,
                        customer_name: customerName,
                        loan_amount: 0,
                        bill_no: liveBillNo,
                        customer_bill_no: liveBillNo,
                    }, { timeout: API_TIMEOUT_MS }));
                    const sentPrinted = new Set(saleIds.map(String));
                    const expectedPrinted = expectedDisplayedRowCount(snapshotForMark);
                    for (let round = 0; round < 8 && sentPrinted.size < expectedPrinted; round++) {
                        const leftover = await collectLeftoverDisplayedBackendIds(snapshotForMark, sentPrinted);
                        if (!leftover.length) {
                            if (!displayedRowsStillSaving(snapshotForMark)) break;
                            continue;
                        }
                        leftover.forEach((id) => sentPrinted.add(String(id)));
                        markIdsRecentlyPrinted(leftover, liveBillNo);
                        applyPrintedFlagsToStores(leftover, liveBillNo);
                        await withPendingMarkPrinted(() => api.post(routes.markPrinted, {
                            sales_ids: asMarkApiIds(leftover),
                            telephone_no: formData.telephone_no,
                            customer_code: customerCode,
                            customer_name: customerName,
                            loan_amount: 0,
                            bill_no: liveBillNo,
                            customer_bill_no: liveBillNo,
                        }, { timeout: API_TIMEOUT_MS }));
                    }
                    if (sentPrinted.size < expectedPrinted) {
                        // Don't abandon rows still resolving under heavy load — keep trying in
                        // the background so a slow row doesn't silently stay unprinted in the DB.
                        keepRetryingMarkPrinted({
                            snapshotRows: snapshotForMark,
                            sentPrinted,
                            expectedPrinted,
                            getBillNo: () => liveBillNo,
                            telephoneNo: formData.telephone_no,
                            customerCode,
                            customerName,
                            onSent: (leftover, bNo) => {
                                markIdsRecentlyPrinted(leftover, bNo);
                                applyPrintedFlagsToStores(leftover, bNo);
                            },
                        });
                    }
                    setManagedTimeout(() => refreshSidebarSales(true), 200);
                } catch (err) {
                    console.error("Background markPrinted error:", err);
                    setManagedTimeout(() => refreshSidebarSales(true), 200);
                }
            })();
        } catch (error) {
            console.error("Printing error:", error);
            alert("මුද්‍රණය කිරීමේදී දෝෂයක් ඇති විය. Error: " + (error.message || error));
            finishPrintFlow();
        }
    });
    const handleBillSizeChange = useStableCallback((e) => updateState({ billSize: e.target.value }));


    // Subscribe once for the lifetime of the page; the stable callback always sees fresh
    const handleShortcut = useStableCallback(async (e) => {
        if (e.key === "F10") {
            e.preventDefault();
            // BUGFIX (printed bills reverting to unprinted after refresh): reloading
            // immediately can cancel a markPrinted confirmation that's still on its way
            // to the server, so the bill looks printed here but the DB never got the
            // memo. Give any genuinely in-flight confirmation a brief window to land
            // before reloading — this only ever delays the reload when there's really
            // something unconfirmed, and never for more than ~3 seconds.
            if (pendingMarkPrintedCountRef.current > 0) {
                const deadline = Date.now() + 3000;
                while (pendingMarkPrintedCountRef.current > 0 && Date.now() < deadline) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
            window.location.reload();
            return;
        }

        const isF1 = e.key === "F1" || e.code === "F1" || e.keyCode === 112 || e.which === 112;
        if (isF1) {
            try {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            } catch (_) { /* ignore */ }
            if (e.repeat) return;

            const now = Date.now();
            if (now - lastF1AtRef.current < 120) return;
            lastF1AtRef.current = now;

            if (printAwaitingBillRef.current || printInFlightRef.current) {
                const age = printStartedAtRef.current ? now - printStartedAtRef.current : Infinity;
                if (age < PRINT_LOCK_MAX_MS) return;
                printAwaitingBillRef.current = false;
                printInFlightRef.current = false;
                printStartedAtRef.current = 0;
                updateState({ isPrinting: false });
            }

            // Never abort GETs or setState before print — that stalls F1 on a large DB.
            let billNo = "";
            const liveForm = formDataRef.current || formData;
            const printedCustomer = selectedPrintedCustomerRef.current || selectedPrintedCustomer;
            if (printedCustomer && String(printedCustomer).includes('-')) {
                billNo = String(printedCustomer).slice(String(printedCustomer).lastIndexOf('-') + 1).trim();
            }

            // Every row currently shown in the middle table — not a GET subset.
            const sourceRows = snapshotDisplayedTableRows();

            const unlockPrintSoon = () => {
                printInFlightRef.current = false;
                printAwaitingBillRef.current = false;
                printStartedAtRef.current = 0;
            };

            const receiptRows = [];
            for (let i = 0; i < sourceRows.length; i++) {
                const s = sourceRows[i];
                if (!s || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) continue;
                const price = parseFloat(s.price_per_kg);
                if (price === 0 || price === 1) {
                    alert("මිල 0 හෝ 1 ලෙස ඇති අයිතම මුද්‍රණය කළ නොහැක.");
                    return;
                }
                if (price === parseFloat(s.SupplierPricePerKg)) {
                    alert(`කේතය: ${s.supplier_code} හි කොමිස් මුදල් අඩුකර නොමැත. කරුණාකර පාරිභෝගිකයා පද්ධතියට ඇතුළත් කර අදාළ ඡායාරූප (Profile, NIC) එක් කරන්න.`);
                    return;
                }
                if (!billNo) {
                    const rowBill = String(s.bill_no || s.customer_bill_no || '').trim();
                    if (rowBill) billNo = rowBill;
                }
                receiptRows.push(s);
            }
            if (receiptRows.length === 0) {
                alert("මුද්‍රණය කිරීමට දත්ත නොමැත!");
                return;
            }

            const customerCode = receiptRows[0].customer_code;
            const customerName = receiptRows[0].customer_name || customerCode;
            const mobile = receiptRows[0].mobile || "0777672838 / 071437115";
            const normalizedCustomerCode = String(customerCode || '').trim().toUpperCase();
            const currentLoan = loanCacheRef.current.has(normalizedCustomerCode)
                ? loanCacheRef.current.get(normalizedCustomerCode)
                : (loanAmountRef.current || parseFloat(loanAmount) || 0);
            const activeBillSize = billSizeRef.current || billSize;

            const openPrintDialogNow = (rows, activeBillNo) => {
                // Full document already — wrapping again doubled HTML and delayed print().
                return writeAndPrintBill(buildFullReceiptHTML(
                    rows,
                    activeBillNo,
                    customerName,
                    mobile,
                    currentLoan,
                    activeBillSize
                ));
            };

            const collectPrintBlockIds = (rows) => {
                const ids = [];
                (rows || []).forEach((s) => {
                    if (!s?.id) return;
                    ids.push(s.id);
                    const idStr = String(s.id);
                    const mappedReal = tempToRealIdRef.current.get(idStr) || s._pendingRealId;
                    if (mappedReal != null) ids.push(mappedReal);
                    const mappedTemp = realToTempIdRef.current.get(idStr);
                    if (mappedTemp != null) ids.push(mappedTemp);
                });
                return ids;
            };

            printInFlightRef.current = true;
            printStartedAtRef.current = Date.now();
            lastPrintAtRef.current = Date.now();
            const clearGen = ++printClearGenerationRef.current;
            lastPrintClearGenRef.current = clearGen;
            const snapshotRows = receiptRows;

            const syncAfterPrint = async (saleIds, assignedNo, printResponse) => {
                handlePrintAndClear(null, {
                    salesToProcess: saleIds.map((id) => ({ id })),
                    billNo: assignedNo || billNo,
                    markPrintedPromise: Promise.resolve(printResponse),
                    printAlreadyTriggered: true,
                    uiAlreadyCleared: true,
                });
                // Keep temp↔real maps until leftover markPrinted can resolve in-flight POSTs.
                setManagedTimeout(() => refreshSidebarSales(true), 200);
            };

            // BUGFIX (duplicate bill numbers under fast entry): the frontend guesses a bill_no
            // (allocateNextCustomerBillNo) so the print dialog opens without waiting on the
            // network — but that guess can collide with another terminal/tab's guess. As soon as
            // the backend confirms what it actually saved, that answer must replace the guess
            // everywhere still to come (the leftover-id rounds below, and the sidebar stamps),
            // otherwise later POSTs keep writing the stale/duplicated number to the database.
            const reconcileBillNoFromResponse = (printResponse, currentNo) => {
                if (printResponse?.data?.status !== "success") return currentNo;
                const serverBillNo = String(
                    printResponse.data.customer_bill_no
                    ?? printResponse.data.bill_no
                    ?? ''
                ).trim();
                if (!serverBillNo || serverBillNo === String(currentNo || '').trim()) return currentNo;
                return serverBillNo;
            };

            // Reprint: backend bill number already on the rows — dialog now.
            if (billNo) {
                const reprintBlockIds = collectPrintBlockIds(snapshotRows);
                markIdsRecentlyPrinted(reprintBlockIds, billNo);
                applyPrintedFlagsToStores(reprintBlockIds, billNo);
                const printedOk = openPrintDialogNow(snapshotRows, billNo);
                setTimeout(unlockPrintSoon, printedOk ? 300 : 0);
                (async () => {
                    try {
                        const saleIds = await waitForEveryDisplayedRowId(snapshotRows);
                        if (!saleIds.length) {
                            setManagedTimeout(() => refreshSidebarSales(true), 0);
                            return;
                        }
                        markIdsRecentlyPrinted(saleIds, billNo);
                        applyPrintedFlagsToStores(saleIds, billNo);
                        const printResponse = await withPendingMarkPrinted(() => api.post(routes.markPrinted, {
                            sales_ids: asMarkApiIds(saleIds),
                            telephone_no: liveForm.telephone_no,
                            customer_code: customerCode,
                            customer_name: customerName,
                            loan_amount: 0,
                            bill_no: billNo,
                            customer_bill_no: billNo,
                        }, { timeout: 15000 }));
                        const confirmedBillNo = reconcileBillNoFromResponse(printResponse, billNo);
                        if (confirmedBillNo !== billNo) {
                            billNo = confirmedBillNo;
                            markIdsRecentlyPrinted(saleIds, billNo);
                            applyPrintedFlagsToStores(saleIds, billNo);
                        }
                        const allPrintedIds = [...saleIds];
                        const sentPrinted = new Set(saleIds.map(String));
                        const expectedPrinted = expectedDisplayedRowCount(snapshotRows);
                        for (let round = 0; round < 8 && sentPrinted.size < expectedPrinted; round++) {
                            const leftover = await collectLeftoverDisplayedBackendIds(snapshotRows, sentPrinted);
                            if (!leftover.length) {
                                if (!displayedRowsStillSaving(snapshotRows)) break;
                                continue;
                            }
                            leftover.forEach((id) => sentPrinted.add(String(id)));
                            allPrintedIds.push(...leftover);
                            markIdsRecentlyPrinted(leftover, billNo);
                            applyPrintedFlagsToStores(leftover, billNo);
                            await withPendingMarkPrinted(() => api.post(routes.markPrinted, {
                                sales_ids: asMarkApiIds(leftover),
                                telephone_no: liveForm.telephone_no,
                                customer_code: customerCode,
                                customer_name: customerName,
                                loan_amount: 0,
                                bill_no: billNo,
                                customer_bill_no: billNo,
                            }, { timeout: 15000 }));
                        }
                        if (sentPrinted.size < expectedPrinted) {
                            // Don't abandon rows still resolving under heavy load — keep trying
                            // in the background instead of silently leaving them unprinted in DB.
                            keepRetryingMarkPrinted({
                                snapshotRows,
                                sentPrinted,
                                expectedPrinted,
                                getBillNo: () => billNo,
                                telephoneNo: liveForm.telephone_no,
                                customerCode,
                                customerName,
                                onSent: (leftover, bNo) => {
                                    allPrintedIds.push(...leftover);
                                    markIdsRecentlyPrinted(leftover, bNo);
                                    applyPrintedFlagsToStores(leftover, bNo);
                                },
                            });
                        }
                        await syncAfterPrint(allPrintedIds, billNo, printResponse);
                    } catch (error) {
                        console.error("Background sync error after print:", error);
                        setManagedTimeout(() => refreshSidebarSales(true), 0);
                    }
                })();
                return;
            }

            // First print: issue a unique bill_no on the frontend and open the
            // print dialog immediately. Persist that same number to the backend.
            let assignedNo = await allocateNextCustomerBillNoAtomic();
            const firstPrintBlockIds = collectPrintBlockIds(snapshotRows);
            markIdsRecentlyPrinted(firstPrintBlockIds, assignedNo);
            applyPrintedFlagsToStores(firstPrintBlockIds, assignedNo);

            const printedOk = openPrintDialogNow(snapshotRows, assignedNo);
            setTimeout(unlockPrintSoon, printedOk ? 300 : 0);
            setManagedTimeout(() => refreshSidebarSales(true), 0);

            (async () => {
                try {
                    const saleIds = await waitForEveryDisplayedRowId(snapshotRows);
                    if (!saleIds.length) {
                        setManagedTimeout(() => refreshSidebarSales(true), 0);
                        return;
                    }

                    markIdsRecentlyPrinted(saleIds, assignedNo);
                    applyPrintedFlagsToStores(saleIds, assignedNo);
                    const printResponse = await withPendingMarkPrinted(() => api.post(routes.markPrinted, {
                        sales_ids: asMarkApiIds(saleIds),
                        telephone_no: liveForm.telephone_no,
                        customer_code: customerCode,
                        customer_name: customerName,
                        loan_amount: 0,
                        bill_no: assignedNo,
                        customer_bill_no: assignedNo,
                    }, { timeout: 15000 }));
                    const confirmedAssignedNo = reconcileBillNoFromResponse(printResponse, assignedNo);
                    if (confirmedAssignedNo !== assignedNo) {
                        assignedNo = confirmedAssignedNo;
                        markIdsRecentlyPrinted(saleIds, assignedNo);
                        applyPrintedFlagsToStores(saleIds, assignedNo);
                    }

                    const allPrintedIds = [...saleIds];
                    const sentPrinted = new Set(saleIds.map(String));
                    const expectedPrinted = expectedDisplayedRowCount(snapshotRows);
                    for (let round = 0; round < 8 && sentPrinted.size < expectedPrinted; round++) {
                        const leftover = await collectLeftoverDisplayedBackendIds(snapshotRows, sentPrinted);
                        if (!leftover.length) {
                            if (!displayedRowsStillSaving(snapshotRows)) break;
                            continue;
                        }
                        leftover.forEach((id) => sentPrinted.add(String(id)));
                        allPrintedIds.push(...leftover);
                        markIdsRecentlyPrinted(leftover, assignedNo);
                        applyPrintedFlagsToStores(leftover, assignedNo);
                        await withPendingMarkPrinted(() => api.post(routes.markPrinted, {
                            sales_ids: asMarkApiIds(leftover),
                            telephone_no: liveForm.telephone_no,
                            customer_code: customerCode,
                            customer_name: customerName,
                            loan_amount: 0,
                            bill_no: assignedNo,
                            customer_bill_no: assignedNo,
                        }, { timeout: 15000 }));
                    }
                    if (sentPrinted.size < expectedPrinted) {
                        // Don't abandon rows still resolving under heavy load — keep trying in
                        // the background instead of silently leaving them unprinted in the DB.
                        keepRetryingMarkPrinted({
                            snapshotRows,
                            sentPrinted,
                            expectedPrinted,
                            getBillNo: () => assignedNo,
                            telephoneNo: liveForm.telephone_no,
                            customerCode,
                            customerName,
                            onSent: (leftover, bNo) => {
                                allPrintedIds.push(...leftover);
                                markIdsRecentlyPrinted(leftover, bNo);
                                applyPrintedFlagsToStores(leftover, bNo);
                            },
                        });
                    }
                    await syncAfterPrint(allPrintedIds, assignedNo, printResponse);
                    setManagedTimeout(() => refreshSidebarSales(true), 0);
                } catch (error) {
                    console.error("Background sync error after print:", error);
                    unlockPrintSoon();
                    setManagedTimeout(() => refreshSidebarSales(true), 0);
                }
            })();

            return;
        }

        if (e.key === "F5") {
            e.preventDefault();
            const viewingPrinted = middleTableSourceRef.current === 'printed'
                || !!selectedPrintedCustomerRef.current;
            if (viewingPrinted) return;
            handleMarkAllProcessed();
            return;
        }
    });

    // Keep module handler fresh so F1 never finds a null mid-day.
    latestSalesEntryF1Handler = handleShortcut;
    latestPrintDialogClosedHandler = wipeTableWhenPrintDialogCloses;

    useEffect(() => {
        // Capture on both window + document so F1 always reaches print all day.
        const onKeyDown = (event) => {
            const fn = latestSalesEntryF1Handler || handleShortcut;
            if (typeof fn === 'function') fn(event);
        };
        const opts = { capture: true, passive: false };
        window.addEventListener("keydown", onKeyDown, opts);
        document.addEventListener("keydown", onKeyDown, opts);

        const onAfterPrint = () => {
            notifyPrintDialogClosed();
        };
        window.addEventListener('afterprint', onAfterPrint);

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                printInFlightRef.current = false;
                printAwaitingBillRef.current = false;
                printStartedAtRef.current = 0;
                lastF1AtRef.current = 0;
                latestSalesEntryF1Handler = handleShortcut;
                try { window.focus(); } catch (_) { /* ignore */ }
            }
        };
        document.addEventListener('visibilitychange', onVisible);

        // BUGFIX (printed bills reverting to unprinted after refresh): if the browser
        // navigates away (refresh, close tab, etc.) while a markPrinted confirmation is
        // still in flight, the request gets cancelled before the server ever sees it —
        // the bill is physically printed, but the DB never learns about it. Warn only
        // when there's genuinely something unconfirmed; otherwise this never fires, so
        // it doesn't get in the way of normal fast entry.
        const onBeforeUnload = (event) => {
            if (pendingMarkPrintedCountRef.current > 0) {
                event.preventDefault();
                event.returnValue = '';
                return '';
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
            window.removeEventListener("keydown", onKeyDown, opts);
            document.removeEventListener("keydown", onKeyDown, opts);
            window.removeEventListener('afterprint', onAfterPrint);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('beforeunload', onBeforeUnload);
            if (latestSalesEntryF1Handler === handleShortcut) latestSalesEntryF1Handler = null;
        };
    }, [handleShortcut]);

    //new function to save phone no 
    const savePhoneNumber = async () => {
        const phoneNumber = formData.telephone_no;
        const customerCode = formData.customer_code || autoCustomerCode;

        if (!phoneNumber || !customerCode) {
            alert("Please enter both phone number and customer code");
            return;
        }

        try {
            const response = await api.post('/customers/check-or-create', {
                short_name: customerCode,
                telephone_no: phoneNumber
            }, { timeout: API_TIMEOUT_MS });

            if (response.data.customer) {
                // Update the customer name if returned
                setFormData(prev => ({
                    ...prev,
                    customer_name: response.data.customer.name || prev.customer_name
                }));
                // Hide the save button after saving
                updateState({ showSavePhoneButton: false });

                // Focus on given_amount field after saving
                setManagedTimeout(() => {
                    if (refs.given_amount.current) {
                        refs.given_amount.current.focus();
                        refs.given_amount.current.select();
                    }
                }, 100);
            }
        } catch (err) {
            console.error("Failed to save phone number:", err);
            alert("Failed to save phone number. Please try again.");
        }
    };

    const hasData = allSales.length > 0 || sidebarSales.length > 0 || customers.length > 0 || items.length > 0 || suppliers.length > 0;

    // Stable props for the memoized sidebar lists; inline arrows here would defeat
    // React.memo and re-render both full lists on every keystroke in the form.
    const handlePrintedSearchChange = useStableCallback((value) => updateState({ searchQueries: { ...searchQueries, printed: value } }));
    const handleUnprintedSearchChange = useStableCallback((value) => updateState({ searchQueries: { ...searchQueries, unprinted: value } }));
    const toggleCashFilter = useStableCallback(() => updateState({ isCashFilterActive: !state.isCashFilterActive }));

    // Option lists for the two react-selects. These were rebuilt (filter + sort + map over
    // the whole catalog) inside JSX on every render, i.e. on every keystroke of any field.
    const customerSelectOptions = useMemo(() => (
        customers
            .filter(c => !customerSearchInput || String(c.short_name).charAt(0).toUpperCase() === customerSearchInput.charAt(0).toUpperCase())
            .map(c => ({ value: c.short_name, label: `${c.short_name}` }))
    ), [customers, customerSearchInput]);

    const itemSelectOptions = useMemo(() => {
        const input = (state.itemSearchInput || "").toUpperCase();
        return items
            .filter(item => !input || String(item.no).toUpperCase().startsWith(input))
            .sort((a, b) => {
                const isANumeric = !isNaN(a.no);
                const isBNumeric = !isNaN(b.no);
                if (isANumeric && !isBNumeric) return 1;
                if (!isANumeric && isBNumeric) return -1;
                return String(a.no).toUpperCase().localeCompare(String(b.no).toUpperCase());
            })
            .map(item => ({
                value: item.no,
                label: `${item.no} - ${item.type}`,
                item,
            }));
    }, [items, state.itemSearchInput]);

    const tableCustomerScope = String(
        formData.customer_code
        || selectedUnprintedCustomer
        || (selectedPrintedCustomer && String(selectedPrintedCustomer).includes('-')
            ? String(selectedPrintedCustomer).slice(0, String(selectedPrintedCustomer).lastIndexOf('-'))
            : selectedPrintedCustomer)
        || tableCustomerScopeRef.current
        || ''
    ).trim().toUpperCase();
    const rowsMatchExactCustomer = (rows) =>
        !tableCustomerScope
            ? []
            : (rows || []).filter((s) =>
                String(s?.customer_code || '').trim().toUpperCase() === tableCustomerScope);
    const tableRowsRaw = (!middleUserOpenedRef.current || !middleBillArmedRef.current || !middleTableSourceRef.current)
        ? []
        : ((displayedSales && displayedSales.length > 0)
            ? rowsMatchExactCustomer(displayedSales)
            : rowsMatchExactCustomer(displayedSalesRef.current));
    const tableRows = (() => {
        const seen = new Set();
        const out = [];
        (tableRowsRaw || []).forEach((s) => {
            if (!s?.id) return;
            const idStr = String(s.id);
            const mappedTemp = realToTempIdRef.current.get(idStr);
            const key = stableRowKeyRef.current.get(idStr)
                || (mappedTemp ? (stableRowKeyRef.current.get(String(mappedTemp)) || String(mappedTemp)) : idStr);
            if (seen.has(String(key))) return;
            seen.add(String(key));
            out.push(s);
        });
        return out;
    })();

    return (
        <Layout style={{ backgroundColor: '#99ff99' }} billSize={billSize} handleBillSizeChange={handleBillSizeChange}>
            <div className="sales-layout" style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {isLoading && (<div className="fixed top-0 left-0 right-0 bg-blue-500 text-white py-1 text-center text-sm z-50">Refreshing data...</div>)}
                {state.isPrinting && (<div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black py-1 text-center text-sm z-50">Printing in progress... Please wait</div>)}

                {/* --- ADDED ADMIN MODAL --- */}
                <AdminDataTableModal
                    isOpen={isAdminModalOpen}
                    onClose={() => updateState({ isAdminModalOpen: false })}
                    title={modalTitle}
                    sales={modalData}
                    type={modalType}
                    formatDecimal={formatDecimal}
                />

                <div className="three-column-layout" style={{ opacity: isLoading ? 0.7 : 1, display: 'grid', gridTemplateColumns: '200px 1fr 200px', gap: '16px', padding: '10px', marginTop: '-149px' }}>
                    <div className="left-sidebar" style={{ backgroundColor: '#1ec139ff', borderRadius: '0.75rem', maxHeight: '80.5vh', overflowY: 'auto' }}>
                        <CustomerList type="printed" searchQuery={searchQueries.printed} onSearchChange={handlePrintedSearchChange} selectedPrintedCustomer={selectedPrintedCustomer} selectedUnprintedCustomer={selectedUnprintedCustomer} handleCustomerClick={handleCustomerClick} allSales={sidebarSales} isCashFilterActive={state.isCashFilterActive} toggleCashFilter={toggleCashFilter} />
                    </div>


                    <div className="center-form flex flex-col" style={{ backgroundColor: '#111439ff', padding: '20px', borderRadius: '0.75rem', color: 'white', minHeight: '100vh', height: 'auto', boxSizing: 'border-box', gridColumnStart: 2, gridColumnEnd: 3 }}>
                        {currentUser?.role === 'Admin' ? (
                            <div className="admin-farmer-view h-full flex flex-col">
                                <div className="flex flex-row overflow-hidden" style={{ minHeight: "60vh", width: "100%", display: "flex", flexDirection: "row", justifyContent: "center", gap: "20px" }}>
                                    {/* --- Left Column: Printed Farmers --- */}
                                    <div
                                        style={{ width: "300px", height: "850px", flexShrink: 0 }}
                                        className="flex flex-col bg-gray-800 rounded-xl border border-gray-600 overflow-hidden"
                                    >
                                        <div className="bg-green-800 p-2 text-center font-bold">
                                            මුද්‍රණය කළ ගොවීන්
                                        </div>

                                        <div
                                            className="p-2 flex-grow"
                                            style={{ height: "calc(100% - 48px)", overflowY: "auto" }}
                                        >
                                            <input type="text" placeholder="සොයන්න..." className="w-full p-2 mb-2 rounded bg-white text-black text-sm" style={{ textTransform: "uppercase" }} value={searchQueries.farmerPrinted || ""} onChange={e => updateState({ searchQueries: { ...searchQueries, farmerPrinted: e.target.value.toUpperCase() } })} />
                                            {printedFarmers.length > 0 ? (
                                                printedFarmers
                                                    .filter((f) => !searchQueries.farmerPrinted || f.supplier_code.includes(searchQueries.farmerPrinted))
                                                    .map((f) => (
                                                        <div
                                                            key={f.supplier_code}
                                                            onClick={() =>
                                                                updateState({
                                                                    isAdminModalOpen: true,
                                                                    modalType: "farmer",
                                                                    modalTitle: `ගොවියා: ${f.supplier_code}`,
                                                                    modalData: allSales.filter(s => s.supplier_code === f.supplier_code && s.supplier_bill_printed === "Y"),
                                                                })
                                                            }
                                                            className="p-1 mb-2 bg-white text-black font-bold rounded-lg border-l-4 border-green-500 shadow hover:bg-gray-100 cursor-pointer"
                                                        >
                                                            Code: {f.supplier_code}
                                                        </div>
                                                    ))
                                            ) : (
                                                <p className="text-center text-gray-400 mt-4">No data found</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* --- Right Column: Unprinted Farmers --- */}
                                    <div
                                        style={{ width: "300px", height: "850px", flexShrink: 0 }}
                                        className="flex flex-col bg-gray-800 rounded-xl border border-gray-600 overflow-hidden"
                                    >
                                        <div className="bg-red-800 p-2 text-center font-bold">
                                            මුද්‍රණය නොකළ ගොවීන්
                                        </div>

                                        <div
                                            className="p-2 flex-grow"
                                            style={{ height: "calc(100% - 48px)", overflowY: "scroll" }}
                                        >
                                            <input
                                                type="text"
                                                placeholder="සොයන්න..."
                                                className="w-full p-2 mb-2 rounded bg-white text-black text-sm"
                                                style={{ textTransform: "uppercase" }}
                                                value={searchQueries.farmerUnprinted || ""}
                                                onChange={(e) => {
                                                    const upper = e.target.value.toUpperCase();
                                                    updateState({
                                                        searchQueries: {
                                                            ...searchQueries,
                                                            farmerUnprinted: upper,
                                                        },
                                                    });
                                                }}
                                            />

                                            {unprintedFarmers.length > 0 ? (
                                                unprintedFarmers
                                                    .filter((f) => !searchQueries.farmerUnprinted || f.supplier_code.includes(searchQueries.farmerUnprinted))
                                                    .map((f) => (
                                                        <div
                                                            key={f.supplier_code}
                                                            onClick={() =>
                                                                updateState({
                                                                    isAdminModalOpen: true,
                                                                    modalType: "farmer",
                                                                    modalTitle: `ගොවියා: ${f.supplier_code}`,
                                                                    modalData: allSales.filter(s => s.supplier_code === f.supplier_code && s.supplier_bill_printed !== "Y"),
                                                                })
                                                            }
                                                            className="p-1 mb-2 bg-white text-black font-bold rounded-lg border-l-4 border-red-500 shadow hover:bg-gray-100 cursor-pointer"
                                                        >
                                                            Code: {f.supplier_code}
                                                        </div>
                                                    ))
                                            ) : (
                                                <p className="text-center text-gray-400 mt-4">No data found</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="pos-sales-view flex flex-col h-full">
                                <div className="flex-shrink-0">
                                    <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-4">
                                        <div className="w-full flex justify-between items-center">
                                            {/* --- TEXT SECTION (Moved Up Independently) --- */}
                                            <div style={{ position: 'relative', top: '-20px', display: 'flex', alignItems: 'center', zIndex: 20 }}>
                                                <div className="font-bold text-lg" style={{ color: 'red', fontSize: '1.35rem' }}>
                                                    බිල් අං: {currentBillNo}
                                                </div>
                                                <div className="font-bold text-xl whitespace-nowrap" style={{ color: 'red', marginLeft: '100px', fontSize: '1.15rem' }}>

                                                    මුළු විකුණුම්: Rs. {formatDecimal(totalSalesValue)}
                                                </div>
                                            </div>
                                            {/* --- PHOTO SECTION (Stays in original position) --- */}
                                            <div className="flex gap-10 items-center justify-start mt-4 mb-4 relative" style={{ minHeight: '150px' }}>
                                                {/* CUSTOMER PHOTO */}
                                                {state.customerProfilePic && (
                                                    <div onClick={() => handleImageClick('customer')}
                                                        className="cursor-pointer hover:scale-105 transition-transform"
                                                        style={{ position: 'absolute', left: '805px', top: '100px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', zIndex: 10 }}>
                                                        <span className="text-xs text-gray-400">ගැ</span>
                                                        <div style={{ width: '100px', height: '100px', backgroundColor: 'white', border: '5px solid #1ec139', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 10px 20px rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                            <img src={state.customerProfilePic} alt="Customer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* SUPPLIER PHOTO */}
                                                {state.supplierProfilePic && (
                                                    <div onClick={() => handleImageClick('supplier')}
                                                        className="cursor-pointer hover:scale-105 transition-transform"
                                                        style={{ position: 'absolute', left: '940px', top: '100px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                                                        <span className="text-xs text-gray-400">සැ</span>
                                                        <div style={{ width: '100px', height: '100px', backgroundColor: 'white', border: '5px solid #3b82f6', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 10px 20px rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                            <img src={state.supplierProfilePic} alt="Supplier Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                    </div>
                                                )}

                                                <ImagePreviewModal
                                                    isOpen={state.isImageModalOpen}
                                                    onClose={() => updateState({ isImageModalOpen: false })}
                                                    data={state.selectedImageData}
                                                />
                                            </div>
                                        </div>
                                        <div
                                            className="flex items-end gap-3 w-full"
                                            style={{ marginTop: '-160px' }} // Adjust this number until it looks perfect
                                        >
                                            {/* STACK TELEPHONE + CUSTOMER CODE VERTICALLY */}
                                            <div className="flex flex-col gap-2 w-full">
                                                {/* TELEPHONE NUMBER FIELD - Moved up independently using relative positioning */}
                                                <div className="flex-1 min-w-0" style={{ position: 'relative', top: '-50px' }}>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <input
                                                            id="telephone_no"
                                                            ref={refs.telephone_no}
                                                            name="telephone_no"
                                                            value={formData.telephone_no || ""}
                                                            type="text"
                                                            placeholder="දුරකථන අංකය"
                                                            disabled={true}
                                                            className="px-2 py-1 font-bold text-sm w-full border rounded text-black placeholder-gray-500"
                                                        />
                                                        {state.showSavePhoneButton && (
                                                            <button
                                                                type="button"
                                                                onClick={savePhoneNumber}
                                                                style={{
                                                                    backgroundColor: '#4CAF50',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    padding: '8px 16px',
                                                                    borderRadius: '0.5rem',
                                                                    cursor: 'pointer',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '0.9rem',
                                                                    whiteSpace: 'nowrap',
                                                                    height: '36px'
                                                                }}
                                                                onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
                                                                onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
                                                            >
                                                                Save
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* CUSTOMER CODE FIELD - Stays in its original position */}
                                                <div className="flex-1 min-w-0" style={{ marginTop: '-40px' }}>
                                                    <input id="customer_code_input" ref={refs.customer_code_input} name="customer_code" value={formData.customer_code || ""} onChange={(e) => handleInputChange("customer_code", e.target.value.toUpperCase(), e.nativeEvent || e)} onKeyDown={(e) => { if (e.isTrusted && e.key !== 'Tab' && e.key !== 'Shift') customerCodeKeyUsedRef.current = true; handleKeyDown(e, "customer_code_input"); }} type="text" placeholder="පාරිභෝගික කේතය" className="px-2 py-1 uppercase font-bold text-sm w-full border rounded bg-white text-black placeholder-gray-500" style={{ backgroundColor: '#0d0d4d', border: '1px solid #4a5568', color: 'white', height: '36px', fontSize: '1rem', padding: '0 0.75rem', borderRadius: '0.5rem', boxSizing: 'border-box' }} autoComplete="off" />
                                                </div>
                                            </div>
                                            <div style={{ flex: '0 0 150px', minWidth: '120px', marginLeft: '-100px' }}>
                                                <Select id="customer_code_select" ref={refs.customer_code_select} value={formData.customer_code ? { value: formData.customer_code, label: `${formData.customer_code}` } : null} onChange={handleCustomerSelect} options={customerSelectOptions} onInputChange={(v, { action }) => action === "input-change" && updateState({ customerSearchInput: v.toUpperCase() })} inputValue={customerSearchInput} placeholder="පාරිභෝගිකයා තෝරන්න" isClearable isSearchable styles={{ control: b => ({ ...b, minHeight: "36px", height: "36px", fontSize: "25px", backgroundColor: "white", borderColor: "#4a5568", borderRadius: "0.5rem" }), valueContainer: b => ({ ...b, padding: "0 6px", height: "36px" }), placeholder: b => ({ ...b, fontSize: "12px", color: "#a0aec0" }), input: b => ({ ...b, fontSize: "12px", color: "black", fontWeight: "bold" }), singleValue: b => ({ ...b, color: "black", fontSize: "12px", fontWeight: "bold" }), option: (b, s) => ({ ...b, color: "black", fontWeight: "bold", fontSize: "12px", backgroundColor: s.isFocused ? "#e5e7eb" : "white", cursor: "pointer" }) }} />
                                            </div>
                                            <div style={{ flex: '0 0 60px', minWidth: '120px' }}>
                                                <input id="price_per_kg" ref={refs.price_per_kg} name="price_per_kg" type="text" value={formData.price_per_kg} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && handleInputChange('price_per_kg', e.target.value)} onKeyDown={(e) => handleKeyDown(e, "price_per_kg")} placeholder="එකවර මිල" className="px-2 py-1 uppercase font-bold text-sm w-full border rounded bg-white text-black placeholder-gray-500" style={{ backgroundColor: '#0d0d4d', border: '1px solid #4a5568', color: 'white', height: '36px', fontSize: '1rem', padding: '0 0.75rem', borderRadius: '0.5rem', boxSizing: 'border-box' }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="rounded-lg border relative bg-white flex items-center justify-start pl-2 pt-2.5" style={{ flex: "0 0 100px", marginLeft: "5px", height: "36px" }}>
                                                    <span className="absolute left-2 top-1 text-gray-400 text-[10px] pointer-events-none">
                                                        Loan Amount
                                                    </span>
                                                    <span className="text-black font-bold text-sm">
                                                        Rs. {loanAmount < 0 ? formatDecimal(Math.abs(loanAmount)) : formatDecimal(loanAmount)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-full" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", columnGap: "8px", alignItems: "end", marginTop: "8px" }}>
                                            <div style={{ gridColumnStart: 1, gridColumnEnd: 3 }}>
                                                <input id="supplier_code" ref={refs.supplier_code} name="supplier_code" value={formData.supplier_code} onChange={(e) => handleInputChange("supplier_code", e.target.value.toUpperCase())} onKeyDown={(e) => handleKeyDown(e, "supplier_code")} type="text" placeholder="සැපයුම්කරු" className="px-2 py-1 uppercase font-bold text-xs border rounded bg-white text-black placeholder-gray-500 w-full" style={{ width: "150px", backgroundColor: '#0d0d4d', border: '1px solid #4a5568', color: 'white', height: '44px', fontSize: '1.25rem', padding: '0 1rem', borderRadius: '0.5rem', boxSizing: 'border-box' }} />
                                            </div>
                                            <div style={{ gridColumnStart: 5, gridColumnEnd: 7, marginLeft: "-120px", marginRight: "-2px" }}>
                                                {(() => {
                                                    const currentFilteredOptions = itemSelectOptions;

                                                    const commitItemOption = (optionToSelect) => {
                                                        if (!optionToSelect) return;
                                                        handleItemSelect(optionToSelect);
                                                        updateState({ itemSearchInput: "" });
                                                        const select = refs.item_code_select.current;
                                                        // Prefer public API over internal setState (setState can desync controlled inputValue).
                                                        if (select && typeof select.blurInput === 'function') {
                                                            try { select.blurInput(); } catch (_) { /* ignore */ }
                                                        }
                                                        if (select && typeof select.onMenuClose === 'function') {
                                                            try { select.onMenuClose(); } catch (_) { /* ignore */ }
                                                        } else if (select && typeof select.setState === 'function') {
                                                            try { select.setState({ menuIsOpen: false }); } catch (_) { /* ignore */ }
                                                        }
                                                        setManagedTimeout(() => {
                                                            refs.weight.current?.focus();
                                                            refs.weight.current?.select();
                                                        }, 50);
                                                    };

                                                    const resolveEnterOption = (select) => {
                                                        const typed = String(state.itemSearchInput || '').trim().toUpperCase();
                                                        // Exact code match first — operators type item codes then Enter.
                                                        if (typed) {
                                                            const exact = currentFilteredOptions.find(
                                                                (opt) => String(opt.value || '').toUpperCase() === typed
                                                            );
                                                            if (exact) return exact;
                                                            const prefix = currentFilteredOptions.find(
                                                                (opt) => String(opt.value || '').toUpperCase().startsWith(typed)
                                                            );
                                                            if (prefix) return prefix;
                                                            if (currentFilteredOptions.length === 1) return currentFilteredOptions[0];
                                                        }

                                                        let idx = select?.state?.highlightedIndex;
                                                        if (idx === undefined || idx === -1) {
                                                            const focusedOption = select?.state?.focusedOption || select?.state?.highlightedOption;
                                                            if (focusedOption && typeof focusedOption === 'object') {
                                                                idx = currentFilteredOptions.findIndex(
                                                                    (opt) => opt.value === focusedOption.value
                                                                );
                                                            }
                                                        }
                                                        if ((idx === undefined || idx === -1) && currentFilteredOptions.length === 1) {
                                                            idx = 0;
                                                        }
                                                        if (idx !== undefined && idx !== -1 && idx < currentFilteredOptions.length) {
                                                            return currentFilteredOptions[idx];
                                                        }
                                                        return null;
                                                    };

                                                    return (
                                                        <div
                                                            onKeyDown={(e) => {
                                                                if (e.key !== "Enter") return;
                                                                // Always stop Enter here so the form cannot implicitly
                                                                // activate another control or drop table scope mid-select.
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (typeof e.nativeEvent?.stopImmediatePropagation === 'function') {
                                                                    e.nativeEvent.stopImmediatePropagation();
                                                                }

                                                                if (state.itemSearchInput === "+") return;

                                                                const select = refs.item_code_select.current;
                                                                const optionToSelect = resolveEnterOption(select);
                                                                if (optionToSelect) commitItemOption(optionToSelect);
                                                            }}
                                                        >
                                                            <Select
                                                                ref={refs.item_code_select}
                                                                openMenuOnFocus
                                                                isSearchable
                                                                tabSelectsValue={false}
                                                                closeMenuOnSelect
                                                                blurInputOnSelect={false}
                                                                // Options are already filtered — disable react-select's
                                                                // second filter so highlightedIndex matches our list.
                                                                filterOption={() => true}
                                                                inputValue={state.itemSearchInput}
                                                                options={currentFilteredOptions}
                                                                placeholder="භාණ්ඩය"

                                                                value={
                                                                    formData.item_code
                                                                        ? {
                                                                            value: formData.item_code,
                                                                            label: `${formData.item_code} - ${formData.item_name}`,
                                                                        }
                                                                        : null
                                                                }

                                                                onKeyDown={(e) => {
                                                                    // BETTER CHECK FOR '+' - use the current input value directly
                                                                    const currentValue = e.target?.value || state.itemSearchInput || '';
                                                                    const isPlusTyped = currentValue === '+';

                                                                    if (e.key === "Enter" && isPlusTyped) {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();

                                                                        // IMMEDIATELY clear the input value
                                                                        const select = refs.item_code_select.current;
                                                                        if (e.target) {
                                                                            e.target.value = "";
                                                                        }

                                                                        // Clear state immediately
                                                                        updateState({
                                                                            itemSearchInput: "",
                                                                            isManualClear: false
                                                                        });

                                                                        // Force clear react-select internal state
                                                                        if (select) {
                                                                            try {
                                                                                if (select.inputRef) {
                                                                                    select.inputRef.value = '';
                                                                                }
                                                                                if (typeof select.setState === 'function') {
                                                                                    select.setState({
                                                                                        inputValue: '',
                                                                                        menuIsOpen: false
                                                                                    });
                                                                                }
                                                                                if (typeof select.blur === 'function') {
                                                                                    select.blur();
                                                                                }
                                                                            } catch (_) { /* ignore */ }
                                                                        }

                                                                        // Latest item: table top row (newest) → lastEnteredItemRef → caches.
                                                                        // Never get stuck: always resolve from what is currently on screen.
                                                                        const isPrintedBillView = middleTableSourceRef.current === 'printed'
                                                                            || !!selectedPrintedCustomerRef.current
                                                                            || !!selectedPrintedCustomer;
                                                                        const keptCustomer = isPrintedBillView ? '' : String(
                                                                            formDataRef.current?.customer_code ||
                                                                            selectedUnprintedCustomerRef.current ||
                                                                            selectedUnprintedCustomer ||
                                                                            tableCustomerScopeRef.current ||
                                                                            ''
                                                                        ).trim().toUpperCase();

                                                                        let targetItemCode = '';
                                                                        let targetItemName = '';

                                                                        const tableRows = isPrintedBillView
                                                                            ? []
                                                                            : ((displayedSalesRef.current && displayedSalesRef.current.length > 0)
                                                                                ? displayedSalesRef.current
                                                                                : (displayedSales || []));
                                                                        const topRow = tableRows.find((s) => {
                                                                            if (!s?.item_code || isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return false;
                                                                            if (!keptCustomer) return true;
                                                                            return String(s.customer_code || '').trim().toUpperCase() === keptCustomer;
                                                                        }) || tableRows[0];

                                                                        if (topRow?.item_code) {
                                                                            targetItemCode = topRow.item_code;
                                                                            targetItemName = topRow.item_name || '';
                                                                            lastEnteredItemRef.current = {
                                                                                item_code: targetItemCode,
                                                                                item_name: targetItemName,
                                                                                customer_code: keptCustomer || String(topRow.customer_code || '').trim().toUpperCase(),
                                                                                at: Date.now(),
                                                                                saleId: topRow.id,
                                                                            };
                                                                        } else {
                                                                            const remembered = isPrintedBillView ? null : lastEnteredItemRef.current;
                                                                            if (
                                                                                remembered?.item_code &&
                                                                                (!keptCustomer || !remembered.customer_code || remembered.customer_code === keptCustomer)
                                                                            ) {
                                                                                targetItemCode = remembered.item_code;
                                                                                targetItemName = remembered.item_name || '';
                                                                            } else {
                                                                                const uniqueSalesMap = new Map();
                                                                                const consider = (s) => {
                                                                                    if (!s?.id || !s.item_code) return;
                                                                                    if (isDeletedSaleId(deletedSaleIdsRef.current, s.id)) return;
                                                                                    // Never pull item from printed-sidebar bills into the entry form.
                                                                                    if (String(s.bill_printed ?? '').trim().toUpperCase() === 'Y') return;
                                                                                    if (isRecentlyPrintedId(s.id)) return;
                                                                                    if (keptCustomer && String(s.customer_code || '').trim().toUpperCase() !== keptCustomer) return;
                                                                                    const idStr = String(s.id);
                                                                                    if (!uniqueSalesMap.has(idStr)) uniqueSalesMap.set(idStr, s);
                                                                                };
                                                                                Array.from(pinnedBillSalesRef.current.values()).forEach(consider);
                                                                                Array.from(localTableSalesRef.current.values()).forEach(consider);
                                                                                Array.from(stickyTableSalesRef.current.values()).forEach(consider);
                                                                                const sortedSales = Array.from(uniqueSalesMap.values()).sort((a, b) => {
                                                                                    const getSortTime = (sale) => {
                                                                                        if (isTempOrOptimisticSale(sale)) {
                                                                                            const ts = parseInt(String(sale.id).split('-')[1], 10);
                                                                                            if (!isNaN(ts)) return ts;
                                                                                        }
                                                                                        const timestamps = [sale.created_at, sale.updated_at, sale.timestamp, sale.date];
                                                                                        for (const ts of timestamps) {
                                                                                            if (!ts) continue;
                                                                                            const parsed = new Date(ts).getTime();
                                                                                            if (!isNaN(parsed)) return parsed;
                                                                                        }
                                                                                        const idNum = parseInt(sale.id, 10);
                                                                                        return isNaN(idNum) ? 0 : idNum;
                                                                                    };
                                                                                    return getSortTime(b) - getSortTime(a);
                                                                                });
                                                                                const latestSale = sortedSales[0];
                                                                                if (latestSale?.item_code) {
                                                                                    targetItemCode = latestSale.item_code;
                                                                                    targetItemName = latestSale.item_name || '';
                                                                                }
                                                                            }
                                                                        }

                                                                        if (targetItemCode) {
                                                                            if (keptCustomer) tableCustomerScopeRef.current = keptCustomer;

                                                                            flushSync(() => {
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    customer_code: keptCustomer || prev.customer_code,
                                                                                    item_code: targetItemCode,
                                                                                    item_name: targetItemName,
                                                                                    weight: "",
                                                                                    price_per_kg: "",
                                                                                    packs: "",
                                                                                    total: ""
                                                                                }));
                                                                            });

                                                                            if (refs.item_code_select.current) {
                                                                                const selectEl = refs.item_code_select.current;
                                                                                try {
                                                                                    if (typeof selectEl.selectOption === 'function') {
                                                                                        selectEl.selectOption({
                                                                                            value: targetItemCode,
                                                                                            label: `${targetItemCode} - ${targetItemName}`,
                                                                                            item: { no: targetItemCode, type: targetItemName }
                                                                                        });
                                                                                    }
                                                                                } catch (_) { /* ignore */ }
                                                                            }

                                                                            // Focus weight immediately — no long delay that feels stuck.
                                                                            requestAnimationFrame(() => {
                                                                                if (refs.weight.current) {
                                                                                    refs.weight.current.focus();
                                                                                    refs.weight.current.select();
                                                                                }
                                                                            });
                                                                        }
                                                                        return;
                                                                    }

                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                    }
                                                                }}

                                                                // IMPROVED onInputChange - ensure '+' is handled correctly
                                                                onInputChange={(value, meta) => {
                                                                    if (meta.action === "input-change") {
                                                                        // If the user types '+', keep it exactly as is
                                                                        if (value === '+') {
                                                                            updateState({ itemSearchInput: '+' });
                                                                        } else {
                                                                            // For other values, trim and convert to uppercase
                                                                            const cleanValue = value.trim() === "" ? "" : value.toUpperCase();
                                                                            updateState({ itemSearchInput: cleanValue });
                                                                        }
                                                                    }
                                                                    // When menu closes or value is set, don't wipe the input
                                                                }}


                                                                className="react-select-container font-bold text-sm w-full"

                                                                styles={{
                                                                    control: base => ({
                                                                        ...base,
                                                                        height: "44px",
                                                                        minHeight: "44px",
                                                                        fontSize: "1.25rem",
                                                                        backgroundColor: "white",
                                                                        borderColor: "#4a5568",
                                                                        borderRadius: "0.5rem",
                                                                    }),
                                                                    valueContainer: base => ({
                                                                        ...base,
                                                                        padding: "0 1rem",
                                                                        height: "44px"
                                                                    }),
                                                                    input: base => ({
                                                                        ...base,
                                                                        color: "black",
                                                                        fontSize: "1.25rem"
                                                                    }),
                                                                    singleValue: base => ({
                                                                        ...base,
                                                                        color: "black",
                                                                        fontWeight: "bold",
                                                                        fontSize: "1.25rem",
                                                                    }),
                                                                    option: (base, state) => ({
                                                                        ...base,
                                                                        fontWeight: "bold",
                                                                        color: "black",
                                                                        backgroundColor: state.isFocused ? "#e5e7eb" : "white",
                                                                        fontSize: "1rem",
                                                                    }),
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {[{ id: 'weight', placeholder: "බර", fieldRef: refs.weight },
                                            { id: 'price_per_kg_grid_item', placeholder: "මිල", fieldRef: refs.price_per_kg_grid_item },
                                            { id: 'packs', placeholder: "අසුරුම්", fieldRef: refs.packs },
                                            { id: 'total', placeholder: "TOTAL", fieldRef: refs.total, isReadOnly: true }].map(({ id, placeholder, fieldRef, isReadOnly = false }) => (
                                                <div key={id} style={{ ...(id === 'weight' && { gridColumnStart: 8, gridColumnEnd: 9, marginLeft: "-70px", width: "100px" }), ...(id === 'price_per_kg_grid_item' && { gridColumnStart: 9, gridColumnEnd: 10, marginLeft: "-30px", width: "105px" }), ...(id === 'packs' && { gridColumnStart: 10, gridColumnEnd: 11 }), ...(id === 'total' && { gridColumnStart: 11, gridColumnEnd: 14, marginLeft: "10px" }) }}>
                                                    <input id={id} ref={fieldRef} name={id} type="text" value={id === 'price_per_kg_grid_item' ? gridPricePerKg : formData[id]} onChange={(e) => id === 'price_per_kg_grid_item' ? handleInputChange(id, e.target.value) : (/^\d*\.?\d*$/.test(e.target.value) && handleInputChange(id, e.target.value))} onKeyDown={(e) => handleKeyDown(e, id)} placeholder={placeholder} readOnly={isReadOnly} className="px-2 py-1 uppercase font-bold text-xs border rounded bg-white text-black placeholder-gray-500 text-center" style={{ backgroundColor: isReadOnly ? '#e2e8f0' : 'white', borderRadius: '0.5rem', textAlign: 'right', fontSize: '1.125rem', height: '40px', boxSizing: 'border-box', width: '100%' }} />
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" tabIndex={-1} style={{ display: "none" }} aria-hidden="true"></button>
                                    </form>
                                    {errors.form && <div className="mt-6 p-3 bg-red-100 text-red-700 rounded-xl">{errors.form}</div>}
                                </div>
                                <div className="flex-grow overflow-y-auto mt-1">
                                    <table className="min-w-full border-gray-200 rounded-xl" style={{ backgroundColor: '#000000', color: 'white', borderCollapse: 'collapse', margin: '0px 0', width: '100%', fontSize: '12px' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#000000' }}>
                                                {['Sup code', 'කේතය', 'අයිතමය', 'බර(kg)', 'මිල', 'අගය', 'මලු', 'Actions'].map((header, index) => (
                                                    <th key={index} className="border" style={{ backgroundColor: '#f5fafb', color: '#000000', padding: '6px 8px', fontSize: '11px', fontWeight: 'bold' }}>{header}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        {tableRows.length === 0 ? (
                                            <tbody>
                                                <tr>
                                                    <td colSpan="8" className="border text-center" style={{ padding: '12px', color: '#9ca3af', fontSize: '12px' }}>
                                                        {(formData.customer_code || selectedUnprintedCustomer || selectedPrintedCustomer)
                                                            ? 'මෙම පාරිභෝගිකයාට වාර්තා නොමැත'
                                                            : 'පාරිභෝගික කේතය ඇතුළත් කරන්න'}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        ) : (
                                            <tbody>
                                                {tableRows.map((s, idx) => {
                                                    const isZeroPrice = parseFloat(s.price_per_kg) === 1;
                                                    const cellStyle = {
                                                        padding: '6px 8px',
                                                        fontSize: '12px',
                                                        color: isZeroPrice ? '#FF0000' : 'white',
                                                        // Remove backgroundColor or set it to transparent
                                                        backgroundColor: 'transparent'
                                                    };
                                                    const idKey = s?.id != null ? String(s.id) : '';
                                                    const rowKey = (idKey && (
                                                        stableRowKeyRef.current.get(idKey)
                                                        || (realToTempIdRef.current.has(idKey)
                                                            ? stableRowKeyRef.current.get(realToTempIdRef.current.get(idKey))
                                                            : null)
                                                        || idKey
                                                    )) || `${s.customer_code || 'sale'}-${s.item_code || 'item'}-${idx}`;
                                                    return (
                                                        <tr key={rowKey}
                                                            tabIndex={-1}
                                                            className="text-center cursor-pointer focus:outline-none"
                                                            onClick={() => handleEditClick(s)}
                                                            onKeyDown={(e) => handleTableRowKeyDown(e, s)}>
                                                            <td className="border" style={cellStyle}>{s.supplier_code}</td>
                                                            <td className="border" style={cellStyle}>{s.item_code}</td>
                                                            <td className="border" style={{ padding: '6px 8px', fontSize: '16px', fontFamily: 'inherit', fontWeight: 'normal', color: isZeroPrice ? '#FF0000' : '#FFFFFF', textTransform: 'none', backgroundColor: 'transparent' }}>{s.item_name}</td>
                                                            <td className="border" style={cellStyle}>{formatDecimal(s.weight)}</td>
                                                            <td className="border" style={cellStyle}>{formatDecimal(s.price_per_kg)}</td>
                                                            <td className="border" style={cellStyle}>{formatDecimal((parseFloat(s.weight) || 0) * (parseFloat(s.price_per_kg) || 0) + (parseFloat(s.packs) || 0) * (parseFloat(s.pack_due) || 0))}</td>
                                                            <td className="border" style={cellStyle}>{s.packs}</td>
                                                            <td className="border text-center" style={{ padding: '6px 8px', backgroundColor: 'transparent' }}>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteRecord(s.id); }} className="text-black font-bold rounded-full bg-white hover:bg-gray-200" style={{ padding: '2px 6px', fontSize: '11px' }}>
                                                                    🗑️
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        )}
                                    </table>
                                    {tableRows.length > 0 && (<SalesSummaryFooter sales={tableRows} formatDecimal={formatDecimal} />)}
                                    <div
                                        className="flex items-center space-x-3 overflow-x-auto whitespace-nowrap"
                                        style={{ marginTop: "-75px" }}  // adjust value as needed
                                    >
                                        <div style={{ marginLeft: '660px', marginTop: '-2px', display: "none" }}>
                                            <input id="given_amount" ref={refs.given_amount} name="given_amount_field" type="tel" inputMode="numeric" autoComplete="new-password" value={formData.given_amount ? Number(formData.given_amount).toLocaleString() : ""} onChange={(e) => handleInputChange("given_amount", e.target.value.replace(/,/g, ""))} onKeyDown={(e) => handleKeyDown(e, "given_amount")} placeholder="දුන් මුදල" className="px-4 py-2 border rounded-xl text-right bg-white text-black" style={{ width: "180px", fontWeight: "bold", fontSize: "1.1rem" }} />
                                        </div>
                                    </div>
                                    <div className="flex gap-4 items-start"><ItemSummary sales={tableRows} formatDecimal={formatDecimal} /><BreakdownDisplay sale={selectedSaleForBreakdown} formatDecimal={formatDecimal} /></div>
                                    <div className="flex items-center justify-between mb-4" style={{ marginTop: "35px" }}>
                                        {/* Red Total Text */}
                                        <div className="flex items-center justify-between mb-4" style={{ marginTop: "35px" }}>
                                            {/* Red Total Text - Only show when displayedSales has records */}
                                            {tableRows.length > 0 && (
                                                <div className="text-2xl font-bold" style={{ color: 'red' }}>
                                                    (විකුණුම්: Rs. {formatDecimal(salesTotal)} + මල්ලක අගය: Rs. {formatDecimal(packCostTotal)} )
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="right-sidebar" style={{ backgroundColor: '#1ec139ff', borderRadius: '0.75rem', maxHeight: '80.5vh', overflowY: 'auto', gridColumnStart: 3, gridColumnEnd: 4 }}>
                        <CustomerList type="unprinted" searchQuery={searchQueries.unprinted} onSearchChange={handleUnprintedSearchChange} selectedPrintedCustomer={selectedPrintedCustomer} selectedUnprintedCustomer={selectedUnprintedCustomer} handleCustomerClick={handleCustomerClick} allSales={sidebarSales} />
                    </div>
                </div>
            </div>
        </Layout>
    );
}