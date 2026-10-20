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

    return (
        <div className="border border-2 border-dark rounded p-3 mb-4" style={{ backgroundColor: '#004d00' }}>
            <h4 className="text-white mb-3">
                {isEditing ? 'Edit Loan Record' : 'Add New Loan'}
            </h4>

            {errors.general && (
                <div className="alert alert-danger">{errors.general}</div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="row gy-2">
                    {/* Loan Type Selection */}
                    <div className="col-md-8">
                        <label className="me-3 text-white">
                            <input 
                                type="radio" 
                                name="loan_type" 
                                value="old" 
                                checked={formData.loan_type === 'old'}
                                onChange={handleChange}
                            /> වෙළෙන්දාගේ ලාද පරණ නය
                        </label>
                        <label className="me-3 text-white">
                            <input 
                                type="radio" 
                                name="loan_type" 
                                value="today" 
                                checked={formData.loan_type === 'today'}
                                onChange={handleChange}
                            /> වෙළෙන්දාගේ අද දින නය ගැනීම
                        </label>
                        <label className="me-3 text-white">
                            <input 
                                type="radio" 
                                name="loan_type" 
                                value="ingoing" 
                                checked={formData.loan_type === 'ingoing'}
                                onChange={handleChange}
                            /> වෙනත් ලාභීම/ආදායම්
                        </label>
                        <label className="me-3 text-white">
                            <input 
                                type="radio" 
                                name="loan_type" 
                                value="outgoing" 
                                checked={formData.loan_type === 'outgoing'}
                                onChange={handleChange}
                            /> වියදම්
                        </label>
                        <label className="me-3 text-white">
                            <input 
                                type="radio" 
                                name="loan_type" 
                                value="grn_damage" 
                                checked={formData.loan_type === 'grn_damage'}
                                onChange={handleChange}
                            /> GRN Damages
                        </label>
                        <label className="text-white">
                            <input 
                                type="radio" 
                                name="loan_type" 
                                value="returns" 
                                checked={formData.loan_type === 'returns'}
                                onChange={handleChange}
                            /> Returns
                        </label>
                    </div>

                    {/* Settling Way */}
                    <div className="col-md-4">
                        <label className="text-white"><strong>Settling Way:</strong></label><br />
                        <label className="me-3 text-white">
                            <input 
                                type="radio" 
                                name="settling_way" 
                                value="cash" 
                                checked={formData.settling_way === 'cash'}
                                onChange={handleChange}
                            /> Cash
                        </label>
                        <label className="text-white">
                            <input 
                                type="radio" 
                                name="settling_way" 
                                value="cheque" 
                                checked={formData.settling_way === 'cheque'}
                                onChange={handleChange}
                            /> Cheque
                        </label>
                    </div>

                    {/* Customer Selection */}
                    {(formData.loan_type === 'old' || formData.loan_type === 'today') && (
                        <div className="col-md-4">
                            <label className="text-white">Customer</label>
                            <select 
                                className="form-select form-select-sm" 
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

                    {/* Bill No */}
                    {(formData.loan_type === 'old' || formData.loan_type === 'today') && (
                        <div className="col-md-3">
                            <label className="text-white">Bill No</label>
                            <input 
                                type="text" 
                                className="form-control form-control-sm" 
                                name="bill_no" 
                                value={formData.bill_no}
                                onChange={handleChange}
                            />
                        </div>
                    )}

                    {/* Amount and Description */}
                    {formData.loan_type !== 'grn_damage' && formData.loan_type !== 'returns' && (
                        <div className="row gx-2">
                            <div className="col-md-2">
                                <label className="text-white">Amount</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    className="form-control form-control-sm" 
                                    name="amount" 
                                    value={formData.amount}
                                    onChange={handleChange}
                                    required
                                />
                                {creditLimitMessage && (
                                    <div className="text-danger small">{creditLimitMessage}</div>
                                )}
                            </div>
                            <div className="col-md-5">
                                <label className="text-white">Description</label>
                                <input 
                                    type="text" 
                                    className="form-control form-control-sm" 
                                    name="description" 
                                    value={formData.description}
                                    onChange={handleChange}
                                    required
                                />
                                {totalAmount && <div className="text-warning fw-bold small mt-1">{totalAmount}</div>}
                            </div>
                        </div>
                    )}

                    {/* Cheque Fields */}
                    {formData.settling_way === 'cheque' && formData.loan_type === 'old' && (
                        <div className="col-md-5 ms-auto">
                            <div className="border rounded p-2 bg-light">
                                <h6 className="text-success fw-bold mb-2">Cheque Details</h6>
                                <div className="row g-2">
                                    <div className="col-4">
                                        <label className="form-label mb-1">Cheque Date</label>
                                        <input 
                                            type="date" 
                                            className="form-control form-control-sm" 
                                            name="cheque_date" 
                                            value={formData.cheque_date}
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label mb-1">Cheque No</label>
                                        <input 
                                            type="text" 
                                            className="form-control form-control-sm" 
                                            name="cheque_no" 
                                            value={formData.cheque_no}
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label mb-1">Bank</label>
                                        <input 
                                            type="text" 
                                            className="form-control form-control-sm" 
                                            name="bank" 
                                            value={formData.bank}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Wasted Fields for GRN Damage */}
                    {formData.loan_type === 'grn_damage' && (
                        <div className="col-md-7 ms-auto">
                            <div className="border rounded p-2 bg-light">
                                <h6 className="text-success fw-bold mb-2">Wasted Details</h6>
                                <div className="row g-2">
                                    <div className="col-4">
                                        <label className="form-label mb-1">Code</label>
                                        <select 
                                            className="form-select form-select-sm" 
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
                                    <div className="col-4">
                                        <label className="form-label mb-1">Wasted Packs</label>
                                        <input 
                                            type="number" 
                                            step="1" 
                                            className="form-control form-control-sm" 
                                            name="wasted_packs" 
                                            value={formData.wasted_packs}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label mb-1">Wasted Weight</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            className="form-control form-control-sm" 
                                            name="wasted_weight" 
                                            value={formData.wasted_weight}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Submit and Cancel Buttons */}
                    <div className="col-12 mt-3">
                        <button 
                            type="submit" 
                            className="btn btn-light text-dark me-2"
                            disabled={loading || (creditLimitMessage && formData.amount)}
                        >
                            {loading ? 'Saving...' : (isEditing ? 'Update Loan' : 'Add Loan')}
                        </button>
                        
                        {isEditing && (
                            <button 
                                type="button" 
                                className="btn btn-secondary"
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
};

export default CreateCustomerLoan;