import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const IncomeExpenseReport2 = () => {
    const navigate = useNavigate();
    
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({
        total_income: 0,
        total_expense: 0,
        net_balance: 0,
        total_transactions: 0,
        income_count: 0,
        expense_count: 0
    });
    const [users, setUsers] = useState([]);
    const [dateRange, setDateRange] = useState({ min_date: '', max_date: '' });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    
    // Filter states
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [transactionType, setTransactionType] = useState('all');
    const [myTransactions, setMyTransactions] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    
    // Current logged-in user
    const [currentUser, setCurrentUser] = useState(null);
    
    const [sortConfig, setSortConfig] = useState({ key: 'Date', direction: 'desc' });
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list');
    const [categoryData, setCategoryData] = useState({ income_by_category: [], expense_by_category: [] });
    
    // Get current user info
    useEffect(() => {
        const userData = localStorage.getItem('userData');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                setCurrentUser(user);
            } catch (e) {
                console.error('Error parsing user data:', e);
            }
        }
    }, []);
    
    // Fetch report data
    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (transactionType !== 'all') params.transaction_type = transactionType;
            if (myTransactions && currentUser) {
                params.my_transactions = true;
                params.user_id = currentUser.user_id || currentUser.id;
            }
            
            const response = await api.get('/income-expense-report', { params });
            
            if (response.data.success) {
                setTransactions(response.data.data);
                setSummary(response.data.summary);
                setUsers(response.data.users);
                setDateRange(response.data.date_range);
            }
        } catch (error) {
            console.error('Error fetching report:', error);
            alert('Failed to load report');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, transactionType, myTransactions, currentUser]);
    
    // Fetch category summary
    const fetchCategorySummary = useCallback(async () => {
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (myTransactions && currentUser) {
                params.my_transactions = true;
                params.user_id = currentUser.user_id || currentUser.id;
            }
            
            const response = await api.get('/income-expense-category-summary', { params });
            if (response.data.success) {
                setCategoryData({
                    income_by_category: response.data.income_by_category,
                    expense_by_category: response.data.expense_by_category
                });
            }
        } catch (error) {
            console.error('Error fetching category summary:', error);
        }
    }, [startDate, endDate, myTransactions, currentUser]);
    
    useEffect(() => {
        fetchReport();
        if (viewMode === 'summary') {
            fetchCategorySummary();
        }
    }, [fetchReport, viewMode, fetchCategorySummary]);
    
    const applyFilters = () => {
        fetchReport();
        if (viewMode === 'summary') {
            fetchCategorySummary();
        }
    };
    
    const clearFilters = () => {
        setStartDate('');
        setEndDate('');
        setTransactionType('all');
        setMyTransactions(false);
        setSelectedUserId('');
        setSearchTerm('');
        setTimeout(() => {
            fetchReport();
            if (viewMode === 'summary') {
                fetchCategorySummary();
            }
        }, 100);
    };
    
    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };
    
    const handleExport = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (myTransactions && currentUser) {
                params.append('my_transactions', true);
                params.append('user_id', currentUser.user_id || currentUser.id);
            }
            
            window.open(`/api/income-expense-export?${params.toString()}`, '_blank');
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Failed to export report');
        } finally {
            setExporting(false);
        }
    };
    
    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    
    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-LK');
    };
    
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return '↕️';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };
    
    const filteredAndSortedTransactions = useMemo(() => {
        let filtered = [...transactions];
        
        if (searchTerm) {
            filtered = filtered.filter(t => 
                (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (t.customer_short_name && t.customer_short_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (t.bill_no && t.bill_no.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        
        filtered.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            
            if (sortConfig.key === 'amount') {
                aVal = Math.abs(aVal);
                bVal = Math.abs(bVal);
            } else if (sortConfig.key === 'Date') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            } else {
                aVal = String(aVal || '').toLowerCase();
                bVal = String(bVal || '').toLowerCase();
            }
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return filtered;
    }, [transactions, searchTerm, sortConfig]);
    
    // Add global styles to override everything
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body, html {
                margin: 0 !important;
                padding: 0 !important;
                overflow-x: hidden !important;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            }
            
            /* Override any existing container styles */
            #root, .App, main, .main-content, .content {
                margin: 0 !important;
                padding: 0 !important;
                background: transparent !important;
            }
            
            /* Input focus styles */
            input:focus, select:focus, textarea:focus {
                border-color: #667eea !important;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
                outline: none !important;
            }
            
            /* Button hover effects */
            button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            }
            
            button:active {
                transform: translateY(0);
            }
            
            /* Table row hover */
            tr:hover td {
                background-color: #f8fafc !important;
            }
            
            /* Custom scrollbar */
            ::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }
            
            ::-webkit-scrollbar-track {
                background: rgba(255,255,255,0.2);
                border-radius: 10px;
            }
            
            ::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.4);
                border-radius: 10px;
            }
            
            ::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.6);
            }
            
            /* Animations */
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }
            
            .fade-in {
                animation: fadeIn 0.5s ease-out;
            }
            
            /* Card hover effects */
            .stat-card:hover {
                transform: translateY(-4px) !important;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2) !important;
            }
        `;
        document.head.appendChild(style);
        
        return () => {
            document.head.removeChild(style);
        };
    }, []);
    
    // Full screen styles
    const styles = {
        // Full screen container that overrides everything
        fullScreenContainer: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            margin: 0,
            padding: 0,
            overflow: 'auto',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            zIndex: 9999
        },
        container: {
            width: '100%',
            minHeight: '100%',
            padding: '24px',
            boxSizing: 'border-box'
        },
        header: {
            marginBottom: '24px'
        },
        title: {
            fontSize: '32px',
            fontWeight: '700',
            color: 'white',
            marginBottom: '8px',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        subtitle: {
            color: 'rgba(255,255,255,0.9)',
            fontSize: '14px'
        },
        statsRow: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
        },
        statCard: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '16px',
            padding: '20px',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
        },
        statLabel: {
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px'
        },
        statValue: {
            fontSize: '28px',
            fontWeight: '700',
            color: '#1e293b'
        },
        statPositive: { color: '#10b981' },
        statNegative: { color: '#ef4444' },
        filterBar: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)'
        },
        filterGroup: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
        },
        filterLabel: {
            fontSize: '12px',
            fontWeight: '600',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
        },
        filterInput: {
            padding: '10px 12px',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
            backgroundColor: 'white'
        },
        select: {
            padding: '10px 12px',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '14px',
            backgroundColor: 'white',
            cursor: 'pointer',
            outline: 'none'
        },
        checkbox: {
            marginRight: '8px',
            width: '16px',
            height: '16px',
            cursor: 'pointer'
        },
        button: {
            padding: '10px 20px',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
        },
        buttonPrimary: {
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        buttonSecondary: {
            background: '#f1f5f9',
            color: '#475569',
            border: '1px solid #e2e8f0'
        },
        buttonSuccess: {
            background: '#10b981',
            color: 'white',
            boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
        },
        buttonDanger: {
            background: '#ef4444',
            color: 'white',
            boxShadow: '0 2px 4px rgba(239,68,68,0.2)'
        },
        card: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            borderRadius: '12px',
            overflow: 'hidden'
        },
        th: {
            textAlign: 'left',
            padding: '14px 12px',
            background: '#f8fafc',
            fontWeight: '600',
            fontSize: '13px',
            color: '#475569',
            borderBottom: '2px solid #e2e8f0',
            cursor: 'pointer',
            position: 'sticky',
            top: 0,
            zIndex: 10
        },
        td: {
            padding: '12px',
            fontSize: '14px',
            color: '#334155',
            borderBottom: '1px solid #e2e8f0'
        },
        badge: {
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600'
        },
        badgeIncome: {
            background: '#10b981',
            color: 'white'
        },
        badgeExpense: {
            background: '#ef4444',
            color: 'white'
        },
        viewToggle: {
            display: 'flex',
            gap: '10px',
            marginBottom: '20px'
        },
        viewButton: {
            padding: '8px 16px',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            background: 'white',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            transition: 'all 0.2s'
        },
        viewButtonActive: {
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            border: 'none'
        },
        filterRow: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            alignItems: 'flex-end'
        },
        searchInput: {
            padding: '10px 12px',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '14px',
            outline: 'none',
            width: '100%',
            backgroundColor: 'white'
        },
        actionBar: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '16px'
        }
    };
    
    if (loading && transactions.length === 0) {
        return (
            <div style={styles.fullScreenContainer}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    width: '100vw'
                }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        border: '4px solid rgba(255,255,255,0.3)',
                        borderTop: '4px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                </div>
            </div>
        );
    }
    
    return (
        <div style={styles.fullScreenContainer}>
            <div style={styles.container}>
                <div style={styles.header}>
                    <h1 style={styles.title}>💰 Income & Expense Report</h1>
                    <p style={styles.subtitle}>Track and analyze all financial transactions</p>
                </div>
                
                {/* Summary Cards */}
                <div style={styles.statsRow}>
                    {[
                        { label: 'Total Income', value: summary.total_income, color: '#10b981', count: summary.income_count },
                        { label: 'Total Expense', value: summary.total_expense, color: '#ef4444', count: summary.expense_count },
                        { label: 'Net Balance', value: summary.net_balance, color: summary.net_balance >= 0 ? '#10b981' : '#ef4444', isNet: true },
                        { label: 'Total Transactions', value: summary.total_transactions, color: '#667eea', isCount: true }
                    ].map((stat, idx) => (
                        <div 
                            key={idx} 
                            className="stat-card"
                            style={styles.statCard}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                            }}
                        >
                            <div style={styles.statLabel}>{stat.label}</div>
                            <div style={{ 
                                ...styles.statValue, 
                                ...(stat.isNet ? (stat.value >= 0 ? styles.statPositive : styles.statNegative) : {}),
                                color: stat.isCount ? stat.color : undefined
                            }}>
                                {stat.isCount ? stat.value : formatCurrency(stat.value)}
                            </div>
                            {stat.count !== undefined && (
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                    {stat.count} transactions
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                
                {/* Filters */}
                <div style={styles.filterBar}>
                    <div style={styles.filterRow}>
                        <div style={styles.filterGroup}>
                            <label style={styles.filterLabel}>Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={styles.filterInput}
                            />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.filterLabel}>End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={styles.filterInput}
                            />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.filterLabel}>Transaction Type</label>
                            <select
                                value={transactionType}
                                onChange={(e) => setTransactionType(e.target.value)}
                                style={styles.select}
                            >
                                <option value="all">All Transactions</option>
                                <option value="income">Income Only</option>
                                <option value="expense">Expense Only</option>
                            </select>
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.filterLabel}>
                                <input
                                    type="checkbox"
                                    checked={myTransactions}
                                    onChange={(e) => setMyTransactions(e.target.checked)}
                                    style={styles.checkbox}
                                />
                                My Transactions Only
                            </label>
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.filterLabel}>&nbsp;</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    style={{ ...styles.button, ...styles.buttonPrimary }}
                                    onClick={applyFilters}
                                >
                                    Apply Filters
                                </button>
                                <button
                                    style={{ ...styles.button, ...styles.buttonSecondary }}
                                    onClick={clearFilters}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* View Toggle and Actions */}
                <div style={styles.card}>
                    <div style={styles.actionBar}>
                        <div style={styles.viewToggle}>
                            <button
                                style={{ ...styles.viewButton, ...(viewMode === 'list' ? styles.viewButtonActive : {}) }}
                                onClick={() => setViewMode('list')}
                            >
                                📋 List View
                            </button>
                            <button
                                style={{ ...styles.viewButton, ...(viewMode === 'summary' ? styles.viewButtonActive : {}) }}
                                onClick={() => {
                                    setViewMode('summary');
                                    fetchCategorySummary();
                                }}
                            >
                                📊 Summary View
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="🔍 Search by description, customer or bill..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={styles.searchInput}
                            />
                            <button
                                style={{ ...styles.button, ...styles.buttonSuccess }}
                                onClick={handleExport}
                                disabled={exporting}
                            >
                                {exporting ? '⏳ Exporting...' : '📥 Export CSV'}
                            </button>
                        </div>
                    </div>
                    
                    {/* List View */}
                    {viewMode === 'list' && (
                        <div style={{ overflowX: 'auto', borderRadius: '12px' }}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th} onClick={() => handleSort('Date')}>Date {getSortIcon('Date')}</th>
                                        <th style={styles.th} onClick={() => handleSort('loan_type')}>Type {getSortIcon('loan_type')}</th>
                                        <th style={styles.th} onClick={() => handleSort('description')}>Description {getSortIcon('description')}</th>
                                        <th style={styles.th} onClick={() => handleSort('amount')}>Amount {getSortIcon('amount')}</th>
                                        <th style={styles.th} onClick={() => handleSort('customer_short_name')}>Customer {getSortIcon('customer_short_name')}</th>
                                        <th style={styles.th} onClick={() => handleSort('settling_way')}>Payment Method {getSortIcon('settling_way')}</th>
                                        <th style={styles.th} onClick={() => handleSort('user_id')}>User {getSortIcon('user_id')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSortedTransactions.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                                📊 No transactions found
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAndSortedTransactions.map((transaction) => (
                                            <tr key={transaction.id}>
                                                <td style={styles.td}>{formatDate(transaction.Date)}</td>
                                                <td style={styles.td}>
                                                    <span style={{
                                                        ...styles.badge,
                                                        ...(transaction.loan_type === 'ingoing' ? styles.badgeIncome : styles.badgeExpense)
                                                    }}>
                                                        {transaction.loan_type === 'ingoing' ? '💰 Income' : '📉 Expense'}
                                                    </span>
                                                </td>
                                                <td style={styles.td}>
                                                    <strong>{transaction.description}</strong>
                                                    {transaction.bill_no && <div style={{ fontSize: '11px', color: '#64748b' }}>Bill: {transaction.bill_no}</div>}
                                                </td>
                                                <td style={{
                                                    ...styles.td,
                                                    fontWeight: 'bold',
                                                    color: transaction.loan_type === 'ingoing' ? '#10b981' : '#ef4444'
                                                }}>
                                                    {formatCurrency(Math.abs(transaction.amount))}
                                                </td>
                                                <td style={styles.td}>{transaction.customer_short_name || '-'}</td>
                                                <td style={styles.td}>
                                                    {transaction.settling_way === 'cheque' ? (
                                                        <span>💳 Cheque</span>
                                                    ) : (
                                                        <span>💰 Cash</span>
                                                    )}
                                                    {transaction.cheque_no && (
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                            {transaction.bank} - {transaction.cheque_no}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={styles.td}>{transaction.user_id || '-'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    {/* Summary View */}
                    {viewMode === 'summary' && (
                        <div className="fade-in">
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{ color: '#10b981', marginBottom: '16px', fontSize: '20px' }}>💰 Income by Category</h3>
                                <div style={{ overflowX: 'auto', borderRadius: '12px' }}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>Category</th>
                                                <th style={styles.th}>Total Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryData.income_by_category.length === 0 ? (
                                                <tr><td colSpan="2" style={{ textAlign: 'center', padding: '40px' }}>No income data</td></tr>
                                            ) : (
                                                categoryData.income_by_category.map((cat, idx) => (
                                                    <tr key={idx}>
                                                        <td style={styles.td}>{cat.description}</td>
                                                        <td style={{ ...styles.td, color: '#10b981', fontWeight: 'bold' }}>
                                                            {formatCurrency(cat.total)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <div>
                                <h3 style={{ color: '#ef4444', marginBottom: '16px', fontSize: '20px' }}>📉 Expense by Category</h3>
                                <div style={{ overflowX: 'auto', borderRadius: '12px' }}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>Category</th>
                                                <th style={styles.th}>Total Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryData.expense_by_category.length === 0 ? (
                                                <tr><td colSpan="2" style={{ textAlign: 'center', padding: '40px' }}>No expense data</td></tr>
                                            ) : (
                                                categoryData.expense_by_category.map((cat, idx) => (
                                                    <tr key={idx}>
                                                        <td style={styles.td}>{cat.description}</td>
                                                        <td style={{ ...styles.td, color: '#ef4444', fontWeight: 'bold' }}>
                                                            {formatCurrency(cat.total)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default IncomeExpenseReport2;