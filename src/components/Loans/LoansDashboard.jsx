import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api';
import Avatar from './Avatar';
import { SCOPED_CSS, errorMessage, formatAmount } from './loansShared';

// Shared loans dashboard for customers (sales entry lines) and suppliers
// (supplier transaction lines). Each party's lines are loans that payments
// settle; the `config` prop supplies endpoints, labels and which payment
// methods exist. Cheque features (pending cheques, cheque register) are only
// shown when config.cheques is true — a cheque counts as paid once cleared.

const todayIso = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

const METHOD_LABELS = { cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank transfer' };
const METHOD_ICONS = { cash: 'payments', cheque: 'receipt_long', bank_transfer: 'account_balance' };
const CHEQUE_PILLS = { pending: 'amber', cleared: 'green', bounced: 'red' };

const ALL_STATUS_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'outstanding', label: 'Outstanding' },
    { key: 'cheques', label: 'Pending cheques' },
    { key: 'settled', label: 'Settled' },
];

const ALL_SORT_COLUMNS = [
    { key: 'code', label: 'Party', align: 'start' },
    { key: 'bill_no', label: 'Bill', align: 'start' },
    { key: 'loan_amount', label: 'Loaned', align: 'end' },
    { key: 'paid_amount', label: 'Paid', align: 'end' },
    { key: 'pending_cheques', label: 'Pending cheques', align: 'end' },
    { key: 'outstanding', label: 'Outstanding', align: 'end' },
    { key: 'last_loan_date', label: 'Last loan', align: 'start' },
];

// Animates a number from its previous value to the new one.
const useCountUp = (target, duration = 700) => {
    const [value, setValue] = useState(0);
    useEffect(() => {
        const end = Number(target) || 0;
        let frame;
        let startValue;
        const startTime = performance.now();
        setValue((prev) => { startValue = prev; return prev; });
        const tick = (now) => {
            const t = Math.min(1, (now - startTime) / duration);
            const eased = 1 - (1 - t) ** 3;
            setValue((startValue ?? 0) + (end - (startValue ?? 0)) * eased);
            if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, duration]);
    return value;
};

const emptyPayment = {
    amount: '',
    payment_method: 'cash',
    payment_date: '',
    cheque_no: '',
    cheque_date: todayIso(),
    bank: '',
    reference_no: '',
    notes: '',
};

const SummaryCard = ({ label, amount, sub, color, icon, active, onClick, delay = 0, colClass = 'col-6 col-xl-3' }) => {
    const animated = useCountUp(amount);
    return (
        <div className={colClass}>
            <div
                className={`csl-kpi ${active ? 'active' : ''}`}
                style={{ '--tone': color, animationDelay: `${delay}ms` }}
                onClick={onClick}
                role="button"
            >
                <div className="d-flex justify-content-between align-items-start">
                    <div className="csl-kpi-label">{label}</div>
                    <div className="csl-kpi-icon"><i className="material-icons">{icon}</i></div>
                </div>
                <div className="csl-kpi-value">Rs. {formatAmount(animated)}</div>
                {sub && <div className="csl-kpi-sub">{sub}</div>}
            </div>
        </div>
    );
};

const PaidBar = ({ loan, paid, pending }) => {
    const total = Math.max(loan, 0.01);
    const paidPct = Math.min(100, (paid / total) * 100);
    const pendingPct = Math.min(100 - paidPct, (pending / total) * 100);
    return (
        <div className="csl-bar" title={`${paidPct.toFixed(0)}% paid${pendingPct ? `, ${pendingPct.toFixed(0)}% in pending cheques` : ''}`}>
            <span className="paid" style={{ width: `${paidPct}%` }} />
            <span className="pend" style={{ width: `${pendingPct}%` }} />
        </div>
    );
};

const PaymentModal = ({ code: customer, outstanding, onClose, onSaved, paymentUrl, methods }) => {
    const [form, setForm] = useState({ ...emptyPayment, amount: outstanding > 0 ? outstanding.toFixed(2) : '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const isCheque = form.payment_method === 'cheque';
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const payload = { ...form, amount: parseFloat(form.amount) };
            if (!isCheque) {
                delete payload.cheque_no;
                delete payload.cheque_date;
            }
            await api.post(paymentUrl(customer), payload);
            onSaved();
        } catch (err) {
            setError(errorMessage(err, 'Could not save the payment.'));
        } finally {
            setSaving(false);
        }
    };

    // Esc closes the dialog.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const quickAmounts = outstanding > 0
        ? [['Full', outstanding], ['Half', outstanding / 2], ['Rs. 1,000', 1000], ['Rs. 5,000', 5000]].filter(([, v]) => v <= outstanding || v === outstanding)
        : [];

    return (
        <div className="csl-overlay" onClick={onClose}>
            <form className="csl-modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
                <div className="csl-modal-head">
                    <div className="d-flex align-items-center gap-2">
                        <Avatar code={customer} />
                        <div>
                            <div className="fw-bold fs-5">Record payment</div>
                            <div className="small text-muted">{customer} · Outstanding <span className="csl-amt-red">Rs. {formatAmount(outstanding)}</span></div>
                        </div>
                    </div>
                    <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
                </div>
                <div className="csl-modal-body">
                    <div className="csl-method" style={{ gridTemplateColumns: `repeat(${methods.length},1fr)` }}>
                        {methods.map((key) => [key, METHOD_LABELS[key]]).map(([key, label]) => (
                            <button key={key} type="button" className={form.payment_method === key ? 'active' : ''}
                                onClick={() => setForm((f) => ({ ...f, payment_method: key }))}>
                                <i className="material-icons">{METHOD_ICONS[key]}</i>{label}
                            </button>
                        ))}
                    </div>

                    <div className="row g-2">
                        <div className="col-6">
                            <label>Amount (Rs.)</label>
                            <input type="number" step="0.01" min="0.01" className="form-control fw-bold" value={form.amount} onChange={set('amount')} required autoFocus />
                        </div>
                        <div className="col-6">
                            <label>Payment date <span className="fw-normal">(blank = business date)</span></label>
                            <input type="date" className="form-control" value={form.payment_date} onChange={set('payment_date')} />
                        </div>
                        {quickAmounts.length > 0 && (
                            <div className="col-12 csl-quick">
                                {quickAmounts.map(([label, value]) => (
                                    <button key={label} type="button" onClick={() => setForm((f) => ({ ...f, amount: Number(value).toFixed(2) }))}>{label}</button>
                                ))}
                            </div>
                        )}

                        {isCheque && (
                            <>
                                <div className="col-6">
                                    <label>Cheque no</label>
                                    <input type="text" className="form-control" value={form.cheque_no} onChange={set('cheque_no')} required />
                                </div>
                                <div className="col-6">
                                    <label>Cheque date</label>
                                    <input type="date" className="form-control" value={form.cheque_date} onChange={set('cheque_date')} required />
                                </div>
                            </>
                        )}
                        {form.payment_method !== 'cash' && (
                            <div className="col-12">
                                <label>Bank</label>
                                <input type="text" className="form-control" value={form.bank} onChange={set('bank')} required={isCheque} />
                            </div>
                        )}
                        {form.payment_method === 'bank_transfer' && (
                            <div className="col-12">
                                <label>Reference no</label>
                                <input type="text" className="form-control" value={form.reference_no} onChange={set('reference_no')} />
                            </div>
                        )}
                        <div className="col-12">
                            <label>Notes</label>
                            <textarea className="form-control" rows="2" value={form.notes} onChange={set('notes')} />
                        </div>
                    </div>

                    {isCheque && (
                        <div className="csl-pill amber mt-3 w-100 justify-content-start" style={{ borderRadius: 10, padding: '8px 12px', fontWeight: 600 }}>
                            <i className="material-icons" style={{ fontSize: 18 }}>info</i>
                            Recorded as pending — it reduces the loan only once you mark it cleared.
                        </div>
                    )}
                    {error && <div className="csl-pill red mt-3 w-100" style={{ borderRadius: 10, padding: '8px 12px' }}>{error}</div>}
                </div>
                <div className="csl-modal-foot">
                    <button type="button" className="csl-btn ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="csl-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save payment'}</button>
                </div>
            </form>
        </div>
    );
};

const ChequeActions = ({ payment, onChange }) => (
    <span className="text-nowrap">
        {payment.cheque_status !== 'cleared' && (
            <button type="button" className="csl-act clear" onClick={(e) => { e.stopPropagation(); onChange(payment, 'cleared'); }}>✓ Clear</button>
        )}
        {payment.cheque_status !== 'bounced' && (
            <button type="button" className="csl-act bounce" onClick={(e) => { e.stopPropagation(); onChange(payment, 'bounced'); }}>✕ Bounce</button>
        )}
        {payment.cheque_status !== 'pending' && (
            <button type="button" className="csl-act pending" onClick={(e) => { e.stopPropagation(); onChange(payment, 'pending'); }}>↺ Pending</button>
        )}
    </span>
);

const LoansDashboard = ({ config }) => {
    const { cheques: withCheques } = config;
    const STATUS_FILTERS = withCheques ? ALL_STATUS_FILTERS : ALL_STATUS_FILTERS.filter((f) => f.key !== 'cheques');
    const SORT_COLUMNS = ALL_SORT_COLUMNS
        .filter((c) => withCheques || c.key !== 'pending_cheques')
        .map((c) => (c.key === 'code' ? { ...c, label: config.partyLabel } : c));
    const [data, setData] = useState({ customers: [], totals: {} });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('customers');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    // Newest entered bills first; clicking a column header re-sorts.
    const [sort, setSort] = useState({ key: 'last_entered_at', dir: 'desc' });

    const [selected, setSelected] = useState(null);
    // Bill shown in the detail panel: 'ALL', '' for unprinted lines, or a bill number.
    const [selectedBill, setSelectedBill] = useState('ALL');
    const [detail, setDetail] = useState(null);
    const [detailTab, setDetailTab] = useState('loans');
    const [detailRange, setDetailRange] = useState({ from: '', to: '' });
    const [showPayment, setShowPayment] = useState(false);

    const [cheques, setCheques] = useState([]);
    const [chequeFilter, setChequeFilter] = useState('pending');
    const [toast, setToast] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const closePayment = useCallback(() => setShowPayment(false), []);

    const notify = (message) => {
        setToast(message);
        setTimeout(() => setToast(''), 2500);
    };

    const loadSummary = useCallback(async () => {
        setError('');
        try {
            const res = await api.get(config.summaryUrl);
            setData({
                // One row per party + bill; rowKey keeps several bills of the same party apart.
                customers: (res.data[config.listKey] || []).map((r) => ({
                    ...r,
                    code: r[config.codeField],
                    name: r[config.nameField],
                    rowKey: `${r[config.codeField]}|${r.bill_no ?? ''}`,
                })),
                totals: res.data.totals || {},
            });
        } catch (err) {
            setError(errorMessage(err, 'ණය දත්ත ලබා ගැනීමට නොහැකි විය (Failed to load loans).'));
        } finally {
            setLoading(false);
        }
    }, [config]);

    const loadDetail = useCallback(async (code) => {
        try {
            const res = await api.get(config.detailUrl(code));
            setDetail({ ...res.data, name: res.data[config.nameField] });
        } catch (err) {
            setDetail(null);
            notify(errorMessage(err, 'Could not load details.'));
        }
    }, [config]);

    const loadCheques = useCallback(async () => {
        try {
            const res = await api.get('/customer-sale-loan-payments/cheques', {
                params: chequeFilter === 'all' ? {} : { status: chequeFilter },
            });
            setCheques(res.data.cheques || []);
        } catch (err) {
            notify(errorMessage(err, 'Could not load cheques.'));
        }
    }, [chequeFilter]);


    // body is a centring flexbox app-wide, which shrinks #root to its content;
    // stretch it while this page is open so the dashboard uses the full width.
    useEffect(() => {
        const root = document.getElementById('root');
        if (!root) return undefined;
        const previous = root.style.width;
        root.style.width = '100%';
        return () => { root.style.width = previous; };
    }, []);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { if (withCheques && tab === 'cheques') loadCheques(); }, [withCheques, tab, loadCheques]);

    const refreshAll = useCallback(() => {
        loadSummary();
        if (selected) loadDetail(selected);
        if (withCheques && tab === 'cheques') loadCheques();
    }, [loadSummary, loadDetail, loadCheques, selected, tab, withCheques]);

    const openCustomer = (code, billNo = 'ALL') => {
        setSelected(code);
        setSelectedBill(billNo ?? '');
        setDetail(null);
        setDetailTab('loans');
        loadDetail(code);
    };

    const changeChequeStatus = async (payment, status) => {
        try {
            await api.patch(`/customer-sale-loan-payments/${payment.id}/cheque-status`, { cheque_status: status });
            notify(`Cheque ${payment.cheque_no} marked ${status}`);
            refreshAll();
        } catch (err) {
            notify(errorMessage(err, 'Could not update the cheque.'));
        }
    };

    const deletePayment = async (payment) => {
        if (!window.confirm(`Delete this ${METHOD_LABELS[payment.payment_method]} payment of Rs. ${formatAmount(payment.amount)}?`)) return;
        try {
            await api.delete(config.deletePaymentUrl(payment.id));
            notify('Payment deleted');
            refreshAll();
        } catch (err) {
            notify(errorMessage(err, 'Could not delete the payment.'));
        }
    };

    const toggleSort = (key) => {
        setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'code' ? 'asc' : 'desc' }));
    };

    const visibleCustomers = useMemo(() => {
        const term = search.trim().toUpperCase();
        const rows = (data.customers || []).filter((c) => {
            if (term && !`${c.code} ${c.name || ''} ${c.bill_no || ''}`.toUpperCase().includes(term)) return false;
            if (statusFilter === 'outstanding') return c.outstanding > 0;
            if (statusFilter === 'settled') return c.outstanding <= 0;
            if (statusFilter === 'cheques') return c.pending_cheques > 0;
            return true;
        });
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = a[sort.key] ?? '';
            const bv = b[sort.key] ?? '';
            return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
        });
    }, [data.customers, search, statusFilter, sort]);

    const filteredLoans = useMemo(() => (detail?.loans || []).filter((l) => (
        (selectedBill === 'ALL' || (l.bill_no ?? '') === selectedBill)
        && (!detailRange.from || l.loan_date >= detailRange.from) && (!detailRange.to || l.loan_date <= detailRange.to)
    )), [detail, detailRange, selectedBill]);

    // Every bill this party has, for the detail panel's bill picker.
    const detailBills = useMemo(() => {
        const seen = new Map();
        (detail?.loans || []).forEach((l) => {
            const key = l.bill_no ?? '';
            seen.set(key, (seen.get(key) || 0) + 1);
        });
        return [...seen.entries()];
    }, [detail]);

    const totals = data.totals || {};
    const cardCol = withCheques ? 'col-6 col-xl-3' : 'col-12 col-md-4';
    const today = todayIso();

    const filterCounts = useMemo(() => {
        const list = data.customers || [];
        return {
            all: list.length,
            outstanding: list.filter((c) => c.outstanding > 0).length,
            cheques: list.filter((c) => c.pending_cheques > 0).length,
            settled: list.filter((c) => c.outstanding <= 0).length,
        };
    }, [data.customers]);

    const handleRefresh = () => {
        setRefreshing(true);
        refreshAll();
        setTimeout(() => setRefreshing(false), 800);
    };

    const Empty = ({ icon, text, colSpan }) => (
        <tr><td colSpan={colSpan} className="csl-empty"><i className="material-icons">{icon}</i>{text}</td></tr>
    );

    const SkeletonRows = ({ cols }) => [0, 1, 2, 3].map((i) => (
        <tr key={i}>{Array.from({ length: cols }).map((_, j) => <td key={j}><div className="csl-skel" style={{ width: `${50 + ((i + j) % 3) * 20}%` }} /></td>)}</tr>
    ));

    return (
        <div className="container-fluid py-3 csl-dashboard" style={{ minHeight: '100vh', width: '100%', flex: '1 1 auto' }}>
            <style>{SCOPED_CSS}</style>

            <div className="csl-hero d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                <div>
                    <h3>{config.title}</h3>
                    <p>{config.subtitle}</p>
                </div>
                <button type="button" className={`csl-glass-btn d-flex align-items-center gap-1 ${refreshing ? 'spinning' : ''}`} onClick={handleRefresh}>
                    <i className="material-icons" style={{ fontSize: 18 }}>refresh</i> Refresh
                </button>
            </div>

            <div className="row g-3 mb-3">
                <SummaryCard label="Total loaned" amount={totals.loan_amount} sub={`${totals.loans || 0} lines · ${totals.bills || 0} bills · ${totals[config.listKey] || 0} ${config.listKey}`} colClass={cardCol}
                    color="#4f46e5" icon="account_balance_wallet" delay={0}
                    active={tab === 'customers' && statusFilter === 'all'} onClick={() => { setTab('customers'); setStatusFilter('all'); }} />
                <SummaryCard label={config.paidLabel} amount={totals.paid_amount} sub={withCheques ? 'Cash, transfers & cleared cheques' : 'Cash & bank transfers'} colClass={cardCol}
                    color="#16a34a" icon="savings" delay={70}
                    active={tab === 'customers' && statusFilter === 'settled'} onClick={() => { setTab('customers'); setStatusFilter('settled'); }} />
                {withCheques && (
                    <SummaryCard label="Pending cheques" amount={totals.pending_cheques} sub={`${totals.pending_cheque_count || 0} cheque(s) to clear`} colClass={cardCol}
                        color="#d97706" icon="pending_actions" delay={140}
                        active={tab === 'cheques'} onClick={() => { setTab('cheques'); setChequeFilter('pending'); }} />
                )}
                <SummaryCard label="Outstanding" amount={totals.outstanding} sub={config.outstandingSub} colClass={cardCol}
                    color="#dc2626" icon="trending_down" delay={210}
                    active={tab === 'customers' && statusFilter === 'outstanding'} onClick={() => { setTab('customers'); setStatusFilter('outstanding'); }} />
            </div>

            {error && <div className="csl-pill red mb-3 w-100" style={{ borderRadius: 12, padding: '10px 14px' }}>{error}</div>}

            <div className="csl-tabs mb-3">
                <button type="button" className={`csl-tab ${tab === 'customers' ? 'active' : ''}`} onClick={() => setTab('customers')}>
                    <i className="material-icons align-middle me-1" style={{ fontSize: 18 }}>{config.partyIcon}</i>{config.partyPlural}
                </button>
                {withCheques && (
                    <button type="button" className={`csl-tab ${tab === 'cheques' ? 'active' : ''}`} onClick={() => setTab('cheques')}>
                        <i className="material-icons align-middle me-1" style={{ fontSize: 18 }}>receipt_long</i>Cheque register
                        {totals.pending_cheque_count > 0 && <span className="csl-pill amber ms-2" style={{ padding: '0 8px' }}>{totals.pending_cheque_count}</span>}
                    </button>
                )}
            </div>

            {tab === 'customers' && (
                <div className="row g-3">
                    <div className={selected ? 'col-12 col-xl-6' : 'col-12'}>
                        <div className="csl-panel">
                            <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                                <input type="search" className="form-control csl-search" style={{ maxWidth: 300 }} placeholder="Search code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
                                <div className="d-flex flex-wrap gap-2">
                                    {STATUS_FILTERS.map((f) => (
                                        <button key={f.key} type="button" className={`csl-chip ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>
                                            {f.label}<span className="count">{filterCounts[f.key]}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="table-responsive" style={{ maxHeight: '62vh' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            {SORT_COLUMNS.map((col) => (
                                                <th key={col.key} className={`sortable text-${col.align} text-nowrap ${sort.key === col.key ? 'sorted' : ''}`} onClick={() => toggleSort(col.key)}>
                                                    {col.label}{sort.key === col.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? <SkeletonRows cols={SORT_COLUMNS.length} />
                                            : visibleCustomers.length === 0 ? <Empty icon="search_off" text={`No ${config.listKey} match`} colSpan={SORT_COLUMNS.length} />
                                            : visibleCustomers.map((c, i) => (
                                                <tr key={c.rowKey} onClick={() => openCustomer(c.code, c.bill_no ?? '')}
                                                    className={`clickable ${selected === c.code && selectedBill === (c.bill_no ?? '') ? 'selected' : ''}`} style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}>
                                                    <td>
                                                        <div className="d-flex align-items-center gap-2">
                                                            <Avatar code={c.code} />
                                                            <div>
                                                                <div className="fw-bold">{c.code}</div>
                                                                <div className="small text-muted text-truncate" style={{ maxWidth: 160 }}>{c.name || '—'}</div>
                                                                <PaidBar loan={c.loan_amount} paid={c.paid_amount} pending={c.pending_cheques || 0} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-nowrap">
                                                        {c.bill_no ? <span className="csl-pill blue">#{c.bill_no}</span> : <span className="csl-pill gray">{c.loan_count ? 'Unprinted' : '—'}</span>}
                                                        <div className="small text-muted">{c.loan_count} line(s)</div>
                                                    </td>
                                                    <td className="text-end fw-semibold">{formatAmount(c.loan_amount)}</td>
                                                    <td className="text-end csl-amt-green">{formatAmount(c.paid_amount)}</td>
                                                    {withCheques && (
                                                        <td className="text-end">{c.pending_cheques > 0
                                                            ? <span className="csl-pill amber">{formatAmount(c.pending_cheques)}</span>
                                                            : <span className="text-muted">—</span>}</td>
                                                    )}
                                                    <td className="text-end">{c.outstanding > 0
                                                        ? <span className="csl-amt-red">{formatAmount(c.outstanding)}</span>
                                                        : <span className="csl-pill green">✓ Settled</span>}</td>
                                                    <td className="small text-nowrap text-muted">{c.last_loan_date || '—'}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {selected && (
                        <div className="col-12 col-xl-6">
                            <div className="csl-detail" key={selected}>
                                <div className="csl-detail-head">
                                    <div className="d-flex align-items-center gap-2">
                                        <Avatar code={selected} />
                                        <div>
                                            <div className="fw-bold fs-5">{selected}</div>
                                            <div className="muted">{detail?.name || ' '}</div>
                                        </div>
                                    </div>
                                    <div className="d-flex gap-2 align-items-center">
                                        <button type="button" className="csl-btn primary d-flex align-items-center gap-1" onClick={() => setShowPayment(true)} disabled={!detail}>
                                            <i className="material-icons" style={{ fontSize: 18 }}>add_card</i> Record payment
                                        </button>
                                        <button type="button" className="csl-btn light" onClick={() => setSelected(null)} aria-label="Close">✕</button>
                                    </div>
                                </div>
                                <div className="csl-detail-body">
                                    {!detail ? (
                                        <div className="d-grid gap-2">{[0, 1, 2].map((i) => <div key={i} className="csl-skel" style={{ height: 22 }} />)}</div>
                                    ) : (
                                        <>
                                            <div className="row g-2 mb-3">
                                                {[
                                                    ['Loaned', detail.summary.loan_amount, '#1f2937'],
                                                    ['Paid', detail.summary.paid_amount, '#16a34a'],
                                                    withCheques && ['Pending cheques', detail.summary.pending_cheques, '#d97706'],
                                                    ['Outstanding', detail.summary.outstanding, '#dc2626'],
                                                ].filter(Boolean).map(([label, value, color]) => (
                                                    <div key={label} className={withCheques ? 'col-6 col-md-3' : 'col-4'}>
                                                        <div className="csl-mini">
                                                            <div className="lbl">{label}</div>
                                                            <div className="val" style={{ color }}>{formatAmount(value)}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="csl-tabs mb-3">
                                                <button type="button" className={`csl-tab ${detailTab === 'loans' ? 'active' : ''}`} onClick={() => setDetailTab('loans')}>Loans · {detail.loans.length}</button>
                                                <button type="button" className={`csl-tab ${detailTab === 'payments' ? 'active' : ''}`} onClick={() => setDetailTab('payments')}>Payments · {detail.payments.length}</button>
                                            </div>

                                            {detailTab === 'loans' && (
                                                <>
                                                    <div className="d-flex flex-wrap gap-2 mb-2 align-items-center small">
                                                        <span className="text-muted fw-semibold">Bill</span>
                                                        <select className="form-control form-control-sm" style={{ maxWidth: 190 }} value={selectedBill} onChange={(e) => setSelectedBill(e.target.value)}>
                                                            <option value="ALL">All bills ({detailBills.length})</option>
                                                            {detailBills.map(([bill, count]) => (
                                                                <option key={bill || 'open'} value={bill}>{bill ? `#${bill}` : 'Unprinted'} · {count} line(s)</option>
                                                            ))}
                                                        </select>
                                                        <span className="text-muted fw-semibold">From</span>
                                                        <input type="date" className="form-control form-control-sm" style={{ maxWidth: 160 }} value={detailRange.from} onChange={(e) => setDetailRange((r) => ({ ...r, from: e.target.value }))} />
                                                        <span className="text-muted fw-semibold">To</span>
                                                        <input type="date" className="form-control form-control-sm" style={{ maxWidth: 160 }} value={detailRange.to} onChange={(e) => setDetailRange((r) => ({ ...r, to: e.target.value }))} />
                                                        {(detailRange.from || detailRange.to) && <button type="button" className="csl-chip" onClick={() => setDetailRange({ from: '', to: '' })}>Clear</button>}
                                                    </div>
                                                    <div className="table-responsive" style={{ maxHeight: 420 }}>
                                                        <table>
                                                            <thead>
                                                                <tr><th>Date</th><th>Bill</th><th>Item</th><th className="text-end">Kg</th><th className="text-end">Price</th><th className="text-end">Amount</th></tr>
                                                            </thead>
                                                            <tbody>
                                                                {filteredLoans.length === 0 ? <Empty icon="inbox" text="No loan lines" colSpan={6} />
                                                                    : filteredLoans.map((l, i) => (
                                                                        <tr key={l.id} style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
                                                                            <td className="text-nowrap">{l.loan_date}</td>
                                                                            <td>{l.bill_no ? <span className="csl-pill blue">#{l.bill_no}</span> : <span className="csl-pill gray">Unprinted</span>}</td>
                                                                            <td>{l.item_name || l.item_code}</td>
                                                                            <td className="text-end">{formatAmount(l.weight)}</td>
                                                                            <td className="text-end">{formatAmount(l.price_per_kg)}</td>
                                                                            <td className="text-end fw-bold">{formatAmount(l.amount)}</td>
                                                                        </tr>
                                                                    ))}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr><td colSpan="5" className="text-end">Total</td><td className="text-end">{formatAmount(filteredLoans.reduce((s, l) => s + Number(l.amount || 0), 0))}</td></tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                </>
                                            )}

                                            {detailTab === 'payments' && (
                                                <div className="table-responsive" style={{ maxHeight: 460 }}>
                                                    <table>
                                                        <thead>
                                                            <tr><th>Date</th><th>Method</th><th>Details</th><th className="text-end">Amount</th><th /></tr>
                                                        </thead>
                                                        <tbody>
                                                            {detail.payments.length === 0 ? <Empty icon="payments" text="No payments yet" colSpan={5} />
                                                                : detail.payments.map((p, i) => (
                                                                    <tr key={p.id} style={{ animationDelay: `${Math.min(i, 15) * 25}ms`, opacity: p.cheque_status === 'bounced' ? 0.6 : 1 }}>
                                                                        <td className="text-nowrap">{p.payment_date}</td>
                                                                        <td className="text-nowrap">
                                                                            <i className="material-icons align-middle me-1" style={{ fontSize: 18, color: '#6b7280' }}>{METHOD_ICONS[p.payment_method]}</i>
                                                                            {METHOD_LABELS[p.payment_method]}
                                                                            {p.cheque_status && <span className={`csl-pill ms-1 ${CHEQUE_PILLS[p.cheque_status]}`}>{p.cheque_status}</span>}
                                                                        </td>
                                                                        <td className="small">
                                                                            {p.payment_method === 'cheque' && <>#{p.cheque_no} · {p.bank} · {p.cheque_date}</>}
                                                                            {p.payment_method === 'bank_transfer' && <>{p.bank}{p.reference_no ? ` · Ref ${p.reference_no}` : ''}</>}
                                                                            {p.notes && <div className="text-muted">{p.notes}</div>}
                                                                            {/* What this payment paid for (oldest purchases first) */}
                                                                            {p.items_covered?.length > 0 && (
                                                                                <div className="d-flex flex-wrap gap-1 mt-1">
                                                                                    {p.items_covered.map((it) => (
                                                                                        <span key={it.item_name} className="csl-pill gray" title={it.part ? 'Partly paid by this payment' : 'Fully paid by this payment'}>
                                                                                            {it.item_name} {Number(it.weight).toLocaleString('en-US', { maximumFractionDigits: 2 })} kg{it.part ? ' (part)' : ''}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className={`text-end fw-bold ${p.cheque_status === 'bounced' ? 'text-decoration-line-through' : ''}`}>{formatAmount(p.amount)}</td>
                                                                        <td className="text-end text-nowrap">
                                                                            {p.payment_method === 'cheque' && <ChequeActions payment={p} onChange={changeChequeStatus} />}
                                                                            <button type="button" className="csl-act del" title="Delete payment" onClick={() => deletePayment(p)}>
                                                                                <i className="material-icons align-middle" style={{ fontSize: 18 }}>delete</i>
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {withCheques && tab === 'cheques' && (
                <div className="csl-panel">
                    <div className="d-flex flex-wrap gap-2 mb-3">
                        {['pending', 'cleared', 'bounced', 'all'].map((s) => (
                            <button key={s} type="button" className={`csl-chip text-capitalize ${chequeFilter === s ? 'active' : ''}`} onClick={() => setChequeFilter(s)}>{s}</button>
                        ))}
                    </div>
                    <div className="table-responsive" style={{ maxHeight: '62vh' }}>
                        <table>
                            <thead>
                                <tr><th>Cheque date</th><th>Customer</th><th>Cheque no</th><th>Bank</th><th className="text-end">Amount</th><th>Status</th><th /></tr>
                            </thead>
                            <tbody>
                                {cheques.length === 0 ? <Empty icon="receipt_long" text="No cheques" colSpan={7} />
                                    : cheques.map((c, i) => {
                                        const due = c.cheque_status === 'pending' && c.cheque_date <= today;
                                        return (
                                            <tr key={c.id} className={`clickable ${due ? 'due' : ''}`} style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}
                                                onClick={() => { setTab('customers'); openCustomer(c.customer_code); }}>
                                                <td className="text-nowrap">{c.cheque_date}{due && <span className="csl-pill red ms-2">Due</span>}</td>
                                                <td>
                                                    <div className="d-flex align-items-center gap-2"><Avatar code={c.customer_code} /><span className="fw-bold">{c.customer_code}</span></div>
                                                </td>
                                                <td className="fw-semibold">{c.cheque_no}</td>
                                                <td>{c.bank}</td>
                                                <td className="text-end fw-bold">{formatAmount(c.amount)}</td>
                                                <td><span className={`csl-pill ${CHEQUE_PILLS[c.cheque_status]}`}>{c.cheque_status}</span></td>
                                                <td className="text-end"><ChequeActions payment={c} onChange={changeChequeStatus} /></td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showPayment && detail && (
                <PaymentModal
                    code={selected}
                    paymentUrl={config.paymentUrl}
                    methods={config.methods}
                    outstanding={detail.summary.outstanding}
                    onClose={closePayment}
                    onSaved={() => { setShowPayment(false); notify('Payment recorded'); refreshAll(); }}
                />
            )}

            {toast && (
                <div className="csl-toast"><i className="material-icons" style={{ fontSize: 20, color: '#22c55e' }}>check_circle</i>{toast}</div>
            )}
        </div>
    );
};

export default LoansDashboard;
