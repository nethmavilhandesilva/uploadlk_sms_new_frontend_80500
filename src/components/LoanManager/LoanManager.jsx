import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable'; 
import api from '../../api';
import Sidebar from '../Sidebar';
import { BASE_PATH } from '../../config';

const formatCustomerOptions = (customers) => customers.map(c => ({
    value: c.id,
    label: `${c.short_name}`,
    shortName: c.short_name,
    creditLimit: c.credit_limit
}));

const getInitialFormState = () => ({
    loan_id: '',
    _method: 'POST',
    loan_type: 'old',
    settling_way: 'cash',
    customer_id: null,
    bill_no: '',
    amount: '',
    description: '',
    cheque_no: '',
    bank: '',
    cheque_date: new Date().toISOString().slice(0, 10),
    wasted_code: null,
    wasted_packs: '',
    wasted_weight: '',
    return_grn_code: null,
    return_item_code: '',
    return_bill_no: null,
    return_weight: '',
    return_packs: '',
    return_reason: '',
});

const LoanManager = () => {
    const [form, setForm] = useState(getInitialFormState());
    const [customersRaw, setCustomersRaw] = useState([]);
    const [grnCodes, setGrnCodes] = useState([]);
    const [loans, setLoans] = useState([]);
    const [billNos, setBillNos] = useState([]);
    const [totalLoanDisplay, setTotalLoanDisplay] = useState('');
    const [creditLimitMessage, setCreditLimitMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    
    // State for utility types dropdowns
    const [incomeTypes, setIncomeTypes] = useState([]);
    const [expenseTypes, setExpenseTypes] = useState([]);

    const isCustomerRelated = form.loan_type === 'old' || form.loan_type === 'today';
    const isSettlingWayVisible = form.loan_type === 'old';
    const isCheque = form.settling_way === 'cheque';
    const isReturns = form.loan_type === 'returns';
    const isIncomeOrExpense = form.loan_type === 'ingoing' || form.loan_type === 'outgoing';
    const isExpense = form.loan_type === 'outgoing';

    // Fetch utility types for dropdowns
    const fetchUtilityTypes = useCallback(async () => {
        try {
            // Fetch income types
            const incomeResponse = await api.get('/utility-types/income');
            if (incomeResponse.data.success) {
                setIncomeTypes(incomeResponse.data.data);
            }
            
            // Fetch expense types
            const expenseResponse = await api.get('/utility-types/expense');
            if (expenseResponse.data.success) {
                setExpenseTypes(expenseResponse.data.data);
            }
        } catch (error) {
            console.error('Error fetching utility types:', error);
        }
    }, []);

    const fetchCustomers = useCallback(async () => {
        try {
            const { data } = await api.get('/customers');
            setCustomersRaw(data);
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const { data } = await api.get('/customers-loans/data');
            setGrnCodes(data.grnCodes.map(code => ({ value: code, label: code })));
            setLoans(data.loans);
        } catch (error) {
            console.error('Error fetching initial loan data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchBillNos = useCallback(async () => {
        try {
            const { data } = await api.get('/api/all-bill-nos');
            setBillNos(data.map(bill => ({ value: bill, label: bill })));
        } catch (error) {
            console.error('Error fetching bill numbers:', error);
        }
    }, []);

    useEffect(() => {
        fetchCustomers();
        fetchData();
        fetchBillNos();
        fetchUtilityTypes();
    }, [fetchCustomers, fetchData, fetchBillNos, fetchUtilityTypes]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name) => (selectedOption) => {
        setForm(prev => ({
            ...prev,
            [name]: selectedOption ? selectedOption.value : null,
        }));
    };

    // Handle description change for income/expense dropdowns
    const handleDescriptionSelect = (selectedOption, isIncome = true) => {
        setForm(prev => ({ 
            ...prev, 
            description: selectedOption ? selectedOption.label : '' 
        }));
    };

    const handleLoanTypeChange = (e) => {
        const { value } = e.target;
        const resetFields = (value === 'ingoing' || value === 'outgoing' || value === 'returns')
            ? { customer_id: null, bill_no: '', settling_way: 'cash' }
            : {};

        if (value === 'returns') setIsEditMode(false);

        // Clear description when switching between income/expense
        if (value === 'ingoing' || value === 'outgoing') {
            resetFields.description = '';
        }

        setForm(prev => ({
            ...prev,
            loan_type: value,
            ...resetFields
        }));
    };

    const fetchLoanTotal = useCallback(async (customerId, showTotalLoan) => {
        if (customerId && showTotalLoan) {
            try {
                const res = await api.get(`/customers/${customerId}/loans-total`);
                // Same balance as the loan statement: opening + paid back - loans taken + bills.
                const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const d = res.data;
                const balance = Number(d.balance ?? d.total_amount ?? 0);
                                setTotalLoanDisplay(`(Balance: ${fmt(balance)} — opening ${fmt(d.opening_balance)} + paid ${fmt(d.paid_back)} − loans ${fmt(d.loans_taken)} + bills ${fmt(d.bills_total)})`);
            } catch (error) {
                setTotalLoanDisplay('(Could not fetch total loans)');
            }
        } else {
            setTotalLoanDisplay('');
        }
    }, []);

    useEffect(() => {
        if (isEditMode) return;

        const { loan_type, settling_way, bank } = form;
        let newDescription = "";

        if (loan_type === 'old') {
            newDescription = settling_way === 'cheque' ? `Cheque payment from ${bank || 'bank'}` : "වෙළෙන්දාගේ ලාද පරණ නය";
        } else if (loan_type === 'today') {
            newDescription = "වෙළෙන්දාගේ අද දින නය ගැනීම";
        } else if (loan_type === 'ingoing') {
            newDescription = ""; // Will be selected from dropdown
        } else if (loan_type === 'outgoing') {
            newDescription = ""; // Will be selected from dropdown
        }

        if (newDescription && !isIncomeOrExpense) {
            setForm(prev => ({ ...prev, description: newDescription }));
        }
    }, [form.loan_type, form.settling_way, form.bank, isEditMode, isIncomeOrExpense]);

    useEffect(() => {
        fetchLoanTotal(form.customer_id, isCustomerRelated);
    }, [form.customer_id, isCustomerRelated, fetchLoanTotal]);

    useEffect(() => {
        const { customer_id, amount } = form;
        const submitButton = document.getElementById('submitButton');
        const selectedCustomerData = customersRaw.find(c => c.id === customer_id);
        const creditLimit = selectedCustomerData?.credit_limit;

        setCreditLimitMessage('');
        if (submitButton) submitButton.disabled = false;

        if (isCustomerRelated && customer_id && parseFloat(amount) > 0) {
            if (creditLimit && parseFloat(amount) > parseFloat(creditLimit)) {
                setCreditLimitMessage('Amount exceeds credit limit!');
                if (submitButton) submitButton.disabled = true;
            }
        }
    }, [form.customer_id, form.amount, customersRaw, isCustomerRelated]);

    const handleCancelEdit = (preservedDescription = '') => {
        setIsEditMode(false);
        setForm({
            ...getInitialFormState(),
            description: preservedDescription || form.description,
            loan_type: form.loan_type,
            settling_way: form.settling_way
        });
    };

    const handleSubmit = async (e, isReturn = false) => {
        e.preventDefault();
        setLoading(true);

        const currentDescription = form.description;

        let formData = { ...form };
        let url = isEditMode ? `/customers-loans/${form.loan_id}` : '/customers-loans';

        if (isReturn) {
            formData = { ...form, loan_type: 'returns', amount: 0, description: 'Return entry' };
            url = '/customers-loans';
        }

        try {
            const payload = isEditMode ? { ...formData, _method: 'PUT' } : formData;
            await api({ url, method: 'POST', data: payload });
            
            handleCancelEdit(currentDescription);
            
            fetchData();
            fetchCustomers();
        } catch (error) {
            alert(error.response?.data?.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (loan) => {
        setIsEditMode(true);
        setForm({
            ...getInitialFormState(),
            loan_id: loan.id,
            _method: 'PUT',
            loan_type: loan.loan_type,
            settling_way: loan.settling_way || 'cash',
            customer_id: loan.customer_id,
            bill_no: loan.bill_no || '',
            amount: Math.abs(loan.amount),
            description: loan.description,
            cheque_no: loan.cheque_no || '',
            bank: loan.bank || '',
            cheque_date: loan.cheque_date || new Date().toISOString().slice(0, 10),
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;
        try {
            await api.delete(`/customers-loans/${id}`);
            fetchData();
            fetchCustomers();
        } catch (error) {
            alert('Failed to delete record.');
        }
    };

    const customerOptions = useMemo(() => formatCustomerOptions(customersRaw), [customersRaw]);

    // Format options for income/expense dropdowns
    const incomeOptions = useMemo(() => 
        incomeTypes.map(type => ({ value: type.id, label: type.name }))
    , [incomeTypes]);

    const expenseOptions = useMemo(() => 
        expenseTypes.map(type => ({ value: type.id, label: type.name }))
    , [expenseTypes]);

    const customFilter = (option, searchText) => {
        const term = searchText.toLowerCase().trim();
        const optionText = option.label.toLowerCase();
        if (term.length === 1 && option.data && option.data.shortName) {
            return option.data.shortName.toLowerCase().startsWith(term);
        }
        return optionText.includes(term);
    };

    if (loading) return <div className="text-center mt-5">Loading...</div>;

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <div style={{ marginLeft: '260px', flexGrow: 1, padding: '20px', width: 'calc(100vw - 260px)' }}>
                <style>{`
                    body { background-color: #99ff99 !important; }
                    .custom-card { background-color: #004d00 !important; color: #fff; padding: 25px; border-radius: 10px; }
                    .form-control, .form-select { padding: 0.15rem 0.4rem !important; font-size: 0.75rem !important; border: 1px solid black !important; color: black !important; font-weight: bold !important; background-color: white !important; }
                    .table td, .table th { padding: 0.3rem; font-size: 0.875rem; }
                    label { font-weight: 500; margin-bottom: 0.2rem; color: #fff; }
                    .table th { background-color: #006600; color: white; }
                    .bg-custom-dark { background-color: #004d00 !important; color: #fff; }
                    .creatable-select__control { min-height: 25px !important; border-color: black !important; box-shadow: none !important; }
                `}</style>

                <div className="custom-card">
                    <h3 className="mb-4">ණය කළමනාකරණ පුවරුව</h3>

                    <form onSubmit={e => handleSubmit(e, isReturns)} className="p-3 border border-2 border-dark rounded bg-custom-dark">
                        <div className="row gy-2">
                            <div className="col-md-8">
                                {['old', 'today', 'ingoing', 'outgoing', 'returns'].map(type => (
                                    <label key={type} className="me-3">
                                        <input type="radio" name="loan_type" value={type} checked={form.loan_type === type} onChange={handleLoanTypeChange} />
                                        {' '}
                                        {type === 'old' && 'වෙළෙන්දාගේ ලාද පරණ නය'}
                                        {type === 'today' && 'වෙළෙන්දාගේ අද දින නය ගැනීම'}
                                        {type === 'ingoing' && 'වෙනත් ලාභීම/ආදායම්'}
                                        {type === 'outgoing' && 'වි‍යදම්'}
                                        {type === 'returns' && 'Returns'}
                                    </label>
                                ))}
                            </div>

                            {isSettlingWayVisible && (
                                <div className="col-md-4">
                                    <label className="text-form-label d-block"><strong>ගෙවීමේ ක්‍රමය:</strong></label>
                                    {['cash', 'cheque'].map(way => (
                                        <label key={way} className="me-3">
                                            <input type="radio" name="settling_way" value={way} checked={form.settling_way === way} onChange={handleInputChange} />
                                            {' '} {way.charAt(0).toUpperCase() + way.slice(1)}
                                        </label>
                                    ))}
                                </div>
                            )}

                            {isCustomerRelated && (
                                <div className="col-md-4">
                                    <label className="text-form-label">ගෙණුම්කරු</label>
                                    <Select
                                        options={customerOptions}
                                        onChange={handleSelectChange('customer_id')}
                                        value={customerOptions.find(opt => opt.value === form.customer_id)}
                                        filterOption={customFilter}
                                        placeholder="-- Select Customer --"
                                        isClearable
                                        classNamePrefix="select"
                                        styles={{
                                            option: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                            singleValue: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                        }}
                                    />
                                </div>
                            )}

                            {isCustomerRelated && !isCheque && (
                                <div className="col-md-3">
                                    <label className="text-form-label">බිල් අං</label>
                                    <input type="text" className="form-control form-control-sm" name="bill_no" value={form.bill_no} onChange={handleInputChange} />
                                </div>
                            )}

                            {!isReturns && (
                                <div className="row gx-2 mt-2">
                                    <div className={`col-md-${isIncomeOrExpense ? 4 : 2}`}>
                                        <label className="text-form-label">මුදල</label>
                                        <input type="number" step="0.01" className="form-control form-control-sm" name="amount" value={form.amount} onChange={handleInputChange} required />
                                        {isCustomerRelated && <span className="text-danger small fw-bold">{creditLimitMessage}</span>}
                                    </div>
                                    <div className={`col-md-${isIncomeOrExpense ? 8 : 5}`}>
                                        <label className="text-form-label">විස්තරය</label>
                                        
                                        {/* For Income (Ingoing) - Dropdown from ic_utilitytypes where type = 'income' */}
                                        {form.loan_type === 'ingoing' && (
                                            <Select
                                                options={incomeOptions}
                                                onChange={(selected) => handleDescriptionSelect(selected, true)}
                                                value={incomeOptions.find(opt => opt.label === form.description)}
                                                placeholder="Select income type..."
                                                isClearable
                                                classNamePrefix="income-select"
                                                styles={{
                                                    control: (provided) => ({ ...provided, minHeight: '25px', borderColor: 'black' }),
                                                    option: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                                    singleValue: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                                    input: (provided) => ({ ...provided, color: '#000' }),
                                                }}
                                            />
                                        )}
                                        
                                        {/* For Expense (Outgoing) - Dropdown from ic_utilitytypes where type = 'expense' */}
                                        {form.loan_type === 'outgoing' && (
                                            <Select
                                                options={expenseOptions}
                                                onChange={(selected) => handleDescriptionSelect(selected, false)}
                                                value={expenseOptions.find(opt => opt.label === form.description)}
                                                placeholder="Select expense type..."
                                                isClearable
                                                classNamePrefix="expense-select"
                                                styles={{
                                                    control: (provided) => ({ ...provided, minHeight: '25px', borderColor: 'black' }),
                                                    option: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                                    singleValue: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                                    input: (provided) => ({ ...provided, color: '#000' }),
                                                }}
                                            />
                                        )}
                                        
                                        {/* For other loan types - CreatableSelect */}
                                        {!isIncomeOrExpense && (
                                            <CreatableSelect
                                                options={isExpense ? expenseOptions : []}
                                                onChange={handleDescriptionSelect}
                                                onCreateOption={(inputValue) => {
                                                    setForm(prev => ({ ...prev, description: inputValue }));
                                                }}
                                                value={
                                                    (isExpense && expenseOptions.find(opt => opt.label === form.description)) || 
                                                    (form.description ? { value: form.description, label: form.description } : null)
                                                }
                                                placeholder="Type or select..."
                                                isClearable
                                                classNamePrefix="creatable-select"
                                                styles={{
                                                    control: (provided) => ({ ...provided, minHeight: '25px', borderColor: 'black' }),
                                                    option: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                                    singleValue: (provided) => ({ ...provided, fontWeight: 'bold', color: '#000' }),
                                                    input: (provided) => ({ ...provided, color: '#000' }),
                                                }}
                                            />
                                        )}
                                        
                                        {isCustomerRelated && <span className="text-white-50 small fw-bold">{totalLoanDisplay}</span>}
                                    </div>
                                </div>
                            )}

                            {isSettlingWayVisible && isCheque && (
                                <div className="col-md-6 mt-2">
                                    <div className="border rounded p-2 bg-light text-dark">
                                        <h6 className="text-success fw-bold">චෙක් විස්තර</h6>
                                        <div className="row g-2">
                                            <div className="col-4">
                                                <label className="text-dark small">දිනය</label>
                                                <input type="date" className="form-control form-control-sm" name="cheque_date" value={form.cheque_date} onChange={handleInputChange} />
                                            </div>
                                            <div className="col-4">
                                                <label className="text-dark small">අංකය</label>
                                                <input type="text" className="form-control form-control-sm" name="cheque_no" value={form.cheque_no} onChange={handleInputChange} />
                                            </div>
                                            <div className="col-4">
                                                <label className="text-dark small">බැංකුව</label>
                                                <input type="text" className="form-control form-control-sm" name="bank" value={form.bank} onChange={handleInputChange} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!isReturns && (
                                <div className="col-12 mt-3">
                                    <button type="submit" className={`btn btn-sm ${isEditMode ? 'btn-success' : 'btn-light'}`} id="submitButton" disabled={loading || (isCustomerRelated && creditLimitMessage)}>
                                        {isEditMode ? 'Update Loan' : 'Add'}
                                    </button>
                                    {isEditMode && <button type="button" className="btn btn-sm btn-secondary ms-2" onClick={() => handleCancelEdit(form.description)}>Cancel</button>}
                                </div>
                            )}
                        </div>
                    </form>

                    <h4 className="mt-4">අදේණු ණය වාර්තා</h4>
                    <div className="table-responsive">
                        <table className="table table-bordered table-sm mt-2 bg-white text-dark">
                            <thead>
                                <tr className="text-center">
                                    <th>විස්තරය</th>
                                    <th>මුදල</th>
                                    <th>විලා</th>
                                    <th>වර්ගය</th>
                                    <th>බිල්පත් අං</th>
                                    <th>ක්‍රියා</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loans.length > 0 ? (
                                    loans.map(loan => (
                                        <tr key={loan.id}>
                                            <td>{loan.description}</td>
                                            <td className="text-end">{loan.display_amount}</td>
                                            <td>{loan.customer_short_name}</td>
                                            <td>{loan.loan_type}</td>
                                            <td className="text-center">{loan.bill_no || '-'}</td>
                                            <td className="text-center">
                                                <button className="btn btn-xs btn-warning me-1" onClick={() => handleEdit(loan)}>සංස්කරණය</button>
                                                <button className="btn btn-xs btn-danger" onClick={() => handleDelete(loan.id)}>මකන්න</button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="6" className="text-center">අද සඳහා ණය වාර්තා කිසිවක් සොයාගත නොහැක</td></tr>
                                )}
                            </tbody>
                        </table>
                        <div className="d-flex flex-wrap gap-2 mt-3">
                            <a href={`${BASE_PATH}/loan-report`} className="btn btn-sm btn-dark">ණය වාර්තාව</a>
                            <a href="/income-expense-report2" className="btn btn-sm btn-dark">IC Report</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoanManager;