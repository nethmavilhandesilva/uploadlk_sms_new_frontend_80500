import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../api';
import { REPORT_CSS, SHOP, apiError, balanceClass, money, useFullWidthRoot } from './reportShared';
import { CUSTOMER_PARTY } from './partyConfigs';

// 5. All customers (or suppliers — see partyConfigs) balance report:
// balance = opening balance + added - deducted, from the loans page entries.
const COLUMNS = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'telephone_no', label: 'Phone' },
    { key: 'opening_balance', label: 'Opening', num: true },
    { key: 'loans_taken', label: 'add', num: true },
    { key: 'paid_back', label: 'deduct', num: true },
    { key: 'bills_total', label: 'Bills', num: true, billsOnly: true },
    { key: 'balance', label: 'Balance', num: true },
    { key: 'last_entry_date', label: 'Last entry' },
];

const CustomerBalanceReport = ({ party = CUSTOMER_PARTY }) => {
    const columns = COLUMNS.filter((c) => party.hasBills || !c.billsOnly);
    useFullWidthRoot();
    const navigate = useNavigate();
    const [asAt, setAsAt] = useState('');
    const [includeZero, setIncludeZero] = useState(false);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ key: 'balance', dir: 'desc' });
    const [data, setData] = useState({ rows: [], totals: {} });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (asAt) params.as_at = asAt;
            if (includeZero) params.include_zero = 1;
            const res = await api.get(`${party.api}/report`, { params });
            setData(res.data);
        } catch (err) {
            setError(apiError(err, 'Could not load the balance report.'));
        } finally {
            setLoading(false);
        }
    }, [asAt, includeZero, party]);

    useEffect(() => { load(); }, [load]);

    const rows = useMemo(() => {
        const term = search.trim().toUpperCase();
        const filtered = (data.rows || []).filter((r) => !term
            || `${r.code} ${r.name || ''} ${r.telephone_no || ''}`.toUpperCase().includes(term));
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const av = a[sort.key] ?? '';
            const bv = b[sort.key] ?? '';
            return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
        });
    }, [data.rows, search, sort]);

    const totals = useMemo(() => rows.reduce((t, r) => ({
        opening_balance: t.opening_balance + r.opening_balance,
        loans_taken: t.loans_taken + r.loans_taken,
        paid_back: t.paid_back + r.paid_back,
        bills_total: t.bills_total + (r.bills_total || 0),
        balance: t.balance + r.balance,
    }), { opening_balance: 0, loans_taken: 0, paid_back: 0, bills_total: 0, balance: 0 }), [rows]);

    const toggleSort = (key) => setSort((s) => (s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: ['code', 'name', 'telephone_no'].includes(key) ? 'asc' : 'desc' }));

    const exportExcel = () => {
        const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
            Code: r.code,
            Name: r.name || '',
            Phone: r.telephone_no || '',
            Opening: r.opening_balance,
            [party.addLabel]: r.loans_taken,
            [party.deductLabel]: r.paid_back,
            ...(party.hasBills ? { Bills: r.bills_total || 0 } : {}),
            Balance: r.balance,
            'Last entry': r.last_entry_date || '',
        })));
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, `${party.label} balances`);
        XLSX.writeFile(book, `${party.key}-balances${asAt ? `-${asAt}` : ''}.xlsx`);
    };

    const openStatement = (code) => navigate(`${party.statementPath}/${encodeURIComponent(code)}${asAt ? `?to=${asAt}` : ''}`);

    return (
        <div className="cr-page">
            <style>{REPORT_CSS}</style>
            <div className="cr-panel cr-printable">
                <div className="cr-print-head">
                    <div className="shop">{SHOP.name}</div>
                    <div className="line">{SHOP.address} · {SHOP.phones}</div>
                    <div className="line" style={{ fontWeight: 700, marginTop: 6 }}>All {party.label}s Balance Report{asAt ? ` — as at ${asAt}` : ''}</div>
                </div>

                <div className="cr-head no-print">
                    <div>
                        <h3 className="cr-title">{party.titles.report}</h3>
                        <div className="cr-sub">Balance = {party.formula}. Click a {party.label.toLowerCase()} for the full statement.</div>
                    </div>
                    <div className="d-flex gap-2">
                        <button type="button" className="cr-btn ghost" onClick={() => navigate(party.homePath)}>← {party.homeLabel}</button>
                        <button type="button" className="cr-btn green" onClick={exportExcel} disabled={!rows.length}>Excel</button>
                        <button type="button" className="cr-btn dark" onClick={() => window.print()} disabled={!rows.length}>Print</button>
                    </div>
                </div>

                <div className="cr-toolbar no-print">
                    <div>
                        <label htmlFor="br-asat">As at date</label>
                        <input id="br-asat" type="date" className="cr-input" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
                    </div>
                    <div>
                        <label htmlFor="br-search">Search</label>
                        <input id="br-search" type="search" className="cr-input" style={{ width: 240 }} placeholder="Code, name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <label className="d-flex align-items-center gap-2 mb-1" style={{ textTransform: 'none', fontSize: '.85rem', color: '#374151' }}>
                        <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} /> Include settled (zero balance) {party.plural}
                    </label>
                    {asAt && <button type="button" className="cr-btn ghost" onClick={() => setAsAt('')}>Clear date</button>}
                </div>

                <div className="cr-cards">
                    <div className="cr-card"><div className="lbl">{party.label}s</div><div className="val">{rows.length}</div></div>
                    <div className="cr-card"><div className="lbl">Opening balances</div><div className="val">{money(totals.opening_balance)}</div></div>
                    <div className="cr-card"><div className="lbl">{party.addLabel}</div><div className="val">{money(totals.loans_taken)}</div></div>
                    <div className="cr-card"><div className="lbl">{party.deductLabel}</div><div className="val">{money(totals.paid_back)}</div></div>
                    {party.hasBills && <div className="cr-card"><div className="lbl">Bills</div><div className="val">{money(totals.bills_total)}</div></div>}
                    <div className="cr-card"><div className="lbl">Total balance</div><div className={`val ${balanceClass(totals.balance, party)}`}>{money(totals.balance)}</div></div>
                </div>

                {error && <div className="cr-msg err">{error}</div>}

                <div className="cr-table-wrap">
                    <table className="cr-table">
                        <thead>
                            <tr>
                                <th className="c">#</th>
                                {columns.map((c) => (
                                    <th key={c.key} className={`sortable ${c.num ? 'r' : ''}`} onClick={() => toggleSort(c.key)}>
                                        {c.label === 'add' ? party.addLabel : c.label === 'deduct' ? party.deductLabel : c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={columns.length + 1} className="c cr-muted">Loading…</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={columns.length + 1} className="c cr-muted">No {party.plural} with a balance</td></tr>
                            ) : rows.map((r, i) => (
                                <tr key={r.code} className="click" onClick={() => openStatement(r.code)}>
                                    <td className="c cr-muted">{i + 1}</td>
                                    <td className="fw-bold">{r.code}</td>
                                    <td>{r.name || '—'}</td>
                                    <td>{r.telephone_no || '—'}</td>
                                    <td className="r">{money(r.opening_balance)}</td>
                                    <td className="r">{money(r.loans_taken)}</td>
                                    <td className="r">{money(r.paid_back)}{r.cheque_payments > 0 && <span className="cr-pill amber ms-1">{r.cheque_payments} chq</span>}</td>
                                    {party.hasBills && <td className="r">{r.bills_total ? money(r.bills_total) : <span className="cr-muted">—</span>}{r.bill_count > 0 && <span className="cr-muted" style={{ fontSize: '.75rem' }}> ({r.bill_count})</span>}</td>}
                                    <td className={`r ${balanceClass(r.balance, party)}`}>{money(r.balance)}</td>
                                    <td>{r.last_entry_date || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                        {rows.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td colSpan={4}>Total ({rows.length})</td>
                                    <td className="r">{money(totals.opening_balance)}</td>
                                    <td className="r">{money(totals.loans_taken)}</td>
                                    <td className="r">{money(totals.paid_back)}</td>
                                    {party.hasBills && <td className="r">{money(totals.bills_total)}</td>}
                                    <td className={`r ${balanceClass(totals.balance, party)}`}>{money(totals.balance)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CustomerBalanceReport;
