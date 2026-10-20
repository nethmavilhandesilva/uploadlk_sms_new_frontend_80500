import React, { useState, useEffect, useRef } from 'react';
import bankService from "../../services/bankService";
import api from '../../api';

const BankList = ({ banks, onBankDeleted, onRefresh, selectedCashier = 'all' }) => {
    const [deletingId, setDeletingId] = useState(null);
    const [error, setError] = useState('');
    const [loadingBalances, setLoadingBalances] = useState(true);
    const [bankBalances, setBankBalances] = useState({});
    const [totalBankBalance, setTotalBankBalance] = useState(0);
    const [bankBreakdowns, setBankBreakdowns] = useState({});
    
    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedBank, setSelectedBank] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [transactionDetails, setTransactionDetails] = useState(null);
    
    // Statement Modal states
    const [statementModalOpen, setStatementModalOpen] = useState(false);
    const [statementData, setStatementData] = useState(null);
    const [statementLoading, setStatementLoading] = useState(false);
    const [statementFilters, setStatementFilters] = useState({
        start_date: '',
        end_date: '',
        include_unrealized: false
    });
    const [selectedUnrealizedCheques, setSelectedUnrealizedCheques] = useState([]);
    
    // Unrealized Cheques Modal states
    const [chequesModalOpen, setChequesModalOpen] = useState(false);
    const [unrealizedCheques, setUnrealizedCheques] = useState(null);
    const [chequesLoading, setChequesLoading] = useState(false);
    const [chequeFilters, setChequeFilters] = useState({
        start_date: '',
        end_date: ''
    });
    
    // Bank Cheques Modal states
    const [bankChequesModalOpen, setBankChequesModalOpen] = useState(false);
    const [bankChequesData, setBankChequesData] = useState(null);
    const [bankChequesLoading, setBankChequesLoading] = useState(false);
    const [processingId, setProcessingId] = useState(null);
    const [processingStatus, setProcessingStatus] = useState({});
    const [realizedCheques, setRealizedCheques] = useState(new Set());

    const intervalRef = useRef(null);

    // Fetch bank balances from all four tables via API
    const fetchBankBalances = async () => {
        console.log('Fetching bank balances from all tables...', new Date().toLocaleTimeString());
        setLoadingBalances(true);
        setError('');
        
        try {
            const response = await bankService.getAllBanksWithBalances();
            
            if (response.success && response.data) {
                const banksData = response.data.banks || [];
                const summary = response.data.summary || {};
                
                const balanceMap = {};
                const breakdownMap = {};
                let grandTotal = 0;
                
                banksData.forEach(bank => {
                    const bankName = bank.bank_name;
                    const lowerCaseName = bankName.toLowerCase();
                    
                    balanceMap[lowerCaseName] = bank.current_balance || 0;
                    
                    breakdownMap[lowerCaseName] = {
                        bank_name: bank.bank_name,
                        branch: bank.branch,
                        account_no: bank.account_no,
                        opening_balance: bank.opening_balance || 0,
                        current_balance: bank.current_balance || 0,
                        total_debit: bank.total_debit || 0,
                        total_credit: bank.total_credit || 0,
                        cheque_amount: bank.cheque_amount || 0,
                        bank_transfer_amount: bank.bank_transfer_amount || 0,
                        status: bank.status,
                        debit_cheque: bank.debit_cheque || 0,
                        debit_bank_transfer: bank.debit_bank_transfer || 0,
                        credit_cheque: bank.credit_cheque || 0,
                        credit_bank_transfer: bank.credit_bank_transfer || 0,
                    };
                    
                    grandTotal += (bank.current_balance || 0);
                });
                
                setBankBalances(balanceMap);
                setBankBreakdowns(breakdownMap);
                setTotalBankBalance(grandTotal);
                
                console.log('Bank balances loaded:', balanceMap);
                console.log('Total bank balance:', grandTotal);
            } else {
                throw new Error(response.message || 'Failed to fetch bank balances');
            }
        } catch (error) {
            console.error('Error fetching bank balances:', error);
            setError('Failed to fetch bank balances. Please try again.');
        } finally {
            setLoadingBalances(false);
        }
    };

    // Fetch detailed transactions for a specific bank
    const fetchBankDetails = async (bankId, bankName) => {
        setModalLoading(true);
        try {
            const response = await bankService.getBankBalanceDetails(bankId);
            
            if (response.success && response.data) {
                const data = response.data;
                
                let debitCheque = 0;
                let debitBankTransfer = 0;
                let creditCheque = 0;
                let creditBankTransfer = 0;
                
                const transactions = data.transactions || [];
                transactions.forEach(trans => {
                    if (trans.type === 'debit') {
                        if (trans.payment_method === 'Cheque') {
                            debitCheque += trans.amount || 0;
                        } else if (trans.payment_method === 'Bank Transfer') {
                            debitBankTransfer += trans.amount || 0;
                        }
                    } else if (trans.type === 'credit') {
                        if (trans.payment_method === 'Cheque') {
                            creditCheque += trans.amount || 0;
                        } else if (trans.payment_method === 'Bank Transfer') {
                            creditBankTransfer += trans.amount || 0;
                        }
                    }
                });
                
                setTransactionDetails({
                    bank: data.bank,
                    opening_balance: data.opening_balance || 0,
                    current_balance: data.current_balance || 0,
                    total_debit: data.total_debit || 0,
                    total_credit: data.total_credit || 0,
                    cheque_amount: data.cheque_amount || 0,
                    bank_transfer_amount: data.bank_transfer_amount || 0,
                    debit_cheque: debitCheque,
                    debit_bank_transfer: debitBankTransfer,
                    credit_cheque: creditCheque,
                    credit_bank_transfer: creditBankTransfer,
                    transactions: transactions.slice(0, 50)
                });
            } else {
                throw new Error(response.message || 'Failed to fetch bank details');
            }
        } catch (error) {
            console.error('Error fetching bank details:', error);
            setError('Failed to fetch bank details. Please try again.');
        } finally {
            setModalLoading(false);
        }
    };

    // Fetch bank statement
    const fetchBankStatement = async (bankId, filters) => {
        setStatementLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            if (filters.include_unrealized) params.append('include_unrealized', 'true');
            
            const response = await bankService.getBankStatement(bankId, params.toString());
            
            if (response.success && response.data) {
                setStatementData(response.data);
                if (response.data.unrealized_cheques) {
                    setSelectedUnrealizedCheques(response.data.unrealized_cheques);
                } else {
                    setSelectedUnrealizedCheques([]);
                }
            } else {
                throw new Error(response.message || 'Failed to fetch bank statement');
            }
        } catch (error) {
            console.error('Error fetching bank statement:', error);
            setError('Failed to fetch bank statement. Please try again.');
        } finally {
            setStatementLoading(false);
        }
    };

    // Fetch unrealized cheques
    const fetchUnrealizedCheques = async (bankId, filters) => {
        setChequesLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            
            const response = await bankService.getUnrealizedCheques(bankId, params.toString());
            
            if (response.success && response.data) {
                setUnrealizedCheques(response.data);
            } else {
                throw new Error(response.message || 'Failed to fetch unrealized cheques');
            }
        } catch (error) {
            console.error('Error fetching unrealized cheques:', error);
            setError('Failed to fetch unrealized cheques. Please try again.');
        } finally {
            setChequesLoading(false);
        }
    };

    // Fetch bank cheques - UPDATED to use correct endpoint
    const fetchBankCheques = async (bankAccountId) => {
        setBankChequesLoading(true);
        try {
            const response = await bankService.getBankCheques(bankAccountId);
            
            if (response.success && response.data) {
                const allCheques = response.data.cheques || [];
                // Check which cheques are already realized
                const realizedSet = new Set();
                allCheques.forEach(cheque => {
                    if (cheque.bank_realized === 'Y') {
                        realizedSet.add(cheque.id);
                    }
                });
                setRealizedCheques(realizedSet);
                
                setBankChequesData({
                    cheques: allCheques,
                    summary: {
                        total_cheques: allCheques.length,
                        total_amount: allCheques.reduce((sum, c) => sum + (c.amount || 0), 0),
                        sales_count: allCheques.filter(c => c.source === 'sales').length,
                        history_count: allCheques.filter(c => c.source === 'sales_history').length,
                        realized_count: realizedSet.size,
                        unrealized_count: allCheques.length - realizedSet.size,
                    }
                });
            } else {
                throw new Error(response.message || 'Failed to fetch bank cheques');
            }
        } catch (error) {
            console.error('Error fetching bank cheques:', error);
            setError('Failed to fetch bank cheques. Please try again.');
        } finally {
            setBankChequesLoading(false);
        }
    };

    // Handle realize cheque - calls sales-realize endpoint
    const handleRealizeCheque = async (cheque, e) => {
        e.stopPropagation();
        
        if (!window.confirm(`Are you sure you want to realize this cheque?`)) {
            return;
        }
        
        setProcessingId(cheque.id);
        setProcessingStatus(prev => ({ ...prev, [cheque.id]: 'realizing' }));
        
        try {
            const payload = {
                cheques: [{
                    record_id: cheque.record_id,
                    record_type: cheque.record_type
                }]
            };
            
            const response = await api.post('/cheque-report/sales-realize', payload);
            
            if (response.data.success) {
                setError('');
                setProcessingStatus(prev => ({ ...prev, [cheque.id]: 'success' }));
                // Mark as realized
                setRealizedCheques(prev => new Set([...prev, cheque.id]));
                // Refresh the cheques list
                await fetchBankCheques(selectedBank.id);
                alert(`Cheque ${cheque.cheque_no} realized successfully!`);
            } else {
                throw new Error(response.data.message || 'Failed to realize cheque');
            }
        } catch (error) {
            console.error('Error realizing cheque:', error);
            setError('Failed to realize cheque. Please try again.');
            setProcessingStatus(prev => ({ ...prev, [cheque.id]: 'error' }));
            alert('Failed to realize cheque. Please try again.');
        } finally {
            setProcessingId(null);
            setTimeout(() => {
                setProcessingStatus(prev => {
                    const newStatus = { ...prev };
                    delete newStatus[cheque.id];
                    return newStatus;
                });
            }, 3000);
        }
    };

    // Handle unrealize cheque - calls sales-unrealize endpoint
    const handleUnrealizeCheque = async (cheque, e) => {
        e.stopPropagation();
        
        if (!window.confirm(`Are you sure you want to unrealize this cheque?`)) {
            return;
        }
        
        setProcessingId(cheque.id);
        setProcessingStatus(prev => ({ ...prev, [cheque.id]: 'unrealizing' }));
        
        try {
            const payload = {
                cheques: [{
                    record_id: cheque.record_id,
                    record_type: cheque.record_type
                }]
            };
            
            const response = await api.post('/cheque-report/sales-unrealize', payload);
            
            if (response.data.success) {
                setError('');
                setProcessingStatus(prev => ({ ...prev, [cheque.id]: 'unrealized' }));
                // Remove from realized set
                setRealizedCheques(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(cheque.id);
                    return newSet;
                });
                // Refresh the cheques list
                await fetchBankCheques(selectedBank.id);
                alert(`Cheque ${cheque.cheque_no} unrealized successfully!`);
            } else {
                throw new Error(response.data.message || 'Failed to unrealize cheque');
            }
        } catch (error) {
            console.error('Error unrealizing cheque:', error);
            setError('Failed to unrealize cheque. Please try again.');
            setProcessingStatus(prev => ({ ...prev, [cheque.id]: 'error' }));
            alert('Failed to unrealize cheque. Please try again.');
        } finally {
            setProcessingId(null);
            setTimeout(() => {
                setProcessingStatus(prev => {
                    const newStatus = { ...prev };
                    delete newStatus[cheque.id];
                    return newStatus;
                });
            }, 3000);
        }
    };

    // Handle row click to open modal
    const handleRowClick = (bank) => {
        setSelectedBank(bank);
        setModalOpen(true);
        fetchBankDetails(bank.id, bank.bank_name);
    };

    // Handle view statement
    const handleViewStatement = (bank, e) => {
        e.stopPropagation();
        setSelectedBank(bank);
        setStatementModalOpen(true);
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const filters = {
            start_date: thirtyDaysAgo.toISOString().split('T')[0],
            end_date: today.toISOString().split('T')[0],
            include_unrealized: false
        };
        
        setStatementFilters(filters);
        fetchBankStatement(bank.id, filters);
    };

    // Handle view unrealized cheques
    const handleViewUnrealizedCheques = (bank, e) => {
        e.stopPropagation();
        setSelectedBank(bank);
        setChequesModalOpen(true);
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const filters = {
            start_date: thirtyDaysAgo.toISOString().split('T')[0],
            end_date: today.toISOString().split('T')[0]
        };
        
        setChequeFilters(filters);
        fetchUnrealizedCheques(bank.id, filters);
    };

    // Handle view bank cheques
    const handleViewBankCheques = (bank, e) => {
        e.stopPropagation();
        setSelectedBank(bank);
        setBankChequesModalOpen(true);
        fetchBankCheques(bank.id);
    };

    // Handle statement filter change
    const handleStatementFilterChange = (field, value) => {
        const newFilters = { ...statementFilters, [field]: value };
        setStatementFilters(newFilters);
    };

    // Handle statement filter apply
    const handleStatementFilterApply = () => {
        if (selectedBank) {
            fetchBankStatement(selectedBank.id, statementFilters);
        }
    };

    // Handle cheque filter change
    const handleChequeFilterChange = (field, value) => {
        const newFilters = { ...chequeFilters, [field]: value };
        setChequeFilters(newFilters);
    };

    // Handle cheque filter apply
    const handleChequeFilterApply = () => {
        if (selectedBank) {
            fetchUnrealizedCheques(selectedBank.id, chequeFilters);
        }
    };

    // Close modal
    const closeModal = () => {
        setModalOpen(false);
        setSelectedBank(null);
        setTransactionDetails(null);
    };

    // Close statement modal
    const closeStatementModal = () => {
        setStatementModalOpen(false);
        setStatementData(null);
        setSelectedUnrealizedCheques([]);
    };

    // Close cheques modal
    const closeChequesModal = () => {
        setChequesModalOpen(false);
        setUnrealizedCheques(null);
    };

    // Close bank cheques modal
    const closeBankChequesModal = () => {
        setBankChequesModalOpen(false);
        setBankChequesData(null);
        setProcessingId(null);
        setProcessingStatus({});
        setRealizedCheques(new Set());
    };

    // Set up auto-refresh
    useEffect(() => {
        fetchBankBalances();
        
        intervalRef.current = setInterval(() => {
            console.log('Auto-refresh triggered');
            fetchBankBalances();
        }, 10000);
        
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                console.log('Interval cleared');
            }
        };
    }, []);

    // Refresh when banks prop changes
    useEffect(() => {
        if (banks && banks.length > 0) {
            fetchBankBalances();
        }
    }, [banks]);

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        
        if (!window.confirm('Are you sure you want to delete this bank account?')) {
            return;
        }

        setDeletingId(id);
        setError('');

        try {
            await bankService.deleteBank(id);
            if (onBankDeleted) {
                onBankDeleted(id);
            }
            if (onRefresh) {
                onRefresh();
            }
            await fetchBankBalances();
        } catch (error) {
            setError('Failed to delete bank account. Please try again.');
            console.error('Delete error:', error);
        } finally {
            setDeletingId(null);
        }
    };

    const getBankGradient = (bankName) => {
        const name = bankName.toLowerCase();
        if (name.includes('sbi')) return 'linear-gradient(135deg, #3b82f6, #1e3a8a)';
        if (name.includes('hdfc')) return 'linear-gradient(135deg, #ef4444, #991b1b)';
        if (name.includes('icici')) return 'linear-gradient(135deg, #8b5cf6, #5b21b6)';
        if (name.includes('axis')) return 'linear-gradient(135deg, #f97316, #c2410c)';
        if (name.includes('kotak')) return 'linear-gradient(135deg, #10b981, #065f46)';
        if (name.includes('peoples') || name.includes('people')) return 'linear-gradient(135deg, #059669, #047857)';
        if (name.includes('boc') || name.includes('bank of ceylon')) return 'linear-gradient(135deg, #2563eb, #1d4ed8)';
        if (name.includes('ntb')) return 'linear-gradient(135deg, #7c3aed, #6d28d9)';
        return 'linear-gradient(135deg, #4b5563, #1f2937)';
    };

    const getBankIcon = (bankName) => {
        const name = bankName.toLowerCase();
        if (name.includes('sbi')) return '🏦';
        if (name.includes('hdfc')) return '🏛️';
        if (name.includes('icici')) return '💜';
        if (name.includes('axis')) return '🟠';
        if (name.includes('kotak')) return '💚';
        if (name.includes('peoples') || name.includes('people')) return '🏦';
        if (name.includes('boc') || name.includes('bank of ceylon')) return '🏦';
        if (name.includes('ntb')) return '🏦';
        return '💰';
    };

    const formatCurrency = (amount) => {
        return `Rs ${(amount || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    };

    const getBalanceForBank = (bankName) => {
        const normalizedBankName = bankName.toLowerCase();
        return bankBalances[normalizedBankName] || 0;
    };

    const getBreakdownForBank = (bankName) => {
        const normalizedBankName = bankName.toLowerCase();
        return bankBreakdowns[normalizedBankName] || {};
    };

    // Helper function to group transactions by reference
    const groupTransactionsByReference = (transactions) => {
        const grouped = {};
        
        transactions.forEach(trans => {
            const key = trans.reference || 'no-ref';
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(trans);
        });
        
        return grouped;
    };

    // Statement Modal styles
    const statementModalStyles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
            padding: '20px'
        },
        modal: {
            background: 'white',
            borderRadius: '16px',
            maxWidth: '1200px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column'
        }
    };

    const styles = {
        container: {
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden'
        },
        header: {
            background: 'linear-gradient(135deg, #1f2937, #374151)',
            padding: '20px 24px',
            borderBottom: '1px solid #374151'
        },
        headerContent: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
        },
        titleSection: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        },
        titleIcon: {
            fontSize: '28px'
        },
        title: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: 'white',
            margin: 0
        },
        subtitle: {
            fontSize: '14px',
            color: '#9ca3af',
            marginTop: '4px'
        },
        statsBadge: {
            background: 'rgba(59,130,246,0.2)',
            padding: '8px 16px',
            borderRadius: '12px',
            color: '#60a5fa',
            fontSize: '14px',
            fontWeight: '600'
        },
        infoNote: {
            background: 'rgba(245,158,11,0.1)',
            padding: '6px 12px',
            borderRadius: '8px',
            color: '#f59e0b',
            fontSize: '11px',
            fontWeight: '500',
            marginTop: '8px'
        },
        errorMessage: {
            margin: '16px',
            padding: '12px',
            background: 'linear-gradient(135deg, #fef2f2, #fce7f3)',
            borderLeft: '4px solid #ef4444',
            borderRadius: '8px',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        emptyState: {
            textAlign: 'center',
            padding: '64px 32px',
            background: 'linear-gradient(135deg, #f9fafb, white)'
        },
        emptyIcon: {
            fontSize: '64px',
            marginBottom: '16px',
            opacity: 0.6
        },
        emptyTitle: {
            fontSize: '18px',
            color: '#6b7280',
            marginBottom: '8px'
        },
        emptySubtitle: {
            fontSize: '14px',
            color: '#9ca3af'
        },
        tableWrapper: {
            overflowX: 'auto',
            maxHeight: '600px',
            overflowY: 'auto'
        },
        table: {
            minWidth: '100%',
            borderCollapse: 'collapse'
        },
        thead: {
            background: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)',
            position: 'sticky',
            top: 0,
            zIndex: 10
        },
        th: {
            padding: '16px 20px',
            textAlign: 'left',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#4b5563',
            borderBottom: '2px solid #e5e7eb'
        },
        thRight: {
            padding: '16px 20px',
            textAlign: 'right',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#4b5563',
            borderBottom: '2px solid #e5e7eb'
        },
        tr: {
            transition: 'all 0.2s',
            borderBottom: '1px solid #f3f4f6',
            cursor: 'pointer'
        },
        td: {
            padding: '16px 20px',
            whiteSpace: 'nowrap'
        },
        bankCell: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        },
        bankIconCircle: {
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        bankName: {
            fontWeight: '600',
            color: '#111827',
            fontSize: '14px'
        },
        branchText: {
            fontSize: '14px',
            color: '#6b7280'
        },
        accountText: {
            fontSize: '13px',
            color: '#374151',
            fontFamily: 'monospace',
            background: '#f3f4f6',
            padding: '4px 8px',
            borderRadius: '6px',
            display: 'inline-block'
        },
        remainingAmount: {
            fontSize: '14px',
            fontWeight: '600',
            padding: '6px 12px',
            borderRadius: '8px',
            display: 'inline-block'
        },
        positiveAmount: {
            color: '#059669',
            background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)'
        },
        zeroAmount: {
            color: '#6b7280',
            background: '#f3f4f6'
        },
        negativeAmount: {
            color: '#dc2626',
            background: 'linear-gradient(135deg, #fee2e2, #fca5a5)'
        },
        deleteButton: {
            background: 'none',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
        },
        actionButton: {
            background: 'none',
            border: 'none',
            color: '#3b82f6',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
        },
        loadingIndicator: {
            textAlign: 'center',
            padding: '20px',
            color: '#6b7280',
            fontSize: '14px'
        },
        filterContainer: {
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '16px',
            padding: '12px',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
        },
        filterInput: {
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '13px'
        },
        filterLabel: {
            fontSize: '13px',
            fontWeight: '500',
            color: '#374151'
        },
        filterButton: {
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: 'white',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s'
        }
    };

    const modalStyles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
            padding: '20px'
        },
        modal: {
            background: 'white',
            borderRadius: '16px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column'
        },
        modalHeader: {
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #1f2937, #374151)',
            color: 'white',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px'
        },
        modalBody: {
            padding: '24px',
            overflowY: 'auto',
            flex: 1
        },
        modalClose: {
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '8px',
            transition: 'background 0.2s'
        },
        summaryGrid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
        },
        summaryCard: {
            background: '#f9fafb',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
        },
        summaryLabel: {
            fontSize: '12px',
            color: '#6b7280',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '4px'
        },
        summaryValue: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#111827'
        },
        breakdownGrid: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '24px'
        },
        breakdownSection: {
            background: '#f9fafb',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
        },
        breakdownTitle: {
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#374151',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '2px solid #e5e7eb'
        },
        breakdownRow: {
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            fontSize: '14px'
        },
        breakdownLabel: {
            color: '#6b7280'
        },
        breakdownValue: {
            fontWeight: '600'
        },
        transactionTable: {
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px'
        },
        transactionTh: {
            textAlign: 'left',
            padding: '8px 12px',
            background: '#f3f4f6',
            fontWeight: '600',
            color: '#374151',
            borderBottom: '2px solid #e5e7eb'
        },
        transactionTd: {
            padding: '8px 12px',
            borderBottom: '1px solid #f3f4f6'
        },
        statusBadge: (type) => ({
            padding: '2px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '600',
            display: 'inline-block',
            background: type === 'debit' ? '#d1fae5' : '#fee2e2',
            color: type === 'debit' ? '#065f46' : '#991b1b'
        })
    };

    if (banks.length === 0) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <div style={styles.headerContent}>
                        <div>
                            <div style={styles.titleSection}>
                                <span style={styles.titleIcon}>📋</span>
                                <h2 style={styles.title}>Saved Bank Accounts</h2>
                            </div>
                            <p style={styles.subtitle}>Manage your bank accounts</p>
                        </div>
                        <div style={styles.statsBadge}>
                            Total: 0 accounts
                        </div>
                    </div>
                </div>
                <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>🏦</div>
                    <p style={styles.emptyTitle}>No bank accounts added yet</p>
                    <p style={styles.emptySubtitle}>Add your first bank account using the form above</p>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerContent}>
                    <div>
                        <div style={styles.titleSection}>
                            <span style={styles.titleIcon}>📋</span>
                            <h2 style={styles.title}>Saved Bank Accounts</h2>
                        </div>
                        <p style={styles.subtitle}>Manage and track all your bank accounts</p>
                        <div style={styles.infoNote}>
                            💡 Click on any row to view detailed transaction breakdown
                        </div>
                    </div>
                    <div style={styles.statsBadge}>
                        Total: {banks.length} account{banks.length !== 1 ? 's' : ''} | Total Bank Balance: {formatCurrency(totalBankBalance)}
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div style={styles.errorMessage}>
                    <span>❌</span>
                    <span>{error}</span>
                    <button 
                        onClick={fetchBankBalances}
                        style={{
                            marginLeft: 'auto',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Table */}
            <div style={styles.tableWrapper}>
                <table style={styles.table}>
                    <thead style={styles.thead}>
                        <tr>
                            <th style={styles.th}>Bank Name</th>
                            <th style={styles.th}>Branch</th>
                            <th style={styles.th}>Account Number</th>
                            <th style={styles.th}>Balance</th>
                            <th style={styles.th}>Cheque</th>
                            <th style={styles.th}>Bank Transfer</th>
                            <th style={styles.th}>Debits (IN)</th>
                            <th style={styles.th}>Credits (OUT)</th>
                            <th style={styles.thRight}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {banks.map((bank, index) => {
                            const balance = getBalanceForBank(bank.bank_name);
                            const breakdown = getBreakdownForBank(bank.bank_name);
                            const chequeAmount = breakdown.cheque_amount || 0;
                            const bankTransferAmount = breakdown.bank_transfer_amount || 0;
                            const totalDebit = breakdown.total_debit || 0;
                            const totalCredit = breakdown.total_credit || 0;
                            
                            return (
                                <tr
                                    key={bank.id}
                                    style={{
                                        ...styles.tr,
                                        background: index % 2 === 0 ? 'white' : '#fafafa',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#f3f4f6';
                                        e.currentTarget.style.transform = 'translateX(4px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#fafafa';
                                        e.currentTarget.style.transform = 'translateX(0)';
                                    }}
                                    onClick={() => handleRowClick(bank)}
                                >
                                    {/* Bank Name Cell */}
                                    <td style={styles.td}>
                                        <div style={styles.bankCell}>
                                            <div style={{
                                                ...styles.bankIconCircle,
                                                background: getBankGradient(bank.bank_name)
                                            }}>
                                                {getBankIcon(bank.bank_name)}
                                            </div>
                                            <div>
                                                <div style={styles.bankName}>{bank.bank_name}</div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Branch Cell */}
                                    <td style={styles.td}>
                                        <div style={styles.branchText}>{bank.branch}</div>
                                    </td>

                                    {/* Account Number Cell */}
                                    <td style={styles.td}>
                                        <div style={styles.accountText}>
                                            {bank.account_no}
                                        </div>
                                    </td>

                                    {/* Balance Cell */}
                                    <td style={styles.td}>
                                        {loadingBalances ? (
                                            <div style={styles.loadingIndicator}>
                                                <span>⟳</span> Loading...
                                            </div>
                                        ) : (
                                            <div style={{
                                                ...styles.remainingAmount,
                                                ...(balance > 0 ? styles.positiveAmount : 
                                                   balance < 0 ? styles.negativeAmount : 
                                                   styles.zeroAmount)
                                            }}>
                                                {balance > 0 ? '💰 ' : balance < 0 ? '🔴 ' : '📭 '}
                                                {formatCurrency(balance)}
                                            </div>
                                        )}
                                    </td>

                                    {/* Cheque Amount */}
                                    <td style={styles.td}>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
                                            padding: '4px 12px',
                                            borderRadius: '8px',
                                            color: '#1e40af',
                                            fontWeight: '600',
                                            fontSize: '13px',
                                            display: 'inline-block'
                                        }}>
                                            💳 {formatCurrency(chequeAmount)}
                                        </div>
                                    </td>

                                    {/* Bank Transfer Amount */}
                                    <td style={styles.td}>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                            padding: '4px 12px',
                                            borderRadius: '8px',
                                            color: '#92400e',
                                            fontWeight: '600',
                                            fontSize: '13px',
                                            display: 'inline-block'
                                        }}>
                                            💸 {formatCurrency(bankTransferAmount)}
                                        </div>
                                    </td>

                                    {/* Total Debits */}
                                    <td style={styles.td}>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                                            padding: '4px 12px',
                                            borderRadius: '8px',
                                            color: '#065f46',
                                            fontWeight: '600',
                                            fontSize: '13px',
                                            display: 'inline-block'
                                        }}>
                                            ⬆️ {formatCurrency(totalDebit)}
                                        </div>
                                    </td>

                                    {/* Total Credits */}
                                    <td style={styles.td}>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #fee2e2, #fca5a5)',
                                            padding: '4px 12px',
                                            borderRadius: '8px',
                                            color: '#991b1b',
                                            fontWeight: '600',
                                            fontSize: '13px',
                                            display: 'inline-block'
                                        }}>
                                            ⬇️ {formatCurrency(totalCredit)}
                                        </div>
                                    </td>

                                    {/* Actions Cell */}
                                    <td style={{ ...styles.td, textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                            <button
                                                onClick={(e) => handleViewBankCheques(bank, e)}
                                                style={{
                                                    ...styles.actionButton,
                                                    color: '#7c3aed'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = '#ede9fe'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                                title="View Bank Cheques"
                                            >
                                                💳 Cheques
                                            </button>
                                            <button
                                                onClick={(e) => handleViewStatement(bank, e)}
                                                style={{
                                                    ...styles.actionButton,
                                                    color: '#059669'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = '#d1fae5'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                                title="View Bank Statement"
                                            >
                                                📊
                                            </button>
                                            <button
                                                onClick={(e) => handleViewUnrealizedCheques(bank, e)}
                                                style={{
                                                    ...styles.actionButton,
                                                    color: '#d97706'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = '#fef3c7'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                                title="View Unrealized Cheques"
                                            >
                                                ⏳
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(bank.id, e)}
                                                disabled={deletingId === bank.id}
                                                style={{
                                                    ...styles.deleteButton,
                                                    opacity: deletingId === bank.id ? 0.5 : 1,
                                                    cursor: deletingId === bank.id ? 'not-allowed' : 'pointer'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (deletingId !== bank.id) {
                                                        e.currentTarget.style.background = '#fee2e2';
                                                        e.currentTarget.style.transform = 'scale(1.05)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'none';
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }}
                                            >
                                                {deletingId === bank.id ? (
                                                    <>
                                                        <div style={{
                                                            width: '16px',
                                                            height: '16px',
                                                            border: '2px solid #ef4444',
                                                            borderTopColor: 'transparent',
                                                            borderRadius: '50%',
                                                            animation: 'spin 0.6s linear infinite'
                                                        }} />
                                                        <span>Deleting...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>🗑️</span>
                                                        <span>Delete</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Bank Cheques Modal - Shows all cheques with Realize/Unrealize toggle */}
            {bankChequesModalOpen && selectedBank && (
                <div style={statementModalStyles.overlay} onClick={closeBankChequesModal}>
                    <div style={statementModalStyles.modal} onClick={(e) => e.stopPropagation()}>
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'linear-gradient(135deg, #1f2937, #374151)',
                            color: 'white',
                            borderTopLeftRadius: '16px',
                            borderTopRightRadius: '16px'
                        }}>
                            <div>
                                <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                                    💳 Bank Cheques - {selectedBank.bank_name}
                                </h2>
                                <p style={{ fontSize: '13px', color: '#9ca3af', margin: '4px 0 0 0' }}>
                                    Account: {selectedBank.account_no} | Branch: {selectedBank.branch}
                                </p>
                            </div>
                            <button 
                                onClick={closeBankChequesModal}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            {bankChequesLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        border: '3px solid #e5e7eb',
                                        borderTopColor: '#7c3aed',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite',
                                        margin: '0 auto 16px'
                                    }} />
                                    <p style={{ color: '#6b7280' }}>Loading cheques...</p>
                                </div>
                            ) : bankChequesData ? (
                                <>
                                    {/* Summary Cards */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                        gap: '12px',
                                        marginBottom: '24px'
                                    }}>
                                        <div style={{ background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', padding: '16px', borderRadius: '12px', border: '1px solid #3b82f6' }}>
                                            <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600', textTransform: 'uppercase' }}>Total Cheques</div>
                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>{bankChequesData.summary.total_cheques}</div>
                                        </div>
                                        <div style={{ background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', padding: '16px', borderRadius: '12px', border: '1px solid #3b82f6' }}>
                                            <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600', textTransform: 'uppercase' }}>Total Amount</div>
                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>{formatCurrency(bankChequesData.summary.total_amount)}</div>
                                        </div>
                                        <div style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', padding: '16px', borderRadius: '12px', border: '1px solid #10b981' }}>
                                            <div style={{ fontSize: '12px', color: '#065f46', fontWeight: '600', textTransform: 'uppercase' }}>Realized</div>
                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#065f46' }}>{bankChequesData.summary.realized_count || 0}</div>
                                        </div>
                                        <div style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', padding: '16px', borderRadius: '12px', border: '1px solid #f59e0b' }}>
                                            <div style={{ fontSize: '12px', color: '#92400e', fontWeight: '600', textTransform: 'uppercase' }}>Unrealized</div>
                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#92400e' }}>{bankChequesData.summary.unrealized_count || 0}</div>
                                        </div>
                                    </div>

                                    {/* Cheques Table with Realize/Unrealize Buttons */}
                                    {bankChequesData.cheques && bankChequesData.cheques.length > 0 ? (
                                        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                                            <table style={{
                                                width: '100%',
                                                borderCollapse: 'collapse',
                                                fontSize: '13px'
                                            }}>
                                                <thead>
                                                    <tr style={{ background: '#f3f4f6' }}>
                                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Date</th>
                                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Cheque No</th>
                                                        <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Amount</th>
                                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Customer Name</th>
                                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Bill No</th>
                                                        <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Source</th>
                                                        <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Status</th>
                                                        <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: '600', color: '#374151', borderBottom: '2px solid #d1d5db' }}>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bankChequesData.cheques.map((cheque, idx) => {
                                                        const isProcessing = processingId === cheque.id;
                                                        const status = processingStatus[cheque.id];
                                                        const isRealized = realizedCheques.has(cheque.id);
                                                        
                                                        return (
                                                            <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                                                                <td style={{ padding: '10px 12px' }}>
                                                                    {cheque.cheque_date ? new Date(cheque.cheque_date).toLocaleDateString() : 'N/A'}
                                                                </td>
                                                                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: '600', color: '#1e40af' }}>
                                                                    {cheque.cheque_no || 'N/A'}
                                                                </td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                                                                    {formatCurrency(cheque.amount)}
                                                                </td>
                                                                <td style={{ padding: '10px 12px' }}>
                                                                    {cheque.customer_name || 'N/A'}
                                                                </td>
                                                                <td style={{ padding: '10px 12px' }}>
                                                                    {cheque.bill_no || 'N/A'}
                                                                </td>
                                                                <td style={{ padding: '10px 12px' }}>
                                                                    <span style={{
                                                                        padding: '2px 8px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11px',
                                                                        background: cheque.source === 'sales' ? '#dbeafe' : '#fef3c7',
                                                                        color: cheque.source === 'sales' ? '#1e40af' : '#92400e'
                                                                    }}>
                                                                        {cheque.source === 'sales' ? 'Sales' : 'Sales History'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                                    {isRealized ? (
                                                                        <span style={{ 
                                                                            color: '#10b981', 
                                                                            fontWeight: '600',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            gap: '4px'
                                                                        }}>
                                                                            ✅ Realized
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ 
                                                                            color: '#d97706', 
                                                                            fontWeight: '600',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            gap: '4px'
                                                                        }}>
                                                                            ⏳ Pending
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                                    {isRealized ? (
                                                                        <button
                                                                            onClick={(e) => handleUnrealizeCheque(cheque, e)}
                                                                            disabled={isProcessing}
                                                                            style={{
                                                                                background: status === 'unrealized' ? '#10b981' : 
                                                                                           status === 'error' ? '#ef4444' : 
                                                                                           'linear-gradient(135deg, #f59e0b, #d97706)',
                                                                                color: 'white',
                                                                                border: 'none',
                                                                                padding: '6px 14px',
                                                                                borderRadius: '6px',
                                                                                cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                                                fontSize: '12px',
                                                                                fontWeight: '600',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                opacity: isProcessing ? 0.6 : 1,
                                                                                transition: 'all 0.2s'
                                                                            }}
                                                                            onMouseEnter={(e) => {
                                                                                if (!isProcessing && status !== 'unrealized' && status !== 'error') {
                                                                                    e.currentTarget.style.transform = 'scale(1.05)';
                                                                                    e.currentTarget.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
                                                                                }
                                                                            }}
                                                                            onMouseLeave={(e) => {
                                                                                if (!isProcessing && status !== 'unrealized' && status !== 'error') {
                                                                                    e.currentTarget.style.transform = 'scale(1)';
                                                                                    e.currentTarget.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                                                                                }
                                                                            }}
                                                                        >
                                                                            {status === 'unrealized' ? (
                                                                                <>
                                                                                    <span>✅</span>
                                                                                    <span>Undone</span>
                                                                                </>
                                                                            ) : status === 'error' ? (
                                                                                <>
                                                                                    <span>❌</span>
                                                                                    <span>Retry</span>
                                                                                </>
                                                                            ) : isProcessing ? (
                                                                                <>
                                                                                    <div style={{
                                                                                        width: '14px',
                                                                                        height: '14px',
                                                                                        border: '2px solid white',
                                                                                        borderTopColor: 'transparent',
                                                                                        borderRadius: '50%',
                                                                                        animation: 'spin 0.6s linear infinite'
                                                                                    }} />
                                                                                    <span>Unrealizing...</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <span>↩️</span>
                                                                                    <span>Unrealize</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={(e) => handleRealizeCheque(cheque, e)}
                                                                            disabled={isProcessing}
                                                                            style={{
                                                                                background: status === 'success' ? '#10b981' : 
                                                                                           status === 'error' ? '#ef4444' : 
                                                                                           'linear-gradient(135deg, #10b981, #059669)',
                                                                                color: 'white',
                                                                                border: 'none',
                                                                                padding: '6px 14px',
                                                                                borderRadius: '6px',
                                                                                cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                                                fontSize: '12px',
                                                                                fontWeight: '600',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                opacity: isProcessing ? 0.6 : 1,
                                                                                transition: 'all 0.2s'
                                                                            }}
                                                                            onMouseEnter={(e) => {
                                                                                if (!isProcessing && status !== 'success' && status !== 'error') {
                                                                                    e.currentTarget.style.transform = 'scale(1.05)';
                                                                                    e.currentTarget.style.background = 'linear-gradient(135deg, #059669, #047857)';
                                                                                }
                                                                            }}
                                                                            onMouseLeave={(e) => {
                                                                                if (!isProcessing && status !== 'success' && status !== 'error') {
                                                                                    e.currentTarget.style.transform = 'scale(1)';
                                                                                    e.currentTarget.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                                                                                }
                                                                            }}
                                                                        >
                                                                            {status === 'success' ? (
                                                                                <>
                                                                                    <span>✅</span>
                                                                                    <span>Done</span>
                                                                                </>
                                                                            ) : status === 'error' ? (
                                                                                <>
                                                                                    <span>❌</span>
                                                                                    <span>Retry</span>
                                                                                </>
                                                                            ) : isProcessing ? (
                                                                                <>
                                                                                    <div style={{
                                                                                        width: '14px',
                                                                                        height: '14px',
                                                                                        border: '2px solid white',
                                                                                        borderTopColor: 'transparent',
                                                                                        borderRadius: '50%',
                                                                                        animation: 'spin 0.6s linear infinite'
                                                                                    }} />
                                                                                    <span>Realizing...</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <span>✅</span>
                                                                                    <span>Realize</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: '#f3f4f6', fontWeight: '600', borderTop: '2px solid #d1d5db' }}>
                                                        <td colSpan="2" style={{ padding: '10px 12px', textAlign: 'right' }}>TOTAL</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>
                                                            {formatCurrency(bankChequesData.summary.total_amount)}
                                                        </td>
                                                        <td colSpan="5"></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                                            <p style={{ fontSize: '48px', marginBottom: '16px' }}>📭</p>
                                            <p>No cheques found for this bank account.</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                                    No cheque data available
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Rest of the modals (Statement, Unrealized Cheques, Main Detail) remain the same */}
            {/* ... (keep the existing code for other modals) ... */}

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .modal-overlay {
                    animation: fadeIn 0.2s ease-in-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default BankList;