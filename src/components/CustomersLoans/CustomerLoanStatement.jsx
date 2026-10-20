import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api';
import { REPORT_CSS, SHOP, apiError, balanceClass, money, useFullWidthRoot } from './reportShared';
import { CUSTOMER_PARTY } from './partyConfigs';

// 6. One customer's loan details in a single report, from the customer loans
// page entries: opening balance, every loan taken ('today') and every amount
// paid back ('old'), with a running balance.
const TYPE_PILLS = {
    opening: ['blue', 'Opening'],
    loan: ['red', 'Loan taken'],
    paid: ['green', 'Paid back'],
    bill: ['amber', 'Bill'],
};

const CustomerLoanStatement = ({ party = CUSTOMER_PARTY }) => {
    useFullWidthRoot();
    const navigate = useNavigate();
    const { code: routeCode } = useParams();
    const [searchParams] = useSearchParams();
    const [customers, setCustomers] = useState([]);
    const [codeInput, setCodeInput] = useState(routeCode ? routeCode.toUpperCase() : '');
    const [code, setCode] = useState(routeCode ? routeCode.toUpperCase() : '');
    const [range, setRange] = useState({ from: '', to: searchParams.get('to') || '' });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get(party.listApi)
            .then((res) => setCustomers(Array.isArray(res.data) ? res.data : (res.data?.data || [])))
            .catch(() => setCustomers([]));
    }, [party]);

    // No customer chosen → every customer's entries (newest first).
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (range.from) params.from = range.from;
            if (range.to) params.to = range.to;
            const url = code ? `${party.api}/${encodeURIComponent(code)}/statement` : `${party.api}/entries`;
            const res = await api.get(url, { params });
            setData(res.data);
        } catch (err) {
            setError(apiError(err, 'Could not load the statement.'));
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [code, range, party]);

    useEffect(() => { load(); }, [load]);

    const openCode = (value) => {
        const next = String(value || '').trim().toUpperCase();
        setCodeInput(next);
        setCode(next);
        navigate(next ? `${party.statementPath}/${encodeURIComponent(next)}` : party.statementPath, { replace: true });
    };

    const isAll = !code;
    // While switching between "all" and one customer the old response is still in
    // state for a render; only show data that matches the current mode.
    const dataMatches = !!data && (isAll ? !data.party : !!data.party);
    const s = data?.summary;
    const entries = data?.entries || [];
    const cols = isAll ? 8 : 7;

    return (
        <div className="cr-page">
            <style>{REPORT_CSS}</style>
            <div className="cr-panel cr-printable">
                <div className="cr-print-head">
                    <div className="shop">{SHOP.name}</div>
                    <div className="line">{SHOP.address} · {SHOP.phones}</div>
                    <div className="line" style={{ fontWeight: 700, marginTop: 6 }}>
                        {isAll ? `All ${party.label}s Loan Entries` : `${party.label} Loan Statement`}{range.from || range.to ? ` — ${range.from || 'start'} to ${range.to || 'today'}` : ''}
                    </div>
                </div>

                <div className="cr-head no-print">
                    <div>
                        <h3 className="cr-title">{party.titles.statement}</h3>
                        <div className="cr-sub">Opening balance and every entry, with a running balance. Balance = {party.formula}.</div>
                    </div>
                    <div className="d-flex gap-2">
                        <button type="button" className="cr-btn ghost" onClick={() => navigate(party.balancesPath)}>All balances</button>
                        <button type="button" className="cr-btn ghost" onClick={() => navigate(party.homePath)}>← {party.homeLabel}</button>
                        <button type="button" className="cr-btn dark" onClick={() => window.print()} disabled={!dataMatches}>Print</button>
                    </div>
                </div>

                <form className="cr-toolbar no-print" onSubmit={(e) => { e.preventDefault(); openCode(codeInput); }}>
                    <div>
                        <label htmlFor="st-code">{party.label}</label>
                        <input id="st-code" list="st-customers" className="cr-input text-uppercase" style={{ width: 200 }} autoComplete="off"
                            value={codeInput} placeholder={`All ${party.plural}`}
                            onChange={(e) => {
                                const value = e.target.value.toUpperCase();
                                setCodeInput(value);
                                // Empty box shows every customer's records; a full code opens that customer.
                                if (!value.trim() || customers.some((c) => String(party.listCode(c) || '').toUpperCase() === value)) openCode(value);
                            }} />
                        <datalist id="st-customers">
                            {customers.map((c) => <option key={c.id} value={String(party.listCode(c) || '').toUpperCase()}>{c.name}</option>)}
                        </datalist>
                    </div>
                    <button type="submit" className="cr-btn primary">Show</button>
                    {!isAll && <button type="button" className="cr-btn ghost" onClick={() => openCode('')}>All {party.plural}</button>}
                    <div>
                        <label htmlFor="st-from">From</label>
                        <input id="st-from" type="date" className="cr-input" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                    </div>
                    <div>
                        <label htmlFor="st-to">To</label>
                        <input id="st-to" type="date" className="cr-input" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                    </div>
                    {(range.from || range.to) && <button type="button" className="cr-btn ghost" onClick={() => setRange({ from: '', to: '' })}>All dates</button>}
                </form>

                {error && <div className="cr-msg err">{error}</div>}
                {loading && <div className="cr-sub">Loading…</div>}

                {dataMatches && !loading && (
                    <>
                        <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                            {isAll ? (
                                <div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>All {party.plural}</div>
                                    <div className="cr-sub">Newest first · each balance is that {party.label.toLowerCase()}'s running balance · click a {party.label.toLowerCase()} to open their statement</div>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{data.party.code} {data.party.name ? `· ${data.party.name}` : ''}</div>
                                    <div className="cr-sub">{[data.party.telephone_no, data.party.address].filter(Boolean).join(' · ') || ' '}</div>
                                </div>
                            )}
                            <div className="cr-sub" style={{ textAlign: 'right' }}>Printed {new Date().toLocaleString()}</div>
                        </div>

                        <div className="cr-cards">
                            {isAll && <div className="cr-card"><div className="lbl">{party.label}s</div><div className="val">{s.count}</div></div>}
                            {isAll && range.from && <div className="cr-card"><div className="lbl">Brought forward</div><div className="val">{money(data.brought_forward)}</div></div>}
                            <div className="cr-card"><div className="lbl">Opening balance</div><div className="val">{money(s.opening_balance)}</div></div>
                            <div className="cr-card"><div className="lbl">{party.addLabel} ({s.loan_entries})</div><div className="val">{money(s.loans_taken)}</div></div>
                            <div className="cr-card"><div className="lbl">{party.deductLabel} ({s.payment_entries})</div><div className="val">{money(s.paid_back)}</div></div>
                            {party.hasBills && <div className="cr-card"><div className="lbl">Bills ({s.bill_entries || 0})</div><div className="val">{money(s.bills_total)}</div></div>}
                            <div className="cr-card"><div className="lbl">Closing balance</div><div className={`val ${balanceClass(s.closing_balance, party)}`}>{money(s.closing_balance)}</div></div>
                        </div>

                        <div className="cr-table-wrap">
                            <table className="cr-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>{isAll && <th>{party.label}</th>}<th>Type</th><th>Bill</th><th>Details</th>
                                        <th className="r">{party.positiveIsCredit ? 'In (+)' : 'Loan (+)'}</th><th className="r">{party.positiveIsCredit ? 'Out (−)' : 'Paid (−)'}</th><th className="r">{isAll ? `${party.label} balance` : 'Balance'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!isAll && range.from && (
                                        <tr><td>{range.from}</td><td><span className="cr-pill blue">B/F</span></td><td /><td>Balance brought forward</td><td /><td /><td className="r fw-bold">{money(data.brought_forward)}</td></tr>
                                    )}
                                    {entries.length === 0 ? (
                                        <tr><td colSpan={cols} className="c cr-muted">No entries in this period</td></tr>
                                    ) : entries.map((e, i) => {
                                        const [defaultTone, defaultLabel] = TYPE_PILLS[e.type] || ['gray', e.type];
                                        const label = e.type === 'loan' ? party.addPill : e.type === 'paid' ? party.deductPill : defaultLabel;
                                        // Customers: amounts that add (paid back) are good, deductions are red.
                                        const tone = party.positiveIsCredit && e.type === 'loan' ? 'green'
                                            : party.positiveIsCredit && e.type === 'paid' ? 'red' : defaultTone;
                                        return (
                                            <tr key={i}>
                                                <td className="text-nowrap">{e.date || '—'}</td>
                                                {isAll && (
                                                    <td>
                                                        <button type="button" className="btn btn-link p-0 fw-bold" style={{ color: '#4338ca' }} onClick={() => openCode(e.code)}>{e.code}</button>
                                                        {e.name && <div className="cr-muted" style={{ fontSize: '.78rem' }}>{e.name}</div>}
                                                    </td>
                                                )}
                                                <td><span className={`cr-pill ${tone}`}>{label}</span></td>
                                                <td>{e.bill_no ? `#${e.bill_no}` : <span className="cr-muted">—</span>}</td>
                                                <td>{e.description}</td>
                                                <td className="r">{e.debit ? money(e.debit) : ''}</td>
                                                <td className="r">{e.credit ? money(e.credit) : ''}</td>
                                                <td className={`r ${balanceClass(e.balance, party)}`}>{money(e.balance)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={cols - 3}>{isAll ? `Total balance (all ${party.plural})` : 'Closing balance'}</td>
                                        <td className="r">{money(entries.reduce((t, e) => t + e.debit, 0))}</td>
                                        <td className="r">{money(entries.reduce((t, e) => t + e.credit, 0))}</td>
                                        <td className={`r ${balanceClass(s.closing_balance, party)}`}>{money(s.closing_balance)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                    </>
                )}
            </div>
        </div>
    );
};

export default CustomerLoanStatement;
