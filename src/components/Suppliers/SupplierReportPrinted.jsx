import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import ReactDOM from 'react-dom';
import FundAllocationModal from './FundAllocationModal';

const routes = {
    getSuppliers: "/suppliers/supplierloans",
    getSupplierBillDetails: "/suppliers/bill",
    getUnprintedDetails: "/suppliers/unprinted-details",
    getBanks: "/banks",
    paymentHistory: "/supplier-loan/payment-history",
    deleteSupplierLoan: "/suppliers/delete-loan-record",
    updateGivenAmountApplied: "/suppliers/update-loan-payment",
    pendingCustomerBills: "/pending-customer-bills",
    pendingFarmerBills: "/pending-farmer-bills",
    printBill: "/suppliers/print-bill",
    checkOrCreateCreditor: "/suppliers/check-or-create-creditor",
    getSupplierByCode: "/suppliers/check-creditor",
    getSupplierDetailedReport: "/supplier-detailed-report",
    getOldBillsSummary: "/suppliers/old-bills-summary",
    getBanksList: "/banks-list",
    getSupplierAdvances: "/suppliers/advance-amounts",
};

// ==================== SHARED HELPERS (perf + leak prevention) ====================
const BANKS_CACHE_TTL_MS = 5 * 60 * 1000;
const banksCacheStore = { data: null, fetchedAt: 0, promise: null };

const isAbortError = (error) => {
    const name = error?.name || '';
    const code = error?.code || '';
    return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED';
};

const safeError = (message, error) => {
    // Never log response bodies / financial payloads to the console
    if (typeof console !== 'undefined' && console.error) {
        const detail = error?.message || (typeof error === 'string' ? error : 'Request failed');
        console.error(message, detail);
    }
};

const parsePaymentDetails = (raw) => {
    if (!raw) return [];
    let payments = raw;
    if (typeof payments === 'string') {
        try {
            payments = JSON.parse(payments);
        } catch {
            return [];
        }
    }
    return Array.isArray(payments) ? payments : [];
};

const isValidBillNumber = (bn) =>
    !!bn && bn !== 'Pending' && bn !== 'N/A' && bn !== 'null' && bn !== 'undefined';

const mapWithConcurrency = async (items, limit, worker) => {
    const results = new Array(items.length);
    let nextIndex = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) || 0 }, async () => {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await worker(items[current], current);
        }
    });
    await Promise.all(runners);
    return results;
};

const SIDEBAR_POLL_MS = 8000;
const PAYMENT_UNLOCK_MS = 400;
const OPTIMISTIC_PAYMENT_TTL_MS = 12000;

const applyPaymentToBillItem = (item, { paymentAmount, paymentRecord, totalPayable, isCreditSettlement = false, updatedCreditor = null, creditAmountDelta = 0 }) => {
    const existingPayments = Array.isArray(item.payment_details) ? item.payment_details : [];
    const alreadyRecorded = paymentRecord?.id && existingPayments.some((p) => p.id === paymentRecord.id);
    const nextPayments = alreadyRecorded ? existingPayments : [...existingPayments, paymentRecord];
    const nextPaid = alreadyRecorded
        ? (parseFloat(item.loan_amount) || 0)
        : (parseFloat(item.loan_amount) || 0) + (parseFloat(paymentAmount) || 0);
    const advance = parseFloat(item.advance_amount) || 0;
    const total = parseFloat(item.total_amount) || parseFloat(totalPayable) || 0;
    const totalPaidIncludingAdvance = nextPaid + advance;
    const remaining = Math.max(0, total - totalPaidIncludingAdvance);
    const fullySettled = isCreditSettlement ? true : totalPaidIncludingAdvance >= (total - 0.01);

    let creditRemaining = parseFloat(item.credit_remaining_amount) || 0;
    let creditPaid = parseFloat(item.credit_paid_amount) || 0;
    if (isCreditSettlement) {
        if (updatedCreditor) {
            creditRemaining = parseFloat(updatedCreditor.remaining_amount) || 0;
            const creditTotal = parseFloat(updatedCreditor.credit_amount ?? item.credit_amount) || 0;
            creditPaid = parseFloat(updatedCreditor.paid_amount ?? (creditTotal - creditRemaining)) || 0;
        } else {
            creditRemaining = Math.max(0, creditRemaining - (parseFloat(paymentAmount) || 0));
            creditPaid += parseFloat(paymentAmount) || 0;
        }
    }

    return {
        ...item,
        loan_amount: nextPaid,
        payment_details: nextPayments,
        net_remaining: remaining,
        is_fully_settled: fullySettled,
        total_paid_including_advance: totalPaidIncludingAdvance,
        credit_amount: (parseFloat(item.credit_amount) || 0) + (parseFloat(creditAmountDelta) || 0),
        credit_remaining_amount: creditRemaining,
        credit_paid_amount: creditPaid
    };
};

const fetchBanksCached = async (signal) => {
    const now = Date.now();
    if (banksCacheStore.data && (now - banksCacheStore.fetchedAt) < BANKS_CACHE_TTL_MS) {
        return banksCacheStore.data;
    }
    if (banksCacheStore.promise) {
        return banksCacheStore.promise;
    }
    banksCacheStore.promise = api.get(routes.getBanks, signal ? { signal } : undefined)
        .then((response) => {
            const data = response.data?.success ? (response.data.data || []) : [];
            banksCacheStore.data = data;
            banksCacheStore.fetchedAt = Date.now();
            return data;
        })
        .finally(() => {
            banksCacheStore.promise = null;
        });
    return banksCacheStore.promise;
};


// ==================== BANK ACCOUNT SELECTOR COMPONENT ====================
const BankAccountSelector = ({ selectedAccountId, onSelect, disabled = false, id = "bank-select", onEnterPress = null }) => {
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const selectRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

        const loadBanks = async () => {
            setLoading(true);
            try {
                const data = await fetchBanksCached(controller?.signal);
                if (!cancelled) {
                    setBanks(data);
                    setError(data.length ? '' : 'Failed to load bank accounts');
                }
            } catch (error) {
                if (!cancelled && !isAbortError(error)) {
                    setError('Unable to load bank accounts');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadBanks();
        return () => {
            cancelled = true;
            controller?.abort();
        };
    }, []);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (onEnterPress) {
                onEnterPress();
            }
        }
    };

    if (loading) {
        return <div style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>Loading bank accounts...</div>;
    }

    if (error) {
        return <div style={{ padding: '10px', textAlign: 'center', color: '#ef4444', fontSize: '12px' }}>{error}</div>;
    }

    return (
        <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '13px', color: '#334155' }}>
                Select Bank Account <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
                ref={selectRef}
                id={id}
                value={selectedAccountId || ''}
                onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
                onKeyPress={handleKeyPress}
                style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    cursor: 'pointer'
                }}
                disabled={disabled}
            >
                <option value="">-- Select Bank Account --</option>
                {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>
                        {bank.bank_name} - {bank.branch} (Acc: {bank.account_no})
                    </option>
                ))}
            </select>
        </div>
    );
};
// ==================== PAYMENT HISTORY MODAL ====================
const PaymentHistoryModal = ({ isOpen, onClose, payments, totalPaid, totalBill, remaining }) => {
    if (!isOpen) return null;

    const getPaymentMethodStyle = (method) => {
        switch (method) {
            case 'Cash': return { backgroundColor: '#10b981', color: 'white' };
            case 'Cheque': return { backgroundColor: '#8b5cf6', color: 'white' };
            case 'Bank Transfer': return { backgroundColor: '#ec489a', color: 'white' };
            case 'bag_to_box': return { backgroundColor: '#f59e0b', color: 'white' };
            case 'bill_to_bill': return { backgroundColor: '#3b82f6', color: 'white' };
            case 'bad_debt': return { backgroundColor: '#ef4444', color: 'white' };
            default: return { backgroundColor: '#6b7280', color: 'white' };
        }
    };

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getPaymentIcon = (method) => {
        switch (method) {
            case 'Cash': return '💰';
            case 'Cheque': return '💳';
            case 'Bank Transfer': return '🏦';
            case 'bag_to_box': return '📦';
            case 'bill_to_bill': return '📄';
            case 'bad_debt': return '⚠️';
            default: return '💵';
        }
    };

    const getMethodDisplayName = (method) => {
        switch (method) {
            case 'bag_to_box': return 'Bag to Box';
            case 'bill_to_bill': return 'Bill to Bill';
            case 'bad_debt': return 'Bad Debt';
            default: return method;
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10001,
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                width: '550px',
                maxWidth: '90%',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: '1px solid #e2e8f0',
                }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>Payment History</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>

                <div style={{
                    padding: '16px 20px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Total Bill</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>{formatCurrency(totalBill)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Total Paid</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(totalPaid)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Remaining</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f59e0b' }}>{formatCurrency(remaining)}</div>
                    </div>
                </div>

                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    {payments && payments.length > 0 ? (
                        payments.map((payment, index) => (
                            <div key={index} style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '14px' }}>Payment #{index + 1}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {new Date(payment.date).toLocaleString()}
                                    </div>
                                    {payment.reference && (
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                            Ref: {payment.reference}
                                        </div>
                                    )}
                                    {payment.running_balance && (
                                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                            Balance after: {formatCurrency(payment.running_balance)}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        ...getPaymentMethodStyle(payment.method)
                                    }}>
                                        {getPaymentIcon(payment.method)} {getMethodDisplayName(payment.method)}
                                    </span>
                                    <div style={{ fontWeight: 'bold', marginTop: '8px', fontSize: '14px' }}>
                                        {formatCurrency(payment.amount)}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                            No payment history available
                        </div>
                    )}
                </div>

                <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
                    <button onClick={onClose} style={{ padding: '8px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        </div>
    );
};

// ==================== CHEQUE MODAL ====================
const ChequeModal = ({ isOpen, onClose, onConfirm, amount }) => {
    const [chequeDetails, setChequeDetails] = useState({
        cheq_date: '',
        cheq_no: '',
        bank_account_id: null
    });
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(true);

    // Refs for input fields
    const dateRef = useRef(null);
    const chequeNoRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const confirmButtonRef = useRef(null);

    // Fetch banks when modal opens
    useEffect(() => {
        if (!isOpen) return undefined;
        let cancelled = false;
        fetchBanks();
        const id = setTimeout(() => {
            if (!cancelled && dateRef.current) dateRef.current.focus();
        }, 100);
        return () => {
            cancelled = true;
            clearTimeout(id);
        };
    }, [isOpen]);

    const fetchBanks = async () => {
        setLoading(true);
        try {
            const data = await fetchBanksCached();
            setBanks(data);
        } catch (error) {
            if (!isAbortError(error)) safeError('Error fetching banks:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setChequeDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleBankSelect = (bankId) => {
        setChequeDetails(prev => ({ ...prev, bank_account_id: bankId }));
    };

    const handleSubmit = () => {
        if (!chequeDetails.cheq_date || !chequeDetails.cheq_no || !chequeDetails.bank_account_id) {
            alert("Please fill all cheque details and select a bank account");
            return;
        }

        const selectedBankObj = banks.find(bank => bank.id === chequeDetails.bank_account_id);
        const chequeDataWithBank = {
            ...chequeDetails,
            bank_name: selectedBankObj ? selectedBankObj.bank_name : null
        };

        onConfirm(chequeDataWithBank);
        setChequeDetails({ cheq_date: '', cheq_no: '', bank_account_id: null });
    };

    // Handle Enter key navigation using onKeyDown instead of onKeyPress
    const handleChequeDateKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            // Use setTimeout to ensure the date picker closes before moving focus
            setTimeout(() => {
                if (chequeNoRef.current) {
                    chequeNoRef.current.focus();
                }
            }, 50);
        }
    };

    // Handle Enter key from cheque number to focus bank select
    const handleChequeNoKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            // Focus the bank select element by its ID
            const bankSelect = document.getElementById('cheque-bank-select');
            if (bankSelect) {
                bankSelect.focus();
            }
        }
    };

    // Handle Enter key on bank select - move to confirm button
    const handleBankSelectEnter = () => {
        setTimeout(() => {
            if (confirmButtonRef.current) {
                confirmButtonRef.current.focus();
            }
        }, 50);
    };

    // Handle Enter key on confirm button to submit
    const handleConfirmKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit();
        }
    };

    // Handle Enter key on cancel button to close
    const handleCancelKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '20px',
                width: '380px',
                maxWidth: '90%',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '24px' }}>💳</span>
                    <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: '700' }}>Cheque Payment</h3>
                </div>

                <div style={{ background: '#dbeafe', padding: '10px', borderRadius: '10px', marginBottom: '16px', textAlign: 'center' }}>
                    <label style={{ display: 'block', fontWeight: '600', fontSize: '12px', color: '#1e40af', marginBottom: '4px' }}>Payment Amount</label>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: '#1e3a8a', fontFamily: 'monospace' }}>Rs. {amount?.toFixed(2) || '0.00'}</div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>📅 Cheque Date <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                        ref={dateRef}
                        type="date"
                        name="cheq_date"
                        value={chequeDetails.cheq_date}
                        onChange={handleChange}
                        onKeyDown={handleChequeDateKeyDown}
                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', outline: 'none' }}
                    />
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>🔢 Cheque Number <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                        ref={chequeNoRef}
                        type="text"
                        name="cheq_no"
                        value={chequeDetails.cheq_no}
                        onChange={handleChange}
                        placeholder="Enter cheque number"
                        onKeyDown={handleChequeNoKeyDown}
                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', outline: 'none' }}
                    />
                </div>

                <div style={{ marginBottom: '18px' }}>
                    <BankAccountSelector
                        id="cheque-bank-select"
                        selectedAccountId={chequeDetails.bank_account_id}
                        onSelect={handleBankSelect}
                        disabled={loading}
                        onEnterPress={handleBankSelectEnter}
                    />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button
                        ref={cancelButtonRef}
                        onClick={onClose}
                        onKeyDown={handleCancelKeyDown}
                        style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', flex: 1 }}
                    >
                        Cancel
                    </button>
                    <button
                        ref={confirmButtonRef}
                        onClick={handleSubmit}
                        onKeyDown={handleConfirmKeyDown}
                        style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', flex: 1 }}
                    >
                        Confirm Payment
                    </button>
                </div>
            </div>
        </div>
    );
};
// ==================== BANK TO BANK MODAL ====================
const BankToBankModal = ({ isOpen, onClose, onConfirm, amount, supplierCode }) => {
    const [transferDetails, setTransferDetails] = useState({
        bank_account_id: null,
        reference_no: '',
        transfer_date: new Date().toISOString().split('T')[0],
        notes: ''
    });
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Create refs for all input fields
    const bankSelectRef = useRef(null);
    const referenceNoRef = useRef(null);
    const transferDateRef = useRef(null);
    const notesRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const confirmButtonRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        fetchBanks();
        const id = setTimeout(() => {
            bankSelectRef.current?.focus();
        }, 100);
        return () => clearTimeout(id);
    }, [isOpen]);

    const fetchBanks = async () => {
        setLoading(true);
        try {
            const data = await fetchBanksCached();
            setBanks(data);
            setError(data.length ? '' : 'Failed to load bank accounts');
        } catch (error) {
            if (!isAbortError(error)) setError('Unable to load bank accounts');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setTransferDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleBankSelect = (bankId) => {
        setTransferDetails(prev => ({ ...prev, bank_account_id: bankId ? parseInt(bankId) : null }));
    };

    const handleSubmit = () => {
        if (!transferDetails.bank_account_id) {
            alert("Please select a bank account");
            return;
        }
        if (!transferDetails.reference_no) {
            alert("Please enter transaction reference number");
            return;
        }

        // Get bank name from selected bank
        const selectedBankObj = banks.find(bank => bank.id === transferDetails.bank_account_id);
        const transferDataWithBank = {
            ...transferDetails,
            bank_name: selectedBankObj ? selectedBankObj.bank_name : null
        };

        onConfirm(transferDataWithBank);
        // Reset form after submit
        setTransferDetails({
            bank_account_id: null,
            reference_no: '',
            transfer_date: new Date().toISOString().split('T')[0],
            notes: ''
        });
    };

    // Handle Enter key navigation
    const handleKeyPress = (e, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextRef && nextRef.current) {
                setTimeout(() => {
                    nextRef.current.focus();
                }, 50);
            }
        }
    };

    // Handle Enter key for select element
    const handleSelectKeyDown = (e, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextRef && nextRef.current) {
                setTimeout(() => {
                    nextRef.current.focus();
                }, 50);
            } else {
                // If no next field, submit
                handleSubmit();
            }
        }
    };

    // Handle Enter key on last field (notes) - submits the form
    const handleLastFieldKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Handle Enter key on buttons
    const handleButtonKeyPress = (e, action) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            action();
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '20px',
                width: '500px',
                maxWidth: '90%',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '20px 24px',
                    background: 'linear-gradient(135deg, #ec489a, #db2777)',
                    borderRadius: '20px 20px 0 0',
                }}>
                    <span style={{ fontSize: '28px' }}>🏦</span>
                    <h3 style={{ margin: 0, color: 'white', fontSize: '20px', fontWeight: '700' }}>Bank to Bank Transfer</h3>
                </div>

                <div style={{ padding: '24px' }}>
                    <div style={{ background: '#fdf2f8', padding: '16px', borderRadius: '14px', marginBottom: '24px', border: '1px solid #fbcfe8' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#be185d', marginBottom: '10px' }}>💰 Payment Details</div>
                        <div style={{ fontSize: '13px', color: '#9d174d', lineHeight: '1.6' }}>
                            <strong>Amount:</strong> Rs. {amount?.toFixed(2) || '0.00'}<br />
                            <strong>Supplier:</strong> {supplierCode}
                        </div>
                    </div>

                    {/* Bank Account Selector Field */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>🏦 Select Bank Account <span style={{ color: '#ef4444' }}>*</span></label>
                        {loading ? (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>Loading banks...</div>
                        ) : (
                            <select
                                ref={bankSelectRef}
                                value={transferDetails.bank_account_id || ''}
                                onChange={(e) => handleBankSelect(e.target.value)}
                                onKeyDown={(e) => handleSelectKeyDown(e, referenceNoRef)}
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    border: '2px solid #e2e8f0',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    background: 'white',
                                    cursor: 'pointer',
                                    outline: 'none'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#ec489a'}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                            >
                                <option value="">-- Select Bank Account --</option>
                                {banks.map(bank => (
                                    <option key={bank.id} value={bank.id}>
                                        {bank.bank_name} - {bank.branch} (Acc: {bank.account_no})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Transaction Reference Number Field */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>🔢 Transaction Reference Number <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                            ref={referenceNoRef}
                            type="text"
                            name="reference_no"
                            value={transferDetails.reference_no}
                            onChange={handleChange}
                            onKeyPress={(e) => handleKeyPress(e, transferDateRef)}
                            placeholder="Enter transaction ID / Reference"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                outline: 'none',
                                fontFamily: 'monospace'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#ec489a'}
                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>

                    {/* Transfer Date Field */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>📅 Transfer Date <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                            ref={transferDateRef}
                            type="date"
                            name="transfer_date"
                            value={transferDetails.transfer_date}
                            onChange={handleChange}
                            onKeyPress={(e) => handleKeyPress(e, notesRef)}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#ec489a'}
                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>

                    {/* Notes Field (Last Field - Submits on Enter) */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>📝 Notes (Optional)</label>
                        <textarea
                            ref={notesRef}
                            name="notes"
                            value={transferDetails.notes}
                            onChange={handleChange}
                            onKeyDown={handleLastFieldKeyPress}
                            placeholder="Additional notes about the transfer..."
                            rows="3"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                outline: 'none',
                                resize: 'vertical',
                                fontFamily: 'inherit'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#ec489a'}
                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>

                    {/* Buttons Section */}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                        <button
                            ref={cancelButtonRef}
                            onClick={onClose}
                            onKeyPress={(e) => handleButtonKeyPress(e, onClose)}
                            style={{
                                padding: '10px 24px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: 'none',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '13px',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                        >
                            Cancel
                        </button>
                        <button
                            ref={confirmButtonRef}
                            onClick={handleSubmit}
                            onKeyPress={(e) => handleButtonKeyPress(e, handleSubmit)}
                            style={{
                                padding: '10px 24px',
                                background: 'linear-gradient(135deg, #ec489a, #db2777)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '13px',
                                transition: 'transform 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            Confirm Transfer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
// ==================== PAYMENT ADJUSTMENT MODAL ====================
const PaymentAdjustmentModal = ({ isOpen, onClose, onConfirm, billNo, supplierCode, originalBillTotal, adjustmentType = 'bag_to_box', onAmountCalculated, maxAllowedAmount = Infinity }) => {
    const [bagCount, setBagCount] = useState('');
    const [boxCount, setBoxCount] = useState('');
    const [bagValue, setBagValue] = useState('');
    const [boxValue, setBoxValue] = useState('');
    const [targetSupplierCode, setTargetSupplierCode] = useState('');
    const [targetSupplierBillNo, setTargetSupplierBillNo] = useState('');
    const [targetSupplierBillValue, setTargetSupplierBillValue] = useState('');
    const [badDebtName, setBadDebtName] = useState('');
    const [badDebtAmount, setBadDebtAmount] = useState('');
    const [exceedsMax, setExceedsMax] = useState(false);

    // Refs for input fields to enable Enter key navigation
    const bagCountRef = useRef(null);
    const bagValueRef = useRef(null);
    const boxCountRef = useRef(null);
    const boxValueRef = useRef(null);
    const targetSupplierCodeRef = useRef(null);
    const targetSupplierBillNoRef = useRef(null);
    const targetSupplierBillValueRef = useRef(null);
    const badDebtNameRef = useRef(null);
    const badDebtAmountRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const confirmButtonRef = useRef(null);

    // Helper function to check if amount exceeds max
    const checkExceedsMax = (amount) => {
        if (maxAllowedAmount !== Infinity && amount > maxAllowedAmount) {
            setExceedsMax(true);
            return true;
        }
        setExceedsMax(false);
        return false;
    };

    // Effect to auto-calculate and send amount for bag_to_box
    useEffect(() => {
        if (adjustmentType === 'bag_to_box' && onAmountCalculated) {
            const totalBagValue = (parseInt(bagCount) || 0) * (parseFloat(bagValue) || 0);
            const totalBoxValue = (parseInt(boxCount) || 0) * (parseFloat(boxValue) || 0);
            const amount = Math.abs(totalBagValue + totalBoxValue);
            if (amount > 0 && !checkExceedsMax(amount)) {
                onAmountCalculated(amount);
            } else if (amount > 0 && checkExceedsMax(amount)) {
                onAmountCalculated(0);
            }
        }
    }, [bagCount, bagValue, boxCount, boxValue, adjustmentType, maxAllowedAmount]);

    // Effect for bill_to_bill
    useEffect(() => {
        if (adjustmentType === 'bill_to_bill' && onAmountCalculated) {
            const amount = parseFloat(targetSupplierBillValue) || 0;
            if (amount > 0 && !checkExceedsMax(amount)) {
                onAmountCalculated(amount);
            } else if (amount > 0 && checkExceedsMax(amount)) {
                onAmountCalculated(0);
            }
        }
    }, [targetSupplierBillValue, adjustmentType, maxAllowedAmount]);

    // Effect for bad_debt
    useEffect(() => {
        if (adjustmentType === 'bad_debt' && onAmountCalculated) {
            const amount = parseFloat(badDebtAmount) || 0;
            if (amount > 0 && !checkExceedsMax(amount)) {
                onAmountCalculated(amount);
            } else if (amount > 0 && checkExceedsMax(amount)) {
                onAmountCalculated(0);
            }
        }
    }, [badDebtAmount, adjustmentType, maxAllowedAmount]);

    if (!isOpen) return null;

    const calculateBagToBoxAdjustment = () => {
        const totalBagValue = (parseInt(bagCount) || 0) * (parseFloat(bagValue) || 0);
        const totalBoxValue = (parseInt(boxCount) || 0) * (parseFloat(boxValue) || 0);
        const totalAmount = totalBagValue + totalBoxValue;

        // Check against max allowed amount
        if (maxAllowedAmount !== Infinity && totalAmount > maxAllowedAmount) {
            return 0;
        }
        return totalAmount;
    };

    const handleConfirm = () => {
        const adjustmentData = { adjustment_type: adjustmentType, original_bill_total: originalBillTotal };
        let amount = 0;

        if (adjustmentType === 'bag_to_box') {
            if (!bagCount || !boxCount || !bagValue || !boxValue) {
                alert('Please fill all bag/box fields');
                return;
            }
            amount = Math.abs(calculateBagToBoxAdjustment());
            if (amount === 0 && maxAllowedAmount !== Infinity) {
                alert(`Adjustment amount exceeds maximum allowed of Rs. ${formatDecimal(maxAllowedAmount)}`);
                return;
            }
            adjustmentData.bag_count = parseInt(bagCount);
            adjustmentData.box_count = parseInt(boxCount);
            adjustmentData.bag_value = parseFloat(bagValue);
            adjustmentData.box_value = parseFloat(boxValue);
            adjustmentData.amount = amount;
        } else if (adjustmentType === 'bill_to_bill') {
            if (!targetSupplierCode || !targetSupplierBillNo || !targetSupplierBillValue) {
                alert('Please fill all bill to bill fields');
                return;
            }
            amount = parseFloat(targetSupplierBillValue);
            if (maxAllowedAmount !== Infinity && amount > maxAllowedAmount) {
                alert(`Bill amount exceeds maximum allowed of Rs. ${formatDecimal(maxAllowedAmount)}`);
                return;
            }
            adjustmentData.target_supplier_code = targetSupplierCode;
            adjustmentData.target_supplier_bill_no = targetSupplierBillNo;
            adjustmentData.target_supplier_bill_value = amount;
            adjustmentData.amount = amount;
        } else if (adjustmentType === 'bad_debt') {
            if (!badDebtName || !badDebtAmount) {
                alert('Please enter bad debt name and amount');
                return;
            }
            amount = parseFloat(badDebtAmount);
            if (maxAllowedAmount !== Infinity && amount > maxAllowedAmount) {
                alert(`Bad debt amount exceeds maximum allowed of Rs. ${formatDecimal(maxAllowedAmount)}`);
                return;
            }
            adjustmentData.bad_debt_name = badDebtName;
            adjustmentData.bad_debt_amount = amount;
            adjustmentData.amount = amount;
        }

        onConfirm(adjustmentData);
        onClose();
    };

    // Reset form fields when modal closes
    const handleClose = () => {
        setBagCount('');
        setBoxCount('');
        setBagValue('');
        setBoxValue('');
        setTargetSupplierCode('');
        setTargetSupplierBillNo('');
        setTargetSupplierBillValue('');
        setBadDebtName('');
        setBadDebtAmount('');
        setExceedsMax(false);
        onClose();
    };

    // Handle Enter key navigation
    const handleKeyPress = (e, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextRef && nextRef.current) {
                nextRef.current.focus();
            }
        }
    };

    // Handle Enter key on last field or confirm button
    const handleLastFieldKeyPress = (e, isLastField = false) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isLastField && !exceedsMax) {
                handleConfirm();
            } else if (confirmButtonRef.current && !exceedsMax) {
                confirmButtonRef.current.focus();
            }
        }
    };

    const getModalTitle = () => {
        switch (adjustmentType) {
            case 'bag_to_box': return '📦 Bag to Box Conversion';
            case 'bill_to_bill': return '📄 Bill to Bill Transfer';
            case 'bad_debt': return '⚠️ Bad Debt Write-off';
            default: return 'Payment Adjustment';
        }
    };

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDecimalLocal = (value) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number(value || 0));
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }} onClick={handleClose}>
            <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '750px', maxWidth: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '24px 24px 0 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '28px' }}>🔧</span>
                        <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'white' }}>{getModalTitle()}</h3>
                    </div>
                    <button onClick={handleClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'white', width: '34px', height: '34px', borderRadius: '50%' }}>×</button>
                </div>

                {maxAllowedAmount !== Infinity && (
                    <div style={{ padding: '12px 24px', background: '#dbeafe', borderBottom: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: '12px', color: '#1e40af' }}>
                            ⚠️ Maximum allowed amount: {formatCurrency(maxAllowedAmount)}
                        </div>
                    </div>
                )}

                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    {/* Show different form based on adjustment type */}
                    {adjustmentType === 'bag_to_box' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>📦 Number of Bags</label>
                                    <input
                                        ref={bagCountRef}
                                        type="number"
                                        value={bagCount}
                                        onChange={(e) => setBagCount(e.target.value)}
                                        onKeyPress={(e) => handleKeyPress(e, bagValueRef)}
                                        style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>💰 Value per Bag (Rs.)</label>
                                    <input
                                        ref={bagValueRef}
                                        type="number"
                                        value={bagValue}
                                        onChange={(e) => setBagValue(e.target.value)}
                                        onKeyPress={(e) => handleKeyPress(e, boxCountRef)}
                                        style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>📦 Number of Boxes</label>
                                    <input
                                        ref={boxCountRef}
                                        type="number"
                                        value={boxCount}
                                        onChange={(e) => setBoxCount(e.target.value)}
                                        onKeyPress={(e) => handleKeyPress(e, boxValueRef)}
                                        style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>💰 Value per Box (Rs.)</label>
                                    <input
                                        ref={boxValueRef}
                                        type="number"
                                        value={boxValue}
                                        onChange={(e) => setBoxValue(e.target.value)}
                                        onKeyPress={(e) => handleLastFieldKeyPress(e, false)}
                                        style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px' }}
                                    />
                                </div>
                            </div>
                            <div style={{ background: exceedsMax ? '#fee2e2' : 'linear-gradient(135deg, #fef3c7, #fde68a)', padding: '16px', borderRadius: '12px' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600' }}>📊 Adjustment Summary</div>
                                <div>Adjustment Amount: Rs. {Math.abs(calculateBagToBoxAdjustment()).toFixed(2)}</div>
                                {maxAllowedAmount !== Infinity && calculateBagToBoxAdjustment() > maxAllowedAmount && (
                                    <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '8px', fontWeight: 'bold' }}>
                                        ⚠️ Amount exceeds maximum allowed! Max: {formatCurrency(maxAllowedAmount)}
                                    </div>
                                )}
                                {Math.abs(calculateBagToBoxAdjustment()) > 0 && calculateBagToBoxAdjustment() <= maxAllowedAmount && (
                                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#92400e' }}>
                                        💡 This amount will be automatically filled in the payment field when you click "Apply Adjustment"
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {adjustmentType === 'bill_to_bill' && (
                        <div style={{ marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '16px' }}>
                            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>🏢 Supplier Bill Transfer</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>Supplier Code</label>
                                    <input
                                        ref={targetSupplierCodeRef}
                                        type="text"
                                        value={targetSupplierCode}
                                        onChange={(e) => setTargetSupplierCode(e.target.value.toUpperCase())}
                                        onKeyPress={(e) => handleKeyPress(e, targetSupplierBillNoRef)}
                                        style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>Supplier Bill No</label>
                                    <input
                                        ref={targetSupplierBillNoRef}
                                        type="text"
                                        value={targetSupplierBillNo}
                                        onChange={(e) => setTargetSupplierBillNo(e.target.value)}
                                        onKeyPress={(e) => handleKeyPress(e, targetSupplierBillValueRef)}
                                        style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>Bill Amount (Rs.)</label>
                                <input
                                    ref={targetSupplierBillValueRef}
                                    type="number"
                                    value={targetSupplierBillValue}
                                    onChange={(e) => {
                                        let val = e.target.value;
                                        if (val === "") {
                                            setTargetSupplierBillValue("");
                                            return;
                                        }
                                        let num = parseFloat(val);
                                        if (maxAllowedAmount !== Infinity && num > maxAllowedAmount) {
                                            alert(`Maximum allowed: Rs. ${formatDecimalLocal(maxAllowedAmount)}`);
                                            return;
                                        }
                                        setTargetSupplierBillValue(val);
                                    }}
                                    onKeyPress={(e) => handleLastFieldKeyPress(e, false)}
                                    style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px' }}
                                />
                            </div>
                            <div style={{ background: (parseFloat(targetSupplierBillValue) || 0) > maxAllowedAmount && maxAllowedAmount !== Infinity ? '#fee2e2' : '#dbeafe', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600' }}>📊 Transfer Summary</div>
                                <div>Transfer Amount: Rs. {(parseFloat(targetSupplierBillValue) || 0).toLocaleString()}</div>
                                {maxAllowedAmount !== Infinity && (parseFloat(targetSupplierBillValue) || 0) > maxAllowedAmount && (
                                    <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '8px', fontWeight: 'bold' }}>
                                        ⚠️ Amount exceeds maximum allowed! Max: {formatCurrency(maxAllowedAmount)}
                                    </div>
                                )}
                                {(parseFloat(targetSupplierBillValue) || 0) > 0 && (parseFloat(targetSupplierBillValue) || 0) <= maxAllowedAmount && (
                                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#1e40af' }}>
                                        💡 This amount will be automatically filled in the payment field when you click "Apply Adjustment"
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {adjustmentType === 'bad_debt' && (
                        <>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>Bad Debt Name/Reference</label>
                                <input
                                    ref={badDebtNameRef}
                                    type="text"
                                    value={badDebtName}
                                    onChange={(e) => setBadDebtName(e.target.value)}
                                    onKeyPress={(e) => handleKeyPress(e, badDebtAmountRef)}
                                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e2e8f0', borderRadius: '12px' }}
                                />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px' }}>Bad Debt Amount (Rs.)</label>
                                <input
                                    ref={badDebtAmountRef}
                                    type="number"
                                    value={badDebtAmount}
                                    onChange={(e) => {
                                        let val = e.target.value;
                                        if (val === "") {
                                            setBadDebtAmount("");
                                            return;
                                        }
                                        let num = parseFloat(val);
                                        if (maxAllowedAmount !== Infinity && num > maxAllowedAmount) {
                                            alert(`Maximum allowed: Rs. ${formatDecimalLocal(maxAllowedAmount)}`);
                                            return;
                                        }
                                        setBadDebtAmount(val);
                                    }}
                                    onKeyPress={(e) => handleLastFieldKeyPress(e, false)}
                                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e2e8f0', borderRadius: '12px' }}
                                />
                            </div>
                            <div style={{ background: (parseFloat(badDebtAmount) || 0) > maxAllowedAmount && maxAllowedAmount !== Infinity ? '#fee2e2' : '#fee2e2', padding: '16px', borderRadius: '12px' }}>
                                <div style={{ fontSize: '14px', fontWeight: '600' }}>⚠️ Bad Debt Write-off: Rs. {(parseFloat(badDebtAmount) || 0).toLocaleString()}</div>
                                {maxAllowedAmount !== Infinity && (parseFloat(badDebtAmount) || 0) > maxAllowedAmount && (
                                    <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '8px', fontWeight: 'bold' }}>
                                        ⚠️ Amount exceeds maximum allowed! Max: {formatCurrency(maxAllowedAmount)}
                                    </div>
                                )}
                                {(parseFloat(badDebtAmount) || 0) > 0 && (parseFloat(badDebtAmount) || 0) <= maxAllowedAmount && (
                                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#991b1b' }}>
                                        💡 This amount will be automatically filled in the payment field when you click "Apply Adjustment"
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc', borderRadius: '0 0 24px 24px' }}>
                    <button
                        ref={cancelButtonRef}
                        onClick={handleClose}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleClose();
                            }
                        }}
                        style={{ padding: '10px 24px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600' }}
                    >
                        Cancel
                    </button>
                    <button
                        ref={confirmButtonRef}
                        onClick={handleConfirm}
                        disabled={exceedsMax}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && !exceedsMax) {
                                e.preventDefault();
                                handleConfirm();
                            }
                        }}
                        style={{
                            padding: '10px 24px',
                            background: exceedsMax ? '#9ca3af' : 'linear-gradient(135deg, #4CAF50, #45a049)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: exceedsMax ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            opacity: exceedsMax ? 0.6 : 1
                        }}
                    >
                        Apply Adjustment
                    </button>
                </div>
            </div>
        </div>
    );
};
// ==================== DELETE CONFIRMATION MODAL ====================
const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, supplierCode, billNo }) => {
    const [loading, setLoading] = useState(false);
    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20001 }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', width: '450px', maxWidth: '90%', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '48px' }}>⚠️</span>
                    <h3>Delete Payment Record</h3>
                    <p>Are you sure you want to delete this payment record?</p>
                </div>
                <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>
                    <strong>Supplier:</strong> {supplierCode}<br />
                    <strong>Bill No:</strong> {billNo || 'N/A'}<br />
                    <strong>Warning:</strong> This action cannot be undone!
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => onConfirm(supplierCode, billNo)} disabled={loading} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', border: 'none', borderRadius: '10px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? 'Deleting...' : 'Yes, Delete'}</button>
                </div>
            </div>
        </div>
    );
};

// ==================== PRINT BILL MODAL ====================
const PrintBillModal = ({ isOpen, onClose, billContent, billSize, setBillSize, onPrint }) => {
    if (!isOpen) return null;

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<html><head><title>Print Bill</title><style>@media print{@page{margin:0;}body{margin:0;padding:0;}}</style></head><body>${billContent}</body></html>`);
        printWindow.document.close();
        printWindow.print();
        printWindow.close();
        onPrint();
        onClose();
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20002, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', width: '500px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
                <h3>Print Bill</h3>
                <div style={{ marginBottom: '16px' }}>
                    <label>Bill Size: </label>
                    <select value={billSize} onChange={(e) => setBillSize(e.target.value)} style={{ padding: '8px', marginLeft: '12px', borderRadius: '8px' }}>
                        <option value="4inch">4 Inch (Thermal)</option>
                        <option value="a4">A4 Paper</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px' }}>Cancel</button>
                    <button onClick={handlePrint} style={{ padding: '10px 20px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px' }}>Print Bill</button>
                </div>
            </div>
        </div>
    );
};

// ==================== CREDITOR MODAL ====================
const CreditorModal = ({ isOpen, onClose, onConfirm, supplierCode: initialSupplierCode = '', billNo: initialBillNo = null }) => {
    const [supplierCode, setSupplierCode] = useState(initialSupplierCode || '');
    const [billNo, setBillNo] = useState(initialBillNo || '');
    const [loading, setLoading] = useState(false);
    const [showSupplierForm, setShowSupplierForm] = useState(false);
    const [matchingSuppliers, setMatchingSuppliers] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
    const [selectedFromDropdown, setSelectedFromDropdown] = useState(false);
    const [selectedSupplierData, setSelectedSupplierData] = useState(null);
    const [formData, setFormData] = useState({ code: '', name: '', dob: '', address: '', telephone_no: '', profile_pic: null, nic_front: null, nic_back: null });
    const [previewImages, setPreviewImages] = useState({ profile_pic: null, nic_front: null, nic_back: null });

    // Refs for form fields in supplier form
    const nameRef = useRef(null);
    const dobRef = useRef(null);
    const addressRef = useRef(null);
    const telephoneRef = useRef(null);
    const profilePicRef = useRef(null);
    const nicFrontRef = useRef(null);
    const nicBackRef = useRef(null);
    const submitButtonRef = useRef(null);
    const backButtonRef = useRef(null);
    const mainInputRef = useRef(null); // Add ref for main input

    // Auto-focus name field when supplier form opens
    useEffect(() => {
        if (showSupplierForm && nameRef.current) {
            const id = setTimeout(() => {
                nameRef.current?.focus();
            }, 100);
            return () => clearTimeout(id);
        }
    }, [showSupplierForm]);

    // Auto-focus main input when modal opens
    useEffect(() => {
        if (isOpen && !showSupplierForm && mainInputRef.current) {
            const id = setTimeout(() => {
                mainInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(id);
        }
    }, [isOpen, showSupplierForm]);

    // Clear NIC/image previews on close to free memory
    useEffect(() => {
        if (!isOpen) {
            setPreviewImages({ profile_pic: null, nic_front: null, nic_back: null });
        }
    }, [isOpen]);

    // IMPORTANT: Keep formData.code in sync with supplierCode
    useEffect(() => {
        if (supplierCode) {
            setFormData(prev => ({ ...prev, code: supplierCode }));
        }
    }, [supplierCode]);

    useEffect(() => {
        // Only set initial values when modal first opens, not on every prop change
        if (isOpen && initialSupplierCode && supplierCode === '') {
            setSupplierCode(initialSupplierCode);
        }
        if (isOpen && initialBillNo && billNo === '') {
            setBillNo(initialBillNo);
        }
    }, [isOpen, initialSupplierCode, initialBillNo]);

    useEffect(() => {
        if (supplierCode && supplierCode.length > 0 && !selectedFromDropdown) {
            const timer = setTimeout(() => fetchMatchingSuppliers(supplierCode.charAt(0)), 300);
            return () => clearTimeout(timer);
        } else if (!supplierCode) {
            setMatchingSuppliers([]);
            setShowSuggestions(false);
        }
    }, [supplierCode, selectedFromDropdown]);

    const fetchMatchingSuppliers = async (letter) => {
        if (!letter) { setMatchingSuppliers([]); setShowSuggestions(false); return; }
        setIsLoadingSuppliers(true);
        try {
            const response = await api.get(`/suppliers/by-letter?letter=${letter}`);
            if (response.data.success) {
                setMatchingSuppliers(response.data.data);
                setShowSuggestions(response.data.data.length > 0);
            }
        } catch (error) { safeError('Error fetching suppliers:', error); }
        finally { setIsLoadingSuppliers(false); }
    };

    const handleSupplierCodeChange = (e) => {
         // Debug log
        const newCode = e.target.value.toUpperCase();
        setSupplierCode(newCode);
        setFormData(prev => ({ ...prev, code: newCode }));
        setSelectedFromDropdown(false);
        setSelectedSupplierData(null);
    };

    const handleSelectSupplier = (supplier) => {
        setSupplierCode(supplier.code);
        setFormData(prev => ({ ...prev, code: supplier.code }));
        setSelectedSupplierData(supplier);
        setSelectedFromDropdown(true);
        setShowSuggestions(false);

        // Show success toast/message
        const message = `✅ Supplier "${supplier.code}" selected!\n📋 Creditor Number: ${supplier.Creditor_no || 'Not Assigned'}\n📝 Name: ${supplier.name || 'No name'}\n\n📄 Bill No: ${billNo || 'N/A'}`;
        alert(message);
    };

    const handleCheckCreditor = async () => {
        if (!supplierCode) { alert('Please enter supplier code'); return; }
        setLoading(true);
        try {
            if (selectedFromDropdown && selectedSupplierData) {
                if (selectedSupplierData.Creditor !== 'Y') {
                    await api.put('/suppliers/update-creditor-status', { code: supplierCode, Creditor: 'Y', bill_no: billNo });
                }
                await api.post('/creditors/create-with-supplier', { bill_no: billNo, supplier_code: supplierCode, credit_amount: 0, creditor_no: selectedSupplierData.Creditor_no });
                alert(`✅ Creditor record created for Bill #${billNo}\n📋 Supplier: ${supplierCode}`);
                onConfirm(selectedSupplierData);
                onClose();
            } else {
                setShowSupplierForm(true);
            }
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSupplier = async () => {
        const submitData = new FormData();
        submitData.append('code', supplierCode.toUpperCase());
        submitData.append('name', formData.name);
        submitData.append('dob', formData.dob);
        submitData.append('address', formData.address);
        submitData.append('telephone_no', formData.telephone_no);
        submitData.append('bill_no', billNo);
        submitData.append('credit_amount', '0');
        if (formData.profile_pic) submitData.append('profile_pic', formData.profile_pic);
        if (formData.nic_front) submitData.append('nic_front', formData.nic_front);
        if (formData.nic_back) submitData.append('nic_back', formData.nic_back);

        setLoading(true);
        try {
            const response = await api.post('/suppliers', submitData, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (billNo) {
                await api.post('/creditors/create-with-supplier', { bill_no: billNo, supplier_code: supplierCode.toUpperCase(), credit_amount: 0, creditor_no: response.data.Creditor_no });
            }
            alert(`Supplier registered as Creditor successfully!\nCreditor Number: ${response.data.Creditor_no}`);
            onConfirm(response.data.supplier);
            onClose();
        } catch (error) {
            safeError('Error:', error);
            alert('Error creating supplier: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    // Handle image preview
    const handleImageChange = (e, fieldName) => {
        const file = e.target.files[0];
        if (file) {
            setFormData({ ...formData, [fieldName]: file });
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImages(prev => ({ ...prev, [fieldName]: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    // Handle Enter key navigation
    const handleKeyPress = (e, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextRef && nextRef.current) {
                nextRef.current.focus();
            }
        }
    };

    const handleLastFieldKeyPress = (e, isLastField = false) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isLastField) {
                if (submitButtonRef.current) {
                    submitButtonRef.current.click();
                }
            } else if (submitButtonRef.current) {
                submitButtonRef.current.focus();
            }
        }
    };

    if (showSupplierForm) {
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(5px)',
                zIndex: 20001,
                overflowY: 'auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'auto'
            }} onClick={onClose}>
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '24px',
                    width: '550px',
                    maxWidth: '90%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                }} onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        padding: '20px 24px',
                        borderRadius: '24px 24px 0 0',
                        position: 'sticky',
                        top: 0,
                        zIndex: 1
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '28px' }}>🏪</span>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'white' }}>Create New Supplier (Creditor)</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
                                    Register a new supplier as creditor
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '24px' }}>
                        {billNo && (
                            <div style={{
                                background: '#e0f2fe',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                borderLeft: '4px solid #0284c7'
                            }}>
                                <span style={{ fontSize: '20px' }}>📄</span>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#0369a1' }}>Linked Bill</div>
                                    <div style={{ fontWeight: '600', color: '#0c4a6e' }}>Bill No: {billNo}</div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>
                                Supplier Code <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={supplierCode}
                                disabled
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    border: '2px solid #e2e8f0',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    background: '#f1f5f9',
                                    color: '#1e293b',
                                    fontFamily: 'monospace',
                                    fontWeight: 'bold'
                                }}
                            />
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); handleCreateSupplier(); }}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>
                                    Supplier Name <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    ref={nameRef}
                                    type="text"
                                    name="name"
                                    placeholder="Enter supplier name"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    onKeyPress={(e) => handleKeyPress(e, dobRef)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '10px',
                                        fontSize: '13px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                        background: 'white'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>
                                    Date of Birth
                                </label>
                                <input
                                    ref={dobRef}
                                    type="date"
                                    name="dob"
                                    value={formData.dob}
                                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                                    onKeyPress={(e) => handleKeyPress(e, addressRef)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '10px',
                                        fontSize: '13px',
                                        outline: 'none',
                                        background: 'white'
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>
                                    Address <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <textarea
                                    ref={addressRef}
                                    name="address"
                                    placeholder="Enter full address"
                                    required
                                    rows="2"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    onKeyPress={(e) => handleKeyPress(e, telephoneRef)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '10px',
                                        fontSize: '13px',
                                        outline: 'none',
                                        resize: 'vertical',
                                        background: 'white'
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>
                                    Telephone Number <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    ref={telephoneRef}
                                    type="tel"
                                    name="telephone_no"
                                    placeholder="Enter telephone number"
                                    required
                                    value={formData.telephone_no}
                                    onChange={(e) => setFormData({ ...formData, telephone_no: e.target.value })}
                                    onKeyPress={(e) => handleKeyPress(e, profilePicRef)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '10px',
                                        fontSize: '13px',
                                        outline: 'none',
                                        background: 'white'
                                    }}
                                />
                            </div>

                            {/* Profile Picture */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>
                                    Profile Picture
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <input
                                        ref={profilePicRef}
                                        type="file"
                                        name="profile_pic"
                                        accept="image/*"
                                        onChange={(e) => handleImageChange(e, 'profile_pic')}
                                        onKeyPress={(e) => handleKeyPress(e, nicFrontRef)}
                                        style={{ flex: 1, padding: '8px', background: 'white' }}
                                    />
                                    {previewImages.profile_pic && (
                                        <img src={previewImages.profile_pic} alt="Preview" style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }} />
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>
                                        NIC Front
                                    </label>
                                    <input
                                        ref={nicFrontRef}
                                        type="file"
                                        name="nic_front"
                                        accept="image/*"
                                        onChange={(e) => handleImageChange(e, 'nic_front')}
                                        onKeyPress={(e) => handleKeyPress(e, nicBackRef)}
                                        style={{ width: '100%', padding: '8px', background: 'white' }}
                                    />
                                    {previewImages.nic_front && (
                                        <img src={previewImages.nic_front} alt="NIC Front" style={{ width: '100%', maxHeight: '80px', objectFit: 'cover', marginTop: '8px', borderRadius: '8px' }} />
                                    )}
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '12px', color: '#334155' }}>
                                        NIC Back
                                    </label>
                                    <input
                                        ref={nicBackRef}
                                        type="file"
                                        name="nic_back"
                                        accept="image/*"
                                        onChange={(e) => handleImageChange(e, 'nic_back')}
                                        onKeyPress={(e) => handleLastFieldKeyPress(e, false)}
                                        style={{ width: '100%', padding: '8px', background: 'white' }}
                                    />
                                    {previewImages.nic_back && (
                                        <img src={previewImages.nic_back} alt="NIC Back" style={{ width: '100%', maxHeight: '80px', objectFit: 'cover', marginTop: '8px', borderRadius: '8px' }} />
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <button
                                    ref={backButtonRef}
                                    type="button"
                                    onClick={() => setShowSupplierForm(false)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            setShowSupplierForm(false);
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        background: '#f1f5f9',
                                        color: '#475569',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                >
                                    Back
                                </button>
                                <button
                                    ref={submitButtonRef}
                                    type="submit"
                                    disabled={loading}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleCreateSupplier();
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        background: loading ? '#9ca3af' : 'linear-gradient(135deg, #4CAF50, #45a049)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        opacity: loading ? 0.6 : 1,
                                        transition: 'transform 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!loading) {
                                            e.currentTarget.style.transform = 'scale(1.02)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                >
                                    {loading ? 'Saving...' : 'Create Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 20001,
            pointerEvents: 'auto'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                width: '550px',
                maxWidth: '90%',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                pointerEvents: 'auto'
            }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '20px 24px',
                    borderRadius: '24px 24px 0 0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '28px' }}>💰</span>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'white' }}>Creditor Mode</h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
                                Mark supplier as creditor
                            </p>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    {billNo && (
                        <div style={{
                            background: '#e0f2fe',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            borderLeft: '4px solid #0284c7'
                        }}>
                            <span style={{ fontSize: '20px' }}>📄</span>
                            <div>
                                <div style={{ fontSize: '11px', color: '#0369a1' }}>Current Bill</div>
                                <div style={{ fontWeight: '600', color: '#0c4a6e', fontSize: '14px' }}>Bill Number: <strong>{billNo}</strong></div>
                            </div>
                        </div>
                    )}

                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                        Enter supplier code to mark as creditor:
                    </p>

                    <div style={{ position: 'relative', marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>
                            Supplier Code <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                            ref={mainInputRef}
                            type="text"
                            value={supplierCode}
                            onChange={handleSupplierCodeChange}
                            placeholder="Enter Supplier Code (e.g., SUP001)"
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontFamily: 'monospace',
                                fontWeight: 'bold',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                                background: 'white',
                                color: '#1e293b'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#667eea'}
                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />

                        {showSuggestions && !selectedFromDropdown && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                zIndex: 20002,
                                maxHeight: '250px',
                                overflowY: 'auto',
                                marginTop: '4px'
                            }}>
                                {isLoadingSuppliers ? (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                                        <div style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid #e2e8f0', borderTopColor: '#667eea', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div>
                                        <p style={{ marginTop: '8px', fontSize: '12px' }}>Loading suppliers...</p>
                                    </div>
                                ) : (
                                    matchingSuppliers.map((supplier, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectSupplier(supplier)}
                                            style={{
                                                padding: '14px 16px',
                                                cursor: 'pointer',
                                                borderBottom: idx < matchingSuppliers.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>{supplier.code}</div>
                                                    {supplier.name && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{supplier.name}</div>}
                                                </div>
                                                <div style={{
                                                    background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                                                    padding: '4px 12px',
                                                    borderRadius: '20px',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    color: '#065f46'
                                                }}>
                                                    📋 {supplier.Creditor_no || 'Creditor'}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{
                        fontSize: '12px',
                        color: '#64748b',
                        padding: '12px 16px',
                        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                        borderRadius: '12px',
                        marginBottom: '16px'
                    }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px', color: '#475569' }}>💡 Tip:</div>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            <li>Select from dropdown → Use existing supplier</li>
                            <li>Type & click "Continue" → Create NEW supplier</li>
                        </ul>
                    </div>
                </div>

                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: '12px',
                    background: '#f8fafc',
                    borderRadius: '0 0 24px 24px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCheckCreditor}
                        disabled={loading}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: loading ? '#9ca3af' : 'linear-gradient(135deg, #4CAF50, #45a049)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                            opacity: loading ? 0.6 : 1,
                            transition: 'transform 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!loading) {
                                e.currentTarget.style.transform = 'scale(1.02)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        {loading ? 'Processing...' : 'Continue →'}
                    </button>
                </div>
            </div>
        </div>
    );
};
// ==================== VIEW OLD BILLS MODAL ====================
const ViewOldBillsModal = ({ isOpen, onClose, onViewBills, isLoading }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    if (!isOpen) return null;

    const handleView = () => {
        if (!startDate || !endDate) {
            alert('Please select both start date and end date');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            alert('Start date cannot be after end date');
            return;
        }
        onViewBills(startDate, endDate);
        onClose();
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20004 }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', width: '450px', maxWidth: '90%', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '28px' }}>📜</span>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>View Old Bills</h3>
                </div>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Select a date range to view bills from the history table.</p>
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>Start Date <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '14px' }} />
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>End Date <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                    <button onClick={handleView} disabled={isLoading} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', border: 'none', borderRadius: '10px', cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: isLoading ? 0.6 : 1 }}>{isLoading ? 'Loading...' : 'View Bills'}</button>
                </div>
            </div>
        </div>
    );
};

// ==================== STYLES ====================
const styles = {
    app: { width: '100vw', minHeight: '100vh', background: '#0dea77', margin: 0, padding: 0, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
    container: { width: '100%', maxWidth: '1600px', margin: '0 auto', padding: '24px 32px' },
    threeColumns: { display: 'grid', gridTemplateColumns: '0.7fr 2fr 0.7fr', gap: '24px', alignItems: 'start', width: '100%' },
    panel: { background: '#11ba2d', borderRadius: '20px', border: '4px solid #000000', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)', minHeight: '500px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    panelHeader: { padding: '16px 20px', background: '#ffffff', borderBottom: '1px solid #eef2ff' },
    panelTitle: { fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' },
    panelContent: { flex: 1, overflowY: 'auto', padding: '16px' },
    searchInput: { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '13px', background: 'white', outline: 'none' },
    billItem: { padding: '14px', borderRadius: '12px', marginBottom: '8px', cursor: 'pointer', transition: 'all 0.15s', border: '1px solid transparent' },
    billPending: { background: '#ffffff', borderColor: '#f1f5f9' },
    billSelected: { background: '#eff6ff', borderColor: '#074ec1' },
    billApplied: { background: '#f0fdf4', borderColor: '#dcfce7' },
    billRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    billLeft: { flex: 1 },
    billNo: { fontWeight: '700', fontSize: '15px', color: '#0f172a' },
    billCustomer: { fontSize: '12px', color: '#000000', fontWeight: 'bold', marginTop: '2px' },
    billRight: { textAlign: 'right' },
    billTotal: { fontWeight: '700', fontSize: '15px', color: '#0f172a' },
    billGiven: { fontSize: '11px', color: '#64748b', marginTop: '2px' },
    statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '28px', marginBottom: '0' },
    statBox: { background: 'white', borderRadius: '16px', padding: '18px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' },
    statLabel: { fontSize: '13px', fontWeight: '500', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    statNumber: { fontSize: '32px', fontWeight: '700', color: '#0f172a' },
    statSub: { fontSize: '12px', color: '#94a3b8', marginTop: '4px' },
    emptyState: { textAlign: 'center', padding: '60px 20px', color: '#94a3b8' },
    paymentBox: { background: '#f8fafc', borderRadius: '16px', padding: '18px', margin: '0 0 16px 0' },
    paymentButtonsContainer: { display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' },
    cashPaymentBtn: { flex: 1, padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    chequePaymentBtn: { flex: 1, padding: '12px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    bankToBankPaymentBtn: { flex: 1, padding: '12px', background: '#ec489a', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    adjustmentBtn: { width: '100%', marginBottom: '12px', padding: '12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }
};

const LoadingSkeleton = () => (
    <div style={styles.app}>
        <div style={styles.container}>
            <div style={{ height: '40px', background: '#e2e8f0', borderRadius: '12px', width: '200px', marginBottom: '24px' }}></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '24px' }}>
                {[1, 2, 3].map(i => <div key={i} style={{ background: 'white', borderRadius: '20px', height: '500px' }}></div>)}
            </div>
        </div>
    </div>
);

const EmptyState = ({ message }) => (
    <div style={styles.emptyState}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
        <p style={{ margin: 0, fontSize: '13px' }}>{message}</p>
    </div>
);

// ==================== DETAILED REPORT MODAL ====================
const DetailedReportModal = ({ isOpen, onClose, data, supplierCode, isLoading }) => {
    if (!isOpen) return null;

    const formatCurrency = (amount) => `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatDate = (date) => date ? new Date(date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
    const getPaymentColor = (method) => ({ 'Cash': '#10b981', 'Cheque': '#8b5cf6', 'Bank Transfer': '#ec489a', 'bag_to_box': '#f59e0b', 'bill_to_bill': '#3b82f6', 'bad_debt': '#ef4444' }[method] || '#6b7280');
    const getPaymentIcon = (method) => ({ 'Cash': '💰', 'Cheque': '💳', 'Bank Transfer': '🏦', 'bag_to_box': '📦', 'bill_to_bill': '📄', 'bad_debt': '⚠️' }[method] || '💵');

    if (isLoading) {
        return <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20003 }}><div style={{ background: 'white', borderRadius: '20px', padding: '40px', textAlign: 'center' }}><div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div><p>Loading detailed report...</p></div></div>;
    }

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20003, overflowY: 'auto', padding: '20px' }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '1200px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '24px 30px', borderRadius: '24px 24px 0 0', color: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>👨‍🌾 Farmer Detailed Report</h2><p style={{ margin: '8px 0 0 0', opacity: 0.9 }}>Supplier Code: <strong>{supplierCode}</strong></p></div>
                        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'white', width: '40px', height: '40px', borderRadius: '50%' }}>×</button>
                    </div>
                </div>
                {data && (
                    <div style={{ padding: '24px 30px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '30px' }}>
                            <div style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', padding: '20px', borderRadius: '16px', color: 'white' }}><div style={{ fontSize: '12px', marginBottom: '8px' }}>Total Sales</div><div style={{ fontSize: '28px', fontWeight: 'bold' }}>{formatCurrency(data.summary?.total_sales_value)}</div></div>
                            <div style={{ background: '#10b981', padding: '20px', borderRadius: '16px', color: 'white' }}><div style={{ fontSize: '12px', marginBottom: '8px' }}>Total Paid</div><div style={{ fontSize: '28px', fontWeight: 'bold' }}>{formatCurrency(data.summary?.total_paid)}</div></div>
                            <div style={{ background: '#f59e0b', padding: '20px', borderRadius: '16px', color: 'white' }}><div style={{ fontSize: '12px', marginBottom: '8px' }}>Remaining</div><div style={{ fontSize: '28px', fontWeight: 'bold' }}>{formatCurrency(data.summary?.total_remaining)}</div></div>
                            <div style={{ background: '#3b82f6', padding: '20px', borderRadius: '16px', color: 'white' }}><div style={{ fontSize: '12px', marginBottom: '8px' }}>Total Bills</div><div style={{ fontSize: '28px', fontWeight: 'bold' }}>{data.summary?.unique_bills || 0}</div></div>
                        </div>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: '#1e293b' }}>📋 Bills & Transactions</h3>
                        {data.bills?.map((bill, idx) => (
                            <div key={idx} style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                                <div style={{ background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                    <div><strong>Bill No: {bill.bill_no}</strong><div style={{ fontSize: '12px', color: '#64748b' }}>Date: {formatDate(bill.date)}</div></div>
                                    <div style={{ textAlign: 'right' }}><div>Total: <strong>{formatCurrency(bill.total_amount)}</strong></div><div>Paid: <strong style={{ color: '#10b981' }}>{formatCurrency(bill.paid_amount)}</strong></div><div>Remaining: <strong>{formatCurrency(bill.total_amount - bill.paid_amount)}</strong></div></div>
                                </div>
                            </div>
                        ))}
                        <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '30px 0 20px', color: '#1e293b' }}>📜 All Payment Records</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
                                <thead><tr style={{ background: '#f1f5f9' }}><th style={{ padding: '12px', textAlign: 'left' }}>Date</th><th style={{ padding: '12px', textAlign: 'left' }}>Bill No</th><th style={{ padding: '12px', textAlign: 'left' }}>Method</th><th style={{ padding: '12px', textAlign: 'right' }}>Amount</th><th style={{ padding: '12px', textAlign: 'left' }}>Reference</th></tr></thead>
                                <tbody>{data.all_payments?.map((payment, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '12px' }}>{formatDate(payment.created_at)}</td>
                                        <td style={{ padding: '12px' }}>{payment.bill_no || 'N/A'}</td>
                                        <td style={{ padding: '12px' }}><span style={{ background: getPaymentColor(payment.type), padding: '4px 10px', borderRadius: '20px', color: 'white', fontSize: '11px' }}>{getPaymentIcon(payment.type)} {payment.type}</span></td>
                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(payment.loan_amount)}</td>
                                        <td style={{ padding: '12px', fontSize: '11px', color: '#64748b' }}>{payment.cheque_no || payment.transfer_reference_no || '-'}</td>
                                    </tr>
                                ))}</tbody>
                                <tfoot><tr style={{ background: '#f8fafc', fontWeight: 'bold' }}><td colSpan="3" style={{ padding: '12px', textAlign: 'right' }}>Total:</td><td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(data.summary?.total_paid)}</td><td></td></tr></tfoot>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
// ==================== ADJUSTMENT SUMMARY MODAL ====================
const AdjustmentSummaryModal = ({ isOpen, onClose, totals }) => {
    if (!isOpen) return null;

    const formatCurrency = (amount) => `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const totalReceived = (totals.cash || 0) + (totals.cheque || 0) + (totals.bank_transfer || 0) + (totals.bag_to_box || 0) + (totals.bill_to_bill || 0) + (totals.bad_debt || 0);
    const totalWithCredit = totalReceived + (totals.credit || 0);

    const paymentItems = [
        { icon: '💰', label: 'Cash Payments', value: totals.cash, color: '#10b981', bg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
        { icon: '💳', label: 'Cheque Payments', value: totals.cheque, color: '#8b5cf6', bg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' },
        { icon: '🏦', label: 'Bank Transfer Payments', value: totals.bank_transfer, color: '#ec489a', bg: 'linear-gradient(135deg, #fce7f3, #fbcfe8)' },
        { icon: '💳', label: 'Credit Payments ', value: totals.credit, color: '#f59e0b', bg: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
        { icon: '📦', label: 'Bag to Box Conversion', value: totals.bag_to_box, color: '#f59e0b', bg: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
        { icon: '📄', label: 'Bill to Bill Transfer', value: totals.bill_to_bill, color: '#3b82f6', bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' },
        { icon: '⚠️', label: 'Bad Debt Write-off', value: totals.bad_debt, color: '#ef4444', bg: 'linear-gradient(135deg, #fee2e2, #fecaca)' }
    ];

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20001 }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', width: '450px', maxWidth: '90%', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #e2e8f0' }}>
                    <span style={{ fontSize: '40px', lineHeight: 1 }}>📊</span>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>Payment Summary</h3>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    {paymentItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', marginBottom: '10px', background: item.bg, borderRadius: '12px', borderLeft: `4px solid ${item.color}` }}>
                            <div><span style={{ fontSize: '20px', marginRight: '8px' }}>{item.icon}</span><span style={{ fontWeight: '600', color: item.color === '#10b981' ? '#065f46' : item.color === '#8b5cf6' ? '#5b21b6' : item.color === '#ec489a' ? '#9d174d' : item.color === '#f59e0b' ? '#92400e' : item.color === '#3b82f6' ? '#1e40af' : '#991b1b' }}>{item.label}</span></div>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#dc2626' }}>{formatCurrency(item.value || 0)}</div>
                        </div>
                    ))}

                    <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', margin: '16px 0' }}></div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '12px', color: 'white', marginBottom: '10px' }}>
                        <div><span style={{ fontSize: '20px', marginRight: '8px' }}>💰</span><span style={{ fontWeight: '700' }}>Total Received</span></div>
                        <div style={{ fontSize: '20px', fontWeight: '800' }}>{formatCurrency(totalReceived)}</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1e293b', borderRadius: '12px', color: 'white' }}>
                        <div><span style={{ fontSize: '20px', marginRight: '8px' }}>📊</span><span style={{ fontWeight: '700' }}>Total Including Credit</span></div>
                        <div style={{ fontSize: '20px', fontWeight: '800' }}>{formatCurrency(totalWithCredit)}</div>
                    </div>
                </div>

                <button onClick={onClose} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>Close</button>
            </div>
        </div>
    );
};
// ==================== BANK ALLOCATION MODAL (UPDATED) ====================
const BankAllocationModal = ({ isOpen, onClose }) => {
    const [allocatedRecords, setAllocatedRecords] = useState([]);
    const [grandTotals, setGrandTotals] = useState({
        total_cash_allocated: 0,
        total_bank_allocated: 0,
        total_allocated: 0,
        total_records: 0
    });
    const [isLoading, setIsLoading] = useState(false);
    const [expandedCashier, setExpandedCashier] = useState(null);

    // Fetch allocated breakdown when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchAllocatedBreakdown();
        }
    }, [isOpen]);

    const fetchAllocatedBreakdown = async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/cashier-balance/allocated-breakdown');
            if (response.data.success) {
                // The API returns records array with cashier-specific data
                const records = response.data.data.records || [];
                const totals = response.data.data.grand_totals || {
                    total_cash_allocated: 0,
                    total_bank_allocated: 0,
                    total_allocated: 0,
                    total_records: 0
                };

                setAllocatedRecords(records);
                setGrandTotals(totals);
            }
        } catch (error) {
            safeError('Error fetching allocated breakdown:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const toggleCashierExpand = (cashierName) => {
        if (expandedCashier === cashierName) {
            setExpandedCashier(null);
        } else {
            setExpandedCashier(cashierName);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 20008
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '20px',
                width: '550px',
                maxWidth: '90%',
                padding: '24px',
                maxHeight: '80vh',
                overflowY: 'auto'
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #e2e8f0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '28px' }}>💰</span>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Funds Allocation Details</h3>
                    </div>
                    <button onClick={onClose} style={{
                        background: '#f1f5f9',
                        border: 'none',
                        fontSize: '20px',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%'
                    }}>×</button>
                </div>

                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
                        <p>Loading allocation details...</p>
                    </div>
                ) : (
                    <>
                        {/* Grand Totals Summary */}
                        <div style={{
                            background: 'linear-gradient(135deg, #667eea, #764ba2)',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '20px',
                            textAlign: 'center',
                            color: 'white'
                        }}>
                            <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>📊 Total Allocated Funds (All Cashiers)</div>
                            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{formatCurrency(grandTotals.total_allocated)}</div>
                            <div style={{ fontSize: '11px', marginTop: '8px', opacity: 0.8 }}>
                                Across {grandTotals.total_records} cashier record(s)
                            </div>
                        </div>

                        {/* Cashier-wise Breakdown */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                marginBottom: '12px',
                                color: 'white'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '20px' }}>👤</span>
                                    <span style={{ fontWeight: '600' }}>Cashier-wise Breakdown</span>
                                </div>
                            </div>

                            {allocatedRecords.length > 0 ? (
                                <div style={{ paddingLeft: '8px' }}>
                                    {allocatedRecords.map((record, index) => {
                                        const isExpanded = expandedCashier === record.cashier_name;
                                        const hasBankAllocations = record.bank_breakdown && record.bank_breakdown.length > 0;

                                        return (
                                            <div key={record.id || index} style={{
                                                marginBottom: '12px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                overflow: 'hidden',
                                                background: 'white'
                                            }}>
                                                {/* Cashier Header - Clickable */}
                                                <div
                                                    onClick={() => toggleCashierExpand(record.cashier_name)}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '12px 16px',
                                                        background: '#f8fafc',
                                                        cursor: 'pointer',
                                                        borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '18px' }}>👤</span>
                                                        <div>
                                                            <div style={{ fontWeight: '700', color: '#1e293b' }}>{record.cashier_name}</div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                                Total: {formatCurrency(record.total_allocated)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '18px', color: '#64748b' }}>
                                                        {isExpanded ? '▲' : '▼'}
                                                    </span>
                                                </div>

                                                {/* Expanded Content */}
                                                {isExpanded && (
                                                    <div style={{ padding: '16px' }}>
                                                        {/* Cash Allocated */}
                                                        <div style={{
                                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                                            borderRadius: '10px',
                                                            padding: '12px 16px',
                                                            marginBottom: '12px',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            color: 'white'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '20px' }}>💰</span>
                                                                <span style={{ fontWeight: '600' }}>Cash Allocated</span>
                                                            </div>
                                                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                                                {formatCurrency(record.cash_allocated)}
                                                            </div>
                                                        </div>

                                                        {/* Bank Allocated Section */}
                                                        <div>
                                                            <div style={{
                                                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                                                borderRadius: '10px',
                                                                padding: '12px 16px',
                                                                marginBottom: '12px',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                color: 'white'
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ fontSize: '20px' }}>🏦</span>
                                                                    <span style={{ fontWeight: '600' }}>Bank Allocated</span>
                                                                </div>
                                                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                                                    {formatCurrency(record.total_bank_allocated)}
                                                                </div>
                                                            </div>

                                                            {/* Individual Bank Breakdown */}
                                                            {hasBankAllocations ? (
                                                                <div style={{ paddingLeft: '16px', borderLeft: '2px solid #e2e8f0' }}>
                                                                    {record.bank_breakdown.map((bank, bankIdx) => (
                                                                        <div key={bankIdx} style={{
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            padding: '10px 14px',
                                                                            marginBottom: '8px',
                                                                            background: '#fef3c7',
                                                                            borderRadius: '8px',
                                                                            borderLeft: '3px solid #f59e0b'
                                                                        }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <span style={{ fontSize: '16px' }}>🏦</span>
                                                                                <span style={{ fontWeight: '600', color: '#92400e', fontSize: '13px' }}>
                                                                                    {bank.bank_name}
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ fontSize: '15px', fontWeight: '700', color: '#dc2626' }}>
                                                                                {formatCurrency(bank.amount)}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div style={{
                                                                    padding: '12px',
                                                                    textAlign: 'center',
                                                                    color: '#94a3b8',
                                                                    fontSize: '12px',
                                                                    background: '#f8fafc',
                                                                    borderRadius: '8px'
                                                                }}>
                                                                    No bank allocations for this cashier
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Last Updated Info */}
                                                        {record.last_updated && (
                                                            <div style={{
                                                                marginTop: '12px',
                                                                padding: '8px',
                                                                textAlign: 'center',
                                                                fontSize: '10px',
                                                                color: '#94a3b8',
                                                                borderTop: '1px solid #e2e8f0'
                                                            }}>
                                                                Last updated: {new Date(record.last_updated).toLocaleString()}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{
                                    padding: '40px',
                                    textAlign: 'center',
                                    color: '#94a3b8',
                                    fontSize: '13px',
                                    background: '#f8fafc',
                                    borderRadius: '10px'
                                }}>
                                    No allocation records found
                                </div>
                            )}
                        </div>
                    </>
                )}

                <button onClick={onClose} style={{
                    width: '100%',
                    marginTop: '20px',
                    padding: '12px',
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px'
                }}>
                    Close
                </button>
            </div>
        </div>
    );
};
// ==================== INCOME SOURCES MODAL ====================
const IncomeSourcesModal = ({ isOpen, onClose, totals, isLoading, onRefresh, filterOptions, onAllocateFunds }) => {
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [localTotals, setLocalTotals] = useState(totals);
    const [localIsLoading, setLocalIsLoading] = useState(false);

    // FILTER STATES
    const [selectedUniqueCode, setSelectedUniqueCode] = useState('all');
    const [selectedBankName, setSelectedBankName] = useState('all');
    const [selectedCashierName, setSelectedCashierName] = useState('all');
    const [localFilterOptions, setLocalFilterOptions] = useState(filterOptions || { unique_codes: [], bank_names: [], cashier_names: [] });
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);

    // NEW: Fund Allocation Modal State
    const [showFundAllocationModal, setShowFundAllocationModal] = useState(false);
    const [selectedTotalForAllocation, setSelectedTotalForAllocation] = useState(0);

    // Cashier Balance States
    const [cashierBalance, setCashierBalance] = useState({
        cash_balance: 0,
        bank_balance: 0,
        bank_breakdown: {},
        total_balance: 0,
        cashier_names: [],
        session_count: 0
    });
    const [showBankBreakdown, setShowBankBreakdown] = useState(false);
    const [isLoadingCashierBalance, setIsLoadingCashierBalance] = useState(false);

    // Polling interval refs
    const filterPollingIntervalRef = useRef(null);
    const cashierBalanceIntervalRef = useRef(null);

    const incomeModalMountedRef = useRef(true);
    useEffect(() => {
        incomeModalMountedRef.current = true;
        return () => { incomeModalMountedRef.current = false; };
    }, []);

    const fetchCashierBalance = async () => {
        if (!incomeModalMountedRef.current) return;
        setIsLoadingCashierBalance(true);
        try {
            let url = '/cashier-balance/detailed-balance';
            const params = new URLSearchParams();

            if (selectedCashierName && selectedCashierName !== 'all') {
                params.append('cashier_name', selectedCashierName);
            }
            if (dateRange.startDate) {
                params.append('start_date', dateRange.startDate);
            }
            if (dateRange.endDate) {
                params.append('end_date', dateRange.endDate);
            }

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            const response = await api.get(url);
            if (!incomeModalMountedRef.current) return;

            if (response.data.success) {
                const data = response.data.data;
                setCashierBalance({
                    cash_balance: data.cash_balance || 0,
                    bank_balance: data.bank_balance || 0,
                    bank_breakdown: data.bank_breakdown || {},
                    total_balance: data.total_balance || 0,
                    cashier_names: data.cashier_names || [],
                    session_count: data.session_count || 0
                });
            }
        } catch (error) {
            if (!isAbortError(error)) safeError('Error fetching cashier balance:', error);
        } finally {
            if (incomeModalMountedRef.current) setIsLoadingCashierBalance(false);
        }
    };

    // Fetch filter options (including cashier names)
    const fetchFilterOptions = async () => {
        if (!incomeModalMountedRef.current) return;
        setIsLoadingOptions(true);
        try {
            const incomeResponse = await api.get('/income-filter-options');
            const cashierResponse = await api.get('/cashier-balance/detailed-balance');
            if (!incomeModalMountedRef.current) return;

            const cashierNames = cashierResponse.data.success ? cashierResponse.data.data.cashier_names : [];

            setLocalFilterOptions({
                unique_codes: incomeResponse.data.data?.unique_codes || [],
                bank_names: incomeResponse.data.data?.bank_names || [],
                cashier_names: cashierNames
            });
        } catch (error) {
            if (!isAbortError(error)) safeError('Error fetching filter options:', error);
        } finally {
            if (incomeModalMountedRef.current) setIsLoadingOptions(false);
        }
    };

    // Fetch cashier balance when modal opens or filters change
    useEffect(() => {
        if (isOpen) {
            fetchCashierBalance();
        }
    }, [isOpen, selectedCashierName, dateRange.startDate, dateRange.endDate]);

    // Polling for cashier balance every 30 seconds
    useEffect(() => {
        let isSubscribed = true;
        let pollingInterval = null;

        if (isOpen && isSubscribed) {
            pollingInterval = setInterval(() => {
                if (isSubscribed && typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    fetchCashierBalance();
                }
            }, 60000);

            cashierBalanceIntervalRef.current = pollingInterval;
        }

        return () => {
            isSubscribed = false;
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
            if (cashierBalanceIntervalRef.current) {
                clearInterval(cashierBalanceIntervalRef.current);
                cashierBalanceIntervalRef.current = null;
            }
        };
    }, [isOpen, selectedCashierName]);

    // Fetch filter options when modal opens
    useEffect(() => {
        let isSubscribed = true;
        let pollingInterval = null;

        if (isOpen && isSubscribed) {
            fetchFilterOptions();

            pollingInterval = setInterval(() => {
                if (isSubscribed && typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    fetchFilterOptions();
                }
            }, 60000);

            filterPollingIntervalRef.current = pollingInterval;
        }

        return () => {
            isSubscribed = false;
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
            if (filterPollingIntervalRef.current) {
                clearInterval(filterPollingIntervalRef.current);
                filterPollingIntervalRef.current = null;
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (totals) {
            setLocalTotals(totals);
        }
    }, [totals]);

    if (!isOpen) return null;

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const handleApplyFilters = async () => {
        setLocalIsLoading(true);
        try {
            await onRefresh(
                dateRange.startDate,
                dateRange.endDate,
                selectedUniqueCode,
                selectedBankName,
                selectedCashierName
            );
            await fetchCashierBalance();
        } finally {
            setLocalIsLoading(false);
        }
    };

    const handleResetFilters = async () => {
        setDateRange({ startDate: '', endDate: '' });
        setSelectedUniqueCode('all');
        setSelectedBankName('all');
        setSelectedCashierName('all');
        setLocalIsLoading(true);
        try {
            await onRefresh();
            await fetchCashierBalance();
        } finally {
            setLocalIsLoading(false);
        }
    };

    const totalIncome = (localTotals?.cash || 0) + (localTotals?.cheque || 0) + (localTotals?.bank_transfer || 0) +
        (localTotals?.bag_to_box || 0) + (localTotals?.bill_to_bill || 0) + (localTotals?.bad_debt || 0);

    // UPDATED: Open fund allocation modal - pass 0 or null to indicate custom amount
    const handleAllocateFunds = () => {
        if (totalIncome > 0) {
            setSelectedTotalForAllocation(0); // Set to 0 to indicate custom amount in modal
            setShowFundAllocationModal(true);
        } else {
            alert('No income available to allocate funds.');
        }
    };
    // In IncomeSourcesModal
    const handleAllocationComplete = (allocationData) => {

        // Safely extract allocated amount
        let allocatedAmount = 0;
        let remainingBalance = 0;

        if (typeof allocationData === 'number') {
            allocatedAmount = allocationData;
        } else if (allocationData && typeof allocationData === 'object') {
            allocatedAmount = allocationData.allocated_amount || allocationData.amount || 0;
            remainingBalance = allocationData.remaining || allocationData.remaining_balance || 0;
        }

        // Update funds in parent component
        if (onAllocateFunds) {
            onAllocateFunds(allocatedAmount);
        }

        // Refresh cashier balance
        fetchCashierBalance();

        // Show success message with proper formatting
        const formatCurrency = (amount) => {
            return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };

        alert(`✅ Funds allocated successfully!\n\nAllocated Amount: ${formatCurrency(allocatedAmount)}\nRemaining Balance: ${formatCurrency(remainingBalance)}`);
    };
    const incomeItems = [
        { id: 'cash', icon: '💰', label: 'Cash Payments', value: localTotals?.cash || 0, color: '#10b981', bg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
        { id: 'cheque', icon: '💳', label: 'Cheque Payments', value: localTotals?.cheque || 0, color: '#8b5cf6', bg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' },
        { id: 'bank_transfer', icon: '🏦', label: 'Bank Transfer Payments', value: localTotals?.bank_transfer || 0, color: '#ec489a', bg: 'linear-gradient(135deg, #fce7f3, #fbcfe8)' },
        { id: 'bag_to_box', icon: '📦', label: 'Bag to Box Conversion', value: localTotals?.bag_to_box || 0, color: '#f59e0b', bg: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
        { id: 'bill_to_bill', icon: '📄', label: 'Bill to Bill Transfer', value: localTotals?.bill_to_bill || 0, color: '#3b82f6', bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' },
        { id: 'bad_debt', icon: '⚠️', label: 'Bad Debt Write-off', value: localTotals?.bad_debt || 0, color: '#ef4444', bg: 'linear-gradient(135deg, #fee2e2, #fecaca)' }
    ];

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 20005,
                overflowY: 'auto',
                padding: '20px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '20px',
                    width: '650px',
                    maxWidth: '95%',
                    padding: '24px',
                    maxHeight: '90vh',
                    overflowY: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '20px',
                        paddingBottom: '12px',
                        borderBottom: '2px solid #e2e8f0'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '32px' }}>💰</span>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Income & Balance Summary</h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#f1f5f9',
                            border: 'none',
                            fontSize: '20px',
                            cursor: 'pointer',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Cashier Balance Section */}
                <div
                    style={{
                        marginBottom: '20px',
                        padding: '16px',
                        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                        borderRadius: '16px',
                        color: 'white'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🏦</span> Cashier Balance Summary
                        </div>
                        {isLoadingCashierBalance && (
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>⏳ Updating...</div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        {/* Cash Balance Card */}
                        <div
                            style={{
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                borderRadius: '12px',
                                padding: '16px',
                                textAlign: 'center'
                            }}
                        >
                            <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '4px' }}>💰 Cash Balance</div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                                {formatCurrency(cashierBalance.cash_balance)}
                            </div>
                        </div>

                        {/* Bank Balance Card - Clickable */}
                        <div
                            onClick={() => setShowBankBreakdown(!showBankBreakdown)}
                            style={{
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                borderRadius: '12px',
                                padding: '16px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'transform 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '4px' }}>
                                🏦 Bank Balance {showBankBreakdown ? '▲' : '▼'}
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                                {formatCurrency(cashierBalance.bank_balance)}
                            </div>
                        </div>
                    </div>

                    {/* Bank Breakdown */}
                    {showBankBreakdown && (
                        <div
                            style={{
                                marginTop: '12px',
                                padding: '12px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.2)'
                            }}
                        >
                            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🏦</span> Bank-wise Breakdown
                            </div>
                            {Object.keys(cashierBalance.bank_breakdown).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {Object.entries(cashierBalance.bank_breakdown).map(([bankName, amount]) => (
                                        <div
                                            key={bankName}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '8px 12px',
                                                background: 'rgba(255,255,255,0.08)',
                                                borderRadius: '8px'
                                            }}
                                        >
                                            <div style={{ fontSize: '12px', fontWeight: '500' }}>{bankName.replace(/_/g, ' ')}</div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fbbf24' }}>
                                                {formatCurrency(amount)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: '11px', textAlign: 'center', padding: '12px', color: '#94a3b8' }}>
                                    No bank transactions recorded
                                </div>
                            )}
                        </div>
                    )}

                    {/* Total Balance */}
                    <div
                        style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            borderRadius: '12px',
                            textAlign: 'center'
                        }}
                    >
                        <div style={{ fontSize: '11px', opacity: 0.9 }}>📊 Total Balance</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                            {formatCurrency(cashierBalance.total_balance)}
                        </div>
                        {cashierBalance.session_count > 0 && (
                            <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.7 }}>
                                Based on {cashierBalance.session_count} session(s)
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter Section */}
                <div
                    style={{
                        marginBottom: '20px',
                        padding: '16px',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>🔍 Filters</div>
                        {isLoadingOptions && (
                            <div style={{ fontSize: '10px', color: '#10b981' }}>🔄 Refreshing...</div>
                        )}
                    </div>

                    {/* Cashier Name Filter */}
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', color: '#64748b' }}>👤 Cashier Name</label>
                        <select
                            value={selectedCashierName}
                            onChange={(e) => setSelectedCashierName(e.target.value)}
                            disabled={isLoadingOptions}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                background: 'white'
                            }}
                        >
                            <option value="all">-- All Cashiers --</option>
                            {localFilterOptions.cashier_names?.map((name, idx) => (
                                <option key={idx} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {/* User Filter */}
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', color: '#64748b' }}>👤 User (Unique Code)</label>
                        <select
                            value={selectedUniqueCode}
                            onChange={(e) => setSelectedUniqueCode(e.target.value)}
                            disabled={isLoadingOptions}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                background: 'white'
                            }}
                        >
                            <option value="all">-- All Users --</option>
                            {localFilterOptions.unique_codes?.map((code, idx) => (
                                <option key={idx} value={code}>{code}</option>
                            ))}
                        </select>
                    </div>

                    {/* Bank Filter */}
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', color: '#64748b' }}>🏦 Bank Name</label>
                        <select
                            value={selectedBankName}
                            onChange={(e) => setSelectedBankName(e.target.value)}
                            disabled={isLoadingOptions}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                background: 'white'
                            }}
                        >
                            <option value="all">-- All Banks --</option>
                            {localFilterOptions.bank_names?.map((bank, idx) => (
                                <option key={idx} value={bank}>{bank}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', color: '#64748b' }}>Start Date</label>
                            <input
                                type="date"
                                value={dateRange.startDate}
                                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px', color: '#64748b' }}>End Date</label>
                            <input
                                type="date"
                                value={dateRange.endDate}
                                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                                style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }}
                            />
                        </div>
                    </div>

                    {/* Auto-refresh indicator */}
                    <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', marginBottom: '8px' }}>
                        🔄 Filters auto-refresh every 10 seconds | Balance refreshes every 30 seconds
                    </div>

                    {/* Filter Buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleApplyFilters}
                            disabled={localIsLoading}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: localIsLoading ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '600',
                                opacity: localIsLoading ? 0.6 : 1
                            }}
                        >
                            {localIsLoading ? 'Loading...' : 'Apply Filters'}
                        </button>
                        <button
                            onClick={handleResetFilters}
                            disabled={localIsLoading}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: localIsLoading ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                fontWeight: '600'
                            }}
                        >
                            Reset All
                        </button>
                    </div>
                </div>

                {localIsLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
                        <p>Loading income data...</p>
                    </div>
                ) : (
                    <>
                        {/* Summary Stats */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '20px',
                                padding: '12px',
                                background: '#e0f2fe',
                                borderRadius: '12px'
                            }}
                        >
                            <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '11px', color: '#0369a1' }}>Total Bills</div>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#0369a1' }}>{localTotals?.total_bills || 0}</div>
                            </div>
                            <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ fontSize: '11px', color: '#0369a1' }}>Total Customers</div>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#0369a1' }}>{localTotals?.total_customers || 0}</div>
                            </div>
                        </div>

                        {/* Income Items (without checkboxes) */}
                        {incomeItems.map((item, idx) => (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    marginBottom: '10px',
                                    background: item.bg,
                                    borderRadius: '12px',
                                    borderLeft: `4px solid ${item.color}`
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '20px', marginRight: '8px' }}>{item.icon}</span>
                                    <span style={{
                                        fontWeight: '600',
                                        color: item.color === '#10b981' ? '#065f46' :
                                            item.color === '#8b5cf6' ? '#5b21b6' :
                                                item.color === '#ec489a' ? '#9d174d' :
                                                    item.color === '#f59e0b' ? '#92400e' :
                                                        item.color === '#3b82f6' ? '#1e40af' : '#991b1b'
                                    }}>
                                        {item.label}
                                    </span>
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: '700', color: '#dc2626' }}>
                                    {formatCurrency(item.value)}
                                </div>
                            </div>
                        ))}

                        <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', margin: '16px 0' }}></div>

                        {/* Total Income */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '20px',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                borderRadius: '12px',
                                color: 'white'
                            }}
                        >
                            <div>
                                <span style={{ fontSize: '24px', marginRight: '12px' }}>💰</span>
                                <span style={{ fontWeight: '700', fontSize: '16px' }}>Total Income</span>
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: '800' }}>
                                {formatCurrency(totalIncome)}
                            </div>
                        </div>

                        {/* Allocate Funds Button - Opens modal where user can enter custom amount */}
                        <button
                            onClick={handleAllocateFunds}
                            disabled={totalIncome === 0}
                            style={{
                                width: '100%',
                                marginTop: '16px',
                                padding: '14px',
                                background: totalIncome === 0 ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                cursor: totalIncome === 0 ? 'not-allowed' : 'pointer',
                                fontWeight: '700',
                                fontSize: '16px',
                                opacity: totalIncome === 0 ? 0.6 : 1,
                                transition: 'transform 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                if (totalIncome > 0) {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            💵 Allocate Funds
                        </button>

                        {/* Active Filters Display */}
                        {(selectedUniqueCode !== 'all' || selectedBankName !== 'all' || selectedCashierName !== 'all' || dateRange.startDate || dateRange.endDate) && (
                            <div
                                style={{
                                    marginTop: '16px',
                                    padding: '10px',
                                    background: '#f1f5f9',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    color: '#64748b',
                                    textAlign: 'center'
                                }}
                            >
                                🔍 Active Filters:
                                {selectedCashierName !== 'all' && ` Cashier: ${selectedCashierName}`}
                                {selectedUniqueCode !== 'all' && ` User: ${selectedUniqueCode}`}
                                {selectedBankName !== 'all' && ` Bank: ${selectedBankName}`}
                                {dateRange.startDate && ` From: ${dateRange.startDate}`}
                                {dateRange.endDate && ` To: ${dateRange.endDate}`}
                            </div>
                        )}

                        {/* Note about excluded items */}
                        <div
                            style={{
                                marginTop: '16px',
                                padding: '10px',
                                background: '#f1f5f9',
                                borderRadius: '8px',
                                fontSize: '11px',
                                color: '#64748b',
                                textAlign: 'center'
                            }}
                        >
                            ℹ️ Credit payments are excluded as they represent debt, not actual income.
                        </div>
                    </>
                )}

                <button
                    onClick={onClose}
                    style={{
                        width: '100%',
                        marginTop: '20px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px'
                    }}
                >
                    Close
                </button>
            </div>

            {/* Fund Allocation Modal - User will enter custom amount */}
            <FundAllocationModal
                isOpen={showFundAllocationModal}
                onClose={() => {
                    setShowFundAllocationModal(false);
                    setSelectedTotalForAllocation(0);
                }}
                onAllocate={handleAllocationComplete}
                selectedAmount={null} // Pass null so modal allows custom amount entry
                maxAmount={totalIncome} // Pass max available amount for validation
            />
        </div>
    );
};
// ==================== CREDITOR FORM MODAL ====================
const CreditorFormModal = ({ isOpen, onClose, onSave, supplierCode, billNo = null, existingCreditorNo = null }) => {
    const [formData, setFormData] = useState({ code: '', name: '', dob: '', address: '', telephone_no: '', advance_amount: '', profile_pic: null, nic_front: null, nic_back: null });
    const [loading, setLoading] = useState(false);
    const [previewImages, setPreviewImages] = useState({ profile_pic: null, nic_front: null, nic_back: null });
    const [generatedCreditorNo, setGeneratedCreditorNo] = useState(null);

    useEffect(() => {
        if (isOpen && supplierCode) {
            setFormData(prev => ({ ...prev, code: supplierCode.toUpperCase() }));
            setGeneratedCreditorNo(existingCreditorNo || null);
        }
    }, [isOpen, supplierCode, existingCreditorNo]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('code', supplierCode.toUpperCase());
            if (formData.name) formDataToSend.append('name', formData.name);
            if (formData.dob) formDataToSend.append('dob', formData.dob);
            if (formData.address) formDataToSend.append('address', formData.address);
            if (formData.telephone_no) formDataToSend.append('telephone_no', formData.telephone_no);
            if (formData.advance_amount) formDataToSend.append('advance_amount', formData.advance_amount);
            formDataToSend.append('Creditor', 'Y');
            if (formData.profile_pic) formDataToSend.append('profile_pic', formData.profile_pic);
            if (formData.nic_front) formDataToSend.append('nic_front', formData.nic_front);
            if (formData.nic_back) formDataToSend.append('nic_back', formData.nic_back);

            const response = await api.post('/suppliers', formDataToSend, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (response.status === 200 || response.status === 201) {
                const creditorNo = response.data.Creditor_no;
                if (billNo) {
                    await api.post('/creditors/create-with-supplier', { bill_no: billNo, supplier_code: supplierCode.toUpperCase(), credit_amount: 0, creditor_no: creditorNo });
                }
                alert(`Supplier registered as Creditor successfully!\nCreditor Number: ${creditorNo}`);
                onSave(true, creditorNo);
                onClose();
            }
        } catch (error) { alert('Failed to save creditor information. Please try again.'); }
        finally { setLoading(false); }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10001 }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', width: '500px', maxWidth: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '20px 20px 0 0' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'white' }}>Register Creditor: {supplierCode}{billNo && <span style={{ fontSize: '12px', marginLeft: '8px' }}>(Bill: {billNo})</span>}</h3>
                </div>
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#92400e' }}>
                        ⚠️ Supplier "{supplierCode}" not found. Please provide information to register as Creditor.
                        <br /><small>A unique Creditor Number will be automatically generated.</small>
                    </div>
                    <div><label>Supplier Code</label><input type="text" value={supplierCode} disabled style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f1f5f9' }} /></div>
                    <div><label>Supplier Name</label><input type="text" name="name" onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px' }} /></div>
                    <div><label>Date of Birth</label><input type="date" name="dob" onChange={(e) => setFormData({ ...formData, dob: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px' }} /></div>
                    <div><label>Telephone Number</label><input type="tel" name="telephone_no" onChange={(e) => setFormData({ ...formData, telephone_no: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px' }} /></div>
                    <div><label>Address</label><textarea name="address" onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows="2" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px' }} /></div>
                    <div><label>Advance Amount (Rs.)</label><input type="number" name="advance_amount" onChange={(e) => setFormData({ ...formData, advance_amount: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px' }} /></div>
                    <div><label>Profile Picture</label><input type="file" accept="image/*" onChange={(e) => setFormData({ ...formData, profile_pic: e.target.files[0] })} style={{ width: '100%', padding: '6px' }} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div><label>NIC Front</label><input type="file" accept="image/*" onChange={(e) => setFormData({ ...formData, nic_front: e.target.files[0] })} style={{ width: '100%', padding: '6px' }} /></div>
                        <div><label>NIC Back</label><input type="file" accept="image/*" onChange={(e) => setFormData({ ...formData, nic_back: e.target.files[0] })} style={{ width: '100%', padding: '6px' }} /></div>
                    </div>
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc', borderRadius: '0 0 20px 20px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Skip</button>
                    <button onClick={handleSubmit} disabled={loading} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #4CAF50, #45a049)', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? 'Saving...' : 'Save & Continue'}</button>
                </div>
            </div>
        </div>
    );
};
const FundsAllocatedModal = ({ isOpen, onClose, fundsAllocated }) => {
    if (!isOpen) return null;

    const formatCurrency = (amount) => `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const isNegative = fundsAllocated < 0;
    const absoluteAmount = Math.abs(fundsAllocated);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 20006
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '20px',
                width: '400px',
                maxWidth: '90%',
                padding: '24px',
                textAlign: 'center'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                    {isNegative ? '⚠️' : '💰'}
                </div>
                <h3 style={{ marginBottom: '12px', color: '#1e293b' }}>
                    {isNegative ? 'Negative Balance' : 'Funds Allocated'}
                </h3>
                <div style={{
                    fontSize: '36px',
                    fontWeight: 'bold',
                    color: isNegative ? '#ef4444' : '#10b981',
                    marginBottom: '20px',
                    padding: '20px',
                    background: isNegative ? '#fee2e2' : '#f0fdf4',
                    borderRadius: '12px'
                }}>
                    {isNegative ? '-' : ''}{formatCurrency(absoluteAmount)}
                </div>
                {isNegative && (
                    <div style={{
                        marginBottom: '20px',
                        padding: '12px',
                        background: '#fef3c7',
                        borderRadius: '8px',
                        color: '#92400e',
                        fontSize: '14px'
                    }}>
                        ⚠️ You have overspent the allocated funds. This amount is due.
                    </div>
                )}
                <button
                    onClick={onClose}
                    style={{
                        padding: '10px 24px',
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    Close
                </button>
            </div>
        </div>
    );
};
// ==================== MAIN COMPONENT ====================
export default function SupplierReportPrinted() {
    const navigate = useNavigate();
    const [showFarmerModal, setShowFarmerModal] = useState(false);
    const [selectedBillCreditor, setSelectedBillCreditor] = useState(null);
    const [showCreditorModal, setShowCreditorModal] = useState(false);
    const [selectedBillForCreditor, setSelectedBillForCreditor] = useState({ supplierCode: '', billNo: null });
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [showDetailedReport, setShowDetailedReport] = useState(false);
    const [detailedReportData, setDetailedReportData] = useState(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [selectedReportSupplier, setSelectedReportSupplier] = useState(null);
    const farmerSelectRef = useRef(null);
    const [farmerSearchQuery, setFarmerSearchQuery] = useState('');
    const [allFarmerOptions, setAllFarmerOptions] = useState([]);
    const [isLoadingFarmers, setIsLoadingFarmers] = useState(false);
    const [showCreditorForm, setShowCreditorForm] = useState(false);
    const [pendingCreditorBill, setPendingCreditorBill] = useState(null);

    // NEW: State for View Old Bills
    const [showOldBillsModal, setShowOldBillsModal] = useState(false);
    const [isViewingHistory, setIsViewingHistory] = useState(false);
    const [historyDateRange, setHistoryDateRange] = useState({ startDate: '', endDate: '' });
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isMiddlePanelLocked, setIsMiddlePanelLocked] = useState(true);

    // Add these state variables with your other useState declarations
    const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
    const [calculatedAdjustmentAmount, setCalculatedAdjustmentAmount] = useState(0);
    const [selectedAdjustmentType, setSelectedAdjustmentType] = useState('bag_to_box');

    const [supplierAdvancesMap, setSupplierAdvancesMap] = useState({});
    const [isLoadingAdvances, setIsLoadingAdvances] = useState(false);

    const [state, setState] = useState({
        pendingSuppliers: [], completedSuppliers: [], selectedSupplier: null, selectedBillNo: null, supplierDetails: [],
        isLoading: true, isPrinting: false, paymentAmount: "", searchPendingQuery: "", searchCompletedQuery: "",
        showChequeModal: false, pendingChequeAmount: 0, showBankToBankModal: false, pendingBankToBankAmount: 0,
        showAdjustmentModal: false, showPaymentHistoryModal: false, currentPayments: [], paymentHistoryTotalPaid: 0,
        paymentHistoryTotalBill: 0, paymentHistoryRemaining: 0, showDeleteModal: false, deleteSupplierCode: null,
        deleteBillNo: null, paymentMethod: 'Cash', isUpdatingCompletedBill: false, currentPaidAmount: 0,
        selectedMode: 'walking_seller', showPrintModal: false, printBillContent: '', billSize: '4inch', paymentBreakdown: [],
        currentBillTotal: 0, currentLoanId: null
    });
    const [showAdjustmentSummary, setShowAdjustmentSummary] = useState(false);
    const [adjustmentTotals, setAdjustmentTotals] = useState({
        cash: 0,
        cheque: 0,
        bank_transfer: 0,
        credit: 0,
        bag_to_box: 0,
        bill_to_bill: 0,
        bad_debt: 0
    });
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Initialize fundsAllocated directly from localStorage (no initial 0)
    const [fundsAllocated, setFundsAllocated] = useState(() => {
        try {
            const saved = localStorage.getItem('fundsAllocated');
            if (saved !== null && !isNaN(parseFloat(saved))) {
                return parseFloat(saved);
            }
        } catch (error) {
            safeError('Error reading fundsAllocated:', error);
        }
        return 0;
    });
    // Add these state variables with your other useState declarations (around line ~40-50)

    // Advance state for NEW table
    const [advanceAmount, setAdvanceAmount] = useState(0);
    const [advancePayload, setAdvancePayload] = useState({
        supplier_code: '',
        supplier_bill_no: '',
        traveler_code: '',
        advance_amount: ''
    });
    const [advanceLoading, setAdvanceLoading] = useState(false);
    const [advanceStatus, setAdvanceStatus] = useState({ type: '', text: '' });
    const [supplierAdvances, setSupplierAdvances] = useState([]);
    const [totalAdvanceAmount, setTotalAdvanceAmount] = useState(0);
    const [showAdvanceHistory, setShowAdvanceHistory] = useState(false);
    const [bagAmount, setBagAmount] = useState('');

    // Store advance in NEW table
    const storeAdvance = async (advanceData) => {
        const response = await api.post('/supplier-advances', advanceData);
        return response.data;
    };

    // Fetch supplier advances from NEW table
    const fetchSupplierAdvances = async (supplierCode, billNo = null) => {
        if (!supplierCode) return;
        try {
            let url = `/supplier-advances/supplier?supplier_code=${supplierCode}`;
            if (billNo) {
                url += `&supplier_bill_no=${billNo}`;
            }
            const response = await api.get(url);
            if (response.data.success) {
                setSupplierAdvances(response.data.data.advances);
                setTotalAdvanceAmount(response.data.data.summary.total_advance);
            }
        } catch (error) {
            safeError('Error fetching advances:', error);
        }
    };
    // Fetch supplier advances by bill numbers from the backend
    const fetchSupplierAdvancesByBillNumbers = useCallback(async (billNumbers, { silent = false } = {}) => {
        if (!billNumbers || billNumbers.length === 0) {
            return {};
        }

        const validBillNumbers = billNumbers.filter(isValidBillNumber);

        if (validBillNumbers.length === 0) {
            return {};
        }

        if (!silent && isMountedRef.current) setIsLoadingAdvances(true);
        try {
            const response = await api.post(routes.getSupplierAdvances, {
                bill_numbers: validBillNumbers
            });

            if (!isMountedRef.current) return {};

            if (response.data.success) {
                const advanceMap = response.data.data || {};
                setSupplierAdvancesMap(advanceMap);
                return advanceMap;
            }
            safeError('Failed to fetch advances:', response.data.message);
            return {};
        } catch (error) {
            if (!isAbortError(error)) safeError('Error fetching supplier advances:', error);
            return {};
        } finally {
            if (!silent && isMountedRef.current) setIsLoadingAdvances(false);
        }
    }, []);
    // Updated handleAdvanceSubmit for NEW table
    const handleAdvanceSubmit = async (e) => {
        e.preventDefault();

        if (!state.selectedSupplier) {
            alert('Please select a supplier first');
            return;
        }

        const amount = parseFloat(advancePayload.advance_amount);
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid advance amount');
            return;
        }

        if (!advancePayload.traveler_code.trim()) {
            alert('Please enter traveler/trader code');
            return;
        }

        setAdvanceLoading(true);
        setAdvanceStatus({ type: '', text: '' });

        try {
            const response = await storeAdvance({
                supplier_code: state.selectedSupplier,
                supplier_bill_no: state.selectedBillNo || null,
                traveler_code: advancePayload.traveler_code.toUpperCase(),
                advance_amount: amount
            });

            if (response.success) {
                setAdvanceStatus({
                    type: 'success',
                    text: `✅ Advance recorded successfully! Amount: Rs. ${formatDecimal(amount)}`
                });

                // Reset form - keep supplier code but clear other fields
                setAdvancePayload({
                    supplier_code: state.selectedSupplier,
                    supplier_bill_no: state.selectedBillNo || '',
                    traveler_code: '',
                    advance_amount: ''
                });

                // Refresh advances list from new table
                await fetchSupplierAdvances(state.selectedSupplier, state.selectedBillNo);

                // Also update the total advance amount for display
                setAdvanceAmount(prev => prev + amount);

                // Clear success message after 3 seconds
                runSafeTimeout(() => setAdvanceStatus({ type: '', text: '' }), 3000);
            } else {
                throw new Error(response.message || 'Failed to record advance');
            }
        } catch (error) {
            safeError('Advance submission error:', error);
            setAdvanceStatus({
                type: 'error',
                text: `❌ Failed to record advance: ${error.response?.data?.message || error.message}`
            });
            runSafeTimeout(() => setAdvanceStatus({ type: '', text: '' }), 5000);
        } finally {
            setAdvanceLoading(false);
        }
    };

    // Reset advance form and fetch advances when supplier changes
    useEffect(() => {
        if (state.selectedSupplier) {
            setAdvancePayload({
                supplier_code: state.selectedSupplier,
                supplier_bill_no: state.selectedBillNo || '',
                traveler_code: '',
                advance_amount: ''
            });
            // Fetch advances from NEW table
            fetchSupplierAdvances(state.selectedSupplier, state.selectedBillNo);
            setBagAmount('');
        } else {
            setSupplierAdvances([]);
            setTotalAdvanceAmount(0);
            setAdvanceAmount(0);
            setBagAmount('');
        }
    }, [state.selectedSupplier, state.selectedBillNo]);


    // Add these state variables with your other state declarations (around line ~40-50)
    const [editingRecord, setEditingRecord] = useState(null);
    const [newFarmerCode, setNewFarmerCode] = useState('');
    const [newCustomerCode, setNewCustomerCode] = useState('');

    const handleUpdateFarmer = async () => {
        if (!editingRecord) return;

        const finalSupplierCode = newFarmerCode || editingRecord.supplier_code;
        const finalCustomerCode = newCustomerCode || editingRecord.customer_code;

        try {
            // Use setIsDetailsLoading if you have it, or set a local loading state
            // If you don't have setIsDetailsLoading, you can remove it or add a local loading state
            const response = await api.put(`/sales/${editingRecord.id}/update-supplier`, {
                supplier_code: finalSupplierCode,
                customer_code: finalCustomerCode
            });

            if (response.status === 200) {
                // Close the modal
                setEditingRecord(null);
                setNewFarmerCode('');
                setNewCustomerCode('');

                // Refresh the current supplier details to show updated data
                // Get the current selected supplier and bill from state
                const currentSupplier = state.selectedSupplier;
                const currentBillNo = state.selectedBillNo;

                if (currentSupplier && currentBillNo) {
                    // Refresh the current bill details
                    await handleSupplierClick(currentSupplier, currentBillNo);
                }

                // Also refresh the supplier list data
                await fetchSupplierData(isViewingHistory, historyDateRange.startDate, historyDateRange.endDate, false);

                // Show success message
                alert('✅ Record updated successfully!');

                // If the customer code was changed, you might want to show additional info
                if (finalCustomerCode && finalCustomerCode !== editingRecord.customer_code) {
                }
                if (finalSupplierCode && finalSupplierCode !== editingRecord.supplier_code) {
                }
            }
        } catch (error) {
            safeError("Update failed:", error);
            const errorMessage = error.response?.data?.message || error.message || "Failed to update records. Please try again.";
            alert(`Update failed: ${errorMessage}`);
        }
    };
    const [showFundsAllocated, setShowFundsAllocated] = useState(false);
    const isFirstRender = useRef(true);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
    const dropdownButtonRef = useRef(null);
    const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });

    // Save fundsAllocated to localStorage whenever it changes (skip first render to prevent overwrite)
    useEffect(() => {
        // Skip the first render to prevent overwriting the loaded value with 0
        if (isFirstRender.current) {
            isFirstRender.current = false;
            // On first render, just ensure localStorage has the correct value
            localStorage.setItem('fundsAllocated', fundsAllocated.toString());
            return;
        }

        try {
            localStorage.setItem('fundsAllocated', fundsAllocated.toString());
        } catch (error) {
            safeError('Error saving fundsAllocated:', error);
        }
    }, [fundsAllocated]);
    useEffect(() => {
        if (isDropdownOpen && dropdownButtonRef.current) {
            const rect = dropdownButtonRef.current.getBoundingClientRect();
            setDropdownPosition({ x: rect.left, y: rect.bottom });
        }
    }, [isDropdownOpen]);
    // Backup: Save before page unload
    useEffect(() => {
        const handleBeforeUnload = () => {
            localStorage.setItem('fundsAllocated', fundsAllocated.toString());
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [fundsAllocated]);
    // Add these for silent refresh
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshTimeoutRef = useRef(null);
    const isMountedRef = useRef(true);
    const timeoutIdsRef = useRef([]);

    const processingPaymentRef = useRef(false);
    const lastPaymentDataRef = useRef(null);
    const modalOpenRef = useRef(false);
    const isPrintingRef = useRef(false);
    const isProcessingPaymentRef = useRef(false);
    const isRefreshingRef = useRef(false);
    const fetchSupplierDataRef = useRef(null);
    const supplierAdvancesMapRef = useRef({});
    const pendingSupplierRefreshRef = useRef(false);
    const recentOptimisticPaymentsRef = useRef(new Map());

    // Add these with your other state declarations
    const [paymentLock, setPaymentLock] = useState(false);
    const paymentLockRef = useRef(false);
    const idempotencyKeyRef = useRef(null);

    const runSafeTimeout = useCallback((fn, delay) => {
        const id = setTimeout(() => {
            timeoutIdsRef.current = timeoutIdsRef.current.filter((t) => t !== id);
            if (isMountedRef.current) {
                fn();
            }
        }, delay);
        timeoutIdsRef.current.push(id);
        return id;
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            timeoutIdsRef.current.forEach((id) => clearTimeout(id));
            timeoutIdsRef.current = [];
        };
    }, []);

    useEffect(() => {
        isPrintingRef.current = !!state.isPrinting;
    }, [state.isPrinting]);

    useEffect(() => {
        isProcessingPaymentRef.current = !!isProcessingPayment;
    }, [isProcessingPayment]);

    useEffect(() => {
        isRefreshingRef.current = !!isRefreshing;
    }, [isRefreshing]);

    useEffect(() => {
        supplierAdvancesMapRef.current = supplierAdvancesMap;
    }, [supplierAdvancesMap]);

    // Initialize window flags for duplicate detection
    useEffect(() => {
        window.cashPaymentProcessing = false;
        window.lastPaymentTime = null;
        window.lastPaymentAmount = null;

        return () => {
            delete window.cashPaymentProcessing;
            delete window.lastPaymentTime;
            delete window.lastPaymentAmount;
        };
    }, []);


    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isDropdownOpen && !event.target.closest('.dropdown-container')) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isDropdownOpen]);
    // Add refs for history state to avoid stale closures
    const viewHistoryRef = useRef(isViewingHistory);
    const historyStartDateRef = useRef(historyDateRange.startDate);
    const historyEndDateRef = useRef(historyDateRange.endDate);
    const [isPolling, setIsPolling] = useState(true);
    const pollingIntervalRef = useRef(null);
    const supplierDataRequestInFlightRef = useRef(false);
    // Add these with your other state declarations (around line where you have other state)
    const [showIncomeSourcesModal, setShowIncomeSourcesModal] = useState(false);
    const [incomeTotals, setIncomeTotals] = useState({
        cash: 0,
        cheque: 0,
        bank_transfer: 0,
        bag_to_box: 0,
        bill_to_bill: 0,
        bad_debt: 0,
        total_income: 0,
        total_bills: 0,
        total_customers: 0
    });
    const [isLoadingIncome, setIsLoadingIncome] = useState(false);
    //ne fund balance
    // Add these with your other state declarations
    // Add these with your other state declarations
    const [allocatedBreakdown, setAllocatedBreakdown] = useState({
        cash_allocated: 0,
        bank_breakdown: [],
        total_bank_allocated: 0,
        total_allocated: 0
    });
    const [isLoadingAllocated, setIsLoadingAllocated] = useState(false);
    const [showAllocatedBankModal, setShowAllocatedBankModal] = useState(false);
    // Fetch allocated breakdown from cashier_balances table
    const fetchAllocatedBreakdown = async () => {
        setIsLoadingAllocated(true);
        try {
            const response = await api.get('/cashier-balance/allocated-breakdown');
            if (response.data.success) {
                if (!isMountedRef.current) return;
                setAllocatedBreakdown(response.data.data);
            }
        } catch (error) {
            safeError('Error fetching allocated breakdown:', error);
        } finally {
            if (isMountedRef.current) {
                setIsLoadingAllocated(false);
            }
        }
    };
    // Add this with your other state declarations
    const [netAvailableAmount, setNetAvailableAmount] = useState(0);
    const [isLoadingNetAvailable, setIsLoadingNetAvailable] = useState(false);
    const [totalAllocatedAmount, setTotalAllocatedAmount] = useState(0);

    const [supplierPaymentsTotal, setSupplierPaymentsTotal] = useState(0);
    // Add this function with your other fetch functions
    const fetchNetAvailableAmount = async () => {

        setIsLoadingNetAvailable(true);
        try {
            const response = await api.get('/cashier-balance/net-available');


            if (response.data.success) {
                // Use the grand totals from the response
                const grandTotals = response.data.data.grand_totals;
                const netAmount = grandTotals.net_available || 0;
                const totalAllocated = grandTotals.total_allocated || 0;
                const supplierPaymentsTotal = response.data.data.supplier_payments_total || 0;


                if (!isMountedRef.current) return;
                setNetAvailableAmount(netAmount);
                setTotalAllocatedAmount(totalAllocated);
                setSupplierPaymentsTotal(supplierPaymentsTotal);
            } else {
                safeError('❌ API returned success=false:', response.data.message);
                if (!isMountedRef.current) return;
                setNetAvailableAmount(0);
                setTotalAllocatedAmount(0);
                setSupplierPaymentsTotal(0);
            }
        } catch (error) {
            safeError('❌ Error fetching net available amount:', error);
            if (!isMountedRef.current) return;
            setNetAvailableAmount(0);
            setTotalAllocatedAmount(0);
            setSupplierPaymentsTotal(0);
        } finally {
            if (isMountedRef.current) {
                setIsLoadingNetAvailable(false);
            }
        }
    };
    const [showDirectFundAllocationModal, setShowDirectFundAllocationModal] = useState(false);
    const deductAllocatedFunds = async (amount, paymentMethod, bankName = null) => {
        try {
            const response = await api.post('/cashier-balance/deduct-allocated-funds', {
                amount: amount,
                payment_method: paymentMethod,
                bank_name: bankName
            });

            if (response.data.success) {
                await Promise.all([fetchAllocatedBreakdown(), fetchNetAvailableAmount()]);
                return true;
            } else {
                safeError('Failed to deduct allocated funds:', response.data.message);
                return false;
            }
        } catch (error) {
            safeError('Error deducting allocated funds:', error);
            return false;
        }
    };
    // Fetch allocated breakdown on component mount
    useEffect(() => {
        fetchAllocatedBreakdown();

        // Refresh allocated breakdown every 60 seconds when tab is visible
        const allocatedInterval = setInterval(() => {
            if (!modalOpenRef.current && document.visibilityState === 'visible') {
                fetchAllocatedBreakdown();
            }
        }, SIDEBAR_POLL_MS);

        return () => clearInterval(allocatedInterval);
    }, []);
    // Fetch net available amount on component mount and periodically
    useEffect(() => {
        // Initial fetch
        fetchNetAvailableAmount();

        // Refresh net available amount with the same cadence as the sidebars
        const netAvailableInterval = setInterval(() => {
            if (!modalOpenRef.current && document.visibilityState === 'visible') {
                fetchNetAvailableAmount();
            }
        }, SIDEBAR_POLL_MS);

        return () => clearInterval(netAvailableInterval);
    }, []);
    // Auto-refresh sidebars; uses refs so the interval is not recreated (avoids stuck/overlapping polls)
    useEffect(() => {
        if (!isPolling) {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
            return;
        }

        let isSubscribed = true;

        const tick = async () => {
            if (!isSubscribed || !isMountedRef.current) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            if (isPrintingRef.current || isProcessingPaymentRef.current || isRefreshingRef.current) return;
            if (modalOpenRef.current) return;
            if (supplierDataRequestInFlightRef.current) {
                pendingSupplierRefreshRef.current = true;
                return;
            }
            const fetchFn = fetchSupplierDataRef.current;
            if (!fetchFn) return;
            await fetchFn(viewHistoryRef.current, historyStartDateRef.current, historyEndDateRef.current, true);
        };

        const pollingInterval = setInterval(tick, SIDEBAR_POLL_MS);
        pollingIntervalRef.current = pollingInterval;

        const onVisibility = () => {
            if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            isSubscribed = false;
            document.removeEventListener('visibilitychange', onVisibility);
            if (pollingInterval) clearInterval(pollingInterval);
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, [isPolling]);
    // Add this function to fetch income sources with filters
    const fetchIncomeSources = async (startDate = null, endDate = null, uniqueCode = null, bankName = null, cashierName = null) => {
        if (!isMountedRef.current) return;
        setIsLoadingIncome(true);
        try {
            let url = '/income-sources';
            const params = new URLSearchParams();

            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (uniqueCode && uniqueCode !== 'all') params.append('unique_code', uniqueCode);
            if (bankName && bankName !== 'all') params.append('bank_name', bankName);
            if (cashierName && cashierName !== 'all') params.append('cashier_name', cashierName);

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            const response = await api.get(url);

            if (!isMountedRef.current) return;
            if (response.data.success) {
                const data = response.data.data;
                setIncomeTotals({
                    cash: data.totals.cash || 0,
                    cheque: data.totals.cheque || 0,
                    bank_transfer: data.totals.bank_transfer || 0,
                    bag_to_box: data.totals.bag_to_box || 0,
                    bill_to_bill: data.totals.bill_to_bill || 0,
                    bad_debt: data.totals.bad_debt || 0,
                    total_income: data.totals.total_income || 0,
                    total_bills: data.totals.total_bills || 0,
                    total_customers: data.totals.total_customers || 0
                });
            } else {
                alert('Failed to load income data');
            }
        } catch (error) {
            if (!isAbortError(error)) safeError('Error fetching income sources:', error);
            if (isMountedRef.current) {
                alert('Failed to load income data: ' + (error.response?.data?.message || error.message));
            }
        } finally {
            if (isMountedRef.current) setIsLoadingIncome(false);
        }
    };
    // Store mode selections per bill (persists in localStorage)
    const [billModeSelections, setBillModeSelections] = useState(() => {
        try {
            const saved = localStorage.getItem('billModeSelections');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });
    // Save bill mode selections to localStorage
    useEffect(() => {
        localStorage.setItem('billModeSelections', JSON.stringify(billModeSelections));
    }, [billModeSelections]);
    const formatDecimal = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
    // Helper function to calculate total paid excluding Credit from payment_details
    const calculateTotalPaidExcludingCredit = (paymentDetails) => {
        let total = 0;
        if (!paymentDetails) return total;

        let payments = paymentDetails;
        if (typeof payments === 'string') {
            try {
                payments = JSON.parse(payments);
            } catch (e) {
                payments = [];
            }
        }

        if (!Array.isArray(payments)) return total;

        for (const payment of payments) {
            if (payment.method !== 'Credit') {
                total += parseFloat(payment.amount) || 0;
            }
        }
        return total;
    };
    // Handler for adjustment amount calculation
    const handleAdjustmentAmountCalculated = (amount) => {
        setCalculatedAdjustmentAmount(amount);
        // Update the paymentAmount state with the calculated amount
        setState(prev => ({ ...prev, paymentAmount: amount.toString() }));
    };
    const unlockMiddlePanel = () => {
        setIsMiddlePanelLocked(false);
    };
    // Handler for Bag to Box adjustment
    const handleBagToBoxAdjustment = () => {
        if (!state.selectedSupplier) {
            alert('Please select a supplier/bill first');
            return;
        }
        setSelectedAdjustmentType('bag_to_box');
        setShowAdjustmentModal(true);
    };

    // Handler for Bill to Bill adjustment
    const handleBillToBillAdjustment = () => {
        if (!state.selectedSupplier) {
            alert('Please select a supplier/bill first');
            return;
        }
        setSelectedAdjustmentType('bill_to_bill');
        setShowAdjustmentModal(true);
    };

    // Handler for Bad Debt adjustment
    const handleBadDebtAdjustment = () => {
        if (!state.selectedSupplier) {
            alert('Please select a supplier/bill first');
            return;
        }
        setSelectedAdjustmentType('bad_debt');
        setShowAdjustmentModal(true);
    };
    // Helper function to calculate total Credit amount from payment_details
    const calculateTotalCreditAmount = (paymentDetails) => {
        let total = 0;
        if (!paymentDetails) return total;

        let payments = paymentDetails;
        if (typeof payments === 'string') {
            try {
                payments = JSON.parse(payments);
            } catch (e) {
                payments = [];
            }
        }

        if (!Array.isArray(payments)) return total;

        for (const payment of payments) {
            if (payment.method === 'Credit') {
                total += parseFloat(payment.amount) || 0;
            }
        }
        return total;
    };
    const fetchSupplierData = async (useHistory = false, startDate = null, endDate = null, isSilent = false) => {
        if (supplierDataRequestInFlightRef.current) {
            pendingSupplierRefreshRef.current = true;
            return null;
        }
        supplierDataRequestInFlightRef.current = true;

        if (!isSilent && isMountedRef.current) {
            setState(prev => ({ ...prev, isLoading: true }));
        }
        try {
            const effectiveUseHistory = useHistory !== undefined ? useHistory : isViewingHistory;
            const effectiveStartDate = startDate || historyDateRange.startDate;
            const effectiveEndDate = endDate || historyDateRange.endDate;

            let url = routes.getSuppliers;
            const params = new URLSearchParams();

            if (effectiveUseHistory) {
                url = routes.getOldBillsSummary;
                params.append('use_history', 'true');
                params.append('date_filtered', 'true');

                if (effectiveStartDate && effectiveEndDate) {
                    params.append('start_date', effectiveStartDate);
                    params.append('end_date', effectiveEndDate);
                }
            }

            const response = await api.get(`${url}?${params.toString()}`);
            if (!isMountedRef.current) return null;

            if (!response.data) {
                return null;
            }

            const pending = response.data.unprinted || [];
            const completed = response.data.printed || [];
            const allItems = [...pending, ...completed];

            // One batched advances request instead of N+1 per bill
            const billNumbers = [...new Set(
                allItems
                    .map((item) => item.supplier_bill_no)
                    .filter(isValidBillNumber)
            )];
            let advanceMap = { ...supplierAdvancesMapRef.current };
            try {
                if (isSilent && Object.keys(advanceMap).length > 0) {
                    fetchSupplierAdvancesByBillNumbers(billNumbers, { silent: true }).catch((advanceBatchError) => {
                        safeError('Error batch-fetching advances:', advanceBatchError);
                    });
                } else {
                    advanceMap = await fetchSupplierAdvancesByBillNumbers(billNumbers, { silent: isSilent });
                }
            } catch (advanceBatchError) {
                safeError('Error batch-fetching advances:', advanceBatchError);
                advanceMap = { ...supplierAdvancesMapRef.current };
            }
            if (!isMountedRef.current) return null;

            // History loan enrichment with limited concurrency (skip when list already has payment data)
            const historyLoanMap = {};
            if (effectiveUseHistory) {
                const needsHistorySync = allItems.filter((item) => {
                    if (!item.supplier_code || !isValidBillNumber(item.supplier_bill_no)) return false;
                    const existingPayments = parsePaymentDetails(item.payment_details);
                    const hasLoan = parseFloat(item.loan_amount) > 0;
                    return existingPayments.length === 0 || !hasLoan;
                });

                await mapWithConcurrency(needsHistorySync, 5, async (item) => {
                    const key = `${item.supplier_code}::${item.supplier_bill_no}`;
                    try {
                        const historyLoanResponse = await api.get(
                            `/supplier-loan/search?code=${encodeURIComponent(item.supplier_code)}&bill_no=${encodeURIComponent(item.supplier_bill_no)}&use_history=true`
                        );
                        if (historyLoanResponse.data) {
                            historyLoanMap[key] = {
                                loan_amount: parseFloat(historyLoanResponse.data.loan_amount) || 0,
                                payment_details: parsePaymentDetails(historyLoanResponse.data.payment_details)
                            };
                        }
                    } catch {
                        // Ignore per-bill history sync failures
                    }
                });
            }
            if (!isMountedRef.current) return null;

            const processBill = (item) => {
                let paymentDetails = parsePaymentDetails(item.payment_details);
                let historyLoanAmount = 0;

                if (effectiveUseHistory && item.supplier_code && item.supplier_bill_no) {
                    const key = `${item.supplier_code}::${item.supplier_bill_no}`;
                    const historyLoan = historyLoanMap[key];
                    if (historyLoan) {
                        historyLoanAmount = historyLoan.loan_amount || 0;
                        if (historyLoan.payment_details?.length > 0) {
                            paymentDetails = historyLoan.payment_details;
                        }
                    }
                }

                let totalAllPayments = 0;
                for (let i = 0; i < paymentDetails.length; i++) {
                    totalAllPayments += parseFloat(paymentDetails[i].amount) || 0;
                }

                const totalAmount = parseFloat(item.total_amount) || 0;
                const persistedPaidAmount = Math.max(parseFloat(item.loan_amount) || 0, historyLoanAmount);
                const effectivePaidAmount = Math.max(totalAllPayments, persistedPaidAmount);

                let advanceAmountForBill = 0;
                if (isValidBillNumber(item.supplier_bill_no)) {
                    for (let i = 0; i < paymentDetails.length; i++) {
                        const payment = paymentDetails[i];
                        if (payment.details && payment.details.advance_applied) {
                            advanceAmountForBill = Math.max(
                                advanceAmountForBill,
                                parseFloat(payment.details.advance_applied) || 0
                            );
                        }
                    }
                    if (advanceAmountForBill === 0) {
                        advanceAmountForBill = parseFloat(advanceMap[item.supplier_bill_no]) || 0;
                    }
                }

                const totalPaidIncludingAdvance = effectivePaidAmount + advanceAmountForBill;
                const isFullySettled = totalPaidIncludingAdvance >= totalAmount;
                const remainingAmount = Math.max(0, totalAmount - totalPaidIncludingAdvance);

                return {
                    ...item,
                    loan_amount: effectivePaidAmount,
                    credit_amount: parseFloat(item.credit_amount) || 0,
                    credit_paid_amount: parseFloat(item.credit_paid_amount ?? item.paid_amount) || 0,
                    credit_remaining_amount: parseFloat(item.credit_remaining_amount ?? item.remaining_amount) || 0,
                    creditor_status: item.creditor_status || item.status || '',
                    creditor_no: item.creditor_no || item.Creditor_no || null,
                    net_remaining: remainingAmount,
                    payment_details: paymentDetails,
                    is_fully_settled: isFullySettled,
                    is_history: effectiveUseHistory,
                    advance_amount: advanceAmountForBill,
                    total_paid_including_advance: totalPaidIncludingAdvance
                };
            };

            const overlayOptimistic = (bill) => {
                const key = `${bill.supplier_code}::${bill.supplier_bill_no}`;
                const optimistic = recentOptimisticPaymentsRef.current.get(key);
                if (!optimistic) return bill;
                if (Date.now() - optimistic.timestamp > OPTIMISTIC_PAYMENT_TTL_MS) {
                    recentOptimisticPaymentsRef.current.delete(key);
                    return bill;
                }
                const serverPaid = parseFloat(bill.loan_amount) || 0;
                const serverPayments = Array.isArray(bill.payment_details) ? bill.payment_details.length : 0;
                const optimisticPayments = Array.isArray(optimistic.payment_details) ? optimistic.payment_details.length : 0;
                if (optimistic.loan_amount > serverPaid + 0.01 || optimisticPayments > serverPayments) {
                    return {
                        ...bill,
                        loan_amount: optimistic.loan_amount,
                        payment_details: optimistic.payment_details || bill.payment_details,
                        net_remaining: optimistic.net_remaining,
                        is_fully_settled: optimistic.is_fully_settled,
                        total_paid_including_advance: optimistic.total_paid_including_advance ?? bill.total_paid_including_advance,
                        credit_amount: optimistic.credit_amount ?? bill.credit_amount,
                        credit_remaining_amount: optimistic.credit_remaining_amount ?? bill.credit_remaining_amount,
                        credit_paid_amount: optimistic.credit_paid_amount ?? bill.credit_paid_amount
                    };
                }
                recentOptimisticPaymentsRef.current.delete(key);
                return bill;
            };

            const processedPending = pending.map(processBill).map(overlayOptimistic);
            const processedCompleted = completed.map(processBill).map(overlayOptimistic);

            const notSettled = processedPending.filter((item) => !item.is_fully_settled);
            const fullySettled = [
                ...processedCompleted.filter((item) => item.is_fully_settled),
                ...processedPending.filter((item) => item.is_fully_settled)
            ];

            if (isMountedRef.current) {
                setState((prev) => ({
                    ...prev,
                    pendingSuppliers: notSettled,
                    completedSuppliers: fullySettled,
                    isLoading: false
                }));
            }
            return {
                pending: notSettled,
                completed: fullySettled,
                totalLoansFound: response.data.total_loans_found || 0
            };
        } catch (error) {
            safeError("Error fetching supplier data:", error);
            if (!isSilent && isMountedRef.current) {
                setState((prev) => ({ ...prev, isLoading: false }));
            }
            return null;
        } finally {
            supplierDataRequestInFlightRef.current = false;
            if (pendingSupplierRefreshRef.current && isMountedRef.current) {
                pendingSupplierRefreshRef.current = false;
                Promise.resolve().then(() => {
                    const fetchFn = fetchSupplierDataRef.current;
                    if (fetchFn) {
                        fetchFn(
                            viewHistoryRef.current,
                            historyStartDateRef.current,
                            historyEndDateRef.current,
                            true
                        );
                    }
                });
            }
        }
    };

    // Keep polling callback current without recreating the interval
    fetchSupplierDataRef.current = fetchSupplierData;

    // Handler for viewing old bills
    const handleViewOldBills = async (startDate, endDate) => {
        setIsLoadingHistory(true);
        try {

            const formattedStart = new Date(startDate).toISOString().split('T')[0];
            const formattedEnd = new Date(endDate).toISOString().split('T')[0];

            setIsViewingHistory(true);
            setHistoryDateRange({ startDate: formattedStart, endDate: formattedEnd });

            // ✅ IMPORTANT: Pass the date range explicitly to fetchSupplierData
            const result = await fetchSupplierData(true, formattedStart, formattedEnd, false);

            if (result && (result.pending.length > 0 || result.completed.length > 0)) {
                alert(`✅ Loaded bills from ${formattedStart} to ${formattedEnd}\n\nNot Settled: ${result.pending.length}\nFully Settled: ${result.completed.length}`);
            } else {
                alert('No records found for the selected date range.');
                setIsViewingHistory(false);
                setHistoryDateRange({ startDate: '', endDate: '' });
                await fetchSupplierData(false, null, null, false);
            }
        } catch (error) {
            safeError('Error loading old bills:', error);
            alert('Failed to load old bills. Please try again.');
            setIsViewingHistory(false);
            setHistoryDateRange({ startDate: '', endDate: '' });
        } finally {
            setIsLoadingHistory(false);
        }
    };
    const calculatePaymentTotals = useCallback(() => {
        const totals = {
            cash: 0,
            cheque: 0,
            bank_transfer: 0,
            credit: 0,
            bag_to_box: 0,
            bill_to_bill: 0,
            bad_debt: 0
        };

        // Combine pending and completed suppliers
        const allSuppliers = [...state.pendingSuppliers, ...state.completedSuppliers];

        allSuppliers.forEach(supplier => {
            const paymentDetails = supplier.payment_details || [];
            if (Array.isArray(paymentDetails)) {
                paymentDetails.forEach(payment => {
                    const amount = parseFloat(payment.amount) || 0;
                    switch (payment.method) {
                        case 'Cash':
                            totals.cash += amount;
                            break;
                        case 'Cheque':
                            totals.cheque += amount;
                            break;
                        case 'Bank Transfer':
                            totals.bank_transfer += amount;
                            break;
                        case 'Credit':
                            totals.credit += amount;
                            break;
                        case 'bag_to_box':
                            totals.bag_to_box += amount;
                            break;
                        case 'bill_to_bill':
                            totals.bill_to_bill += amount;
                            break;
                        case 'bad_debt':
                            totals.bad_debt += amount;
                            break;
                        default:
                            break;
                    }
                });
            }
        });

        setAdjustmentTotals(totals);
    }, [state.pendingSuppliers, state.completedSuppliers]);

    // Reset to current bills
    const handleResetToCurrentBills = async () => {
        try {
            setIsViewingHistory(false);
            setHistoryDateRange({ startDate: '', endDate: '' });
            await fetchSupplierData(false, null, null, false);
            alert('✅ Switched back to current bills');
        } catch (error) {
            safeError('Error resetting to current bills:', error);
            alert('Failed to load current bills.');
        }
    };

    const fetchPaymentHistory = async (supplierCode, billNo) => {
        try {
            let url = routes.paymentHistory;
            const params = new URLSearchParams();
            params.append('code', supplierCode);
            params.append('bill_no', billNo || '');
            if (isViewingHistory) {
                params.append('use_history', 'true');
            }
            const response = await api.get(`${url}?${params.toString()}`);
            if (response.data.success) {
                const payments = response.data.data.payments || [];
                const uniquePayments = [];
                const seenIds = new Set();
                for (const payment of payments) {
                    const uniqueKey = `${payment.amount}-${payment.method}-${new Date(payment.date).getTime()}`;
                    if (!seenIds.has(uniqueKey)) {
                        seenIds.add(uniqueKey);
                        uniquePayments.push(payment);
                    }
                }

                // ✅ FIX: Calculate total paid from the actual payments array
                // Exclude 'Credit' method payments if needed (since credit is payable TO supplier)
                const calculatedTotalPaid = uniquePayments.reduce((total, payment) => {
                    // Only add non-credit payments to total paid
                    if (payment.method !== 'Credit') {
                        return total + (parseFloat(payment.amount) || 0);
                    }
                    return total;
                }, 0);

                // ✅ FIX: Get total bill amount from response data
                // Try multiple possible field names
                let totalBillAmount = response.data.data.total_bill_amount ||
                    response.data.data.total_amount ||
                    response.data.data.bill_total ||
                    0;

                // If totalBillAmount is still 0, try to calculate from payments + remaining
                if (totalBillAmount === 0) {
                    const remainingBalance = response.data.data.remaining_balance || 0;
                    totalBillAmount = calculatedTotalPaid + remainingBalance;
                }

                const remainingBalance = response.data.data.remaining_balance ||
                    (totalBillAmount - calculatedTotalPaid);


                setState(prev => ({
                    ...prev,
                    currentPayments: uniquePayments,
                    paymentHistoryTotalPaid: calculatedTotalPaid,
                    paymentHistoryTotalBill: totalBillAmount,
                    paymentHistoryRemaining: remainingBalance,
                    showPaymentHistoryModal: true
                }));
            }
        } catch (error) {
            safeError('Failed to fetch payment history:', error);
            alert('Failed to fetch payment history');
        }
    };

    const fetchDetailedReport = async (supplierCode) => {
        setIsLoadingReport(true);
        setSelectedReportSupplier(supplierCode);
        try {
            const response = await api.get(`${routes.getSupplierDetailedReport}/${supplierCode}`);
            if (response.data.success) { setDetailedReportData(response.data.data); setShowDetailedReport(true); }
            else { alert('Failed to load detailed report'); }
        } catch (error) { alert('Error loading report: ' + (error.response?.data?.message || error.message)); }
        finally { setIsLoadingReport(false); }
    };

    const checkBillCreditorStatus = async (billNo, supplierCode) => {
        try {
            const response = await api.get(`/creditors/${billNo}?supplier_code=${supplierCode}`);
            return response.data.success && response.data.data ? response.data.data : null;
        }
        catch (error) { return null; }
    };

    // Update refs when history state changes
    useEffect(() => {
        viewHistoryRef.current = isViewingHistory;
    }, [isViewingHistory]);

    useEffect(() => {
        historyStartDateRef.current = historyDateRange.startDate;
        historyEndDateRef.current = historyDateRange.endDate;
    }, [historyDateRange]);

    // Pause background polls while any blocking UI is open
    useEffect(() => {
        modalOpenRef.current = !!(
            showIncomeSourcesModal ||
            showAdjustmentModal ||
            showCreditorModal ||
            showOldBillsModal ||
            showDetailedReport ||
            showFundsAllocated ||
            showDirectFundAllocationModal ||
            showAllocatedBankModal ||
            showAdjustmentSummary ||
            showFarmerModal ||
            showCreditorForm ||
            showAdvanceHistory ||
            editingRecord ||
            state.showChequeModal ||
            state.showBankToBankModal ||
            state.showPaymentHistoryModal ||
            state.showDeleteModal ||
            state.showPrintModal
        );
    }, [
        showIncomeSourcesModal,
        showAdjustmentModal,
        showCreditorModal,
        showOldBillsModal,
        showDetailedReport,
        showFundsAllocated,
        showDirectFundAllocationModal,
        showAllocatedBankModal,
        showAdjustmentSummary,
        showFarmerModal,
        showCreditorForm,
        showAdvanceHistory,
        editingRecord,
        state.showChequeModal,
        state.showBankToBankModal,
        state.showPaymentHistoryModal,
        state.showDeleteModal,
        state.showPrintModal
    ]);

    // Main useEffect for initial load and silent refresh
    useEffect(() => {
        // Initial load with loading indicator (only first time)
        const initialLoad = async () => {
            await fetchSupplierData(false, null, null, false);
        };
        initialLoad();

        // Cleanup on unmount
        return () => {
            if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
            }
        };
    }, []); // Empty dependency array - runs once on mount

    const handleModeChange = (mode) => {
        // Store the mode selection for this specific bill
        if (state.selectedBillNo) {
            const billKey = `${state.selectedSupplier}-${state.selectedBillNo}`;
            setBillModeSelections(prev => ({
                ...prev,
                [billKey]: mode
            }));
        }

        // Unlock the panel when a mode is selected
        setIsMiddlePanelLocked(false);

        setState(prev => ({ ...prev, selectedMode: mode }));

        if (mode === 'creditor') {
            if (!state.selectedSupplier) {
                alert('Please select a supplier/bill first before marking as creditor.');
                setState(prev => ({ ...prev, selectedMode: 'walking_seller' }));
                setIsMiddlePanelLocked(true);
                return;
            }
            if (!state.selectedBillNo) {
                alert('Please select a bill that has a bill number.');
                setState(prev => ({ ...prev, selectedMode: 'walking_seller' }));
                setIsMiddlePanelLocked(true);
                return;
            }
            setSelectedBillForCreditor({ supplierCode: state.selectedSupplier, billNo: state.selectedBillNo });
            setShowCreditorModal(true);
        }
    };

    const handleCreditorSave = async (saved, creditorNo = null) => {
        if (saved && pendingCreditorBill) {
            setShowCreditorForm(false);
            setPendingCreditorBill(null);
            await fetchSupplierData(isViewingHistory, historyDateRange.startDate, historyDateRange.endDate);
            alert(`Supplier ${pendingCreditorBill.supplierCode} has been registered as a Creditor!${creditorNo ? `\nCreditor Number: ${creditorNo}` : ''}${pendingCreditorBill.billNo ? `\nBill No: ${pendingCreditorBill.billNo}` : ''}`);
        } else { setShowCreditorForm(false); setPendingCreditorBill(null); }
    };

    const fetchAllFarmers = async () => {
        setIsLoadingFarmers(true);
        try {
            const suppliersResponse = await api.get('/suppliers');
            const suppliers = suppliersResponse.data || [];
            const salesResponse = await api.get('/suppliers/with-bills');
            const salesSuppliers = salesResponse.data?.data || [];
            const allOptions = [];
            suppliers.forEach(supplier => allOptions.push({ type: 'supplier', code: supplier.code, name: supplier.name, telephone: supplier.telephone_no, billNo: null, hasBill: false }));
            salesSuppliers.forEach(item => { if (item.supplier_code) allOptions.push({ type: 'bill', code: item.supplier_code, name: '', telephone: '', displayText: `${item.supplier_code} - Bill: ${item.supplier_bill_no || 'N/A'}`, billNo: item.supplier_bill_no, hasBill: true }); });
            const pendingWithNoBill = [...state.pendingSuppliers];
            pendingWithNoBill.forEach(item => { if (!allOptions.some(opt => opt.code === item.supplier_code && opt.billNo === item.supplier_bill_no)) allOptions.push({ type: 'pending', code: item.supplier_code, displayText: `${item.supplier_code} - Bill: ${item.supplier_bill_no || 'Pending'} (Due: ${formatDecimal(item.total_amount || 0)})`, billNo: item.supplier_bill_no, amount: item.total_amount }); });
            const completedWithBill = [...state.completedSuppliers];
            completedWithBill.forEach(item => { if (!allOptions.some(opt => opt.code === item.supplier_code && opt.billNo === item.supplier_bill_no) && item.supplier_bill_no) allOptions.push({ type: 'completed', code: item.supplier_code, displayText: `${item.supplier_code} - Bill: ${item.supplier_bill_no} (Settled ✓)`, billNo: item.supplier_bill_no, settled: true }); });
            const uniqueOptions = [], keyMap = new Map();
            for (const option of allOptions) { const key = `${option.code}-${option.billNo || 'no-bill'}`; if (!keyMap.has(key)) { keyMap.set(key, option); uniqueOptions.push(option); } }
            uniqueOptions.sort((a, b) => a.code.localeCompare(b.code));
            setAllFarmerOptions(uniqueOptions);
        } catch (error) { alert('Failed to load farmers list'); }
        finally { setIsLoadingFarmers(false); }
    };

    useEffect(() => { if (showFarmerModal) fetchAllFarmers(); }, [showFarmerModal]);

    const filteredFarmerOptions = useMemo(() => {
        if (!farmerSearchQuery) return allFarmerOptions;
        const query = farmerSearchQuery.toLowerCase();
        return allFarmerOptions.filter(option => option.code.toLowerCase().includes(query) || (option.name && option.name.toLowerCase().includes(query)) || (option.billNo && option.billNo.toString().toLowerCase().includes(query)));
    }, [allFarmerOptions, farmerSearchQuery]);

    const groupedFarmers = useMemo(() => {
        const groups = { suppliers: [], pending: [], printed: [], completed: [] };
        filteredFarmerOptions.forEach(option => {
            if (option.type === 'supplier') groups.suppliers.push(option);
            else if (option.type === 'pending') groups.pending.push(option);
            else if (option.type === 'completed') groups.completed.push(option);
            else if (option.type === 'bill') groups.printed.push(option);
        });
        return groups;
    }, [filteredFarmerOptions]);

    const handleCreditorConfirm = async (supplier) => {
        // Save the current selected supplier and bill before any refresh
        const currentSupplier = state.selectedSupplier;
        const currentBillNo = state.selectedBillNo;

        // Save creditor mode for this bill
        if (currentBillNo) {
            const billKey = `${currentSupplier}-${currentBillNo}`;
            setBillModeSelections(prev => ({
                ...prev,
                [billKey]: 'creditor'
            }));
        }

        alert(`Supplier ${supplier.code} marked as creditor successfully!`);

        // Refresh data silently WITHOUT resetting the selected bill
        await fetchSupplierData(isViewingHistory, historyDateRange.startDate, historyDateRange.endDate, true);

        // Re-select the same bill after refresh
        if (currentSupplier && currentBillNo) {
            // Check if the bill still exists after refresh
            const billStillExists = [...state.pendingSuppliers, ...state.completedSuppliers].some(
                item => item.supplier_code === currentSupplier &&
                    item.supplier_bill_no === currentBillNo
            );

            if (billStillExists) {
                // Re-select the bill without showing the lock screen
                setIsMiddlePanelLocked(false);

                // Fetch the refreshed details for this bill
                await refreshSupplierDetailsAfterCreditor(currentSupplier, currentBillNo);

                // Update the selected state without triggering a full reset
                setState(prev => ({
                    ...prev,
                    selectedSupplier: currentSupplier,
                    selectedBillNo: currentBillNo,
                    selectedMode: 'creditor'
                }));
            } else {
                // Bill no longer exists, clear selection
                setState(prev => ({
                    ...prev,
                    selectedSupplier: null,
                    selectedBillNo: null,
                    supplierDetails: [],
                    paymentAmount: "",
                    currentPaidAmount: 0,
                    paymentBreakdown: [],
                    currentBillTotal: 0
                }));
                setSelectedBillCreditor(null);
                setIsMiddlePanelLocked(true);
            }
        }

        setIsMiddlePanelLocked(false);
    };

    // Add this helper function to refresh supplier details without resetting selection
    const refreshSupplierDetailsAfterCreditor = async (supplierCode, billNo) => {
        try {
            let url, response;
            const useHistoryParam = isViewingHistory && historyDateRange.startDate && historyDateRange.endDate;

            if (billNo) {
                url = `${routes.getSupplierBillDetails}/${billNo}/details?supplier_code=${supplierCode}`;
                if (useHistoryParam) {
                    url += `&use_history=true&start_date=${historyDateRange.startDate}&end_date=${historyDateRange.endDate}`;
                }
                response = await api.get(url);
            } else {
                url = `${routes.getUnprintedDetails}/${supplierCode}`;
                if (useHistoryParam) {
                    url += `?use_history=true&start_date=${historyDateRange.startDate}&end_date=${historyDateRange.endDate}`;
                }
                response = await api.get(url);
            }

            const salesData = response.data.sales || response.data;

            let calculatedTotal = salesData.reduce((sum, s) => sum + (parseFloat(s.SupplierTotal) || 0), 0);

            const billFromState = [...state.pendingSuppliers, ...state.completedSuppliers].find(
                item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
            );

            let actualBillTotal = calculatedTotal;
            if (billFromState && billFromState.total_amount) {
                actualBillTotal = parseFloat(billFromState.total_amount);
            }

            const total = actualBillTotal;
            let currentPaid = 0;
            let paymentBreakdown = [];

            if (billNo) {
                try {
                    let loanUrl = `/supplier-loan/search?code=${supplierCode}&bill_no=${billNo}`;
                    if (useHistoryParam) {
                        loanUrl += `&use_history=true`;
                    }
                    const loanRes = await api.get(loanUrl);
                    if (loanRes.data) {
                        const paymentDetails = loanRes.data.payment_details || [];
                        if (typeof paymentDetails === 'string') {
                            paymentBreakdown = JSON.parse(paymentDetails);
                        } else {
                            paymentBreakdown = paymentDetails;
                        }

                        const isFromFullySettled = state.completedSuppliers.some(
                            item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
                        );

                        let totalPaidFromPayments = 0;
                        if (Array.isArray(paymentBreakdown)) {
                            paymentBreakdown.forEach(payment => {
                                const amount = parseFloat(payment.amount) || 0;
                                if (isFromFullySettled && payment.method === 'Credit') {
                                    // Exclude Credit from Total Paid display for Fully Settled bills
                                } else {
                                    totalPaidFromPayments += amount;
                                }
                            });
                        }
                        currentPaid = totalPaidFromPayments;
                    }
                } catch (loanError) {
                    safeError('Error fetching loan details during refresh:', loanError);
                }
            }

            // Get updated creditor info
            let creditorInfo = null;
            if (billNo) {
                creditorInfo = await checkBillCreditorStatus(billNo, supplierCode);
                setSelectedBillCreditor(creditorInfo);
            } else {
                setSelectedBillCreditor(null);
            }

            const isFromNotSettled = state.pendingSuppliers.some(
                item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
            );

            const isFromFullySettled = state.completedSuppliers.some(
                item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
            );

            let totalRemainingAmount = 0;
            let isUpdatingCompletedBill = false;

            if (isFromNotSettled) {
                const totalPaidIncludingCredit = paymentBreakdown.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                totalRemainingAmount = Math.max(0, total - totalPaidIncludingCredit);
                isUpdatingCompletedBill = false;
            } else if (isFromFullySettled) {
                totalRemainingAmount = creditorInfo?.remaining_amount || 0;
                isUpdatingCompletedBill = true;
            }

            const defaultPaymentAmount = totalRemainingAmount > 0 ? totalRemainingAmount.toString() : "";

            // Update state without clearing the selection
            setState(prev => ({
                ...prev,
                supplierDetails: salesData || [],
                currentPaidAmount: currentPaid,
                paymentBreakdown: paymentBreakdown,
                currentBillTotal: total,
                isUpdatingCompletedBill: isUpdatingCompletedBill,
                paymentAmount: defaultPaymentAmount
            }));


        } catch (error) {
            safeError('Error refreshing supplier details after creditor:', error);
        }
    };

    const handleSupplierClick = async (supplierCode, billNo = null) => {
        if (state.selectedSupplier === supplierCode && state.selectedBillNo === billNo) {
            setState(prev => ({
                ...prev,
                selectedSupplier: null,
                selectedBillNo: null,
                supplierDetails: [],
                paymentAmount: "",
                currentPaidAmount: 0,
                paymentBreakdown: [],
                currentBillTotal: 0,
                currentLoanId: null
            }));
            setSelectedBillCreditor(null);
            setIsMiddlePanelLocked(true);
            // Reset advance amount when deselecting
            setAdvanceAmount(0);
            return;
        }

        // ⭐ CRITICAL: Immediately check for creditor before any loading
        let hasCreditor = false;
        let creditorInfo = null;

        if (billNo) {
            try {
                creditorInfo = await checkBillCreditorStatus(billNo, supplierCode);
                hasCreditor = !!(creditorInfo && (creditorInfo.creditor_no || creditorInfo.creditorNo || creditorInfo.Creditor_no));
            } catch (error) {
            }
        }

        // ⭐ Check if this specific bill has a previously selected mode
        const billKey = `${supplierCode}-${billNo}`;
        const savedMode = billModeSelections[billKey];

        // ⭐ DECISION LOGIC:
        if (hasCreditor) {
            setIsMiddlePanelLocked(false);
            if (!state.selectedMode || state.selectedMode === 'walking_seller') {
                setState(prev => ({ ...prev, selectedMode: 'walking_seller' }));
            }
        } else if (savedMode) {
            setIsMiddlePanelLocked(false);
            setState(prev => ({ ...prev, selectedMode: savedMode }));
        } else {
            setIsMiddlePanelLocked(true);
            setState(prev => ({ ...prev, selectedMode: null }));
        }

        setState(prev => ({ ...prev, isPrinting: true, selectedSupplier: supplierCode, selectedBillNo: billNo }));

        try {
            const useHistoryParam = isViewingHistory && historyDateRange.startDate && historyDateRange.endDate;

            let detailsUrl;
            if (billNo) {
                detailsUrl = `${routes.getSupplierBillDetails}/${billNo}/details?supplier_code=${supplierCode}`;
                if (useHistoryParam) {
                    detailsUrl += `&use_history=true&start_date=${historyDateRange.startDate}&end_date=${historyDateRange.endDate}`;
                }
            } else {
                detailsUrl = `${routes.getUnprintedDetails}/${supplierCode}`;
                if (useHistoryParam) {
                    detailsUrl += `?use_history=true&start_date=${historyDateRange.startDate}&end_date=${historyDateRange.endDate}`;
                }
            }

            let parallelLoanUrl = null;
            if (billNo) {
                parallelLoanUrl = `/supplier-loan/search?code=${supplierCode}&bill_no=${billNo}`;
                if (useHistoryParam) {
                    parallelLoanUrl += `&use_history=true`;
                }
            }

            const cachedAdvance = (billNo && isValidBillNumber(billNo))
                ? (parseFloat(supplierAdvancesMapRef.current[billNo]) || 0)
                : 0;

            const [response, loanRes, advanceMap] = await Promise.all([
                api.get(detailsUrl),
                parallelLoanUrl
                    ? api.get(parallelLoanUrl).catch((loanError) => {
                        safeError('Error fetching loan details:', loanError);
                        return null;
                    })
                    : Promise.resolve(null),
                (billNo && isValidBillNumber(billNo) && !cachedAdvance)
                    ? fetchSupplierAdvancesByBillNumbers([billNo]).catch((advanceError) => {
                        safeError('Error fetching advance amount:', advanceError);
                        return {};
                    })
                    : Promise.resolve(null)
            ]);

            // CRITICAL FIX: Handle the response correctly for history mode
            let salesData = [];

            // For history mode, the response has a 'sales' property
            if (response.data && response.data.sales) {
                salesData = response.data.sales;
                if (salesData.length > 0) {
                }
            }
            // For normal mode, response is directly an array
            else if (Array.isArray(response.data)) {
                salesData = response.data;
            }
            // Check if response has data property
            else if (response.data && response.data.data) {
                salesData = Array.isArray(response.data.data) ? response.data.data : [];
            }
            // Fallback: try to get from response directly
            else if (response.data) {
                if (typeof response.data === 'object' && !Array.isArray(response.data)) {
                    // If it's an object with numeric keys, convert to array
                    salesData = Object.values(response.data).filter(item => item && typeof item === 'object' && item.SupplierTotal !== undefined);
                } else {
                    salesData = [];
                }
            }

            // Ensure salesData is an array
            if (!Array.isArray(salesData)) {
                salesData = [];
            }


            // If still no sales data, try to get it from the pending/completed suppliers list
            if (salesData.length === 0 && billNo) {
                const billFromList = [...state.pendingSuppliers, ...state.completedSuppliers].find(
                    item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
                );
                if (billFromList && billFromList.sales_data) {
                    salesData = billFromList.sales_data;
                }
            }

            let calculatedTotal = 0;
            if (salesData.length > 0) {
                calculatedTotal = salesData.reduce((sum, s) => sum + (parseFloat(s.SupplierTotal) || 0), 0);
            } else {
            }

            const billFromState = [...state.pendingSuppliers, ...state.completedSuppliers].find(
                item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
            );

            let actualBillTotal = calculatedTotal;
            let creditAmount = 0;
            let creditorRemainingAmount = 0;

            if (billFromState && billFromState.total_amount) {
                actualBillTotal = parseFloat(billFromState.total_amount);
            } else if (calculatedTotal > 0) {
                actualBillTotal = calculatedTotal;
            }

            const total = actualBillTotal;

            let currentPaid = 0;
            let paymentBreakdown = [];
            let fetchedLoanId = null;

            if (loanRes?.data) {
                fetchedLoanId = loanRes.data.id || loanRes.data.ID || loanRes.data.loan_id || null;
                const paymentDetails = loanRes.data.payment_details || [];
                if (typeof paymentDetails === 'string') {
                    paymentBreakdown = JSON.parse(paymentDetails);
                } else {
                    paymentBreakdown = paymentDetails;
                }

                const isFromFullySettled = state.completedSuppliers.some(
                    item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
                );

                let totalPaidFromPayments = 0;
                if (Array.isArray(paymentBreakdown)) {
                    paymentBreakdown.forEach(payment => {
                        const amount = parseFloat(payment.amount) || 0;
                        if (isFromFullySettled && payment.method === 'Credit') {
                            // Exclude Credit from Total Paid display for Fully Settled bills
                        } else {
                            totalPaidFromPayments += amount;
                        }
                    });
                }
                currentPaid = totalPaidFromPayments;
            } else if (billFromState) {
                paymentBreakdown = Array.isArray(billFromState.payment_details) ? billFromState.payment_details : [];
                currentPaid = parseFloat(billFromState.loan_amount) || 0;
            }

            // Get creditor info
            if (billNo && !creditorInfo) {
                creditorInfo = await checkBillCreditorStatus(billNo, supplierCode);
                setSelectedBillCreditor(creditorInfo);
                hasCreditor = !!(creditorInfo && (creditorInfo.creditor_no || creditorInfo.creditorNo || creditorInfo.Creditor_no));
                if (creditorInfo) {
                    creditAmount = parseFloat(creditorInfo.credit_amount) || 0;
                    creditorRemainingAmount = parseFloat(creditorInfo.remaining_amount) || 0;
                }
            } else if (creditorInfo) {
                setSelectedBillCreditor(creditorInfo);
                creditAmount = parseFloat(creditorInfo.credit_amount) || 0;
                creditorRemainingAmount = parseFloat(creditorInfo.remaining_amount) || 0;
            } else {
                setSelectedBillCreditor(null);
            }

            // Check which section this bill belongs to
            const isFromNotSettled = state.pendingSuppliers.some(
                item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
            );

            const isFromFullySettled = state.completedSuppliers.some(
                item => item.supplier_code === supplierCode && item.supplier_bill_no === billNo
            );

            // Calculate remaining amount
            let totalRemainingAmount = 0;
            let isUpdatingCompletedBill = false;

            if (isFromNotSettled) {
                const totalPaidIncludingCredit = paymentBreakdown.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                totalRemainingAmount = Math.max(0, total - totalPaidIncludingCredit);
                isUpdatingCompletedBill = false;
            } else if (isFromFullySettled) {
                totalRemainingAmount = creditorRemainingAmount;
                isUpdatingCompletedBill = true;
            }

            if (hasCreditor && isMiddlePanelLocked) {
                setIsMiddlePanelLocked(false);
            }

            let advanceAmountForBill = 0;
            if (billNo && isValidBillNumber(billNo)) {
                advanceAmountForBill = cachedAdvance || parseFloat(advanceMap?.[billNo]) || 0;
                setTotalAdvanceAmount(advanceAmountForBill);
            } else {
                setTotalAdvanceAmount(0);
            }
            setAdvanceAmount(advanceAmountForBill);

            // Calculate default payment amount considering advance
            let defaultPaymentAmount = "";
            if (isUpdatingCompletedBill && creditorRemainingAmount > 0) {
                defaultPaymentAmount = creditorRemainingAmount.toString();
            } else if (!isUpdatingCompletedBill && totalRemainingAmount > 0) {
                // Subtract advance from remaining amount
                const netRemainingAfterAdvance = Math.max(0, totalRemainingAmount - advanceAmountForBill);
                defaultPaymentAmount = netRemainingAfterAdvance > 0 ? netRemainingAfterAdvance.toString() : "";
            }


            setState(prev => ({
                ...prev,
                supplierDetails: salesData || [],
                paymentAmount: defaultPaymentAmount,
                currentPaidAmount: currentPaid,
                paymentBreakdown: paymentBreakdown,
                isPrinting: false,
                currentBillTotal: total,
                isUpdatingCompletedBill: isUpdatingCompletedBill,
                currentLoanId: fetchedLoanId
            }));

            if (salesData.length === 0) {
                alert('Warning: No item details found for this bill. The table may be empty.');
            }

        } catch (error) {
            safeError('Error fetching supplier details:', error);
            setState(prev => ({ ...prev, isPrinting: false, supplierDetails: [] }));
            setSelectedBillCreditor(null);
            setIsMiddlePanelLocked(true);
            alert('Error loading bill details: ' + (error.response?.data?.message || error.message));
        }
    };
    const generateBillContent = useCallback(async (billNo) => {
        try {
            const useHistoryParam = isViewingHistory && historyDateRange.startDate && historyDateRange.endDate;
            let url = `${routes.getSupplierBillDetails}/${billNo}/details?supplier_code=${state.selectedSupplier}`;
            if (useHistoryParam) {
                url += `&use_history=true&start_date=${historyDateRange.startDate}&end_date=${historyDateRange.endDate}`;
            }
            const response = await api.get(url);
            const details = response.data.sales || response.data;

            // Calculate totals from details
            let totalsupplierSales = 0;
            let totalPacksSum = 0;
            const itemSummaryData = {};

            details.forEach(record => {
                const total = parseFloat(record.SupplierTotal) || 0;
                const weight = parseFloat(record.weight) || 0;
                const packs = parseInt(record.packs) || 0;
                const itemName = record.item_name || '';

                totalsupplierSales += total;
                totalPacksSum += packs;

                if (!itemSummaryData[itemName]) {
                    itemSummaryData[itemName] = { totalWeight: 0, totalPacks: 0 };
                }
                itemSummaryData[itemName].totalWeight += weight;
                itemSummaryData[itemName].totalPacks += packs;
            });

            // Get payment details
            let paymentBreakdown = [];
            let currentPaidAmount = 0;
            try {
                let loanUrl = `/supplier-loan/search?code=${state.selectedSupplier}&bill_no=${billNo}`;
                if (useHistoryParam) {
                    loanUrl += `&use_history=true`;
                }
                const loanRes = await api.get(loanUrl);
                if (loanRes.data) {
                    currentPaidAmount = parseFloat(loanRes.data.loan_amount) || 0;
                    paymentBreakdown = loanRes.data.payment_details || [];
                    if (typeof paymentBreakdown === 'string') {
                        paymentBreakdown = JSON.parse(paymentBreakdown);
                    }
                }
            } catch (loanError) { }

            // Use your bill structure
            const date = new Date().toLocaleDateString('si-LK');
            const mobile = '0777672838/0714371115';
            const is4Inch = state.billSize === '4inch';
            const receiptMaxWidth = is4Inch ? '4in' : '350px';
            const fontSizeBody = '25px';
            const fontSizeHeader = '23px';
            const fontSizeTotal = '28px';

            const paidAmountValue = currentPaidAmount;
            const remainingAfterPayment = totalsupplierSales - paidAmountValue;
            // ✅ FIX: Get the total advance amount from the supplier_advances table
            const advanceAmount = totalAdvanceAmount || 0;

            const colGroups = `
        <colgroup>
            <col style="width:32%;"> 
            <col style="width:21%;">
            <col style="width:21%;">
            <col style="width:26%;">
        </colgroup>`;

            const formatNumber = (value, maxDecimals = 3) => {
                if (typeof value !== 'number' && typeof value !== 'string') return '0';
                const number = parseFloat(value);
                if (isNaN(number)) return '0';
                if (Number.isInteger(number)) return number.toLocaleString('en-US');
                const parts = number.toFixed(maxDecimals).replace(/\.?0+$/, '').split('.');
                const wholePart = parseInt(parts[0]).toLocaleString('en-US');
                return parts[1] ? `${wholePart}.${parts[1]}` : wholePart;
            };

            const detailedItemsHtml = details.map(record => {
                const weight = parseFloat(record.weight) || 0;
                const packs = parseInt(record.packs) || 0;
                const price = parseFloat(record.SupplierPricePerKg) || 0;
                const total = parseFloat(record.SupplierTotal) || 0;
                const itemName = record.item_name || '';
                const customerCode = record.customer_code?.toUpperCase() || '';

                return `
            <tr style="font-size:${fontSizeBody}; font-weight:bold; vertical-align: bottom;">
                <td style="text-align:left; padding:10px 0; white-space: nowrap;">${itemName}<br>${formatNumber(packs)}</td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -70px;">${formatNumber(weight.toFixed(2))}</td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -65px;">${formatNumber(price.toFixed(2))}</td>
                <td style="padding:10px 0; display:flex; flex-direction:column; align-items:flex-end;">
                    <div style="font-size:25px; white-space:nowrap;">${customerCode}</div>
                    <div style="font-weight:900; white-space:nowrap;">${formatNumber(total.toFixed(2))}</div>
                </td>
            </tr>`;
            }).join("");

            const summaryEntries = Object.entries(itemSummaryData);
            let itemSummaryHtml = '';
            for (let i = 0; i < summaryEntries.length; i += 2) {
                const [name1, d1] = summaryEntries[i];
                const [name2, d2] = summaryEntries[i + 1] || [null, null];
                const text1 = `${name1}:${formatNumber(d1.totalWeight)}/${formatNumber(d1.totalPacks)}`;
                const text2 = d2 ? `${name2}:${formatNumber(d2.totalWeight)}/${formatNumber(d2.totalPacks)}` : '';
                itemSummaryHtml += `<tr><td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap; font-size:14px;">${text1}</td><td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap; font-size:14px;">${text2}</td></tr>`;
            }

            const netPayable = advanceAmount - paidAmountValue;

            return `
        <div style="width:${receiptMaxWidth}; margin:0 auto; padding:10px; font-family:'Courier New', monospace; color:#000; background:#fff;">
            <div style="text-align:center; font-weight:bold;">
                <div style="font-size:24px;">මංජු සහ සහෝදරයෝ</div>
                <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin:12px 0;">
                    <span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">N66</span>
                    <div style="font-size:18px;">ගොවියා: <span style="border:2.5px solid #000; padding:5px 10px; font-size:22px;">${state.selectedSupplier}</span></div>
                </div>
                <div style="font-size:16px; white-space: nowrap;">එළවළු තොග වෙළෙන්දෝ බණ්ඩාරවෙල</div>
            </div>
            <div style="font-size:19px; margin-top:10px; padding:0 5px;">
                <div style="font-weight: bold;">දුර:${mobile}</div>
                <div style="display:flex; justify-content:space-between; margin-top:3px;">
                    <span>බිල් අංකය:${billNo}</span>
                    <span>දිනය:${date}</span>
                </div>
            </div>
            <hr style="border:none; border-top:2.5px solid #000; margin:10px 0;">
            <table style="width:100%; border-collapse:collapse; font-size:${fontSizeBody}; table-layout: fixed;">
                ${colGroups}
                <thead>
                    <tr style="border-bottom:2.5px solid #000; font-weight:bold;">
                        <th style="text-align:left; padding-bottom:8px; font-size:${fontSizeHeader};">වර්ගය<br>මලු</th>
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -50px; top: 24px;">කිලෝ</th>
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -45px; top: 24px;">මිල</th>
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader};">කේතය<br>අගය</th>
                    </tr>
                </thead>
                <tbody>${detailedItemsHtml}</tbody>
                <tfoot>
                    <tr style="border-top:2.5px solid #000; font-weight:bold;">
                        <td style="padding-top:12px; font-size:${fontSizeTotal};">${formatNumber(totalPacksSum)}</td>
                        <td colspan="3" style="padding-top:12px; font-size:${fontSizeTotal};"><div style="text-align:right; float:right; white-space:nowrap;">${totalsupplierSales.toFixed(2)}</div></td>
                    <tr>
                </tfoot>
            </table>

            <table style="width:100%; margin-top:20px; font-weight:bold; font-size:22px; padding:0 5px;">
                <tr>
                    <td style="font-size:15px; white-space:nowrap; position:relative; left:-15px;">මෙම බිලට මුළු අගය:</td>
                    <td style="text-align:right;"><span style="border-bottom:2px solid #000; font-size:${fontSizeTotal}; padding:5px 10px;">${totalsupplierSales.toFixed(2)}</span></td>
                </tr>
                
                ${paidAmountValue > 0 ? `
                <tr style="font-size:18px;">
                    <td style="font-size:15px; padding-top:10px;">ගෙවූ මුදල (Paid):</td>
                    <td style="text-align:right; padding-top:10px; color:#000;">- ${paidAmountValue.toFixed(2)}</td>
                </tr>
                <tr style="font-size:18px;">
                    <td style="font-size:15px; padding-top:5px;">ඉතිරි මුදල (Remaining):</td>
                    <td style="text-align:right; padding-top:5px; color:#000;">${remainingAfterPayment.toFixed(2)}</td>
                </tr>
                <tr><td colspan="2" style="border-top:1px dashed #000; padding: 5px 0;"></td></tr>
                ` : ''}

                <tr style="font-size:18px;">
                    <td style="font-size:15px; padding-top:5px;">අත්තිකාරම් (Advance):</td>
                    <td style="text-align:right; padding-top:5px; color:#d97706; font-weight:bold;">- ${advanceAmount.toFixed(2)}</td>
                </tr>

                <tr style="font-weight:900;">
                    <td style="font-size:18px; padding-top:10px;">ශුද්ධ ඉතිරි ශේෂය:</td>
                    <td style="text-align:right; padding-top:10px;">
                        <span style="color:#000; font-size:${fontSizeTotal}; border-bottom:5px double #000; border-top:2px solid #000;">
                        ${netPayable.toFixed(2)}
                        </span>
                    </td>
                </tr>
            </table>

            <div style="margin-top:25px; border-top:1px dashed #000; padding-top:10px;">
                <table style="width:100%; border-collapse:collapse; font-size:14px; text-align:center;">${itemSummaryHtml}</table>
            </div>
        </div>`;
        } catch (error) {
            safeError('Error generating bill:', error);
            return '<div>Error generating bill</div>';
        }
    }, [state.selectedSupplier, state.billSize, isViewingHistory, historyDateRange.startDate, historyDateRange.endDate, totalAdvanceAmount]);
    // Add this function to check if loan exists
    const checkLoanExists = async (supplierCode, billNo) => {
        try {
            let loanUrl = `/supplier-loan/search?code=${supplierCode}&bill_no=${billNo}`;
            if (isViewingHistory) {
                loanUrl += `&use_history=true`;
            }
            const response = await api.get(loanUrl);
            return response.data && response.data.id ? true : false;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return false;
            }
            safeError('Error checking loan existence:', error);
            return false;
        }
    };
    // Add this helper function at the component level (outside any other function)
    const findExistingLoanId = async (supplierCode, billNo) => {
        try {
            let loanUrl = `/supplier-loan/search?code=${supplierCode}&bill_no=${billNo}`;
            if (isViewingHistory) {
                loanUrl += `&use_history=true`;
            }
            const response = await api.get(loanUrl);

            const loanId = response.data?.id || response.data?.ID || response.data?.loan_id;

            if (loanId) {
                let paymentDetails = response.data?.payment_details || [];
                if (typeof paymentDetails === 'string') {
                    try {
                        paymentDetails = JSON.parse(paymentDetails);
                    } catch (e) {
                        paymentDetails = [];
                    }
                }
                return {
                    exists: true,
                    id: loanId,
                    paymentDetails: paymentDetails,
                    currentPaid: response.data?.loan_amount || 0
                };
            }

            return { exists: false, id: null, paymentDetails: [], currentPaid: 0 };
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return { exists: false, id: null, paymentDetails: [], currentPaid: 0 };
            }
            safeError('Error checking loan existence:', error);
            return { exists: false, id: null, paymentDetails: [], currentPaid: 0 };
        }
    };
    const releasePaymentLocks = () => {
        processingPaymentRef.current = false;
        paymentLockRef.current = false;
        if (isMountedRef.current) {
            setPaymentLock(false);
            setIsProcessingPayment(false);
        }
        window.lastPaymentTime = null;
        window.lastPaymentAmount = null;
        window.lastIdempotencyKey = null;
        window.cashPaymentProcessing = false;
    };

    const scheduleSidebarReconcile = () => {
        const fetchFn = fetchSupplierDataRef.current;
        if (!fetchFn) return;
        fetchFn(
            viewHistoryRef.current,
            historyStartDateRef.current,
            historyEndDateRef.current,
            true
        );
        fetchAllocatedBreakdown();
        fetchNetAvailableAmount();
    };

    const applyOptimisticPaymentToSidebars = ({
        supplierCode,
        billNo,
        paymentAmount,
        paymentRecord,
        totalPayable,
        isCreditSettlement = false,
        updatedCreditor = null,
        creditAmountDelta = 0,
        extraState = {}
    }) => {
        const paymentOpts = { paymentAmount, paymentRecord, totalPayable, isCreditSettlement, updatedCreditor, creditAmountDelta };
        setState((prev) => {
            const match = (item) => item.supplier_code === supplierCode && item.supplier_bill_no === billNo;
            let pending = prev.pendingSuppliers;
            let completed = prev.completedSuppliers;
            const pendingIdx = pending.findIndex(match);
            const completedIdx = completed.findIndex(match);
            let updatedBill = null;

            if (pendingIdx >= 0) {
                updatedBill = applyPaymentToBillItem(pending[pendingIdx], paymentOpts);
                if (updatedBill.is_fully_settled) {
                    pending = pending.filter((_, i) => i !== pendingIdx);
                    completed = [updatedBill, ...completed];
                } else {
                    pending = pending.map((item, i) => (i === pendingIdx ? updatedBill : item));
                }
            } else if (completedIdx >= 0) {
                updatedBill = applyPaymentToBillItem(completed[completedIdx], paymentOpts);
                completed = completed.map((item, i) => (i === completedIdx ? updatedBill : item));
            }

            if (updatedBill) {
                recentOptimisticPaymentsRef.current.set(`${supplierCode}::${billNo}`, {
                    loan_amount: updatedBill.loan_amount,
                    payment_details: updatedBill.payment_details,
                    net_remaining: updatedBill.net_remaining,
                    is_fully_settled: updatedBill.is_fully_settled,
                    total_paid_including_advance: updatedBill.total_paid_including_advance,
                    credit_amount: updatedBill.credit_amount,
                    credit_remaining_amount: updatedBill.credit_remaining_amount,
                    credit_paid_amount: updatedBill.credit_paid_amount,
                    timestamp: Date.now()
                });
            }

            return {
                ...prev,
                pendingSuppliers: pending,
                completedSuppliers: completed,
                selectedSupplier: null,
                selectedBillNo: null,
                supplierDetails: [],
                paymentAmount: "",
                currentPaidAmount: 0,
                paymentBreakdown: [],
                showChequeModal: false,
                showBankToBankModal: false,
                showAdjustmentModal: false,
                isPrinting: false,
                currentBillTotal: 0,
                currentLoanId: null,
                ...extraState
            };
        });
        setSelectedBillCreditor(null);
    };

    const processPayment = async (paymentAmount, isCheque = false, chequeDetails = null, isBankTransfer = false, bankTransferDetails = null, isAdjustment = false, adjustmentDetails = null) => {
        // ========== IMPROVED RACE CONDITION FIXES ==========
        const callId = Math.random().toString(36).substr(2, 9);

        // IMPROVED: Use React state lock instead of just window flag
        if (paymentLockRef.current || paymentLock) {
            alert('Payment is already being processed. Please wait...');
            return;
        }

        // Generate idempotency key for backend deduplication
        const idempotencyKey = `${state.selectedSupplier}-${state.selectedBillNo}-${paymentAmount}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        idempotencyKeyRef.current = idempotencyKey;

        // CRITICAL FIX: Check if the selected bill is in the "Not Settled" list
        const isBillInNotSettled = state.pendingSuppliers.some(item =>
            item.supplier_code === state.selectedSupplier &&
            item.supplier_bill_no === state.selectedBillNo
        );


        // Determine if this should be treated as a credit settlement payment
        const isCreditSettlementPayment = !isBillInNotSettled &&
            state.isUpdatingCompletedBill &&
            selectedBillCreditor &&
            selectedBillCreditor.remaining_amount > 0;


        // Check for duplicate within the last 5 seconds using enhanced tracking
        const now = Date.now();

        // Enhanced duplicate detection with idempotency key
        if (window.lastPaymentTime && (now - window.lastPaymentTime) < PAYMENT_UNLOCK_MS) {
            if (window.lastPaymentAmount === paymentAmount && window.lastIdempotencyKey === idempotencyKey) {
                alert('Duplicate payment detected. Please wait a moment.');
                return;
            }
        }

        // Store this payment attempt with idempotency key
        window.lastPaymentTime = now;
        window.lastPaymentAmount = paymentAmount;
        window.lastIdempotencyKey = idempotencyKey;

        // Create a unique key for this payment attempt
        const paymentKey = `${state.selectedSupplier}-${state.selectedBillNo}-${paymentAmount}-${idempotencyKey}`;

        // Check if we're already processing a payment using ref lock
        if (processingPaymentRef.current) {
            alert('Payment is already being processed. Please wait...');
            return;
        }

        // Check for duplicate within the last 3 seconds using ref with idempotency
        if (lastPaymentDataRef.current) {
            const timeDiff = Date.now() - lastPaymentDataRef.current.timestamp;
            const sameSupplier = lastPaymentDataRef.current.supplier === state.selectedSupplier;
            const sameBill = lastPaymentDataRef.current.billNo === state.selectedBillNo;
            const sameIdempotencyKey = lastPaymentDataRef.current.idempotencyKey === idempotencyKey;
            const sameAmount = Math.abs(lastPaymentDataRef.current.amount - paymentAmount) < 0.01;


            if (timeDiff < PAYMENT_UNLOCK_MS && sameSupplier && sameBill && (sameAmount || sameIdempotencyKey)) {
                alert('Duplicate payment detected. Please wait a moment before trying again.');
                return;
            }
        }

        if (!state.selectedSupplier || state.isPrinting) {
            return;
        }

        // Set all processing flags with locks
        processingPaymentRef.current = true;
        paymentLockRef.current = true;
        setPaymentLock(true);

        lastPaymentDataRef.current = {
            timestamp: Date.now(),
            supplier: state.selectedSupplier,
            billNo: state.selectedBillNo,
            amount: paymentAmount,
            idempotencyKey: idempotencyKey,
            callId: callId
        };

        // Disable the button immediately
        setIsProcessingPayment(true);
        setState(prev => ({ ...prev, isPrinting: true }));

        try {
            const totalPayable = state.currentBillTotal || state.supplierDetails.reduce((sum, s) => sum + (parseFloat(s.SupplierTotal) || 0), 0);

            let currentPaid = parseFloat(state.currentPaidAmount) || 0;
            let existingPaymentDetails = Array.isArray(state.paymentBreakdown) ? [...state.paymentBreakdown] : [];
            let existingLoanId = state.currentLoanId || null;

            // Only hit the loan-search API when we already have payments but no stored loan id
            if (!existingLoanId && existingPaymentDetails.length > 0) {
                const loanCheck = await findExistingLoanId(state.selectedSupplier, state.selectedBillNo);
                existingLoanId = loanCheck.exists ? loanCheck.id : null;
                if (loanCheck.paymentDetails?.length) {
                    existingPaymentDetails = loanCheck.paymentDetails;
                    currentPaid = loanCheck.currentPaid;
                }
            }

            // Ensure payment details is an array
            if (typeof existingPaymentDetails === 'string') {
                try {
                    existingPaymentDetails = JSON.parse(existingPaymentDetails);
                } catch (e) {
                    existingPaymentDetails = [];
                }
            }
            if (!Array.isArray(existingPaymentDetails)) {
                existingPaymentDetails = [];
            }

            const duplicateInDb = existingPaymentDetails.some(p => p.idempotency_key === idempotencyKey);

            if (duplicateInDb) {
                alert('This payment was already recorded. Please refresh the page.');
                // Clear all locks
                processingPaymentRef.current = false;
                paymentLockRef.current = false;
                setPaymentLock(false);
                setIsProcessingPayment(false);
                setState(prev => ({ ...prev, isPrinting: false }));
                return;
            }


            // ⭐ CRITICAL FIX: Calculate total paid AFTER this payment
            const newTotalPaid = currentPaid + paymentAmount;
            const isFullySettled = newTotalPaid >= totalPayable;
            const newRemaining = Math.max(0, totalPayable - newTotalPaid);


            let paymentMethod = 'Cash';
            if (isAdjustment && adjustmentDetails) {
                paymentMethod = adjustmentDetails.type === 'bag_to_box' ? 'bag_to_box' :
                    (adjustmentDetails.type === 'bill_to_bill' ? 'bill_to_bill' : 'bad_debt');
            } else if (isBankTransfer) {
                paymentMethod = 'Bank Transfer';
            } else if (isCheque) {
                paymentMethod = 'Cheque';
            }

            // Map payment method to creditor format
            let paymentMethodForCreditor = 'cash';
            if (paymentMethod === 'Cheque') paymentMethodForCreditor = 'cheque';
            else if (paymentMethod === 'Bank Transfer') paymentMethodForCreditor = 'bank_transfer';
            else if (paymentMethod === 'bag_to_box') paymentMethodForCreditor = 'bag_to_box';
            else if (paymentMethod === 'bill_to_bill') paymentMethodForCreditor = 'bill_to_bill';
            else if (paymentMethod === 'bad_debt') paymentMethodForCreditor = 'bad_debt';

            // Create a truly unique ID using multiple sources including idempotency key
            const uniqueId = `${idempotencyKey}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const timestamp = Date.now();

            const paymentRecord = {
                id: uniqueId,
                idempotency_key: idempotencyKey,
                date: new Date().toISOString(),
                amount: paymentAmount,
                method: paymentMethod,
                running_balance: newRemaining,
                reference: paymentMethod === 'Cash' ? `Cash Payment ${timestamp}` : (chequeDetails?.cheq_no || bankTransferDetails?.reference_no || adjustmentDetails?.reference),
                details: {},
                unique_timestamp: timestamp,
                payment_index: existingPaymentDetails.length,
                call_id: callId,
                is_credit_settlement: isCreditSettlementPayment
            };

            // Track bank name for allocation deduction
            let bankNameForAllocation = null;

            if (isCheque && chequeDetails) {
                paymentRecord.reference = chequeDetails.cheq_no;
                paymentRecord.details = {
                    cheque_no: chequeDetails.cheq_no,
                    cheque_date: chequeDetails.cheq_date,
                    bank_account_id: chequeDetails.bank_account_id
                };
                // Get bank name for allocation deduction
                bankNameForAllocation = chequeDetails.bank_name || null;
            } else if (isBankTransfer && bankTransferDetails) {
                paymentRecord.reference = bankTransferDetails.reference_no;
                paymentRecord.details = {
                    reference_no: bankTransferDetails.reference_no,
                    transfer_date: bankTransferDetails.transfer_date,
                    bank_account_id: bankTransferDetails.bank_account_id,
                    notes: bankTransferDetails.notes
                };
                // Get bank name for allocation deduction
                bankNameForAllocation = bankTransferDetails.bank_name || null;
            } else if (isAdjustment && adjustmentDetails) {
                if (adjustmentDetails.type === 'bag_to_box') {
                    paymentRecord.details = {
                        bag_count: adjustmentDetails.bag_count,
                        box_count: adjustmentDetails.box_count,
                        bag_value: adjustmentDetails.bag_value,
                        box_value: adjustmentDetails.box_value
                    };
                } else if (adjustmentDetails.type === 'bill_to_bill') {
                    paymentRecord.details = {
                        target_supplier_code: adjustmentDetails.target_supplier_code,
                        target_supplier_bill_no: adjustmentDetails.target_supplier_bill_no,
                        target_supplier_bill_value: adjustmentDetails.target_supplier_bill_value
                    };
                } else if (adjustmentDetails.type === 'bad_debt') {
                    paymentRecord.details = {
                        bad_debt_name: adjustmentDetails.bad_debt_name,
                        bad_debt_amount: adjustmentDetails.bad_debt_amount
                    };
                }
            }

            // Append new payment
            const allPaymentDetails = [...existingPaymentDetails, paymentRecord];

            // ========== CRITICAL FIX: Only update creditor if bill is NOT in Not Settled list ==========
            let creditorUpdateSuccess = false;
            let updatedCreditorData = null;

            if (!isBillInNotSettled && isCreditSettlementPayment && selectedBillCreditor && selectedBillCreditor.remaining_amount > 0) {

                try {
                    const updateResponse = await api.put('/creditors/update-payment', {
                        bill_no: state.selectedBillNo,
                        payment_amount: paymentAmount,
                        payment_method: paymentMethodForCreditor,
                        idempotency_key: idempotencyKey
                    });


                    if (updateResponse.data.success) {
                        creditorUpdateSuccess = true;
                        updatedCreditorData = updateResponse.data.data;
                    } else {
                        throw new Error(updateResponse.data.message || 'Failed to update creditor payment');
                    }
                } catch (creditorError) {
                    safeError('Failed to update creditor payment:', creditorError);
                    alert('Failed to update creditor payment: ' + (creditorError.response?.data?.message || creditorError.message));
                    // Clear locks on error
                    processingPaymentRef.current = false;
                    paymentLockRef.current = false;
                    setPaymentLock(false);
                    setIsProcessingPayment(false);
                    setState(prev => ({ ...prev, isPrinting: false }));
                    return;
                }
            }

            let response;

            if (existingLoanId) {

                const payload = {
                    code: state.selectedSupplier,
                    bill_no: state.selectedBillNo,
                    loan_amount: paymentAmount,
                    total_amount: totalPayable,
                    type: paymentMethod,
                    transaction_ids: state.supplierDetails.map(record => record.id),
                    payment_details: allPaymentDetails,
                    use_history: isViewingHistory,
                    is_credit_settlement: isCreditSettlementPayment,
                    idempotency_key: idempotencyKey,
                    bag_amount: bagAmount ? parseFloat(bagAmount) : null
                };

                if (isCheque && chequeDetails) {
                    payload.bank_name = chequeDetails.bank_name;
                    payload.cheque_no = chequeDetails.cheq_no;
                    payload.realized_date = chequeDetails.cheq_date;
                    payload.bank_account_id = chequeDetails.bank_account_id;
                } else if (isBankTransfer && bankTransferDetails) {
                    payload.bank_account_id = bankTransferDetails.bank_account_id;
                    payload.transfer_reference_no = bankTransferDetails.reference_no;
                    payload.transfer_date = bankTransferDetails.transfer_date;
                    payload.transfer_notes = bankTransferDetails.notes;
                } else if (isAdjustment && adjustmentDetails) {
                    if (adjustmentDetails.type === 'bag_to_box') {
                        payload.bag_count = adjustmentDetails.bag_count;
                        payload.box_count = adjustmentDetails.box_count;
                        payload.bag_value = adjustmentDetails.bag_value;
                        payload.box_value = adjustmentDetails.box_value;
                        payload.adjustment_amount = adjustmentDetails.amount;
                    } else if (adjustmentDetails.type === 'bill_to_bill') {
                        payload.target_supplier_code = adjustmentDetails.target_supplier_code;
                        payload.target_supplier_bill_no = adjustmentDetails.target_supplier_bill_no;
                        payload.target_supplier_bill_value = adjustmentDetails.target_supplier_bill_value;
                        payload.adjustment_amount = adjustmentDetails.amount;
                    } else if (adjustmentDetails.type === 'bad_debt') {
                        payload.bad_debt_name = adjustmentDetails.bad_debt_name;
                        payload.bad_debt_amount = adjustmentDetails.bad_debt_amount;
                        payload.adjustment_amount = adjustmentDetails.amount;
                    }
                }

                response = await api.put(`/supplier-loan/${existingLoanId}`, payload);
            } else {

                const payload = {
                    code: state.selectedSupplier,
                    bill_no: state.selectedBillNo,
                    loan_amount: paymentAmount,
                    total_amount: totalPayable,
                    type: paymentMethod,
                    transaction_ids: state.supplierDetails.map(record => record.id),
                    payment_details: allPaymentDetails,
                    use_history: isViewingHistory,
                    is_credit_settlement: isCreditSettlementPayment,
                    idempotency_key: idempotencyKey,
                    bag_amount: bagAmount ? parseFloat(bagAmount) : null
                };

                if (isCheque && chequeDetails) {
                    payload.bank_name = chequeDetails.bank_name;
                    payload.cheque_no = chequeDetails.cheq_no;
                    payload.realized_date = chequeDetails.cheq_date;
                    payload.bank_account_id = chequeDetails.bank_account_id;
                } else if (isBankTransfer && bankTransferDetails) {
                    payload.bank_account_id = bankTransferDetails.bank_account_id;
                    payload.transfer_reference_no = bankTransferDetails.reference_no;
                    payload.transfer_date = bankTransferDetails.transfer_date;
                    payload.transfer_notes = bankTransferDetails.notes;
                } else if (isAdjustment && adjustmentDetails) {
                    if (adjustmentDetails.type === 'bag_to_box') {
                        payload.bag_count = adjustmentDetails.bag_count;
                        payload.box_count = adjustmentDetails.box_count;
                        payload.bag_value = adjustmentDetails.bag_value;
                        payload.box_value = adjustmentDetails.box_value;
                        payload.adjustment_amount = adjustmentDetails.amount;
                    } else if (adjustmentDetails.type === 'bill_to_bill') {
                        payload.target_supplier_code = adjustmentDetails.target_supplier_code;
                        payload.target_supplier_bill_no = adjustmentDetails.target_supplier_bill_no;
                        payload.target_supplier_bill_value = adjustmentDetails.target_supplier_bill_value;
                        payload.adjustment_amount = adjustmentDetails.amount;
                    } else if (adjustmentDetails.type === 'bad_debt') {
                        payload.bad_debt_name = adjustmentDetails.bad_debt_name;
                        payload.bad_debt_amount = adjustmentDetails.bad_debt_amount;
                        payload.adjustment_amount = adjustmentDetails.amount;
                    }
                }

                response = await api.post('/supplier-loan', payload);
            }

            if (response.data.success) {
                const capturedSupplier = state.selectedSupplier;
                const capturedBillNo = state.selectedBillNo;
                const isNowFullySettled = newTotalPaid >= totalPayable;

                // Instant sidebar + form update — do not wait on extra API calls
                applyOptimisticPaymentToSidebars({
                    supplierCode: capturedSupplier,
                    billNo: capturedBillNo,
                    paymentAmount,
                    paymentRecord,
                    totalPayable,
                    isCreditSettlement: isCreditSettlementPayment,
                    updatedCreditor: updatedCreditorData
                });

                if (paymentMethod !== 'Credit') {
                    deductAllocatedFunds(paymentAmount, paymentMethod, bankNameForAllocation);
                }

                runSafeTimeout(scheduleSidebarReconcile, 250);

                let successMessage = `✓ Payment Added: ${paymentMethod} - Rs. ${formatDecimal(paymentAmount)}`;

                if (isNowFullySettled && !isCreditSettlementPayment) {
                    successMessage = `✅ Payment Complete!\nPayment: ${paymentMethod} - Rs. ${formatDecimal(paymentAmount)}\nBill is now fully settled!`;
                    if (capturedBillNo) {
                        generateBillContent(capturedBillNo).then((billContent) => {
                            if (isMountedRef.current) {
                                setState(prev => ({ ...prev, printBillContent: billContent, showPrintModal: true }));
                            }
                        }).catch((printError) => safeError('Error generating bill after payment:', printError));
                    }
                }

                if (isCreditSettlementPayment && creditorUpdateSuccess && !isBillInNotSettled) {
                    const remainingCredit = updatedCreditorData?.remaining_amount
                        ?? Math.max(0, (selectedBillCreditor?.remaining_amount || 0) - paymentAmount);
                    const totalCreditAmount = updatedCreditorData?.credit_amount || selectedBillCreditor?.credit_amount || 0;
                    const paidAmount = totalCreditAmount - remainingCredit;

                    if (remainingCredit <= 0) {
                        successMessage = `✅ CREDIT FULLY SETTLED!\n\nAmount: ${paymentMethod} - Rs. ${formatDecimal(paymentAmount)}\nTotal Credit: Rs. ${formatDecimal(totalCreditAmount)}\nTotal Paid: Rs. ${formatDecimal(paidAmount)}`;
                    } else {
                        successMessage = `✓ CREDIT PAYMENT RECORDED!\n\nAmount: ${paymentMethod} - Rs. ${formatDecimal(paymentAmount)}\nRemaining Credit: Rs. ${formatDecimal(remainingCredit)}\nTotal Credit: Rs. ${formatDecimal(totalCreditAmount)}`;
                    }
                }

                alert(successMessage);
            }
        } catch (error) {
            safeError('Failed to record payment:', error);
            alert('Failed to record payment: ' + (error.response?.data?.message || error.message));
            setState(prev => ({ ...prev, isPrinting: false }));
        } finally {
            runSafeTimeout(releasePaymentLocks, PAYMENT_UNLOCK_MS);
        }
    };
    const processCreditSettlementPayment = async (paymentAmount, isCheque = false, chequeDetails = null, isBankTransfer = false, bankTransferDetails = null) => {
        if (!state.selectedSupplier || !selectedBillCreditor) {
            alert("No credit record found to settle");
            return;
        }

        // CRITICAL: Only allow credit settlement when the bill is in Fully Settled section
        if (!state.isUpdatingCompletedBill) {
            alert("⚠️ Credit can only be settled when the bill is in the 'Fully Settled' section.\n\nPlease complete the bill payment first, then the credit will become available for settlement.");
            return;
        }


        setState(prev => ({ ...prev, isPrinting: true }));

        // Track bank name for allocation deduction
        let bankNameForAllocation = null;
        let paymentMethod = 'Cash';
        let paymentMethodForCreditor = 'cash';

        try {
            if (isBankTransfer) {
                paymentMethod = 'Bank Transfer';
                paymentMethodForCreditor = 'bank_transfer';
                bankNameForAllocation = bankTransferDetails?.bank_name || null;
            } else if (isCheque) {
                paymentMethod = 'Cheque';
                paymentMethodForCreditor = 'cheque';
                bankNameForAllocation = chequeDetails?.bank_name || null;
            }

            if (paymentAmount > selectedBillCreditor.remaining_amount) {
                alert(`Amount exceeds remaining credit! Remaining: Rs. ${formatDecimal(selectedBillCreditor.remaining_amount)}`);
                setState(prev => ({ ...prev, isPrinting: false }));
                return;
            }


            // ✅ Call the creditor update payment endpoint
            const updateResponse = await api.put('/creditors/update-payment', {
                bill_no: state.selectedBillNo,
                payment_amount: paymentAmount,
                payment_method: paymentMethodForCreditor
            });


            if (updateResponse.data.success) {
                const updatedCreditor = updateResponse.data.data;

                // Also record this payment in the loan record
                const totalPayableAmt = state.currentBillTotal || state.supplierDetails.reduce((sum, s) => sum + (parseFloat(s.SupplierTotal) || 0), 0);
                const currentPaid = state.currentPaidAmount;
                const newTotalPaid = currentPaid + paymentAmount;
                const newRemaining = Math.max(0, totalPayableAmt - newTotalPaid);

                const paymentRecord = {
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    date: new Date().toISOString(),
                    amount: paymentAmount,
                    method: paymentMethod,
                    running_balance: newRemaining,
                    reference: `Credit Settlement - ${paymentMethod}`,
                    details: {
                        creditor_settlement: true,
                        previous_credit_remaining: selectedBillCreditor.remaining_amount,
                        new_credit_remaining: updatedCreditor.remaining_amount
                    }
                };

                const allPaymentDetails = [...state.paymentBreakdown, paymentRecord];
                const payload = {
                    code: state.selectedSupplier,
                    bill_no: state.selectedBillNo,
                    loan_amount: paymentAmount,
                    total_amount: totalPayableAmt,
                    type: paymentMethod,
                    transaction_ids: state.supplierDetails.map(record => record.id),
                    payment_details: allPaymentDetails,
                    use_history: isViewingHistory
                };

                if (isCheque && chequeDetails) {
                    payload.bank_name = chequeDetails.bank_name;
                    payload.cheque_no = chequeDetails.cheq_no;
                    payload.realized_date = chequeDetails.cheq_date;
                    payload.bank_account_id = chequeDetails.bank_account_id;
                } else if (isBankTransfer && bankTransferDetails) {
                    payload.bank_account_id = bankTransferDetails.bank_account_id;
                    payload.transfer_reference_no = bankTransferDetails.reference_no;
                    payload.transfer_date = bankTransferDetails.transfer_date;
                    payload.transfer_notes = bankTransferDetails.notes;
                }

                const loanResponse = await api.post('/supplier-loan', payload);

                if (loanResponse.data.success) {
                    deductAllocatedFunds(paymentAmount, paymentMethod, bankNameForAllocation);

                    applyOptimisticPaymentToSidebars({
                        supplierCode: state.selectedSupplier,
                        billNo: state.selectedBillNo,
                        paymentAmount,
                        paymentRecord,
                        totalPayable: totalPayableAmt,
                        isCreditSettlement: true,
                        updatedCreditor
                    });
                    runSafeTimeout(scheduleSidebarReconcile, 250);

                    const message = updatedCreditor.remaining_amount <= 0
                        ? `✅ CREDIT FULLY SETTLED!\nAmount: Rs. ${formatDecimal(paymentAmount)}\nPayment Method: ${paymentMethod}`
                        : `✓ CREDIT PAYMENT RECORDED!\nAmount: Rs. ${formatDecimal(paymentAmount)}\nRemaining Credit: Rs. ${formatDecimal(updatedCreditor.remaining_amount)}`;

                    alert(message);
                } else {
                    throw new Error('Failed to record loan payment');
                }
            } else {
                throw new Error(updateResponse.data.message || 'Failed to update creditor payment');
            }
        } catch (error) {
            safeError('❌ Failed to process credit payment:', error);
            alert('Failed to process credit payment: ' + (error.response?.data?.message || error.message));
            setState(prev => ({ ...prev, isPrinting: false }));
        }
    };
    const handleCashPayment = async () => {
        const amount = parseFloat(state.paymentAmount);
        if (amount === 0 || isNaN(amount)) {
            alert("Please enter an amount");
            return;
        }

        // CRITICAL: Use a window flag to prevent double clicks
        if (window.cashPaymentProcessing) {
            alert('Payment is already being processed. Please wait...');
            return;
        }

        window.cashPaymentProcessing = true;

        // Disable the button element directly
        const cashButton = document.querySelector('button[data-payment-type="cash"]');
        if (cashButton) {
            cashButton.disabled = true;
            cashButton.style.opacity = '0.5';
        }

        try {
            await processPayment(amount);
        } catch (error) {
            safeError('❌ Cash payment failed:', error);
        } finally {
            runSafeTimeout(() => {
                window.cashPaymentProcessing = false;
                if (cashButton) {
                    cashButton.disabled = false;
                    cashButton.style.opacity = '1';
                }
            }, PAYMENT_UNLOCK_MS);
        }
    };
    // Handle right-click on Funds Allocated button
    const handleFundsAllocatedContextMenu = (e) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY
        });
    };

    // Close context menu
    const closeContextMenu = () => {
        setContextMenu({ visible: false, x: 0, y: 0 });
    };

    // Reset funds allocated to zero
    const handleResetFundsAllocated = () => {
        if (window.confirm('Are you sure you want to reset the Funds Allocated amount to zero?')) {
            setFundsAllocated(0);
            localStorage.setItem('fundsAllocated', '0');
            alert('✅ Funds Allocated has been reset to 0');
        }
        closeContextMenu();
    };
    // Function to deduct payment from fundsAllocated

    const handleChequePayment = async () => { const amount = parseFloat(state.paymentAmount); if (amount === 0 || isNaN(amount)) { alert("Please enter an amount"); return; } setState(prev => ({ ...prev, pendingChequeAmount: amount, showChequeModal: true })); };
    const handleChequeConfirm = async (details) => {
        const amount = state.pendingChequeAmount;
        // Always use processPayment - it will detect if credit settlement is needed
        await processPayment(amount, true, details);
        setState(prev => ({ ...prev, showChequeModal: false, pendingChequeAmount: 0 }));
    };
    const handleBankToBankPayment = async () => { const amount = parseFloat(state.paymentAmount); if (amount === 0 || isNaN(amount)) { alert("Please enter an amount"); return; } setState(prev => ({ ...prev, pendingBankToBankAmount: amount, showBankToBankModal: true })); };
    const handleBankToBankConfirm = async (details) => {
        const amount = state.pendingBankToBankAmount;
        // Always use processPayment - it will detect if credit settlement is needed
        await processPayment(amount, false, null, true, details);
        setState(prev => ({ ...prev, showBankToBankModal: false, pendingBankToBankAmount: 0 }));
    };

    const handleCreditPayment = async () => {
        let paymentAmount = parseFloat(state.paymentAmount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) { alert("Please enter a valid amount"); return; }
        if (!state.selectedSupplier) { alert("Please select a supplier/bill first"); return; }
        const remainingBillAmount = (state.currentBillTotal || state.supplierDetails.reduce((sum, s) => sum + (parseFloat(s.SupplierTotal) || 0), 0)) - state.currentPaidAmount;
        if (paymentAmount > remainingBillAmount) { alert(`Amount exceeds remaining bill amount!\nRemaining: Rs. ${formatDecimal(remainingBillAmount)}`); return; }
        if (!window.confirm(`⚠️ CREDIT PAYMENT CONFIRMATION\nSupplier: ${state.selectedSupplier}\nAmount: Rs. ${paymentAmount.toFixed(2)}\nThis will be recorded as PAYABLE to the supplier.`)) return;
        await processCreditPayment(paymentAmount);
    };
    // Update payment amount when calculated adjustment amount changes
    useEffect(() => {
        if (calculatedAdjustmentAmount > 0 && showAdjustmentModal) {
            setState(prev => ({ ...prev, paymentAmount: calculatedAdjustmentAmount.toString() }));
        }
    }, [calculatedAdjustmentAmount, showAdjustmentModal]);

    const processCreditPayment = async (paymentAmount) => {
        if (!state.selectedSupplier || state.isPrinting) return;
        setState(prev => ({ ...prev, isPrinting: true }));
        try {
            const totalPayableAmt = state.currentBillTotal || state.supplierDetails.reduce((sum, s) => sum + (parseFloat(s.SupplierTotal) || 0), 0);
            const currentPaid = state.currentPaidAmount;
            const newTotalPaid = currentPaid + paymentAmount;
            const isFullySettled = newTotalPaid >= totalPayableAmt;
            const newRemaining = Math.max(0, totalPayableAmt - newTotalPaid);

            const creditorResponse = await api.post('/creditors/create', { bill_no: state.selectedBillNo, supplier_code: state.selectedSupplier, credit_amount: parseFloat(paymentAmount) });
            if (!creditorResponse.data.success) throw new Error('Failed to create credit record');

            let remainingCreditAmount = parseFloat(paymentAmount), creditorStatus = 'pending';
            if (creditorResponse.data.data?.remaining_amount !== undefined) { remainingCreditAmount = parseFloat(creditorResponse.data.data.remaining_amount); creditorStatus = creditorResponse.data.data.status || 'pending'; }

            const paymentRecord = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                date: new Date().toISOString(),
                amount: paymentAmount,
                method: 'Credit',
                running_balance: newRemaining,
                reference: 'Credit Payment - Payable to Supplier',
                details: { creditor_id: creditorResponse.data.data?.id, credit_amount: parseFloat(paymentAmount), remaining_credit: remainingCreditAmount, creditor_status: creditorStatus }
            };

            const allPaymentDetails = [...state.paymentBreakdown, paymentRecord];
            const payload = {
                code: state.selectedSupplier,
                bill_no: state.selectedBillNo,
                loan_amount: paymentAmount,
                total_amount: totalPayableAmt,
                type: 'Credit',
                transaction_ids: state.supplierDetails.map(record => record.id),
                payment_details: allPaymentDetails,
                use_history: isViewingHistory
            };

            const response = await api.post('/supplier-loan', payload);
            if (response.data.success) {
                const capturedBillNo = state.selectedBillNo;
                applyOptimisticPaymentToSidebars({
                    supplierCode: state.selectedSupplier,
                    billNo: capturedBillNo,
                    paymentAmount,
                    paymentRecord,
                    totalPayable: totalPayableAmt,
                    creditAmountDelta: paymentAmount
                });
                runSafeTimeout(scheduleSidebarReconcile, 250);
                if (isFullySettled && capturedBillNo) {
                    generateBillContent(capturedBillNo).then((billContent) => {
                        if (isMountedRef.current) {
                            setState(prev => ({ ...prev, printBillContent: billContent, showPrintModal: true }));
                        }
                    }).catch((printError) => safeError('Error generating bill after credit payment:', printError));
                }
                alert(isFullySettled ? `✅ Bill Fully Paid!` : `✓ Credit Added Successfully!\nRemaining Credit: Rs. ${formatDecimal(remainingCreditAmount)}`);
            }
        } catch (error) {
            safeError('Failed to process credit payment:', error);
            alert('Failed to process credit payment.');
            setState(prev => ({ ...prev, isPrinting: false }));
        }
    };

    const handleApplyAdjustment = async (adjustmentData) => {
        let adjustmentAmount = 0;
        const adjustmentType = adjustmentData.adjustment_type;

        if (adjustmentType === 'bag_to_box') {
            adjustmentAmount = Math.abs((adjustmentData.bag_count * adjustmentData.bag_value) + (adjustmentData.box_count * adjustmentData.box_value));
        } else if (adjustmentType === 'bill_to_bill') {
            adjustmentAmount = parseFloat(adjustmentData.target_supplier_bill_value) || 0;
        } else if (adjustmentType === 'bad_debt') {
            adjustmentAmount = parseFloat(adjustmentData.bad_debt_amount) || 0;
        }

        if (adjustmentAmount === 0) {
            alert("Adjustment amount is zero");
            return;
        }

        // Create adjustment details object with all needed fields
        const adjustmentPayload = {
            type: adjustmentType,
            amount: adjustmentAmount,
            ...adjustmentData
        };

        if (parseFloat(state.paymentAmount) !== adjustmentAmount) {
            setState(prev => ({ ...prev, paymentAmount: adjustmentAmount.toString() }));
        }
        await processPayment(adjustmentAmount, false, null, false, null, true, adjustmentPayload);

        setState(prev => ({ ...prev, showAdjustmentModal: false }));
        setCalculatedAdjustmentAmount(0); // Reset after confirmation
    };

    const handleDeletePayment = async (supplierCode, billNo) => {
        setState(prev => ({ ...prev, isPrinting: true }));
        try {
            const response = await api.post(routes.deleteSupplierLoan, {
                code: supplierCode,
                bill_no: billNo,
                use_history: isViewingHistory
            });
            if (response.data.success) {
                recentOptimisticPaymentsRef.current.delete(`${supplierCode}::${billNo}`);
                setState(prev => {
                    const match = (item) => item.supplier_code === supplierCode && item.supplier_bill_no === billNo;
                    const resetBill = (item) => ({
                        ...item,
                        loan_amount: 0,
                        payment_details: [],
                        net_remaining: parseFloat(item.total_amount) || 0,
                        is_fully_settled: false,
                        total_paid_including_advance: parseFloat(item.advance_amount) || 0
                    });
                    const fromCompleted = prev.completedSuppliers.find(match);
                    const pending = prev.pendingSuppliers.map((item) => (match(item) ? resetBill(item) : item));
                    return {
                        ...prev,
                        pendingSuppliers: fromCompleted ? [resetBill(fromCompleted), ...pending] : pending,
                        completedSuppliers: prev.completedSuppliers.filter((item) => !match(item)),
                        selectedSupplier: prev.selectedSupplier === supplierCode ? null : prev.selectedSupplier,
                        selectedBillNo: prev.selectedSupplier === supplierCode ? null : prev.selectedBillNo,
                        supplierDetails: prev.selectedSupplier === supplierCode ? [] : prev.supplierDetails,
                        currentBillTotal: prev.selectedSupplier === supplierCode ? 0 : prev.currentBillTotal,
                        currentLoanId: null,
                        isPrinting: false,
                        showDeleteModal: false,
                        deleteSupplierCode: null,
                        deleteBillNo: null
                    };
                });
                scheduleSidebarReconcile();
                alert('Payment record deleted successfully!');
            }
        } catch (error) {
            safeError('Failed to delete payment record:', error);
            alert('Failed to delete payment record');
        }
        finally { setState(prev => ({ ...prev, isPrinting: false, showDeleteModal: false, deleteSupplierCode: null, deleteBillNo: null })); }
    };

    const handleContextMenu = (e, supplierCode, billNo) => { e.preventDefault(); setState(prev => ({ ...prev, showDeleteModal: true, deleteSupplierCode: supplierCode, deleteBillNo: billNo })); };

    const filterPendingSuppliers = useMemo(() => {
        if (!state.searchPendingQuery) return state.pendingSuppliers;
        const q = state.searchPendingQuery.toLowerCase();
        return state.pendingSuppliers.filter(item => item.supplier_code?.toLowerCase().includes(q) || (item.supplier_bill_no && item.supplier_bill_no.toString().toLowerCase().includes(q)));
    }, [state.pendingSuppliers, state.searchPendingQuery]);

    const filterCompletedSuppliers = useMemo(() => {
        if (!state.searchCompletedQuery) return state.completedSuppliers;
        const q = state.searchCompletedQuery.toLowerCase();
        return state.completedSuppliers.filter(item => item.supplier_code?.toLowerCase().includes(q) || (item.supplier_bill_no && item.supplier_bill_no.toString().toLowerCase().includes(q)));
    }, [state.completedSuppliers, state.searchCompletedQuery]);

    const stats = useMemo(() => {
        const totalGiven = [...state.pendingSuppliers, ...state.completedSuppliers].reduce((sum, supplier) => {
            const loanAmount = parseFloat(supplier.loan_amount) || 0;
            return sum + loanAmount;
        }, 0);

        const totalAmount = [...state.pendingSuppliers, ...state.completedSuppliers].reduce((sum, supplier) => {
            const totalAmt = parseFloat(supplier.total_amount) || 0;
            return sum + totalAmt;
        }, 0);

        const totalCreditOutstanding = [...state.pendingSuppliers].reduce((sum, supplier) => {
            const creditAmt = parseFloat(supplier.credit_amount) || 0;
            return sum + creditAmt;
        }, 0);

        return {
            totalPending: filterPendingSuppliers.length,
            totalCompleted: filterCompletedSuppliers.length,
            totalGiven: totalGiven,
            totalAmount: totalAmount,
            totalCreditOutstanding: totalCreditOutstanding
        };
    }, [filterPendingSuppliers, filterCompletedSuppliers, state.pendingSuppliers, state.completedSuppliers]);

    const totalPayable = state.currentBillTotal || state.supplierDetails.reduce((sum, s) => sum + (parseFloat(s.SupplierTotal) || 0), 0);
    const currentGiven = parseFloat(state.paymentAmount) || 0;
    let remainingAfterPayment;
    if (state.isUpdatingCompletedBill && selectedBillCreditor && selectedBillCreditor.remaining_amount > 0) remainingAfterPayment = Math.max(0, selectedBillCreditor.remaining_amount - currentGiven);
    else remainingAfterPayment = Math.max(0, totalPayable - (state.currentPaidAmount + currentGiven));

    useEffect(() => {
        if (state.selectedSupplier) {
            if (state.isUpdatingCompletedBill && selectedBillCreditor && selectedBillCreditor.remaining_amount > 0) {
                if (!state.paymentAmount || parseFloat(state.paymentAmount) === 0) {
                    setState(prev => ({ ...prev, paymentAmount: selectedBillCreditor.remaining_amount.toString() }));
                }
            } else if (!state.isUpdatingCompletedBill && (state.supplierDetails.length > 0 || state.currentBillTotal > 0)) {
                if (!state.paymentAmount || parseFloat(state.paymentAmount) === 0) {
                    // Calculate net payable after advance deduction
                    const remainingAfterPayments = Math.max(0, totalPayable - state.currentPaidAmount);
                    const netPayableAfterAdvance = Math.max(0, remainingAfterPayments - totalAdvanceAmount);
                    setState(prev => ({ ...prev, paymentAmount: netPayableAfterAdvance.toString() }));
                }
            }
        }
    }, [state.selectedSupplier, totalPayable, state.supplierDetails, state.currentPaidAmount, selectedBillCreditor, state.isUpdatingCompletedBill, state.currentBillTotal, totalAdvanceAmount]);

    if (state.isLoading) return <LoadingSkeleton />;
    const renderEditModal = () => {
        if (!editingRecord) return null;
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                    <h3 style={{ marginTop: 0, color: '#091d3d', borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>ගනුදෙනුව වෙනස් කරන්න</h3>

                    <div style={{ margin: '15px 0', fontSize: '0.9rem', color: '#666', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>
                        <p style={{ margin: '2px 0' }}><strong>බිල් අං:</strong> {editingRecord.bill_no || selectedBillNo}</p>
                        <p style={{ margin: '2px 0' }}><strong>අයිතමය:</strong> {editingRecord.item_name} | {editingRecord.weight} kg</p>
                    </div>

                    <div style={{ marginTop: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>නව ගොවි කේතය (Supplier - Optional):</label>
                        <input
                            type="text"
                            placeholder={editingRecord.supplier_code}
                            value={newFarmerCode}
                            onChange={(e) => setNewFarmerCode(e.target.value.toUpperCase())}
                            style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                            autoFocus
                        />
                    </div>

                    <div style={{ marginTop: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>නව ගැනුම්කරු (Customer - Optional):</label>
                        <input
                            type="text"
                            placeholder={editingRecord.customer_code}
                            value={newCustomerCode}
                            onChange={(e) => setNewCustomerCode(e.target.value.toUpperCase())}
                            style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                        <button onClick={handleUpdateFarmer} style={{ flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>OK</button>
                        <button onClick={() => { setEditingRecord(null); setNewFarmerCode(''); setNewCustomerCode(''); }} style={{ flex: 1, padding: '12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                    </div>
                </div>
            </div>

        );
    };

    return (
        <div style={styles.app}>
            <div style={{ background: '#1e293b', padding: '12px 24px', display: 'flex', gap: '12px', alignItems: 'center', overflowX: 'auto', position: 'sticky', top: 0, zIndex: 1000 }}>
                <button onClick={() => navigate('/supplierreport')} style={{ padding: '8px 20px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>📋 Supplier Report</button>

                {/* Dropdown for the 4 buttons */}
                <div className="dropdown-container" style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                        ref={dropdownButtonRef}
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        style={{
                            padding: '10px 24px',
                            background: isDropdownOpen ? '#4b5563' : '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '14px',
                            fontWeight: '500',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                        onMouseEnter={(e) => {
                            if (!isDropdownOpen) e.currentTarget.style.background = '#4b5563';
                        }}
                        onMouseLeave={(e) => {
                            if (!isDropdownOpen) e.currentTarget.style.background = '#6b7280';
                        }}
                    >
                        <span>📁</span> Reports & Actions
                        <span style={{
                            fontSize: '12px',
                            transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease'
                        }}>▼</span>
                    </button>

                    {isDropdownOpen && ReactDOM.createPortal(
                        <div style={{
                            position: 'fixed',
                            top: dropdownPosition.y,
                            left: dropdownPosition.x,
                            background: 'white',
                            borderRadius: '12px',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
                            minWidth: '240px',
                            zIndex: 999999,
                            overflow: 'hidden',
                            animation: 'slideDown 0.2s ease-out',
                            padding: '6px'
                        }}>
                            {/* Section Header */}
                            <div style={{
                                padding: '10px 16px 6px 16px',
                                fontSize: '11px',
                                fontWeight: '600',
                                color: '#9ca3af',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                Reports
                            </div>

                            {/* Report Items */}
                            {[
                                { label: 'Supplier Profit', icon: '📊', color: '#3b82f6', hoverColor: '#2563eb', path: '/supplier-profit' },
                                { label: 'DOB Report', icon: '📅', color: '#f59e0b', hoverColor: '#d97706', path: '/suppliers/dobreport' },
                                { label: 'CD Report', icon: '💰', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/debtor-creditor-report' },
                                { label: 'Bank Statement', icon: '🏦', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/bank-dashboard2' },
                                { label: 'Transport Report', icon: '🚚', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/reports/transport' },
                                { label: 'Loan Report', icon: '💳', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/sop2' },
                                { label: 'Supplier Loan', icon: '🚚', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/supplier-vikunum-report' },
                                { label: 'Banks', icon: '🏦', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/banks' },
                                { label: 'Cheque Report', icon: '📄', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/reports/cheque' },
                                { label: 'Cheque Report2', icon: '📄', color: '#8b5cf6', hoverColor: '#7c3aed', path: '/reports/cheque2' },
                            ].map((item, index) => (
                                <button
                                    key={index}
                                    onClick={() => {
                                        navigate(item.path);
                                        setIsDropdownOpen(false);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 16px',
                                        background: 'transparent',
                                        color: '#374151',
                                        border: 'none',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        borderRadius: '8px',
                                        transition: 'all 0.15s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        fontSize: '14px',
                                        fontWeight: '500'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = `${item.color}15`;
                                        e.currentTarget.style.color = item.color;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = '#374151';
                                    }}
                                >
                                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                                    {item.label}
                                </button>
                            ))}

                            {/* Divider */}
                            <div style={{
                                height: '1px',
                                margin: '4px 16px',
                                background: '#e5e7eb'
                            }} />

                            {/* Action Items */}
                            <div style={{
                                padding: '6px 16px 4px 16px',
                                fontSize: '11px',
                                fontWeight: '600',
                                color: '#9ca3af',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                Actions
                            </div>

                            <button
                                onClick={() => {
                                    setShowFarmerModal(true);
                                    setIsDropdownOpen(false);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px 16px',
                                    background: 'transparent',
                                    color: '#dc2626',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    borderRadius: '8px',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    fontSize: '14px',
                                    fontWeight: '500'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#fee2e2';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <span style={{ fontSize: '16px' }}>👨‍🌾</span>
                                Farmer Selector
                            </button>
                        </div>,
                        document.body
                    )}
                </div>

                <button
                    onClick={() => {
                        // Open FundAllocationModal directly without showing IncomeSourcesModal
                        setShowDirectFundAllocationModal(true);
                    }}
                    style={{
                        padding: '8px 20px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    💰 Allocate Funds
                </button>
                {/* Funds Allocated Button - Shows Cash and Bank Allocated separately */}
                <div style={{ position: 'relative', display: 'inline-flex', gap: '4px' }}>
                    <button
                        onClick={() => setShowFundsAllocated(true)}
                        onContextMenu={handleFundsAllocatedContextMenu}
                        style={{
                            padding: '8px 20px',
                            background: (netAvailableAmount || 0) < 0
                                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                : 'linear-gradient(135deg, #f59e0b, #d97706)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px 0 0 8px',
                            cursor: isLoadingNetAvailable ? 'wait' : 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: isLoadingNetAvailable ? 0.7 : 1
                        }}
                    >
                        {isLoadingNetAvailable ? (
                            <span>⏳ Calculating...</span>
                        ) : (
                            <>
                                {(netAvailableAmount || 0) < 0 ? '⚠️' : '💰'}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.2' }}>
                                    <span>Net Available: {(netAvailableAmount || 0) < 0 ? '-' : ''}Rs. {formatDecimal(Math.abs(netAvailableAmount || 0))}</span>

                                </div>
                                {(netAvailableAmount || 0) < 0 && <span style={{ fontSize: '10px', marginLeft: '4px' }}>(Overspent)</span>}
                            </>
                        )}
                    </button>

                    {/* Dropdown indicator button */}
                    <button
                        onClick={() => setShowAllocatedBankModal(true)}
                        style={{
                            padding: '8px 12px',
                            background: (allocatedBreakdown.total_allocated || 0) < 0
                                ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                                : 'linear-gradient(135deg, #d97706, #b45309)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0 8px 8px 0',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                        title="View allocation details"
                    >
                        <span>📊</span>
                        <span style={{ fontSize: '10px' }}>▼</span>
                    </button>
                </div>
                {/* Context Menu for Funds Allocated */}
                {contextMenu.visible && (
                    <>
                        <div
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                zIndex: 9998,
                            }}
                            onClick={closeContextMenu}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                closeContextMenu();
                            }}
                        />
                        <div
                            style={{
                                position: 'fixed',
                                top: contextMenu.y,
                                left: contextMenu.x,
                                backgroundColor: 'white',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 9999,
                                minWidth: '150px',
                                overflow: 'hidden',
                                border: '1px solid #e2e8f0'
                            }}
                        >
                            <button
                                onClick={handleResetFundsAllocated}
                                style={{
                                    width: '100%',
                                    padding: '10px 16px',
                                    textAlign: 'left',
                                    border: 'none',
                                    backgroundColor: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                🔄 Reset to Zero
                            </button>
                        </div>
                    </>
                )}

                {!isViewingHistory ? (
                    <button onClick={() => setShowOldBillsModal(true)} style={{ padding: '8px 20px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>📜 View Old Bills</button>
                ) : (
                    <button onClick={handleResetToCurrentBills} style={{ padding: '8px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>🔄 Back to Current Bills</button>
                )}

                {isViewingHistory && historyDateRange.startDate && historyDateRange.endDate && (
                    <span style={{ padding: '6px 12px', background: '#f59e0b', borderRadius: '20px', fontSize: '12px', color: 'white', whiteSpace: 'nowrap' }}>
                        📅 History: {historyDateRange.startDate} to {historyDateRange.endDate}
                    </span>
                )}
            </div>

            <div style={styles.container}>
                <div style={styles.threeColumns}>
                    {/* LEFT PANEL - Not Settled */}
                    <div style={styles.panel}>
                        <div style={styles.panelHeader}>
                            <h2 style={styles.panelTitle}>
                                <span style={{ width: '10px', height: '10px', background: '#f59e0b', borderRadius: '50%' }}></span>
                                Not Settled
                            </h2>
                        </div>
                        <div style={{ padding: '12px 16px 0 16px' }}>
                            <input
                                type="text"
                                placeholder="🔍 Search not settled..."
                                value={state.searchPendingQuery}
                                onChange={(e) => setState(prev => ({ ...prev, searchPendingQuery: e.target.value.toUpperCase() }))}
                                style={styles.searchInput}
                            />
                        </div>
                        <div style={styles.panelContent}>
                            {filterPendingSuppliers.length === 0 ?
                                <EmptyState message="No pending suppliers" /> :
                                (() => {
                                    // Group items by bill number
                                    const groupedByBill = filterPendingSuppliers.reduce((groups, item) => {
                                        const billNo = item.supplier_bill_no || 'Pending';
                                        if (!groups[billNo]) {
                                            groups[billNo] = [];
                                        }
                                        groups[billNo].push(item);
                                        return groups;
                                    }, {});

                                    // Convert to array for rendering and SORT by bill number (ascending)
                                    return Object.entries(groupedByBill)
                                        .sort((a, b) => {
                                            const billNoA = a[0];
                                            const billNoB = b[0];

                                            // Handle 'Pending' case - put at end
                                            if (billNoA === 'Pending') return 1;
                                            if (billNoB === 'Pending') return -1;

                                            // Try to extract numeric values for proper sorting
                                            const numA = parseInt(String(billNoA).replace(/[^0-9]/g, ''));
                                            const numB = parseInt(String(billNoB).replace(/[^0-9]/g, ''));

                                            // If both have valid numbers, sort numerically
                                            if (!isNaN(numA) && !isNaN(numB)) {
                                                return numA - numB;
                                            }

                                            // Fallback: compare as strings (case insensitive)
                                            return String(billNoA).toLowerCase().localeCompare(String(billNoB).toLowerCase());
                                        })
                                        .map(([billNo, items]) => {
                                            // Aggregate data from all items in this bill group
                                            const firstItem = items[0];
                                            const totalAmount = items.reduce((sum, item) => sum + (item.total_amount || 0), 0);
                                            const totalLoanAmount = items.reduce((sum, item) => sum + (item.loan_amount || 0), 0);
                                            const totalCreditAmount = items.reduce((sum, item) => sum + (item.credit_amount || 0), 0);
                                            const totalNetRemaining = items.reduce((sum, item) => sum + (item.net_remaining || 0), 0);
                                            const isHistory = items.some(item => item.is_history);

                                            return (
                                                <div key={billNo}
                                                    style={{
                                                        ...styles.billItem,
                                                        ...styles.billPending,
                                                        ...(state.selectedSupplier === firstItem.supplier_code && state.selectedBillNo === billNo ? styles.billSelected : {}),
                                                        borderLeft: isHistory ? '4px solid #8b5cf6' : 'none'
                                                    }}
                                                    onClick={() => handleSupplierClick(firstItem.supplier_code, billNo)}
                                                    onContextMenu={(e) => handleContextMenu(e, firstItem.supplier_code, billNo)}>
                                                    <div style={styles.billRow}>
                                                        <div style={styles.billLeft}>
                                                            <div style={styles.billNo}>{firstItem.supplier_code}</div>
                                                            <div style={styles.billCustomer}>Bill: {billNo}</div>
                                                            {isHistory && <div style={{ fontSize: '10px', color: '#8b5cf6', marginTop: '2px' }}>📜 History</div>}
                                                        </div>
                                                        <div style={styles.billRight}>
                                                            <div style={styles.billTotal}>Rs. {formatDecimal(totalAmount)}</div>
                                                            {totalLoanAmount > 0 && <div style={styles.billGiven}>Paid: {formatDecimal(totalLoanAmount)}</div>}
                                                            {totalCreditAmount > 0 && (
                                                                <div style={{ fontSize: '10px', color: '#8b5cf6', marginTop: '2px', fontWeight: 'bold' }}>
                                                                    💳 Credit: Rs. {formatDecimal(totalCreditAmount)}
                                                                </div>
                                                            )}
                                                            {totalCreditAmount >= (totalAmount - 0.01) && totalLoanAmount === 0 && (
                                                                <div style={{ fontSize: '10px', color: '#10b981', marginTop: '2px', fontWeight: 'bold' }}>
                                                                    ✅ Bill Covered by Credit
                                                                </div>
                                                            )}
                                                            {totalCreditAmount >= (totalAmount - 0.01) && totalLoanAmount > 0 && (
                                                                <div style={{ fontSize: '10px', color: '#10b981', marginTop: '2px', fontWeight: 'bold' }}>
                                                                    ✅ Bill Fully Covered
                                                                </div>
                                                            )}
                                                            {totalNetRemaining > 0 && (
                                                                <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>
                                                                    Remaining: Rs. {formatDecimal(totalNetRemaining)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                })()
                            }
                        </div>
                    </div>

                    {/* ENHANCED MIDDLE PANEL - Supplier Details */}
                    <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)', minHeight: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', position: 'relative' }}>
                        {/* Lock Overlay - Show when panel is locked AND a supplier is selected */}
                        {isMiddlePanelLocked && state.selectedSupplier && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(8px)',
                                zIndex: 1000,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                borderRadius: '20px',
                                pointerEvents: 'auto'
                            }}>
                                <div style={{
                                    textAlign: 'center',
                                    color: 'white',
                                    padding: '30px',
                                    background: 'rgba(0,0,0,0.7)',
                                    borderRadius: '20px',
                                    maxWidth: '80%'
                                }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
                                    <h3 style={{ color: 'white', marginBottom: '12px' }}>Panel Locked</h3>
                                    <p style={{ color: '#cbd5e1', marginBottom: '20px', fontSize: '14px' }}>
                                        Please select a mode below to unlock the panel and process payments.
                                    </p>
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => handleModeChange('walking_seller')}
                                            style={{
                                                padding: '10px 24px',
                                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                fontSize: '14px'
                                            }}
                                        >
                                            🚶 Walking Seller Mode
                                        </button>
                                        <button
                                            onClick={() => handleModeChange('creditor')}
                                            style={{
                                                padding: '10px 24px',
                                                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                fontSize: '14px'
                                            }}
                                        >
                                            💰 Creditor Mode
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setState(prev => ({
                                                ...prev,
                                                selectedSupplier: null,
                                                selectedBillNo: null,
                                                supplierDetails: [],
                                                paymentAmount: "",
                                                currentPaidAmount: 0,
                                                paymentBreakdown: [],
                                                currentBillTotal: 0
                                            }));
                                            setSelectedBillCreditor(null);
                                            setIsMiddlePanelLocked(true);
                                        }}
                                        style={{
                                            padding: '10px 24px',
                                            background: 'rgba(255,255,255,0.2)',
                                            color: 'white',
                                            border: '1px solid rgba(255,255,255,0.3)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                            fontSize: '14px',
                                            marginTop: '16px'
                                        }}
                                    >
                                        ✕ Clear Selection
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderBottom: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px 20px 0 0' }}>
                            {/* Mode buttons - Always visible */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                <button
                                    onClick={() => handleModeChange('walking_seller')}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '11px',
                                        borderRadius: '20px',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        background: state.selectedMode === 'walking_seller' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🚶 Walking Seller
                                </button>
                                <button
                                    onClick={() => handleModeChange('creditor')}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '11px',
                                        borderRadius: '20px',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        background: state.selectedMode === 'creditor' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    💰 Creditor Mode
                                </button>
                            </div>

                            {/* Lock indicator when panel is locked */}
                            {isMiddlePanelLocked && state.selectedSupplier && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '12px',
                                    padding: '6px 12px',
                                    background: 'rgba(0,0,0,0.3)',
                                    borderRadius: '20px',
                                    width: 'fit-content'
                                }}>
                                    <span style={{ fontSize: '12px' }}>🔒</span>
                                    <span style={{ fontSize: '11px', color: '#e2e8f0' }}>Select a mode above to unlock</span>
                                </div>
                            )}

                            <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ width: '10px', height: '10px', background: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24' }}></span>
                                Supplier Details
                                {state.selectedSupplier && (
                                    <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '12px', padding: '4px 12px', borderRadius: '20px', marginLeft: 'auto' }}
                                        onClick={() => {
                                            setState(prev => ({
                                                ...prev,
                                                selectedSupplier: null,
                                                selectedBillNo: null,
                                                supplierDetails: [],
                                                paymentAmount: "",
                                                currentPaidAmount: 0,
                                                paymentBreakdown: [],
                                                currentBillTotal: 0
                                            }));
                                            setSelectedBillCreditor(null);
                                            setIsMiddlePanelLocked(true);
                                        }}>
                                        ✕ Clear
                                    </button>
                                )}
                            </h2>
                        </div>

                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '20px',
                            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                            opacity: isMiddlePanelLocked && state.selectedSupplier ? 0.3 : 1,
                            pointerEvents: isMiddlePanelLocked && state.selectedSupplier ? 'none' : 'auto',
                            transition: 'opacity 0.3s ease'
                        }}>
                            {state.selectedSupplier ? (
                                <>
                                    {/* Enhanced Supplier Info Card */}
                                    <div style={{ padding: '20px', background: 'white', borderRadius: '16px', marginBottom: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>👨‍🌾 Supplier Code</div>
                                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', fontFamily: 'monospace' }}>{state.selectedSupplier}</div>
                                            </div>
                                            {state.selectedBillNo && (
                                                <div>
                                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>📄 Bill Number</div>
                                                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', fontFamily: 'monospace' }}>{state.selectedBillNo}</div>
                                                </div>
                                            )}
                                            <div>
                                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>📊 Status</div>
                                                <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: state.isUpdatingCompletedBill ? '#10b981' : '#f59e0b', color: 'white' }}>
                                                    {state.isUpdatingCompletedBill ? '✓ FULLY PAID' : '⏳ PENDING'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Financial Summary Card with Credit Amount and Advance */}
                                        <div style={{
                                            marginTop: '16px',
                                            display: 'grid',
                                            gridTemplateColumns: selectedBillCreditor && selectedBillCreditor.credit_amount > 0 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)',
                                            gap: '12px',
                                            padding: '12px',
                                            background: '#f8fafc',
                                            borderRadius: '12px'
                                        }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>💰 Total Bill</div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>Rs. {formatDecimal(totalPayable)}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>✅ Total Paid</div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>Rs.  Rs. {formatDecimal(state.currentPaidAmount + totalAdvanceAmount)}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>⏳ Remaining</div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: state.isUpdatingCompletedBill ? '#10b981' : '#f59e0b' }}>
                                                    Rs. {formatDecimal(Math.max(0, totalPayable - state.currentPaidAmount - totalAdvanceAmount))}
                                                </div>
                                            </div>
                                            {/* Advance Amount Display */}
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>📌 Advance</div>
                                                <div style={{
                                                    fontSize: '18px',
                                                    fontWeight: 'bold',
                                                    color: totalAdvanceAmount > 0 ? '#d97706' : '#94a3b8'
                                                }}>
                                                    Rs. {formatDecimal(totalAdvanceAmount)}
                                                </div>
                                                {totalAdvanceAmount > 0 && (
                                                    <div style={{ fontSize: '8px', color: '#92400e' }}>Deducted from payable</div>
                                                )}
                                            </div>

                                            {selectedBillCreditor && selectedBillCreditor.credit_amount > 0 && (
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '10px', color: '#64748b' }}>⚠️ Credit Payable</div>
                                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: selectedBillCreditor.remaining_amount > 0 ? '#dc2626' : '#10b981' }}>
                                                        Rs. {formatDecimal(selectedBillCreditor.remaining_amount)}
                                                    </div>
                                                    {selectedBillCreditor.remaining_amount === 0 && (
                                                        <div style={{ fontSize: '9px', color: '#10b981' }}>✓ Settled</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {isViewingHistory && (
                                            <div style={{ marginTop: '12px', padding: '8px', background: '#ede9fe', borderRadius: '8px', fontSize: '11px', color: '#6d28d9' }}>
                                                📜 Viewing historical record from {historyDateRange.startDate} to {historyDateRange.endDate}
                                            </div>
                                        )}
                                    </div>

                                    {/* Items Table with improved styling */}
                                    <div style={{ padding: '20px', background: 'white', borderRadius: '16px', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>📋</span> Item Details
                                            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal' }}>({state.supplierDetails.length} items)</span>
                                        </div>
                                        <div style={{ marginTop: '20px', overflowX: 'auto' }}>
                                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                                <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                                                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>Customer</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>Item</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Wt (kg)</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>ගනුදෙ මිල</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>සැපයුම් මිල	</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>ගනුදෙ එක</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>සැපයුම් එක</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>කොමි</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {state.supplierDetails.map((sale, idx) => (
                                                        <tr
                                                            key={idx}
                                                            style={{
                                                                borderBottom: '1px solid #f1f5f9',
                                                                cursor: 'pointer',
                                                                transition: 'background-color 0.2s ease'
                                                            }}
                                                            onClick={() => setEditingRecord(sale)}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <td style={{ padding: '10px 8px', fontWeight: '500' }}>{sale.customer_code || 'N/A'}</td>
                                                            <td style={{ padding: '10px 8px' }}>{sale.item_name || 'N/A'}</td>
                                                            <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatDecimal(sale.weight)}</td>
                                                            <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatDecimal(sale.price_per_kg)}</td>
                                                            <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatDecimal(sale.SupplierPricePerKg)}</td>
                                                            <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatDecimal(sale.total)}</td>
                                                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '600', color: '#059669', fontFamily: 'monospace' }}>{formatDecimal(sale.SupplierTotal)}</td>
                                                            <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatDecimal(sale.commission_amount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid #e2e8f0' }}>
                                                        <td colSpan="4" style={{ padding: '12px 8px', textAlign: 'right' }}>Total:</td>
                                                        <td style={{ padding: '12px 8px', textAlign: 'right', color: '#dc2626' }}>{formatDecimal(totalPayable)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                    {/* Bag Amount Input - Add this BEFORE the payment amount input */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#334155',
                                            display: 'block',
                                            marginBottom: '6px'
                                        }}>
                                            📦 Bag Amount (Rs.)
                                            <span style={{ fontSize: '11px', color: '#64748b' }}>(Optional - for this bill)</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={bagAmount}
                                            onChange={(e) => setBagAmount(e.target.value)}
                                            placeholder="Enter bag amount"
                                            style={{
                                                width: '100%',
                                                padding: '12px 14px',
                                                border: '2px solid #e2e8f0',
                                                borderRadius: '12px',
                                                fontSize: '14px',
                                                outline: 'none',
                                                fontFamily: 'monospace'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                            step="0.01"
                                        />
                                    </div>

                                    {/* Payment Input Section */}
                                    {(state.selectedSupplier && (!state.isUpdatingCompletedBill || (selectedBillCreditor && selectedBillCreditor.remaining_amount > 0))) && (
                                        <div style={styles.paymentBox}>
                                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#92400e', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>💰</span>
                                                {state.isUpdatingCompletedBill && selectedBillCreditor && selectedBillCreditor.remaining_amount > 0
                                                    ? 'Settle Credit (Payable to Supplier)'
                                                    : 'Enter Payment Amount'}
                                                {state.isUpdatingCompletedBill && selectedBillCreditor && selectedBillCreditor.remaining_amount > 0 && (
                                                    <span style={{ fontSize: '11px', marginLeft: '8px', color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: '20px' }}>
                                                        Remaining Credit: Rs. {formatDecimal(selectedBillCreditor.remaining_amount)}
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="number"
                                                value={state.paymentAmount}
                                                onChange={(e) => {
                                                    let val = e.target.value;
                                                    if (val === "") {
                                                        setState(prev => ({ ...prev, paymentAmount: "" }));
                                                        return;
                                                    }
                                                    let num = parseFloat(val);
                                                    // For fully settled bills with credit, max is remaining credit amount
                                                    // For not settled bills, max is net payable after advance deduction
                                                    let maxAmount;
                                                    if (state.isUpdatingCompletedBill && selectedBillCreditor?.remaining_amount > 0) {
                                                        maxAmount = selectedBillCreditor.remaining_amount;
                                                    } else {
                                                        const remainingAfterPayments = Math.max(0, totalPayable - state.currentPaidAmount);
                                                        maxAmount = Math.max(0, remainingAfterPayments - totalAdvanceAmount);
                                                    }
                                                    // FIX: Show alert if amount exceeds maxAmount (even if maxAmount is 0)
                                                    if (num > maxAmount) {
                                                        if (maxAmount === 0) {
                                                            alert(`No payment is allowed. The bill is already fully paid.`);
                                                        } else {
                                                            alert(`Maximum payment amount is Rs. ${formatDecimal(maxAmount)}`);
                                                        }
                                                        return;
                                                    }
                                                    setState(prev => ({ ...prev, paymentAmount: val }));
                                                }}
                                                placeholder="0.00"
                                                disabled={state.isPrinting}
                                                style={{ width: '100%', padding: '16px', border: '2px solid #fbbf24', borderRadius: '14px', fontSize: '20px', fontWeight: '700', textAlign: 'center', background: 'white', fontFamily: 'monospace' }}
                                            />

                                            {/* Payment Buttons - Cash, Cheque, Bank Transfer, Credit */}
                                            <div style={{
                                                display: 'flex',
                                                gap: '8px',
                                                width: '100%',
                                                marginTop: '12px'
                                            }}>
                                                {/* CASH */}
                                                <button
                                                    data-payment-type="cash"
                                                    onClick={async () => {
                                                        const amount = parseFloat(state.paymentAmount);
                                                        if (amount === 0 || isNaN(amount)) {
                                                            alert("Please enter an amount");
                                                            return;
                                                        }
                                                        // Always use processPayment - it will detect if credit settlement is needed
                                                        await processPayment(amount);
                                                    }}
                                                    disabled={
                                                        state.isPrinting ||
                                                        !state.paymentAmount ||
                                                        parseFloat(state.paymentAmount) === 0 ||
                                                        window.cashPaymentProcessing
                                                    }
                                                    style={{
                                                        ...styles.cashPaymentBtn,
                                                        flex: 1,
                                                        opacity: (
                                                            state.isPrinting ||
                                                            !state.paymentAmount ||
                                                            parseFloat(state.paymentAmount) === 0 ||
                                                            window.cashPaymentProcessing
                                                        ) ? 0.5 : 1
                                                    }}
                                                >
                                                    💵 Cash
                                                </button>

                                                {/* CHEQUE - Always uses processPayment via handleChequeConfirm */}
                                                {/* CHEQUE */}
                                                <button
                                                    onClick={async () => {
                                                        const amount = parseFloat(state.paymentAmount);
                                                        if (amount === 0 || isNaN(amount)) {
                                                            alert("Please enter an amount");
                                                            return;
                                                        }
                                                        setState(prev => ({
                                                            ...prev,
                                                            pendingChequeAmount: amount,
                                                            showChequeModal: true
                                                        }));
                                                    }}
                                                    disabled={
                                                        state.isPrinting ||
                                                        !state.paymentAmount ||
                                                        parseFloat(state.paymentAmount) === 0
                                                    }
                                                    style={{
                                                        ...styles.chequePaymentBtn,
                                                        flex: 1,
                                                        opacity: (!state.paymentAmount ||
                                                            parseFloat(state.paymentAmount) === 0) ? 0.5 : 1
                                                    }}
                                                >
                                                    💳 Cheque
                                                </button>

                                                {/* BANK TRANSFER - Always uses processPayment via handleBankToBankConfirm */}
                                                {/* BANK TRANSFER */}
                                                <button
                                                    onClick={async () => {
                                                        const amount = parseFloat(state.paymentAmount);
                                                        if (amount === 0 || isNaN(amount)) {
                                                            alert("Please enter an amount");
                                                            return;
                                                        }
                                                        setState(prev => ({
                                                            ...prev,
                                                            pendingBankToBankAmount: amount,
                                                            showBankToBankModal: true
                                                        }));
                                                    }}
                                                    disabled={
                                                        state.isPrinting ||
                                                        !state.paymentAmount ||
                                                        parseFloat(state.paymentAmount) === 0
                                                    }
                                                    style={{
                                                        ...styles.bankToBankPaymentBtn,
                                                        flex: 1,
                                                        opacity: (!state.paymentAmount ||
                                                            parseFloat(state.paymentAmount) === 0) ? 0.5 : 1
                                                    }}
                                                >
                                                    🏦 Transfer
                                                </button>

                                                {/* CREDIT - Only for not fully settled bills */}
                                                {!state.isUpdatingCompletedBill && (
                                                    <button
                                                        onClick={handleCreditPayment}
                                                        disabled={
                                                            state.isPrinting ||
                                                            !state.paymentAmount ||
                                                            parseFloat(state.paymentAmount) === 0
                                                        }
                                                        style={{
                                                            flex: 1,
                                                            padding: '12px',
                                                            background: '#f59e0b',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '12px',
                                                            fontWeight: '600',
                                                            fontSize: '13px',
                                                            cursor: (!state.paymentAmount ||
                                                                parseFloat(state.paymentAmount) === 0)
                                                                ? 'not-allowed'
                                                                : 'pointer',
                                                            opacity: (!state.paymentAmount ||
                                                                parseFloat(state.paymentAmount) === 0)
                                                                ? 0.5
                                                                : 1,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        💳 Credit
                                                    </button>
                                                )}
                                            </div>

                                            {/* Three Adjustment Buttons - All use processPayment which handles credit settlement */}
                                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => {
                                                        // REMOVED: const amount = parseFloat(state.paymentAmount);
                                                        // REMOVED: if (amount === 0 || isNaN(amount)) { alert("Please enter an amount"); return; }
                                                        setSelectedAdjustmentType('bag_to_box');
                                                        setShowAdjustmentModal(true);
                                                    }}
                                                    disabled={state.isPrinting}
                                                    style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '13px', cursor: state.isPrinting ? 'not-allowed' : 'pointer', opacity: state.isPrinting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <span>📦</span> Bag to Box
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        // REMOVED: const amount = parseFloat(state.paymentAmount);
                                                        // REMOVED: if (amount === 0 || isNaN(amount)) { alert("Please enter an amount"); return; }
                                                        setSelectedAdjustmentType('bill_to_bill');
                                                        setShowAdjustmentModal(true);
                                                    }}
                                                    disabled={state.isPrinting}
                                                    style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '13px', cursor: state.isPrinting ? 'not-allowed' : 'pointer', opacity: state.isPrinting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <span>📄</span> Bill to Bill
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        // REMOVED: const amount = parseFloat(state.paymentAmount);
                                                        // REMOVED: if (amount === 0 || isNaN(amount)) { alert("Please enter an amount"); return; }
                                                        setSelectedAdjustmentType('bad_debt');
                                                        setShowAdjustmentModal(true);
                                                    }}
                                                    disabled={state.isPrinting}
                                                    style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '13px', cursor: state.isPrinting ? 'not-allowed' : 'pointer', opacity: state.isPrinting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <span>⚠️</span> Bad Debt
                                                </button>
                                            </div>
                                            {/* Credit Info Message - Only show when bill is fully settled and has credit */}
                                            {state.isUpdatingCompletedBill && selectedBillCreditor && selectedBillCreditor.remaining_amount > 0 && (
                                                <div style={{
                                                    marginTop: '12px',
                                                    padding: '10px',
                                                    background: '#dbeafe',
                                                    borderRadius: '8px',
                                                    fontSize: '12px',
                                                    color: '#1e40af',
                                                    textAlign: 'center'
                                                }}>
                                                    💡 This bill is fully paid. Use Cash/Cheque/Bank Transfer or Adjustment methods above to settle credit payable to supplier.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Credit Information Section - Shows for any bill with credit amount */}
                                    {selectedBillCreditor && selectedBillCreditor.credit_amount > 0 && (
                                        <div style={{ marginTop: '16px', padding: '16px', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: '14px', borderLeft: '4px solid #f59e0b' }}>
                                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400e', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>⚠️</span> Credit Information (Payable to Supplier)
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px' }}>
                                                <div>
                                                    <div style={{ color: '#78350f' }}>Total Credit Taken:</div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#dc2626' }}>Rs. {formatDecimal(selectedBillCreditor.credit_amount)}</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: '#78350f' }}>Amount Paid:</div>
                                                    <div style={{ fontWeight: 'bold', color: '#10b981' }}>Rs. {formatDecimal(selectedBillCreditor.paid_amount)}</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: '#78350f' }}>Remaining Payable:</div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: selectedBillCreditor.remaining_amount > 0 ? '#dc2626' : '#10b981' }}>
                                                        Rs. {formatDecimal(selectedBillCreditor.remaining_amount)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style={{ color: '#78350f' }}>Status:</div>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '4px 10px',
                                                        borderRadius: '20px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        background: selectedBillCreditor.status === 'paid' ? '#10b981' : (selectedBillCreditor.status === 'partial' ? '#f59e0b' : '#ef4444'),
                                                        color: 'white'
                                                    }}>
                                                        {selectedBillCreditor.status === 'paid' ? '✓ FULLY PAID' : (selectedBillCreditor.status === 'partial' ? '⏳ PARTIAL' : '⚠️ PENDING')}
                                                    </span>
                                                </div>
                                            </div>
                                            {selectedBillCreditor.remaining_amount > 0 && (
                                                <div style={{ fontSize: '11px', marginTop: '12px', padding: '8px', background: '#fef3c7', borderRadius: '8px', color: '#92400e' }}>
                                                    ⚠️ This amount is payable TO the supplier! Use the payment options above to settle.
                                                </div>
                                            )}
                                            {selectedBillCreditor.remaining_amount === 0 && selectedBillCreditor.credit_amount > 0 && (
                                                <div style={{ fontSize: '11px', marginTop: '12px', padding: '8px', background: '#d1fae5', borderRadius: '8px', color: '#065f46' }}>
                                                    ✅ Credit fully settled! No amount payable to supplier.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                                        <button onClick={() => fetchPaymentHistory(state.selectedSupplier, state.selectedBillNo)} style={{ width: '100%', padding: '14px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                            📜 View Full Payment History
                                        </button>
                                    </div>
                                    {/* Advance Entry Form - Add this after the Action Buttons section */}
                                    {/* Enhanced Advance Entry Form - Stores in NEW table */}
                                    {(state.selectedSupplier && (
                                        <div style={{
                                            marginTop: '20px',
                                            padding: '20px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '16px',
                                            backgroundColor: 'white',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                        }}>
                                            <div style={{
                                                fontSize: '14px',
                                                fontWeight: '700',
                                                color: '#f59e0b',
                                                marginBottom: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: '10px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>💰</span> අත්තිකාරම් ඇතුලත් කරන්න (Advance Entry)
                                                </div>
                                                {totalAdvanceAmount > 0 && (
                                                    <span style={{
                                                        fontSize: '12px',
                                                        color: '#10b981',
                                                        background: '#d1fae5',
                                                        padding: '4px 12px',
                                                        borderRadius: '20px',
                                                        fontWeight: '600'
                                                    }}>
                                                        Total Advance: Rs. {formatDecimal(totalAdvanceAmount)}
                                                    </span>
                                                )}
                                                {supplierAdvances.length > 0 && (
                                                    <button
                                                        onClick={() => setShowAdvanceHistory(!showAdvanceHistory)}
                                                        style={{
                                                            padding: '4px 12px',
                                                            fontSize: '11px',
                                                            background: '#6366f1',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '20px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {showAdvanceHistory ? 'Hide History' : `View History (${supplierAdvances.length})`}
                                                    </button>
                                                )}
                                            </div>

                                            <form onSubmit={handleAdvanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                                    {/* Traveler/Trader Code */}
                                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                                        <label style={{
                                                            fontSize: '11px',
                                                            fontWeight: '600',
                                                            color: '#64748b',
                                                            display: 'block',
                                                            marginBottom: '5px'
                                                        }}>
                                                            Traveler/Trader Code <span style={{ color: '#ef4444' }}>*</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            name="traveler_code"
                                                            value={advancePayload.traveler_code}
                                                            onChange={(e) => setAdvancePayload({ ...advancePayload, traveler_code: e.target.value.toUpperCase() })}
                                                            style={{
                                                                width: '100%',
                                                                padding: '10px 12px',
                                                                borderRadius: '10px',
                                                                border: '1px solid #e2e8f0',
                                                                fontSize: '13px',
                                                                outline: 'none'
                                                            }}
                                                            placeholder="Enter traveler/trader code"
                                                            required
                                                            autoFocus
                                                        />
                                                    </div>

                                                    {/* Advance Amount */}
                                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                                        <label style={{
                                                            fontSize: '11px',
                                                            fontWeight: '600',
                                                            color: '#64748b',
                                                            display: 'block',
                                                            marginBottom: '5px'
                                                        }}>
                                                            Advance Amount (Rs.) <span style={{ color: '#ef4444' }}>*</span>
                                                        </label>
                                                        <input
                                                            type="number"
                                                            name="advance_amount"
                                                            value={advancePayload.advance_amount}
                                                            onChange={(e) => setAdvancePayload({ ...advancePayload, advance_amount: e.target.value })}
                                                            style={{
                                                                width: '100%',
                                                                padding: '10px 12px',
                                                                borderRadius: '10px',
                                                                border: '1px solid #e2e8f0',
                                                                fontSize: '14px',
                                                                outline: 'none',
                                                                fontFamily: 'monospace'
                                                            }}
                                                            placeholder="0.00"
                                                            required
                                                            step="0.01"
                                                            min="0.01"
                                                        />
                                                    </div>

                                                    {/* Submit Button */}
                                                    <div>
                                                        <button
                                                            type="submit"
                                                            disabled={advanceLoading}
                                                            style={{
                                                                padding: '10px 24px',
                                                                backgroundColor: advanceLoading ? '#9ca3af' : '#f59e0b',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '10px',
                                                                cursor: advanceLoading ? 'not-allowed' : 'pointer',
                                                                fontWeight: '600',
                                                                fontSize: '13px',
                                                                height: '42px',
                                                                transition: 'background 0.2s',
                                                                opacity: advanceLoading ? 0.6 : 1
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                if (!advanceLoading) {
                                                                    e.currentTarget.style.backgroundColor = '#d97706';
                                                                }
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                if (!advanceLoading) {
                                                                    e.currentTarget.style.backgroundColor = '#f59e0b';
                                                                }
                                                            }}
                                                        >
                                                            {advanceLoading ? 'Saving...' : 'Record Advance'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </form>

                                            {advanceStatus.text && (
                                                <p style={{
                                                    color: advanceStatus.type === 'success' ? '#10b981' : '#ef4444',
                                                    marginTop: '12px',
                                                    fontWeight: '600',
                                                    fontSize: '12px',
                                                    padding: '8px',
                                                    backgroundColor: advanceStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                                                    borderRadius: '8px'
                                                }}>
                                                    {advanceStatus.text}
                                                </p>
                                            )}

                                            {/* Advance History from NEW table */}
                                            {showAdvanceHistory && supplierAdvances.length > 0 && (
                                                <div style={{
                                                    marginTop: '16px',
                                                    borderTop: '1px solid #e2e8f0',
                                                    paddingTop: '16px'
                                                }}>
                                                    <div style={{
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        color: '#334155',
                                                        marginBottom: '12px'
                                                    }}>
                                                        📋 Advance History (from new table)
                                                    </div>
                                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                        {supplierAdvances.map((advance) => (
                                                            <div key={advance.id} style={{
                                                                padding: '10px',
                                                                marginBottom: '8px',
                                                                background: '#f8fafc',
                                                                borderRadius: '8px',
                                                                borderLeft: '3px solid #f59e0b'
                                                            }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                                                    <div>
                                                                        <div><strong>Traveler:</strong> {advance.traveler_code}</div>
                                                                        <div><strong>Date:</strong> {new Date(advance.created_at).toLocaleDateString()}</div>
                                                                        {advance.supplier_bill_no && (
                                                                            <div><strong>Bill No:</strong> {advance.supplier_bill_no}</div>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ textAlign: 'right' }}>
                                                                        <div><strong>Amount:</strong> Rs. {formatDecimal(advance.advance_amount)}</div>
                                                                        <div><strong>Recorded by:</strong> {advance.created_by || 'System'}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Info note */}
                                            <div style={{
                                                marginTop: '12px',
                                                padding: '8px',
                                                background: '#fef3c7',
                                                borderRadius: '8px',
                                                fontSize: '11px',
                                                color: '#92400e',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}>
                                                <span>💡</span>
                                                <span>Advances are stored in a separate table. Traveler code is required for tracking.</span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '64px', marginBottom: '16px' }}>📋</div>
                                    <p style={{ fontSize: '16px', fontWeight: '500' }}>Click on any supplier to view details and process payment</p>
                                    <p style={{ fontSize: '12px', marginTop: '8px' }}>Select a bill from Not Settled or Fully Settled sections</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT PANEL - Fully Settled */}
                    <div style={styles.panel}>
                        <div style={styles.panelHeader}>
                            <h2 style={styles.panelTitle}>
                                <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '50%' }}></span>
                                Fully Settled
                            </h2>
                        </div>
                        <div style={{ padding: '12px 16px 0 16px' }}>
                            <input
                                type="text"
                                placeholder="🔍 Search settled..."
                                value={state.searchCompletedQuery}
                                onChange={(e) => setState(prev => ({ ...prev, searchCompletedQuery: e.target.value.toUpperCase() }))}
                                style={styles.searchInput}
                            />
                        </div>
                        <div style={styles.panelContent}>
                            {filterCompletedSuppliers.length === 0 ?
                                <EmptyState message="No settled payments" /> :
                                (() => {
                                    // Group items by bill number
                                    const groupedByBill = filterCompletedSuppliers.reduce((groups, item) => {
                                        const billNo = item.supplier_bill_no || 'N/A';
                                        if (!groups[billNo]) {
                                            groups[billNo] = [];
                                        }
                                        groups[billNo].push(item);
                                        return groups;
                                    }, {});

                                    // Convert to array for rendering and SORT by bill number (ascending)
                                    return Object.entries(groupedByBill)
                                        .sort((a, b) => {
                                            const billNoA = a[0];
                                            const billNoB = b[0];

                                            // Handle 'N/A' case - put at end
                                            if (billNoA === 'N/A') return 1;
                                            if (billNoB === 'N/A') return -1;

                                            // Try to extract numeric values for proper sorting
                                            const numA = parseInt(String(billNoA).replace(/[^0-9]/g, ''));
                                            const numB = parseInt(String(billNoB).replace(/[^0-9]/g, ''));

                                            // If both have valid numbers, sort numerically
                                            if (!isNaN(numA) && !isNaN(numB)) {
                                                return numA - numB;
                                            }

                                            // Fallback: compare as strings (case insensitive)
                                            return String(billNoA).toLowerCase().localeCompare(String(billNoB).toLowerCase());
                                        })
                                        .map(([billNo, items]) => {
                                            const firstItem = items[0];
                                            const isHistory = items.some(item => item.is_history);
                                            const remainingCreditAmount = items.reduce((sum, item) => sum + (item.credit_remaining_amount || 0), 0);
                                            const hasRemainingCredit = remainingCreditAmount > 0;
                                            const isCreditFullySettled = items.some(item => item.credit_amount > 0 && item.credit_remaining_amount === 0);

                                            return (
                                                <div key={billNo}
                                                    style={{
                                                        ...styles.billItem,
                                                        ...styles.billApplied,
                                                        ...(state.selectedSupplier === firstItem.supplier_code && state.selectedBillNo === billNo ? styles.billSelected : {}),
                                                        borderLeft: isHistory ? '4px solid #8b5cf6' : 'none',
                                                        ...(hasRemainingCredit ? { borderRight: '3px solid #f59e0b' } : {})
                                                    }}
                                                    onClick={() => handleSupplierClick(firstItem.supplier_code, firstItem.supplier_bill_no)}
                                                    onContextMenu={(e) => handleContextMenu(e, firstItem.supplier_code, firstItem.supplier_bill_no)}>
                                                    <div style={styles.billRow}>
                                                        <div style={styles.billLeft}>
                                                            <div style={styles.billNo}>
                                                                {firstItem.supplier_code} - Bill: {firstItem.supplier_bill_no || 'N/A'}
                                                            </div>

                                                            {hasRemainingCredit && (
                                                                <div style={{
                                                                    fontSize: '11px',
                                                                    color: '#dc2626',
                                                                    marginTop: '4px',
                                                                    fontWeight: '600',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <span>⚠️</span>
                                                                    <span>Credit: Rs. {formatDecimal(remainingCreditAmount)}</span>
                                                                </div>
                                                            )}

                                                            {isCreditFullySettled && (
                                                                <div style={{
                                                                    fontSize: '10px',
                                                                    color: '#10b981',
                                                                    marginTop: '2px',
                                                                    fontWeight: 'bold',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <span>✅</span>
                                                                    <span>Credit Fully Settled</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                })()
                            }
                        </div>
                    </div>
                </div>

                {/* Stats Row */}
                <div style={styles.statsRow}>
                    <div style={styles.statBox}>
                        <div style={styles.statLabel}>Not Settled</div>
                        <div style={styles.statNumber}>{stats.totalPending}</div>
                        <div style={styles.statSub}>bills awaiting payment</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statLabel}>Fully Settled</div>
                        <div style={styles.statNumber}>{stats.totalCompleted}</div>
                        <div style={styles.statSub}>bills paid in full</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statLabel}>Total Sales</div>
                        <div style={styles.statNumber}>Rs. {formatDecimal(stats.totalAmount)}</div>
                        <div style={styles.statSub}>all bills total</div>
                    </div>

                    <div
                        style={{ ...styles.statBox, cursor: 'pointer' }}
                        onClick={() => {
                            calculatePaymentTotals();
                            setShowAdjustmentSummary(true);
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                        }}
                    >
                        <div style={styles.statLabel}>
                            Total Received
                            <span style={{ fontSize: '10px', marginLeft: '4px', color: '#64748b' }}>(Excl. Credit) 📊</span>
                        </div>
                        <div style={styles.statNumber}>Rs. {formatDecimal(stats.totalGiven)}</div>
                        <div style={styles.statSub}>amount received (click for summary)</div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ViewOldBillsModal isOpen={showOldBillsModal} onClose={() => setShowOldBillsModal(false)} onViewBills={handleViewOldBills} isLoading={isLoadingHistory} />
            <CreditorFormModal isOpen={showCreditorForm} onClose={() => setShowCreditorForm(false)} onSave={handleCreditorSave} supplierCode={pendingCreditorBill?.supplierCode || ''} billNo={pendingCreditorBill?.billNo || null} />
            {/* <PrintBillModal 
    isOpen={state.showPrintModal} 
    onClose={() => setState(prev => ({ ...prev, showPrintModal: false }))} 
    billContent={state.printBillContent} 
    billSize={state.billSize} 
    setBillSize={(size) => setState(prev => ({ ...prev, billSize: size }))} 
    onPrint={() => setState(prev => ({ ...prev, showPrintModal: false }))} 
/> */}
            <ChequeModal isOpen={state.showChequeModal} onClose={() => setState(prev => ({ ...prev, showChequeModal: false, pendingChequeAmount: 0 }))} onConfirm={handleChequeConfirm} amount={state.pendingChequeAmount} />
            <BankToBankModal isOpen={state.showBankToBankModal} onClose={() => setState(prev => ({ ...prev, showBankToBankModal: false, pendingBankToBankAmount: 0 }))} onConfirm={handleBankToBankConfirm} amount={state.pendingBankToBankAmount} supplierCode={state.selectedSupplier} />
            <PaymentAdjustmentModal
                isOpen={showAdjustmentModal}
                onClose={() => {
                    setShowAdjustmentModal(false);
                    setCalculatedAdjustmentAmount(0);
                }}
                onConfirm={handleApplyAdjustment}
                billNo={state.selectedBillNo}
                supplierCode={state.selectedSupplier}
                originalBillTotal={totalPayable}
                adjustmentType={selectedAdjustmentType}
                onAmountCalculated={handleAdjustmentAmountCalculated}
                maxAllowedAmount={state.isUpdatingCompletedBill && selectedBillCreditor?.remaining_amount > 0
                    ? selectedBillCreditor.remaining_amount
                    : Math.max(0, totalPayable - state.currentPaidAmount)}
            />
            <PaymentHistoryModal
                isOpen={state.showPaymentHistoryModal}
                onClose={() => setState(prev => ({ ...prev, showPaymentHistoryModal: false }))}
                payments={state.currentPayments}
                totalPaid={state.paymentHistoryTotalPaid}
                totalBill={state.paymentHistoryTotalBill}
                remaining={state.paymentHistoryRemaining}
            />
            {/* Income Sources Modal */}

            <IncomeSourcesModal
                isOpen={showIncomeSourcesModal}
                onClose={() => setShowIncomeSourcesModal(false)}
                totals={incomeTotals}
                isLoading={isLoadingIncome}
                onRefresh={fetchIncomeSources}
                onAllocateFunds={(amount) => {
                    setFundsAllocated(prev => prev + amount);
                }}
            />
            {/* Funds Allocated Modal */}
            <FundsAllocatedModal
                isOpen={showFundsAllocated}
                onClose={() => setShowFundsAllocated(false)}
                fundsAllocated={fundsAllocated}
            />
            <DeleteConfirmationModal isOpen={state.showDeleteModal} onClose={() => setState(prev => ({ ...prev, showDeleteModal: false, deleteSupplierCode: null, deleteBillNo: null }))} onConfirm={handleDeletePayment} supplierCode={state.deleteSupplierCode} billNo={state.deleteBillNo} />
            <DetailedReportModal isOpen={showDetailedReport} onClose={() => setShowDetailedReport(false)} data={detailedReportData} supplierCode={selectedReportSupplier} isLoading={isLoadingReport} />
            {showCreditorModal && (
                <CreditorModal
                    isOpen={showCreditorModal}
                    onClose={() => {
                        setShowCreditorModal(false);
                        setSelectedBillForCreditor({ supplierCode: '', billNo: null });
                        setState(prev => ({ ...prev, selectedMode: 'walking_seller' }));
                        // ✅ Keep the panel unlocked even if cancelled, or re-lock if needed
                        // setIsMiddlePanelLocked(true); // Uncomment if you want to lock on cancel
                    }}
                    onConfirm={handleCreditorConfirm}
                    supplierCode={selectedBillForCreditor.supplierCode}
                    billNo={selectedBillForCreditor.billNo}
                />
            )}

            {/* Adjustment Summary Modal */}
            <AdjustmentSummaryModal
                isOpen={showAdjustmentSummary}
                onClose={() => setShowAdjustmentSummary(false)}
                totals={adjustmentTotals}
            />

            {/* Bank Allocation Modal */}
            {/* Bank Allocation Modal - Now fetches its own data */}
            <BankAllocationModal
                isOpen={showAllocatedBankModal}
                onClose={() => setShowAllocatedBankModal(false)}
            />
            <FundAllocationModal
                isOpen={showDirectFundAllocationModal}
                onClose={() => setShowDirectFundAllocationModal(false)}
                onAllocate={(result) => {
                    // Optionally update any local state here
                    alert(`✅ ${result.message || 'Funds allocated successfully!'}\n\nAllocated Amount: Rs. ${result.allocated_amount.toFixed(2)}\nCashier: ${result.cashier_name}`);
                }}
                selectedAmount={null}
                maxAmount={null}
            />

            {/* Farmer Selector Modal */}
            {showFarmerModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 20002 }} onClick={() => { setShowFarmerModal(false); setFarmerSearchQuery(''); }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', width: '700px', maxWidth: '90%', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0 }}>👨‍🌾 Farmer / Supplier Selector</h3>
                            <button onClick={() => { setShowFarmerModal(false); setFarmerSearchQuery(''); }} style={{ background: '#f1f5f9', border: 'none', fontSize: '20px', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%' }}>×</button>
                        </div>
                        <input
                            type="text"
                            placeholder="🔍 Search by code, name, or bill number..."
                            value={farmerSearchQuery}
                            onChange={(e) => setFarmerSearchQuery(e.target.value.toUpperCase())}
                            style={{ width: '100%', padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', marginBottom: '16px' }}
                            autoFocus
                        />
                        {isLoadingFarmers ? (
                            <div style={{ textAlign: 'center', padding: '40px' }}>Loading farmers...</div>
                        ) : (
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {groupedFarmers.suppliers.length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '10px', borderBottom: '2px solid #e2e8f0' }}>
                                            🏪 Registered Suppliers ({groupedFarmers.suppliers.length})
                                        </div>
                                        {groupedFarmers.suppliers.map((supplier, idx) => (
                                            <div key={`supplier-${idx}`}
                                                onClick={() => { fetchDetailedReport(supplier.code); setShowFarmerModal(false); setFarmerSearchQuery(''); }}
                                                style={{ padding: '10px 14px', marginBottom: '6px', background: '#f8fafc', borderRadius: '10px', cursor: 'pointer', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontWeight: '700' }}>{supplier.code}</div>
                                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                    {supplier.name || 'No name registered'}{supplier.telephone && ` • 📞 ${supplier.telephone}`}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {groupedFarmers.pending.length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#f59e0b', marginBottom: '10px', borderBottom: '2px solid #fef3c7' }}>
                                            ⏳ Pending Bills ({groupedFarmers.pending.length})
                                        </div>
                                        {groupedFarmers.pending.map((item, idx) => (
                                            <div key={`pending-${idx}`}
                                                onClick={() => { fetchDetailedReport(item.code); setShowFarmerModal(false); setFarmerSearchQuery(''); }}
                                                style={{ padding: '10px 14px', marginBottom: '6px', background: '#fffbeb', borderRadius: '10px', cursor: 'pointer', border: '1px solid #fde68a' }}>
                                                <div style={{ fontWeight: '700', color: '#92400e' }}>{item.code} {item.billNo && `- Bill: ${item.billNo}`}</div>
                                                <div style={{ fontSize: '12px', color: '#b45309' }}>Due Amount: Rs. {formatDecimal(item.amount || 0)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {groupedFarmers.printed.length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#3b82f6', marginBottom: '10px', borderBottom: '2px solid #dbeafe' }}>
                                            📄 Printed Bills ({groupedFarmers.printed.length})
                                        </div>
                                        {groupedFarmers.printed.map((item, idx) => (
                                            <div key={`printed-${idx}`}
                                                onClick={() => { fetchDetailedReport(item.code); setShowFarmerModal(false); setFarmerSearchQuery(''); }}
                                                style={{ padding: '10px 14px', marginBottom: '6px', background: '#eff6ff', borderRadius: '10px', cursor: 'pointer', border: '1px solid #bfdbfe' }}>
                                                <div style={{ fontWeight: '700', color: '#1e40af' }}>{item.code} - Bill: {item.billNo || 'N/A'}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {groupedFarmers.completed.length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#10b981', marginBottom: '10px', borderBottom: '2px solid #d1fae5' }}>
                                            ✅ Settled Bills ({groupedFarmers.completed.length})
                                        </div>
                                        {groupedFarmers.completed.map((item, idx) => (
                                            <div key={`completed-${idx}`}
                                                onClick={() => { fetchDetailedReport(item.code); setShowFarmerModal(false); setFarmerSearchQuery(''); }}
                                                style={{ padding: '10px 14px', marginBottom: '6px', background: '#ecfdf5', borderRadius: '10px', cursor: 'pointer', border: '1px solid #a7f3d0' }}>
                                                <div style={{ fontWeight: '700', color: '#065f46' }}>{item.code} - Bill: {item.billNo}</div>
                                                <div style={{ fontSize: '12px', color: '#047857' }}>✓ Fully Settled</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {filteredFarmerOptions.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No farmers or suppliers found</div>
                                )}
                            </div>
                        )}
                        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
                            <button onClick={() => { setShowFarmerModal(false); setFarmerSearchQuery(''); }} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {renderEditModal()}
        </div>
    );
}