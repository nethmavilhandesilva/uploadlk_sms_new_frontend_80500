import React, { useState, useEffect } from 'react';
import { customerLoanService } from '../../services/customerLoanService';

const CreateCustomerLoan = ({ customers, grnCodes, onLoanCreated, editingLoan, onCancelEdit }) => {
    const [formData, setFormData] = useState({
        loan_type: 'old',
        settling_way: 'cash',
        customer_id: '',
        amount: '',
        description: 'වෙළෙන්දාගේ ලාද පරණ නය', // matches the default 'old' loan type
        bill_no: '',
        cheque_no: '',
        bank: '',
        cheque_date: new Date().toISOString().split('T')[0],
        wasted_code: '',
        wasted_packs: '',
        wasted_weight: '',
        return_grn_code: '',
        return_item_code: '',
        return_bill_no: '',
        return_weight: '',
        return_packs: '',
        return_reason: ''
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [totalAmount, setTotalAmount] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    // Reset form when editingLoan changes
    useEffect(() => {
        if (editingLoan) {
            setIsEditing(true);
            // Convert the loan data to form data
            const loanAmount = Math.abs(editingLoan.amount); // Remove negative sign for display
            
            setFormData({
                loan_type: editingLoan.loan_type || 'old',
                settling_way: editingLoan.settling_way || 'cash',
                customer_id: editingLoan.customer_id || '',
                amount: loanAmount.toString(),
                description: editingLoan.description || '',
                bill_no: editingLoan.bill_no || '',
                cheque_no: editingLoan.cheque_no || '',
                bank: editingLoan.bank || '',
                cheque_date: editingLoan.cheque_date || new Date().toISOString().split('T')[0],
                wasted_code: editingLoan.wasted_code || '',
                wasted_packs: editingLoan.wasted_packs || '',
                wasted_weight: editingLoan.wasted_weight || '',
                return_grn_code: editingLoan.return_grn_code || '',
                return_item_code: editingLoan.return_item_code || '',
                return_bill_no: editingLoan.return_bill_no || '',
                return_weight: editingLoan.return_weight || '',
                return_packs: editingLoan.return_packs || '',
                return_reason: editingLoan.return_reason || ''
            });

            // Fetch customer loan total if customer exists
            if (editingLoan.customer_id && (editingLoan.loan_type === 'today' || editingLoan.loan_type === 'old')) {
                fetchCustomerLoanTotal(editingLoan.customer_id);
            }
        } else {
            resetForm();
        }
    }, [editingLoan]);

    const resetForm = () => {
        setFormData({
            loan_type: 'old',
            settling_way: 'cash',
            customer_id: '',
            amount: '',
            description: 'වෙළෙන්දාගේ ලාද පරණ නය',
            bill_no: '',
            cheque_no: '',
            bank: '',
            cheque_date: new Date().toISOString().split('T')[0],
            wasted_code: '',
            wasted_packs: '',
            wasted_weight: '',
            return_grn_code: '',
            return_item_code: '',
            return_bill_no: '',
            return_weight: '',
            return_packs: '',
            return_reason: ''
        });
        setTotalAmount('');
        setIsEditing(false);
        setErrors({});
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Auto-update description from the NEW values (formData still holds the
        // previous state here, which made the description lag one click behind).
        if (['loan_type', 'settling_way', 'bank', 'wasted_code', 'wasted_packs', 'wasted_weight'].includes(name)) {
            updateDescription({ ...formData, [name]: value });
        }

        // Fetch customer loan total when customer changes
        if (name === 'customer_id' && value && (formData.loan_type === 'today' || formData.loan_type === 'old')) {
            fetchCustomerLoanTotal(value);
        }
    };

    const updateDescription = (data = formData) => {
        const { loan_type, bank, wasted_code, wasted_packs, wasted_weight } = data;
        let description = '';

        switch (loan_type) {
            case 'old':
                description = "වෙළෙන්දාගේ ලාද පරණ නය";
                if (data.settling_way === 'cheque') {
                    description = `Cheque payment from ${bank || 'bank'}`;
                }
                break;
            case 'today':
                description = "වෙළෙන්දාගේ අද දින නය ගැනීම";
                break;
            case 'ingoing':
                description = "වෙනත් ලාභීම/ආදායම්";
                break;
            case 'outgoing':
                description = "වියදම්";
                break;
            case 'grn_damage':
                if (wasted_code) {
                    description = `Wasted stock from code: ${wasted_code} (${wasted_packs} packs, ${wasted_weight} kg)`;
                } else {
                    description = "GRN Damages";
                }
                break;
            default:
                description = data.description; // Keep existing description for other types
        }

        setFormData(prev => ({ ...prev, description }));
    };

    const fetchCustomerLoanTotal = async (customerId) => {
        try {
            const response = await customerLoanService.getCustomerLoanTotal(customerId);
            // Same balance as the loan statement: opening + paid back - loans taken + bills.
            const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const d = response.data;
            const balance = Number(d.balance ?? d.total_amount ?? 0);
                        setTotalAmount(`(Balance: ${fmt(balance)} — opening ${fmt(d.opening_balance)} + paid ${fmt(d.paid_back)} − loans ${fmt(d.loans_taken)} + bills ${fmt(d.bills_total)})`);
        } catch (error) {
            console.error('Error fetching customer loan total:', error);
            setTotalAmount('(Could not fetch total loans)');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            if (isEditing && editingLoan) {
                // Update existing loan
                await customerLoanService.update(editingLoan.id, formData);
            } else {
                // Create new loan
                await customerLoanService.create(formData);
            }
            
            resetForm();
            onLoanCreated();
            if (onCancelEdit) {
                onCancelEdit();
            }
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors || {});
            } else {
                setErrors({ general: error.response?.data?.error || `Error ${isEditing ? 'updating' : 'creating'} loan record` });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        resetForm();
        if (onCancelEdit) {
            onCancelEdit();
        }
    };

    const getCurrentCustomerCreditLimit = () => {
        const customer = customers.find(c => c.id == formData.customer_id);
        return customer ? customer.credit_limit : null;
    };

    const checkCreditLimit = () => {
        const creditLimit = getCurrentCustomerCreditLimit();
        const amount = parseFloat(formData.amount);
        
        if (creditLimit && amount > creditLimit) {
            return `Amount exceeds credit limit of ${creditLimit}!`;
        }
        return '';
    };

    const creditLimitMessage = checkCreditLimit();

    const isCustomerLoan = formData.loan_type === 'old' || formData.loan_type === 'today';
    const showAmount = formData.loan_type !== 'grn_damage' && formData.loan_type !== 'returns';
    const showCheque = formData.settling_way === 'cheque' && formData.loan_type === 'old';

    return (
        <div className="ccl-card">
            <style>{CCL_CSS}</style>

            <div className="ccl-head">
                <div className="ccl-head-icon">{isEditing ? '✏️' : '💰'}</div>
                <div>
                    <h4 className="ccl-title">{isEditing ? 'Edit Loan Record' : 'Add New Loan'}</h4>
                    <div className="ccl-subtitle">
                        {isEditing ? 'Change the details and press Update Loan' : 'Choose the type, fill in the details and press Add Loan'}
                    </div>
                </div>
                {isEditing && <span className="ccl-edit-badge">Editing</span>}
            </div>

            {errors.general && <div className="ccl-alert">⚠️ {errors.general}</div>}

            <form onSubmit={handleSubmit}>
                {/* Loan type */}
                <div className="ccl-section-label">ගනුදෙනු වර්ගය · Type</div>
                <div className="ccl-types">
                    {LOAN_TYPES.map((t) => (
                        <label key={t.value} className={`ccl-type ${formData.loan_type === t.value ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name="loan_type"
                                value={t.value}
                                checked={formData.loan_type === t.value}
                                onChange={handleChange}
                            />
                            <span className="ccl-type-icon">{t.icon}</span>
                            <span className="ccl-type-text">{t.label}</span>
                        </label>
                    ))}
                </div>

                {/* Settling way */}
                <div className="ccl-section-label">Settling Way</div>
                <div className="ccl-segment">
                    {[{ value: 'cash', label: '💵 Cash' }, { value: 'cheque', label: '🧾 Cheque' }].map((s) => (
                        <label key={s.value} className={`ccl-seg ${formData.settling_way === s.value ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name="settling_way"
                                value={s.value}
                                checked={formData.settling_way === s.value}
                                onChange={handleChange}
                            />
                            {s.label}
                        </label>
                    ))}
                </div>

                {/* Details */}
                <div className="ccl-grid">
                    {isCustomerLoan && (
                        <div className="ccl-field ccl-span-2">
                            <label className="ccl-label">Customer</label>
                            <select
                                className="ccl-input"
                                name="customer_id"
                                value={formData.customer_id}
                                onChange={handleChange}
                                required
                            >
                                <option value="">-- Select Customer --</option>
                                {customers.map(customer => (
                                    <option key={customer.id} value={customer.id}>
                                        {customer.short_name} - {customer.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {isCustomerLoan && (
                        <div className="ccl-field">
                            <label className="ccl-label">Bill No</label>
                            <input
                                type="text"
                                className="ccl-input"
                                name="bill_no"
                                value={formData.bill_no}
                                onChange={handleChange}
                                placeholder="Optional"
                            />
                        </div>
                    )}

                    {showAmount && (
                        <div className="ccl-field">
                            <label className="ccl-label">Amount</label>
                            <div className={`ccl-money ${creditLimitMessage ? 'invalid' : ''}`}>
                                <span>Rs.</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="ccl-input"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                            {creditLimitMessage && <div className="ccl-error">{creditLimitMessage}</div>}
                        </div>
                    )}

                    {showAmount && (
                        <div className="ccl-field ccl-span-full">
                            <label className="ccl-label">Description</label>
                            <input
                                type="text"
                                className="ccl-input"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    )}
                </div>

                {showAmount && totalAmount && (
                    <div className="ccl-balance">
                        <span className="ccl-balance-icon">📒</span>
                        <span>{totalAmount}</span>
                    </div>
                )}

                {/* Cheque details */}
                {showCheque && (
                    <div className="ccl-panel">
                        <div className="ccl-panel-title">🧾 Cheque Details</div>
                        <div className="ccl-grid ccl-grid-3">
                            <div className="ccl-field">
                                <label className="ccl-label">Cheque Date</label>
                                <input
                                    type="date"
                                    className="ccl-input"
                                    name="cheque_date"
                                    value={formData.cheque_date}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="ccl-field">
                                <label className="ccl-label">Cheque No</label>
                                <input
                                    type="text"
                                    className="ccl-input"
                                    name="cheque_no"
                                    value={formData.cheque_no}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="ccl-field">
                                <label className="ccl-label">Bank</label>
                                <input
                                    type="text"
                                    className="ccl-input"
                                    name="bank"
                                    value={formData.bank}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Wasted details for GRN damage */}
                {formData.loan_type === 'grn_damage' && (
                    <div className="ccl-panel">
                        <div className="ccl-panel-title">🥀 Wasted Details</div>
                        <div className="ccl-grid ccl-grid-3">
                            <div className="ccl-field">
                                <label className="ccl-label">Code</label>
                                <select
                                    className="ccl-input"
                                    name="wasted_code"
                                    value={formData.wasted_code}
                                    onChange={handleChange}
                                    required
                                >
                                    <option value="">-- Select Code --</option>
                                    {grnCodes.map(code => (
                                        <option key={code} value={code}>{code}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ccl-field">
                                <label className="ccl-label">Wasted Packs</label>
                                <input
                                    type="number"
                                    step="1"
                                    className="ccl-input"
                                    name="wasted_packs"
                                    value={formData.wasted_packs}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="ccl-field">
                                <label className="ccl-label">Wasted Weight (kg)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="ccl-input"
                                    name="wasted_weight"
                                    value={formData.wasted_weight}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="ccl-actions">
                    <button
                        type="submit"
                        className="ccl-btn ccl-btn-primary"
                        disabled={loading || (creditLimitMessage && formData.amount)}
                    >
                        {loading ? <><span className="ccl-spinner" /> Saving...</> : (isEditing ? '✔ Update Loan' : '＋ Add Loan')}
                    </button>
                    {isEditing && (
                        <button type="button" className="ccl-btn ccl-btn-ghost" onClick={handleCancel}>
                            Cancel
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

const LOAN_TYPES = [
    { value: 'old', icon: '↩️', label: 'වෙළෙන්දාගේ ලාද පරණ නය' },
    { value: 'today', icon: '📤', label: 'වෙළෙන්දාගේ අද දින නය ගැනීම' },
    { value: 'ingoing', icon: '📈', label: 'වෙනත් ලාභීම/ආදායම්' },
    { value: 'outgoing', icon: '📉', label: 'වියදම්' },
    { value: 'grn_damage', icon: '🥀', label: 'GRN Damages' },
    { value: 'returns', icon: '🔄', label: 'Returns' },
];

// Scoped to .ccl-* so the app's global form/table styles don't leak in.
const CCL_CSS = `
.ccl-card { background:#fff; color:#1f2937; border-radius:16px; padding:20px 22px; margin-bottom:24px;
  box-shadow:0 10px 30px rgba(0,0,0,.25); border-top:5px solid #16a34a; }
.ccl-head { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.ccl-head-icon { width:44px; height:44px; border-radius:12px; background:#dcfce7; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
.ccl-title { margin:0; font-size:1.25rem; font-weight:800; color:#14532d !important; }
.ccl-subtitle { font-size:.82rem; color:#6b7280; }
.ccl-edit-badge { margin-left:auto; background:#fef3c7; color:#b45309; font-weight:800; font-size:.75rem; padding:4px 10px; border-radius:999px; }
.ccl-alert { background:#fee2e2; color:#b91c1c; border-left:4px solid #ef4444; border-radius:8px; padding:10px 14px; font-weight:600; margin-bottom:14px; }
.ccl-section-label { font-size:.72rem; font-weight:800; text-transform:uppercase; letter-spacing:.6px; color:#6b7280; margin:4px 0 8px; }

.ccl-types { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:8px; margin-bottom:14px; }
.ccl-type { display:flex; align-items:center; gap:8px; padding:10px 12px; border:2px solid #e5e7eb; border-radius:12px; cursor:pointer;
  background:#f9fafb; transition:border-color .15s, background .15s, transform .1s; margin:0; }
.ccl-type:hover { border-color:#86efac; transform:translateY(-1px); }
.ccl-type.active { border-color:#16a34a; background:#f0fdf4; box-shadow:0 0 0 3px rgba(22,163,74,.15); }
.ccl-type input, .ccl-seg input { position:absolute; opacity:0; pointer-events:none; }
.ccl-type-icon { font-size:1.2rem; }
.ccl-type-text { font-size:.86rem; font-weight:700; color:#1f2937; line-height:1.25; }

.ccl-segment { display:inline-flex; background:#f3f4f6; border-radius:10px; padding:4px; gap:4px; margin-bottom:16px; }
.ccl-seg { position:relative; padding:7px 18px; border-radius:8px; font-weight:700; font-size:.9rem; color:#4b5563; cursor:pointer; margin:0; transition:background .15s, color .15s; }
.ccl-seg.active { background:#16a34a; color:#fff; box-shadow:0 2px 6px rgba(22,163,74,.35); }

.ccl-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; }
.ccl-grid-3 { grid-template-columns:repeat(3, minmax(0, 1fr)); }
.ccl-span-2 { grid-column:span 2; }
.ccl-span-full { grid-column:1 / -1; }
.ccl-field { min-width:0; }
.ccl-label { display:block; font-size:.78rem; font-weight:700; color:#374151; margin-bottom:5px; }
.ccl-input { width:100%; padding:9px 12px !important; border:2px solid #e5e7eb !important; border-radius:10px !important; background:#fff !important;
  color:#111827 !important; font-size:.95rem; outline:none; transition:border-color .15s, box-shadow .15s; box-sizing:border-box; }
.ccl-input:focus { border-color:#16a34a !important; box-shadow:0 0 0 3px rgba(22,163,74,.15) !important; }
.ccl-money { display:flex; align-items:stretch; }
.ccl-money span { display:flex; align-items:center; padding:0 10px; background:#f0fdf4; color:#15803d; font-weight:800; border:2px solid #e5e7eb; border-right:0; border-radius:10px 0 0 10px; }
.ccl-money .ccl-input { border-radius:0 10px 10px 0 !important; font-weight:700; text-align:right; }
.ccl-money.invalid span, .ccl-money.invalid .ccl-input { border-color:#ef4444 !important; }
.ccl-error { color:#dc2626; font-size:.78rem; font-weight:700; margin-top:4px; }

.ccl-balance { display:flex; gap:10px; align-items:flex-start; margin-top:12px; background:#fffbeb; border:1px solid #fde68a; color:#92400e;
  border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; }
.ccl-balance-icon { font-size:1.1rem; }

.ccl-panel { margin-top:14px; border:1px dashed #86efac; background:#f0fdf4; border-radius:12px; padding:12px 14px; }
.ccl-panel-title { font-weight:800; color:#15803d; margin-bottom:10px; }

.ccl-actions { display:flex; gap:10px; margin-top:18px; padding-top:14px; border-top:1px solid #f3f4f6; }
.ccl-btn { border:0; border-radius:10px; padding:10px 22px; font-weight:800; font-size:.95rem; cursor:pointer; display:inline-flex; align-items:center; gap:8px;
  transition:transform .1s, box-shadow .15s, filter .15s; }
.ccl-btn:disabled { opacity:.55; cursor:not-allowed; }
.ccl-btn-primary { background:linear-gradient(135deg, #16a34a, #15803d); color:#fff; box-shadow:0 6px 16px rgba(22,163,74,.35); }
.ccl-btn-primary:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.05); }
.ccl-btn-ghost { background:#f3f4f6; color:#374151; }
.ccl-btn-ghost:hover { background:#e5e7eb; }
.ccl-spinner { width:14px; height:14px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:cclSpin .8s linear infinite; }
@keyframes cclSpin { to { transform:rotate(360deg); } }

@media (max-width: 768px) {
  .ccl-grid, .ccl-grid-3 { grid-template-columns:1fr 1fr; }
  .ccl-span-2 { grid-column:1 / -1; }
}
`;

export default CreateCustomerLoan;
