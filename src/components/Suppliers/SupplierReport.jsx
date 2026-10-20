import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import api from "../../api";
import { useNavigate } from 'react-router-dom';
import { STORAGE_URL } from '../../config';

// Supplier report / supplier transaction entry.
// Left: printed bills. Right: suppliers with unprinted lines. Middle: data entry
// (supplier, item, weight, price) plus the selected bill. Every line is also a
// loan for that supplier (see /supplier-loans). F4 prints the open bill and gives
// it a bill number; on a printed bill F4 prints a copy.
// Keys: supplier → Enter → item → Enter → weight → Enter → price → Enter saves the line.

const SIDEBAR_POLL_MS = 5000; // keep both sidebars in step with entries made on other terminals
const STORAGE_BASE = STORAGE_URL;

// --- Pure helpers ---
const formatDecimal = (value, decimals = 2) => (parseFloat(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
});

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const formatNumber = (value, maxDecimals = 3) => {
    const number = parseFloat(value);
    if (Number.isNaN(number)) return '0';
    if (Number.isInteger(number)) return number.toLocaleString('en-US');
    const parts = number.toFixed(maxDecimals).replace(/\.?0+$/, '').split('.');
    const wholePart = parseInt(parts[0], 10).toLocaleString('en-US');
    return parts[1] ? `${wholePart}.${parts[1]}` : wholePart;
};

const imageUrl = (path) => (!path ? null : (path.startsWith('http') ? path : `${STORAGE_BASE}${path}`));

const errorText = (err, fallback) => {
    const errors = err?.response?.data?.errors;
    if (errors) return Object.values(errors).flat().join(' ');
    return err?.response?.data?.message || fallback;
};

// --- Printing: always a fresh hidden iframe (reused iframes stop showing the dialog) ---
const printHtml = (content) => {
    const old = document.getElementById('print-iframe');
    if (old) old.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'print-iframe';
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: 'none', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(iframe);
    try {
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(content);
        doc.close();
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        try { window.focus(); } catch { /* ignore */ }
        return true;
    } catch (e) {
        console.error('Print iframe failed, using popup:', e);
        const w = window.open('', '_blank', 'width=420,height=640');
        if (!w) return false;
        w.document.open();
        w.document.write(content);
        w.document.close();
        w.focus();
        w.print();
        return true;
    }
};

// 76mm receipt in the same style as the original supplier bill.
const SHOP = {
    name: 'DUMINDA VEGETABLE & FRUITS SUPPLIER',
    address: ['Kalpitiya Road, Daluwa.', 'Puttalam.'],
    phones: '0725879432 / 0718989734',
};

// Supplier bill: '3inch' = 76mm receipt, '4inch' = A4 page with full bill details.
const buildBillHtml = ({ bill, lines, total }, isCopy, billSize = '3inch') => {
    const date = new Date(`${bill.bill_date}T00:00:00`).toLocaleDateString('si-LK');
    const nameSize = (name) => (name.length <= 8 ? '18px' : name.length <= 12 ? '16px' : name.length <= 16 ? '14px' : '12px');

    const summary = {};
    lines.forEach((l) => {
        const name = l.item_name || l.item_code || '';
        summary[name] = (summary[name] || 0) + (parseFloat(l.weight) || 0);
    });
    const summaryEntries = Object.entries(summary);

    if (billSize === '4inch') {
        const rows = lines.map((l, i) => `
            <tr>
                <td class="c">${i + 1}</td>
                <td>${escapeHtml(l.grn_no || '—')}</td>
                <td><strong>${escapeHtml(l.item_name || l.item_code || '')}</strong> <span class="muted">(${escapeHtml(l.item_code)})</span></td>
                <td class="r">${formatNumber(Number(l.weight).toFixed(2))}</td>
                <td class="r">${formatNumber(Number(l.price_per_kg).toFixed(2))}</td>
                <td class="r b">${formatNumber(Number(l.amount).toFixed(2))}</td>
            </tr>`).join('');
        const chips = summaryEntries.map(([name, w]) => `<span class="chip">${escapeHtml(name)}: ${formatNumber(w)} kg</span>`).join('');
        const printedAt = new Date().toLocaleTimeString();

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(bill.bill_no)}</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    @page { size:A4 portrait; margin:14mm 14mm 16mm 14mm; }
    html, body { background:#fff; color:#000; font-family:'Segoe UI','Helvetica Neue',Arial,'Noto Sans Sinhala',sans-serif; font-size:14px; }
    .shop { text-align:center; border-bottom:3px double #000; padding-bottom:10px; }
    .shop-name { font-size:26px; font-weight:900; letter-spacing:1px; }
    .shop-line { font-size:14px; font-weight:600; margin-top:2px; }
    .doc-title { text-align:center; font-size:16px; font-weight:800; margin-top:10px; letter-spacing:1px; }
    .meta { display:flex; justify-content:space-between; align-items:flex-start; margin:12px 0; gap:16px; }
    .party { border:2px solid #000; padding:8px 14px; min-width:45%; }
    .party .label { font-size:12px; font-weight:600; } .party .code { font-size:24px; font-weight:900; } .party .name { font-size:14px; font-weight:600; }
    .bill-meta { text-align:right; line-height:1.7; } .bill-meta strong { font-size:16px; }
    table.items { width:100%; border-collapse:collapse; }
    table.items th { background:#f0f0f0; border:1px solid #000; padding:7px 8px; font-size:13px; font-weight:800; text-align:left; }
    table.items td { border:1px solid #000; padding:6px 8px; font-size:14px; font-weight:600; }
    table.items tr { page-break-inside:avoid; } thead { display:table-header-group; }
    table.items tfoot td { font-weight:900; font-size:15px; background:#fafafa; }
    .r { text-align:right !important; } .c { text-align:center !important; } .b { font-weight:900 !important; } .muted { color:#555; font-weight:400; font-size:12px; }
    .summary { margin-top:10px; font-size:12px; }
    .chip { display:inline-block; border:1px solid #999; border-radius:4px; padding:2px 8px; margin:2px 4px 2px 0; font-weight:600; }
    .totals { margin-top:14px; margin-left:auto; width:55%; border-collapse:collapse; page-break-inside:avoid; }
    .totals td { padding:6px 8px; font-size:15px; font-weight:700; }
    .totals .grand td { font-size:19px; font-weight:900; border-top:2px solid #000; border-bottom:3px double #000; }
    .footer { margin-top:20px; text-align:center; border-top:1px solid #000; padding-top:6px; font-size:12px; }
</style></head><body>
    <div class="shop">
        <div class="shop-name">${escapeHtml(SHOP.name)}</div>
        ${SHOP.address.map((line) => `<div class="shop-line">${escapeHtml(line)}</div>`).join('')}
        <div class="shop-line" style="font-weight:700; font-size:15px;">Tel: ${SHOP.phones}</div>
    </div>
    <div class="doc-title">සැපයුම්කරු බිල්පත / SUPPLIER BILL${isCopy ? ' (COPY)' : ''}</div>
    <div class="meta">
        <div class="party">
            <div class="label">සැපයුම්කරු / Supplier</div>
            <div class="code">${escapeHtml(bill.supplier_code)}</div>
            ${bill.supplier_name ? `<div class="name">${escapeHtml(bill.supplier_name)}</div>` : ''}
        </div>
        <div class="bill-meta">
            <div>බිල් අං / Bill No: <strong>${escapeHtml(bill.bill_no)}</strong></div>
            <div>දිනය / Date: <strong>${date}</strong></div>
            <div>වේලාව / Time: ${printedAt}</div>
            <div>පේළි / Lines: ${lines.length}</div>
        </div>
    </div>
    <table class="items">
        <colgroup><col style="width:5%"><col style="width:22%"><col style="width:31%"><col style="width:13%"><col style="width:13%"><col style="width:16%"></colgroup>
        <thead><tr><th class="c">#</th><th>GRN No</th><th>වර්ගය / Item</th><th class="r">කිලෝ / Kg</th><th class="r">මිල / Price</th><th class="r">අගය / Amount</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="c">No items</td></tr>'}</tbody>
        <tfoot><tr><td colspan="3">එකතුව / Total</td><td class="r">${formatNumber(lines.reduce((t, l) => t + (parseFloat(l.weight) || 0), 0).toFixed(2))}</td><td></td><td class="r">${formatNumber(Number(total).toFixed(2))}</td></tr></tfoot>
    </table>
    ${chips ? `<div class="summary">${chips}</div>` : ''}
    <table class="totals">
        <tr class="grand"><td>මෙම බිලට මුළු අගය / Bill Total:</td><td class="r">Rs. ${formatNumber(Number(total).toFixed(2))}</td></tr>
    </table>
    <div class="footer">${escapeHtml(SHOP.name)} · ${SHOP.phones}</div>
</body></html>`;
    }

    const rows = lines.map((l) => {
        const name = l.item_name || l.item_code || '';
        return `
        <tr style="font-size:14px; font-weight:bold; vertical-align:middle; line-height:1.3;">
            <td style="text-align:left; padding:3px;"><div style="font-size:${nameSize(name)}; white-space:nowrap;">${escapeHtml(name)}</div>
                ${l.grn_no ? `<div style="font-size:9px; font-weight:normal; white-space:nowrap;">${escapeHtml(l.grn_no)}</div>` : ''}</td>
            <td style="text-align:right; padding:3px; white-space:nowrap;">${formatNumber(Number(l.weight).toFixed(2))}</td>
            <td style="text-align:right; padding:3px; white-space:nowrap;">${formatNumber(Number(l.price_per_kg).toFixed(2))}</td>
            <td style="text-align:right; padding:3px; white-space:nowrap; font-weight:900;">${formatNumber(Number(l.amount).toFixed(2))}</td>
        </tr>`;
    }).join('');

    let summaryHtml = '';
    for (let i = 0; i < summaryEntries.length; i += 2) {
        const [n1, w1] = summaryEntries[i];
        const second = summaryEntries[i + 1];
        summaryHtml += `<tr><td style="padding:2px; width:50%; font-weight:bold; white-space:nowrap; font-size:11px;">${escapeHtml(n1)}:${formatNumber(w1)}</td>`
            + `<td style="padding:2px; width:50%; font-weight:bold; white-space:nowrap; font-size:11px;">${second ? `${escapeHtml(second[0])}:${formatNumber(second[1])}` : ''}</td></tr>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(bill.bill_no)}</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    @page { size:76mm auto; margin:0; }
    html, body { width:76mm; background:#fff; }
    .receipt { width:72mm; margin:0 auto; padding:3px 4px; font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif; color:#000; font-size:12px; }
    .code-box { border:1.5px solid #000; padding:2px 6px; font-size:18px; font-weight:bold; font-family:'Iskoola Pota','Noto Sans Sinhala',sans-serif; }
    .divider { border:none; border-top:1.5px solid #000; margin:3px 0; }
    table { width:100%; border-collapse:collapse; }
    th { font-size:13px; font-weight:900; padding-bottom:3px; }
    .net { font-size:22px; font-weight:900; border-bottom:3px double #000; border-top:2px solid #000; padding:3px 6px; display:inline-block; white-space:nowrap; }
</style></head><body><div class="receipt">
    <div style="text-align:center; font-weight:bold;">
        <div style="font-size:17px; font-weight:900; line-height:1.15;">DUMINDA VEGETABLE<br>&amp; FRUITS SUPPLIER</div>
        ${SHOP.address.map((line) => `<div style="font-size:12px;">${escapeHtml(line)}</div>`).join('')}
        <div style="display:flex; justify-content:space-between; align-items:center; gap:2px; margin:4px 0;">
            <span style="font-size:14px;">ගොවියා:</span>
            <span class="code-box" style="font-size:20px;">${escapeHtml(bill.supplier_code)}</span>
        </div>
        ${isCopy ? '<div style="font-size:11px; margin-top:2px;">(පිටපත / COPY)</div>' : ''}
    </div>
    <div style="font-size:13px; margin-top:3px; padding:0 2px;">
        <div style="font-weight:bold;">Tel: ${SHOP.phones}</div>
        <div style="display:flex; justify-content:space-between; margin-top:2px; font-weight:bold;">
            <span>බිල් අං:${escapeHtml(bill.bill_no)}</span><span>දිනය:${date}</span>
        </div>
    </div>
    <hr class="divider">
    <table style="table-layout:fixed;">
        <colgroup><col style="width:34%"><col style="width:20%"><col style="width:20%"><col style="width:26%"></colgroup>
        <thead><tr style="border-bottom:1.5px solid #000;">
            <th style="text-align:left;">වර්ගය</th><th style="text-align:right;">කිලෝ</th><th style="text-align:right;">මිල</th><th style="text-align:right;">අගය</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="border-top:1.5px solid #000; font-weight:bold;">
            <td colspan="4" style="padding-top:3px; font-size:18px; text-align:right;">${Number(total).toFixed(2)}</td>
        </tr></tfoot>
    </table>
    <table style="margin-top:6px; font-weight:bold; font-size:15px; padding:0 2px;">
        <tr style="font-weight:900;"><td style="font-size:13px; white-space:nowrap;">මෙම බිලට මුළු අගය:</td>
            <td style="text-align:right;"><span class="net">${Number(total).toFixed(2)}</span></td></tr>
    </table>
    <div style="margin-top:8px; border-top:1px dashed #000; padding-top:3px;"><table>${summaryHtml}</table></div>
    <div style="text-align:center; font-size:8px; color:#999; margin-top:3px; border-top:1px dotted #ccc;">- - - - - - - - - - - - - - - - - - - - - -</div>
</div></body></html>`;
};

// --- Sidebar list button ---
const BillListButton = memo(({ label, buttonStyle, active, onSelect }) => (
    <button
        type="button"
        onClick={onSelect}
        style={{ ...buttonStyle, ...(active ? { outline: '3px solid #ffeb3b', outlineOffset: '-3px' } : null) }}
    >
        <span style={billLabelStyle}>{label}</span>
    </button>
));

const SupplierReport = () => {
    const navigate = useNavigate();

    // Sidebars
    const [summary, setSummary] = useState({ printed: [], unprinted: [], date: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [printedSearchTerm, setPrintedSearchTerm] = useState('');
    const [unprintedSearchTerm, setUnprintedSearchTerm] = useState('');

    // Lookups
    const [suppliers, setSuppliers] = useState([]);
    const [items, setItems] = useState([]);

    // Selection: an open (unprinted) bill for selectedSupplier, or a printed bill (selectedBillNo)
    const [supplierInput, setSupplierInput] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [selectedBillNo, setSelectedBillNo] = useState(null);
    const [supplierDetails, setSupplierDetails] = useState([]);
    const [balance, setBalance] = useState(null);

    // Entry line
    const [line, setLine] = useState({ item_code: '', weight: '', price_per_kg: '' });
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [status, setStatus] = useState({ type: '', text: '' });

    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    // Item dropdown
    const [itemMenuOpen, setItemMenuOpen] = useState(false);
    const [itemHighlight, setItemHighlight] = useState(0);
    const itemMenuRef = useRef(null);

    // Bill size: '3inch' = 76mm receipt, '4inch' = A4. Remembered on this computer.
    const [billSize, setBillSize] = useState(() => {
        // 4 inch (A4) is the default; new key so earlier saved '3inch' choices don't override it.
        try { return localStorage.getItem('supplierBillSizeV2') || '4inch'; } catch { return '4inch'; }
    });
    const changeBillSize = (e) => {
        setBillSize(e.target.value);
        try { localStorage.setItem('supplierBillSizeV2', e.target.value); } catch { /* ignore */ }
    };

    const supplierRef = useRef(null);
    const itemRef = useRef(null);
    const weightRef = useRef(null);
    const priceRef = useRef(null);
    const handlePrintRef = useRef(null);

    const isUnprintedBill = !!selectedSupplier && !selectedBillNo;

    const flash = useCallback((type, text) => {
        setStatus({ type, text });
        if (type !== 'error') setTimeout(() => setStatus((s) => (s.text === text ? { type: '', text: '' } : s)), 2500);
    }, []);

    // Synchronous focus: fast typing must never land in the previous field.
    const focus = (ref) => {
        ref.current?.focus();
        ref.current?.select?.();
    };

    // --- Data loading ---
    const fetchSummary = useCallback(async () => {
        try {
            const res = await api.get('/supplier-transactions/sidebar');
            setSummary({ printed: res.data.printed || [], unprinted: res.data.unprinted || [], date: res.data.date || '' });
        } catch (error) {
            console.error('Error fetching bill sidebars:', error?.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadDetails = useCallback(async (supplierCode, billNo) => {
        if (!supplierCode && !billNo) { setSupplierDetails([]); return; }
        try {
            const params = billNo ? { bill_no: billNo } : { supplier_code: supplierCode, unprinted: 1 };
            const res = await api.get('/supplier-transactions', { params });
            setSupplierDetails(res.data.transactions || []);
        } catch (error) {
            flash('error', errorText(error, 'Could not load the bill.'));
        }
    }, [flash]);

    const loadBalance = useCallback(async (supplierCode) => {
        try {
            const res = await api.get(`/supplier-transaction-loans/${encodeURIComponent(supplierCode)}`);
            setBalance(res.data.summary);
        } catch {
            setBalance(null);
        }
    }, []);

    useEffect(() => {
        fetchSummary();
        Promise.all([api.get('/suppliers'), api.get('/items')])
            .then(([s, i]) => {
                setSuppliers(Array.isArray(s.data) ? s.data : (s.data.data || []));
                setItems(Array.isArray(i.data) ? i.data : (i.data.data || []));
            })
            .catch((error) => console.error('Error loading suppliers/items:', error?.message));
    }, [fetchSummary]);

    // Sidebars refresh in the background and whenever the window regains focus.
    useEffect(() => {
        const timer = setInterval(() => { if (!document.hidden) fetchSummary(); }, SIDEBAR_POLL_MS);
        const onFocus = () => fetchSummary();
        window.addEventListener('focus', onFocus);
        return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
    }, [fetchSummary]);

    useEffect(() => {
        if (!isLoading) supplierRef.current?.focus();
    }, [isLoading]);

    useEffect(() => { loadDetails(selectedSupplier, selectedBillNo); }, [selectedSupplier, selectedBillNo, loadDetails]);

    const supplierByCode = useMemo(
        () => new Map(suppliers.map((s) => [String(s.code || '').toUpperCase(), s])),
        [suppliers]
    );
    const supplierProfile = selectedSupplier ? supplierByCode.get(selectedSupplier) : null;

    const resolveItem = (typed) => {
        const value = String(typed || '').trim().toUpperCase();
        if (!value) return null;
        const code = value.split(' ')[0];
        return items.find((i) => String(i.no).toUpperCase() === code)
            || items.find((i) => String(i.no).toUpperCase().startsWith(code))
            || items.find((i) => String(i.type || '').toUpperCase().includes(value))
            || null;
    };

    // Text shown in the item box once an item is chosen: "CODE - Name".
    // resolveItem() reads the code back from the first word.
    const itemLabel = (item) => (item.type ? `${item.no} - ${item.type}` : String(item.no)).toUpperCase();

    // --- Selection ---
    const resetLine = () => {
        setLine({ item_code: '', weight: '', price_per_kg: '' });
        setEditingId(null);
    };

    const openBill = (supplierCode, billNo = null) => {
        const code = String(supplierCode).toUpperCase();
        setSupplierInput(code);
        setSelectedSupplier(code);
        setSelectedBillNo(billNo);
        resetLine();
        setStatus({ type: '', text: '' });
        loadBalance(code);
    };

    const clearCenterPanel = () => {
        setSelectedSupplier(null);
        setSelectedBillNo(null);
        setSupplierInput('');
        setSupplierDetails([]);
        setBalance(null);
        resetLine();
        focus(supplierRef);
    };

    // Clicking the bill that is already open closes it again.
    const handlePrintedBillClick = (supplierCode, billNo) => {
        if (selectedBillNo === billNo) { clearCenterPanel(); return; }
        openBill(supplierCode, billNo);
    };
    const handleUnprintedBillClick = (supplierCode) => {
        if (isUnprintedBill && selectedSupplier === String(supplierCode).toUpperCase()) { clearCenterPanel(); return; }
        openBill(supplierCode);
        setTimeout(() => focus(itemRef), 0);
    };

    const selectTypedSupplier = () => {
        const code = supplierInput.trim().toUpperCase();
        // Any supplier code is accepted; a new one is added to the suppliers list when its first line is saved.
        if (!code) {
            flash('error', 'සැපයුම්කරු කේතය ඇතුළත් කරන්න');
            focus(supplierRef);
            return false;
        }
        if (!supplierByCode.has(code)) flash('success', `නව සැපයුම්කරු "${code}" (New supplier)`);
        if (selectedSupplier !== code || selectedBillNo) openBill(code);
        focus(itemRef);
        return true;
    };

    const refreshAll = (supplierCode) => {
        loadDetails(supplierCode, selectedBillNo);
        loadBalance(supplierCode);
        fetchSummary();
    };

    // --- Save / edit / delete lines ---
    // Returns true when the line was saved.
    const saveLine = async () => {
        if (!selectedSupplier && !selectTypedSupplier()) return false;
        const item = resolveItem(line.item_code);
        if (!item) { flash('error', 'අයිතමය තෝරන්න (Select an item)'); focus(itemRef); return false; }
        const weight = parseFloat(line.weight);
        if (!(weight > 0)) { flash('error', 'බර ඇතුළත් කරන්න (Enter weight)'); focus(weightRef); return false; }
        const price = parseFloat(line.price_per_kg);
        if (Number.isNaN(price) || price < 0) { flash('error', 'මිල ඇතුළත් කරන්න (Enter price)'); focus(priceRef); return false; }

        const code = selectedSupplier || supplierInput.trim().toUpperCase();
        const payload = { supplier_code: code, item_code: item.no, weight, price_per_kg: price };
        setSaving(true);
        try {
            if (editingId) {
                await api.put(`/supplier-transactions/${editingId}`, payload);
                flash('success', '✅ යාවත්කාලීන විය (Line updated)');
                refreshAll(code);
            } else {
                await api.post('/supplier-transactions', payload);
                flash('success', '✅ සුරකින ලදී (Line saved)');
                // New lines always go to the supplier's open (unprinted) bill.
                if (selectedBillNo) setSelectedBillNo(null); else loadDetails(code, null);
                loadBalance(code);
                fetchSummary();
            }
            resetLine();
            focus(itemRef);
            return true;
        } catch (error) {
            flash('error', errorText(error, 'Could not save the line.'));
            return false;
        } finally {
            setSaving(false);
        }
    };

    // F5: keep the bill open (unprinted) and clear the screen for the next supplier.
    // A line still being typed is saved first; nothing is printed.
    const holdBill = async () => {
        if (saving || printing) return;
        const code = selectedSupplier || supplierInput.trim().toUpperCase();
        const lineTyped = line.item_code.trim() || line.weight || line.price_per_kg;
        if (lineTyped && !(await saveLine())) return;
        if (!code) { focus(supplierRef); return; }
        const isOpenBill = !selectedBillNo;
        clearCenterPanel();
        fetchSummary();
        if (isOpenBill) flash('success', `📋 ${code} — මුද්‍රණය නොකළ ලැයිස්තුවට (Bill held, not printed)`);
    };
    const holdBillRef = useRef(null);
    holdBillRef.current = holdBill;

    const startEdit = (record) => {
        setEditingId(record.id);
        const recordItem = resolveItem(record.item_code);
        setLine({ item_code: recordItem ? itemLabel(recordItem) : String(record.item_code), weight: String(record.weight), price_per_kg: String(record.price_per_kg) });
        focus(weightRef);
    };

    const deleteRecord = async (record) => {
        if (!window.confirm(`${record.item_name || record.item_code} — Rs. ${formatDecimal(record.amount)} මකන්නද? (Delete?)`)) return;
        try {
            await api.delete(`/supplier-transactions/${record.id}`);
            if (editingId === record.id) resetLine();
            flash('success', 'මකා දමන ලදී (Deleted)');
            refreshAll(record.supplier_code);
        } catch (error) {
            flash('error', errorText(error, 'Could not delete the line.'));
        }
    };

    // --- Print (F4): open bill → new bill number; printed bill → copy ---
    const handlePrint = async () => {
        if (printing) return;
        if (!selectedSupplier) { alert('Select a bill first!'); return; }
        if (isUnprintedBill && supplierDetails.length === 0) { alert('No data to print!'); return; }
        setPrinting(true);
        try {
            const res = selectedBillNo
                ? await api.post(`/supplier-transactions/bills/${encodeURIComponent(selectedBillNo)}/reprint`)
                : await api.post('/supplier-transactions/print', { supplier_code: selectedSupplier });
            const ok = printHtml(buildBillHtml(res.data, !!selectedBillNo, billSize));
            if (!ok) alert('Print dialog could not open. Allow popups for this site and press F4 again.');
            fetchSummary();
            clearCenterPanel();
        } catch (error) {
            alert(errorText(error, 'An error occurred while printing. Please try again.'));
        } finally {
            setPrinting(false);
        }
    };
    handlePrintRef.current = handlePrint;

    // F4 prints and F5 holds the bill (instead of reloading) from anywhere on the page; F1 (browser help) is blocked.
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'F1' || event.code === 'F1') {
                event.preventDefault();
                return;
            }
            if (event.key === 'F5' || event.code === 'F5') {
                event.preventDefault();
                if (!event.repeat) holdBillRef.current?.();
                return;
            }
            if (event.key !== 'F4' && event.code !== 'F4') return;
            event.preventDefault();
            if (event.repeat) return;
            handlePrintRef.current?.();
        };
        window.addEventListener('keydown', onKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
    }, []);

    const onEntryKey = (field) => (e) => {
        if (e.key === 'Escape') { if (editingId) resetLine(); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (field === 'supplier') selectTypedSupplier();
        if (field === 'item') {
            const item = resolveItem(line.item_code);
            if (!item) { flash('error', 'අයිතමය හමු නොවීය (Item not found)'); return; }
            setStatus({ type: '', text: '' });
            setLine((l) => ({ ...l, item_code: itemLabel(item) }));
            focus(weightRef);
        }
        if (field === 'weight') focus(priceRef);
        if (field === 'price') saveLine();
    };

    // --- Item dropdown: codes starting with what was typed; ↑/↓ to move, Enter to pick ---
    const pickItem = (item) => {
        setLine((l) => ({ ...l, item_code: itemLabel(item) }));
        setItemMenuOpen(false);
        setStatus({ type: '', text: '' });
        focus(weightRef);
    };

    const onItemKeyDown = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!itemMatches.length) return;
            if (!itemMenuOpen) { setItemMenuOpen(true); setItemHighlight(0); return; }
            setItemHighlight((h) => (e.key === 'ArrowDown'
                ? Math.min(h + 1, itemMatches.length - 1)
                : Math.max(h - 1, 0)));
            return;
        }
        if (e.key === 'Enter' && itemMenuOpen && itemMatches.length) {
            e.preventDefault();
            pickItem(itemMatches[Math.min(itemHighlight, itemMatches.length - 1)]);
            return;
        }
        if (e.key === 'Escape' && itemMenuOpen) { setItemMenuOpen(false); return; }
        if (e.key === 'Tab') setItemMenuOpen(false);
        onEntryKey('item')(e);
    };

    const setNum = (key) => (e) => {
        if (/^\d*\.?\d*$/.test(e.target.value)) setLine((l) => ({ ...l, [key]: e.target.value }));
    };

    // --- Calculations ---
    const { totalWeight, totalAmount, itemSummaryData } = useMemo(() => {
        let weight = 0, amount = 0;
        const summaryByItem = {};
        supplierDetails.forEach((r) => {
            const w = parseFloat(r.weight) || 0;
            const a = parseFloat(r.amount) || 0;
            weight += w;
            amount += a;
            const name = r.item_name || r.item_code || 'Unknown Item';
            if (!summaryByItem[name]) summaryByItem[name] = { totalWeight: 0, totalAmount: 0 };
            summaryByItem[name].totalWeight += w;
            summaryByItem[name].totalAmount += a;
        });
        return { totalWeight: weight, totalAmount: amount, itemSummaryData: summaryByItem };
    }, [supplierDetails]);

    const lineTotal = (parseFloat(line.weight) || 0) * (parseFloat(line.price_per_kg) || 0);
    const currentItem = resolveItem(line.item_code);

    const itemMatches = useMemo(() => {
        // Filter on the code part only, so "A - Apple" still matches items starting with A.
        const q = line.item_code.trim().toUpperCase().split(' ')[0];
        if (!q) return items;
        return items.filter((i) => String(i.no).toUpperCase().startsWith(q));
    }, [line.item_code, items]);

    // Keep the highlighted option visible while moving with the arrow keys.
    useEffect(() => {
        if (!itemMenuOpen) return;
        itemMenuRef.current?.children[itemHighlight]?.scrollIntoView({ block: 'nearest' });
    }, [itemHighlight, itemMenuOpen]);

    const filteredPrintedItems = useMemo(() => {
        const q = printedSearchTerm.toLowerCase();
        return summary.printed.filter((b) => String(b.supplier_code).toLowerCase().includes(q) || String(b.bill_no).toLowerCase().includes(q));
    }, [printedSearchTerm, summary.printed]);

    const filteredUnprintedItems = useMemo(() => {
        const q = unprintedSearchTerm.toLowerCase();
        return summary.unprinted.filter((u) => String(u.supplier_code).toLowerCase().includes(q));
    }, [unprintedSearchTerm, summary.unprinted]);

    // --- Profile / NIC image modal ---
    const renderImageModal = () => {
        if (!isImageModalOpen || !supplierProfile) return null;
        const onClose = () => setIsImageModalOpen(false);
        const docs = [
            ['ප්‍රධාන රූපය', supplierProfile.profile_pic, '#3b82f6'],
            ['NIC ඉදිරිපස', supplierProfile.nic_front, '#4b5563'],
            ['NIC පසුපස', supplierProfile.nic_back, '#4b5563'],
        ];
        return (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
                <div style={{ backgroundColor: '#1f2937', borderRadius: '20px', width: '95%', maxWidth: '1000px', maxHeight: '95vh', padding: '25px', border: '1px solid #4b5563', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #374151', paddingBottom: '15px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: 0 }}>{supplierProfile.name || selectedSupplier} - ලේඛන පරීක්ෂාව</h2>
                        <button onClick={onClose} style={{ background: '#374151', border: 'none', color: 'white', width: '35px', height: '35px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.5fr', gap: '20px', overflowY: 'auto' }}>
                        {docs.map(([label, path, border]) => (
                            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>{label}</span>
                                <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: `2px solid ${border}`, backgroundColor: '#111827' }}>
                                    {path
                                        ? <img src={imageUrl(path)} style={{ width: '100%', height: 'auto', maxHeight: '500px', display: 'block', objectFit: 'contain' }} alt={label} />
                                        : <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>ඡායාරූපයක් නොමැත</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // --- Middle panel: data entry + selected bill ---
    const renderDetailsPanel = () => {
        const panelContainerStyle = { backgroundColor: '#091d3d', padding: '24px 30px', borderRadius: '12px', maxWidth: '100%', maxHeight: 'calc(100vh - 60px)', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)', fontFamily: 'Roboto, Arial, sans-serif', marginTop: '-10px', width: '850px', minHeight: '550px' };
        const headerStyle = { borderBottom: '2px solid #e9ecef', paddingBottom: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' };
        const thStyle = { backgroundColor: '#007bff', color: 'white', fontWeight: '600', padding: '6px 8px', textAlign: 'left', position: 'sticky', top: '0', zIndex: 1, fontSize: '0.8rem', whiteSpace: 'nowrap' };
        const labelStyle = { fontSize: '0.75rem', color: '#cbd5e1', display: 'block', marginBottom: '4px', fontWeight: 600 };
        const inputStyle = { width: '100%', padding: '9px 10px', borderRadius: '6px', border: '2px solid transparent', fontSize: '1.05rem', fontWeight: 'bold', color: '#000', backgroundColor: '#fff', boxSizing: 'border-box' };
        const numStyle = { ...inputStyle, textAlign: 'right' };

        return (
            <div style={panelContainerStyle}>
                <div style={headerStyle}>
                    <div>
                        <h2 style={{ fontSize: '1.4rem', color: 'white', margin: 0 }}>
                            ගනුදෙනු විස්තර (බිල් අංකය: <strong>{selectedBillNo || (isUnprintedBill ? 'මුද්‍රණය නොකළ' : 'N/A')}</strong>)
                        </h2>
                        {selectedSupplier && (
                            <div style={{ color: '#cbd5e1', fontSize: '0.9rem', marginTop: '4px' }}>
                                <strong style={{ color: '#fff' }}>{selectedSupplier}</strong>{supplierProfile?.name ? ` · ${supplierProfile.name}` : ''}
                                {balance && (
                                    <span style={{ marginLeft: '10px' }}>
                                        මුළු ණය <strong style={{ color: '#fff' }}>{formatDecimal(balance.loan_amount)}</strong>
                                        {' · '}ගෙවූ <strong style={{ color: '#4ade80' }}>{formatDecimal(balance.paid_amount)}</strong>
                                        {' · '}ඉතිරි <strong style={{ color: '#ffc107' }}>{formatDecimal(balance.outstanding)}</strong>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    {supplierProfile?.profile_pic && (
                        <img
                            src={imageUrl(supplierProfile.profile_pic)}
                            alt="Supplier"
                            onClick={() => setIsImageModalOpen(true)}
                            style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid white', objectFit: 'cover', backgroundColor: '#ccc', cursor: 'pointer', flexShrink: 0 }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    )}
                </div>

                {/* DATA ENTRY */}
                <form
                    onSubmit={(e) => { e.preventDefault(); saveLine(); }}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr .9fr .9fr 1fr auto', gap: '10px', alignItems: 'end', padding: '14px', borderRadius: '8px', backgroundColor: '#ffffff11', border: '1px solid #ffffff33' }}
                >
                    <div>
                        <label style={labelStyle} htmlFor="sr-supplier">සැපයුම්කරු (Supplier)</label>
                        <input id="sr-supplier" ref={supplierRef} list="sr-suppliers" autoComplete="off" value={supplierInput}
                            onChange={(e) => {
                                setSupplierInput(e.target.value.toUpperCase());
                                if (selectedSupplier) { setSelectedSupplier(null); setSelectedBillNo(null); setBalance(null); }
                            }}
                            onKeyDown={onEntryKey('supplier')} placeholder="කේතය" style={{ ...inputStyle, textTransform: 'uppercase' }} />
                        <datalist id="sr-suppliers">
                            {suppliers.map((s) => <option key={s.id} value={String(s.code || '').toUpperCase()}>{s.name}</option>)}
                        </datalist>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <label style={labelStyle} htmlFor="sr-item">
                            අයිතමය {currentItem && <span style={{ color: '#4ade80' }}>· {currentItem.type}</span>}
                            {(selectedSupplier || supplierInput) && currentItem && !editingId && (
                                <span style={{ color: '#ffc107', marginLeft: 6 }}>GRN: {(selectedSupplier || supplierInput).toUpperCase()}-{String(currentItem.no).toUpperCase()}-auto</span>
                            )}
                        </label>
                        <input id="sr-item" ref={itemRef} autoComplete="off" value={line.item_code}
                            role="combobox" aria-expanded={itemMenuOpen} aria-controls="sr-item-menu"
                            onChange={(e) => {
                                setLine((l) => ({ ...l, item_code: e.target.value.toUpperCase() }));
                                setItemMenuOpen(true);
                                setItemHighlight(0);
                            }}
                            onBlur={() => setItemMenuOpen(false)}
                            onKeyDown={onItemKeyDown} placeholder="භාණ්ඩය" style={inputStyle} />
                        {itemMenuOpen && itemMatches.length > 0 && (
                            <ul id="sr-item-menu" ref={itemMenuRef} role="listbox" style={itemMenuStyle}>
                                {itemMatches.map((i, idx) => (
                                    <li key={i.id} role="option" aria-selected={idx === itemHighlight}
                                        // mousedown (not click) so the input doesn't blur and close the menu first
                                        onMouseDown={(e) => { e.preventDefault(); pickItem(i); }}
                                        onMouseEnter={() => setItemHighlight(idx)}
                                        style={{ ...itemOptionStyle, ...(idx === itemHighlight ? itemOptionActiveStyle : null) }}>
                                        <strong>{String(i.no).toUpperCase()}</strong>
                                        <span style={{ opacity: 0.75, marginLeft: 8 }}>{i.type}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div>
                        <label style={labelStyle} htmlFor="sr-weight">බර (kg)</label>
                        <input id="sr-weight" ref={weightRef} inputMode="decimal" value={line.weight} onChange={setNum('weight')} onKeyDown={onEntryKey('weight')} placeholder="බර" style={numStyle} />
                    </div>
                    <div>
                        <label style={labelStyle} htmlFor="sr-price">මිල</label>
                        <input id="sr-price" ref={priceRef} inputMode="decimal" value={line.price_per_kg} onChange={setNum('price_per_kg')} onKeyDown={onEntryKey('price')} placeholder="මිල" style={numStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>එකතුව</label>
                        <input readOnly tabIndex={-1} value={formatDecimal(lineTotal)} style={{ ...numStyle, backgroundColor: '#e2e8f0' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="submit" disabled={saving}
                            style={{ padding: '10px 16px', backgroundColor: editingId ? '#ffc107' : '#28a745', color: editingId ? '#343a40' : 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', height: '44px' }}>
                            {saving ? '...' : editingId ? 'Update' : 'Add'}
                        </button>
                        {editingId && (
                            <button type="button" onClick={resetLine} style={{ padding: '10px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', height: '44px' }}>✕</button>
                        )}
                    </div>
                </form>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 2px 0', minHeight: '22px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Enter → ඊළඟ · මිල මත Enter → සුරකින්න · F4 → මුද්‍රණය · F5 → මුද්‍රණය නොකළ ලෙස තබන්න · පේළියක් ක්ලික් කර වෙනස් කරන්න · Esc → අවලංගු</span>
                    {status.text && (
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: status.type === 'error' ? '#ff6b6b' : '#4ade80' }}>{status.text}</span>
                    )}
                </div>

                {/* BILL LINES */}
                <div style={{ marginTop: '14px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginBottom: '20px' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>බිල් අං:</th>
                                <th style={thStyle}>GRN අංකය</th>
                                <th style={thStyle}>අයිතමය</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>බර</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>මිල</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>අගය</th>
                                <th style={thStyle}>වේලාව</th>
                                <th style={thStyle} />
                            </tr>
                        </thead>
                        <tbody>
                            {selectedSupplier && supplierDetails.length > 0 ? (
                                <>
                                    {supplierDetails.map((record, index) => (
                                        <tr key={record.id} onClick={() => startEdit(record)}
                                            style={{ ...(index % 2 === 0 ? evenRowStyle : oddRowStyle), ...(editingId === record.id ? { backgroundColor: '#fff3cd' } : null) }}>
                                            <td style={detailTdStyle}>{record.bill_no || '—'}</td>
                                            <td style={{ ...detailTdStyle, fontFamily: 'monospace', fontSize: '0.8rem' }}>{record.grn_no || '—'}</td>
                                            <td style={detailTdStyle}><strong>{record.item_name || record.item_code}</strong> <span style={{ color: '#6c757d' }}>({record.item_code})</span></td>
                                            <td style={{ ...detailTdStyle, textAlign: 'right' }}>{formatDecimal(record.weight, 3)}</td>
                                            <td style={{ ...detailTdStyle, textAlign: 'right' }}>{formatDecimal(record.price_per_kg)}</td>
                                            <td style={{ ...detailTdStyle, textAlign: 'right' }}><strong>{formatDecimal(record.amount)}</strong></td>
                                            <td style={detailTdStyle}>{new Date(record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td style={{ ...detailTdStyle, textAlign: 'center' }}>
                                                <button type="button" title="Delete" onClick={(e) => { e.stopPropagation(); deleteRecord(record); }}
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr style={{ ...(supplierDetails.length % 2 === 0 ? evenRowStyle : oddRowStyle), fontWeight: 'bold', borderTop: '2px solid #000', cursor: 'default' }}>
                                        <td style={detailTdStyle} colSpan="3"><strong>TOTALS</strong></td>
                                        <td style={{ ...detailTdStyle, textAlign: 'right' }}>{totalWeight.toFixed(3)}</td>
                                        <td style={detailTdStyle}>-</td>
                                        <td style={{ ...detailTdStyle, textAlign: 'right' }}>{totalAmount.toFixed(2)}</td>
                                        <td style={detailTdStyle} colSpan="2" />
                                    </tr>
                                </>
                            ) : (
                                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#6c757d', fontStyle: 'italic', padding: '50px 0' }}>
                                    {selectedSupplier ? 'තවම පේළි නොමැත — ඉහත ඇතුළත් කරන්න' : 'Select a bill to view details, or type a supplier code above'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {selectedSupplier && Object.keys(itemSummaryData).length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, backgroundColor: '#6c757d' }}>අයිතමය නම</th>
                                <th style={{ ...thStyle, backgroundColor: '#6c757d' }}>සම්පූර්ණ බර</th>
                                <th style={{ ...thStyle, backgroundColor: '#6c757d' }}>මුළු අගය</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(itemSummaryData).map((name, i) => (
                                <tr key={name} style={i % 2 === 0 ? evenRowStyle : oddRowStyle}>
                                    <td style={detailTdStyle}>{name}</td>
                                    <td style={detailTdStyle}>{formatDecimal(itemSummaryData[name].totalWeight, 3)}</td>
                                    <td style={detailTdStyle}>{formatDecimal(itemSummaryData[name].totalAmount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '12px' }}>
                    {selectedSupplier && (
                        <button type="button" onClick={clearCenterPanel}
                            style={{ padding: '10px 20px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '20px' }}>
                            Clear
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handlePrint}
                        disabled={!selectedSupplier || printing || (isUnprintedBill && supplierDetails.length === 0)}
                        style={{
                            padding: '10px 20px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#ffc107', color: '#343a40',
                            border: 'none', borderRadius: '6px', marginTop: '20px',
                            cursor: selectedSupplier ? 'pointer' : 'not-allowed',
                            opacity: selectedSupplier && !(isUnprintedBill && supplierDetails.length === 0) ? 1 : 0.5,
                        }}
                    >
                        🖨️ {printing ? 'Printing...' : selectedSupplier ? (isUnprintedBill ? 'Print & Finalize Bill (F4)' : 'Print Copy (F4)') : 'Select a Bill First'}
                    </button>
                </div>
            </div>
        );
    };

    const navBarStyle = { backgroundColor: '#343a40', padding: '15px 50px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };
    const reportContainerStyle = { minHeight: '100vh', padding: '90px 50px 50px 50px', fontFamily: 'Roboto, Arial, sans-serif', boxSizing: 'border-box', backgroundColor: '#1ec139ff' };
    const navButtonStyle = { padding: '8px 15px', fontSize: '1rem', fontWeight: 'bold', backgroundColor: '#e83e8c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };

    if (isLoading) return <div style={loadingStyle}>Loading Supplier Report...</div>;

    return (
        <>
            <nav style={navBarStyle}>
                <h1 style={{ color: 'white', fontSize: '1.5rem', margin: 0 }}>සැපයුම්කරු වාර්තාව</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <label htmlFor="sr-bill-size" style={{ color: 'white', fontWeight: 'bold', marginBottom: 0 }}>Bill Size:</label>
                    <select id="sr-bill-size" value={billSize} onChange={changeBillSize}
                        style={{ padding: '7px 10px', borderRadius: '5px', fontWeight: 'bold', backgroundColor: '#006400', color: 'white', border: '1px solid #4a5568' }}>
                        <option value="3inch">3 Inch</option>
                        <option value="4inch">4 Inch (A4 · Def)</option>
                    </select>
                    <button style={navButtonStyle} onClick={() => navigate('/sales')}>මුල් පිටුව</button>
                    <button style={navButtonStyle} onClick={() => navigate('/farmer-loans')}>ගොවි ණය</button>
                    <button style={navButtonStyle} onClick={() => navigate('/supplier-loans')}>සැපයුම්කරු ණය</button>
                    <button style={navButtonStyle} onClick={() => navigate('/advance-report')}>Advance Report</button>
                </div>
            </nav>

            <div style={reportContainerStyle}>
                <div style={sectionsContainerStyle}>
                    <div style={printedContainerStyle}>
                        <div style={printedSectionStyle}>
                            <h2 style={{ ...printedHeaderStyle, padding: '0 25px 10px 25px', marginBottom: '15px' }}> මුද්‍රණය කළ </h2>
                            <input type="text" placeholder="🔍 මුද්‍රිත සෙවීම..." value={printedSearchTerm} onChange={(e) => setPrintedSearchTerm(e.target.value)} style={{ ...searchBarStyle, marginBottom: '20px', height: '22px', padding: '12px 25px' }} />
                            {filteredPrintedItems.length === 0 ? (
                                <p style={{ color: '#6c757d', padding: '10px' }}>{printedSearchTerm ? 'No results found' : 'මෙම ප්‍රවර්ගයේ සැපයුම්කරු නොමැත'}</p>
                            ) : (
                                <div style={listContainerStyle}>
                                    {filteredPrintedItems.map((b) => (
                                        <BillListButton key={b.bill_no} label={`${b.supplier_code}-${b.bill_no}`} buttonStyle={printedButtonStyle}
                                            active={selectedBillNo === b.bill_no} onSelect={() => handlePrintedBillClick(b.supplier_code, b.bill_no)} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={centerPanelContainerStyle}>{renderDetailsPanel()}</div>
                    <div style={unprintedContainerStyle}>
                        <div style={unprintedSectionStyle}>
                            <h2 style={{ ...unprintedHeaderStyle, padding: '0 25px 10px 25px', marginBottom: '15px', whiteSpace: 'nowrap' }}>මුද්‍රණය නොකළ</h2>
                            <input type="text" placeholder="🔍 මුද්‍රණ නොකළ සෙවීම..." value={unprintedSearchTerm} onChange={(e) => setUnprintedSearchTerm(e.target.value)} style={{ ...searchBarStyle, marginBottom: '20px', height: '22px', padding: '12px 25px' }} />
                            {filteredUnprintedItems.length === 0 ? (
                                <p style={{ color: '#6c757d', padding: '10px' }}>{unprintedSearchTerm ? 'No results found' : 'මෙම ප්‍රවර්ගයේ සැපයුම්කරු නොමැත'}</p>
                            ) : (
                                <div style={listContainerStyle}>
                                    {filteredUnprintedItems.map((u) => (
                                        <BillListButton key={u.supplier_code} label={`${u.supplier_code} (${u.line_count})`} buttonStyle={unprintedButtonStyle}
                                            active={isUnprintedBill && selectedSupplier === u.supplier_code} onSelect={() => handleUnprintedBillClick(u.supplier_code)} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {renderImageModal()}
        </>
    );
};

// --- STYLES ---
const listButtonBaseStyle = { width: '100%', display: 'block', textAlign: 'left', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontSize: '0.85rem', marginBottom: '2px', boxSizing: 'border-box', lineHeight: '1.4' };
const printedButtonStyle = { ...listButtonBaseStyle, backgroundColor: '#1E88E5', color: 'white' };
const unprintedButtonStyle = { ...listButtonBaseStyle, backgroundColor: '#FF7043', color: 'white' };
const billLabelStyle = { display: 'block', textAlign: 'left', fontSize: '15px', fontWeight: '600' };
const evenRowStyle = { backgroundColor: '#f8f9fa', cursor: 'pointer' };
const oddRowStyle = { backgroundColor: '#ffffff', cursor: 'pointer' };
const detailTdStyle = { padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #dee2e6', whiteSpace: 'normal', color: '#212529' };
const searchBarStyle = { width: '100%', fontSize: '1rem', borderRadius: '6px', border: '1px solid #E0E0E0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', boxSizing: 'border-box', backgroundColor: 'white' };
const sectionsContainerStyle = { display: 'flex', justifyContent: 'space-between', gap: '20px' };
const printedContainerStyle = { width: '200px', flexShrink: 0, marginLeft: '-45px', marginTop: '-10px', border: '2px solid black' };
const unprintedContainerStyle = { width: '180px', flexShrink: 0, marginRight: '-45px', marginTop: '-10px', marginLeft: '0', border: '2px solid black' };
const centerPanelContainerStyle = { flex: '3', minWidth: '700px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' };
const baseSectionStyle = { padding: '25px 0 25px 0', borderRadius: '12px', boxShadow: '0 6px 15px rgba(0, 0, 0, 0.08)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 210px)' };
const printedSectionStyle = { ...baseSectionStyle, backgroundColor: '#1ec139ff', borderLeft: '5px solid #FFFFFF', minHeight: '550px' };
const unprintedSectionStyle = { ...baseSectionStyle, backgroundColor: '#1ec139ff', borderLeft: '5px solid #FFFFFF', minHeight: '550px' };
const printedHeaderStyle = { color: '#07090ae6', borderBottom: '2px solid #1E88E530', flexShrink: 0, fontSize: '1.3rem' };
const unprintedHeaderStyle = { color: '#07090ae6', borderBottom: '2px solid #FF704330', flexShrink: 0, fontSize: '1.3rem' };
const listContainerStyle = { display: 'flex', flexDirection: 'column', gap: '0px', marginTop: '5px', overflowY: 'auto', padding: '0 5px 0 5px', flexGrow: 1 };
const itemMenuStyle = { position: 'absolute', top: '100%', left: 0, minWidth: '100%', width: 'max-content', maxWidth: '320px', maxHeight: '260px', overflowY: 'auto', margin: '2px 0 0', padding: '4px 0', listStyle: 'none', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 8px 20px rgba(0,0,0,0.25)', zIndex: 50 };
const itemOptionStyle = { padding: '6px 12px', cursor: 'pointer', color: '#111827', fontSize: '0.95rem', whiteSpace: 'nowrap' };
const itemOptionActiveStyle = { backgroundColor: '#007bff', color: '#fff' };
const loadingStyle = { textAlign: 'center', padding: '50px', fontSize: '1.5rem', color: '#1E88E5', backgroundColor: '#1ec139ff' };

export default SupplierReport;
