import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { REPORT_CSS, apiError, balanceClass, money, todayLocal } from './reportShared';
import { CUSTOMER_PARTY } from './partyConfigs';

// Enter / edit each customer's (or supplier's — see partyConfigs) opening balance.
// Entries on the loans page are applied to it: balance = opening + added - deducted.
const CustomerOpeningBalances = ({ party = CUSTOMER_PARTY }) => {
    const [customers, setCustomers] = useState([]);
    const [total, setTotal] = useState({ opening: 0, balance: 0 });
    const [form, setForm] = useState({ code: '', amount: '', date: todayLocal() });
    const [search, setSearch] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get(`${party.api}/openings`);
            setCustomers(res.data.rows || []);
            setTotal({ opening: res.data.total || 0, balance: res.data.total_balance || 0 });
        } catch (err) {
            setMessage({ ok: false, text: apiError(err, `Could not load ${party.plural}.`) });
        }
    }, [party]);

    useEffect(() => { load(); }, [load]);

    const byCode = useMemo(
        () => new Map(customers.map((c) => [String(c.code || '').toUpperCase(), c])),
        [customers]
    );
    const selected = byCode.get(form.code.trim().toUpperCase());

    const pick = (customer) => {
        setForm({
            code: String(customer.code || '').toUpperCase(),
            amount: Number(customer.opening_balance) ? String(Number(customer.opening_balance)) : '',
            date: customer.opening_balance_date ? String(customer.opening_balance_date).slice(0, 10) : todayLocal(),
        });
        setMessage(null);
    };

    const save = async (e) => {
        e.preventDefault();
        if (!selected) { setMessage({ ok: false, text: `Select a ${party.label.toLowerCase()} from the list.` }); return; }
        const amount = parseFloat(form.amount);
        if (Number.isNaN(amount)) { setMessage({ ok: false, text: 'Enter the opening balance amount.' }); return; }
        setSaving(true);
        try {
            await api.put(`${party.api}/openings/${selected.id}`, { opening_balance: amount, opening_balance_date: form.date || null });
            setMessage({ ok: true, text: `Opening balance saved for ${selected.code}: Rs. ${money(amount)}` });
            setForm({ code: '', amount: '', date: form.date });
            load();
        } catch (err) {
            setMessage({ ok: false, text: apiError(err, 'Could not save the opening balance.') });
        } finally {
            setSaving(false);
        }
    };

    const term = search.trim().toUpperCase();
    const rows = customers.filter((c) => (showAll || Number(c.opening_balance) !== 0 || Number(c.balance) !== 0)
        && (!term || `${c.code} ${c.name || ''}`.toUpperCase().includes(term)));

    return (
        <div className="cr-panel mt-4" id="opening-balance-section">
            <style>{REPORT_CSS}</style>
            <div className="cr-head">
                <div>
                    <h4 className="cr-title">{party.titles.opening}</h4>
                    <div className="cr-sub">
                        Balance brought forward for each {party.label.toLowerCase()}. Entries on the loans page are applied to it:
                        balance = {party.formula}. Opening total <strong>Rs. {money(total.opening)}</strong> · Balance total <strong>Rs. {money(total.balance)}</strong>
                    </div>
                </div>
            </div>

            {message && <div className={`cr-msg ${message.ok ? 'ok' : 'err'}`}>{message.text}</div>}

            <form className="cr-toolbar" onSubmit={save}>
                <div>
                    <label htmlFor="ob-code">{party.label}</label>
                    <input id="ob-code" list="ob-customers" className="cr-input text-uppercase" style={{ width: 200 }} autoComplete="off"
                        value={form.code} onChange={(e) => {
                            const code = e.target.value.toUpperCase();
                            const match = byCode.get(code.trim());
                            if (match) pick(match); else setForm((f) => ({ ...f, code }));
                        }} placeholder={`${party.label} code`} />
                    <datalist id="ob-customers">
                        {customers.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
                    </datalist>
                </div>
                <div>
                    <label>Name</label>
                    <input className="cr-input" style={{ width: 220 }} readOnly tabIndex={-1} value={selected?.name || ''} placeholder="—" />
                </div>
                <div>
                    <label htmlFor="ob-amount">Opening balance (Rs.)</label>
                    <input id="ob-amount" type="number" step="0.01" className="cr-input" style={{ width: 170, textAlign: 'right' }}
                        value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                    <label htmlFor="ob-date">As of date</label>
                    <input id="ob-date" type="date" className="cr-input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                {selected && (
                    <div>
                        <label>Balance after deductions</label>
                        <div className="cr-input" style={{ width: 230, background: '#f8fafc' }}>
                            {money((parseFloat(form.amount) || 0) + selected.loans_taken - selected.paid_back + (selected.bills_total || 0))}
                            <span className="cr-muted" style={{ fontSize: '.75rem' }}> (+{money(selected.loans_taken)} {party.addLabel.toLowerCase()}, −{money(selected.paid_back)} {party.deductLabel.toLowerCase()}{party.hasBills ? `, +${money(selected.bills_total || 0)} bills` : ''})</span>
                        </div>
                    </div>
                )}
                <button type="submit" className="cr-btn green" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                {form.code && <button type="button" className="cr-btn ghost" onClick={() => setForm({ code: '', amount: '', date: todayLocal() })}>Clear</button>}
            </form>

            <div className="cr-toolbar">
                <input type="search" className="cr-input" style={{ width: 240 }} placeholder={`Search ${party.label.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
                <label className="d-flex align-items-center gap-2 mb-0" style={{ textTransform: 'none', fontSize: '.85rem', color: '#374151' }}>
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show {party.plural} without an opening balance
                </label>
            </div>

            <div className="cr-table-wrap" style={{ maxHeight: 320 }}>
                <table className="cr-table">
                    <thead>
                        <tr><th>Code</th><th>Name</th><th>Phone</th><th>As of</th><th className="r">Opening balance</th><th className="r">{party.addLabel}</th><th className="r">{party.deductLabel}</th>{party.hasBills && <th className="r">Bills</th>}<th className="r">Balance</th><th /></tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={party.hasBills ? 10 : 9} className="c cr-muted">{showAll ? `No ${party.plural} found` : 'No opening balances entered yet'}</td></tr>
                        ) : rows.map((c) => (
                            <tr key={c.id} className="click" onClick={() => pick(c)}>
                                <td className="fw-bold">{c.code}</td>
                                <td>{c.name || '—'}</td>
                                <td>{c.telephone_no || '—'}</td>
                                <td>{c.opening_balance_date ? String(c.opening_balance_date).slice(0, 10) : '—'}</td>
                                <td className="r fw-bold">{money(c.opening_balance)}</td>
                                <td className="r">{c.loans_taken ? `+${money(c.loans_taken)}` : '—'}</td>
                                <td className="r">{c.paid_back ? `−${money(c.paid_back)}` : '—'}</td>
                                {party.hasBills && <td className="r">{c.bills_total ? `+${money(c.bills_total)}` : '—'}</td>}
                                <td className={`r ${balanceClass(c.balance, party)}`}>{money(c.balance)}</td>
                                <td className="r"><span className="cr-pill blue">Edit</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CustomerOpeningBalances;
