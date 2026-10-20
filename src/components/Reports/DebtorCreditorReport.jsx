import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { STORAGE_BASE } from '../../config';

const DebtorCreditorReport = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('debtors');
    const [debtors, setDebtors] = useState([]);
    const [creditors, setCreditors] = useState([]);
    const [debtorSummary, setDebtorSummary] = useState({});
    const [creditorSummary, setCreditorSummary] = useState({});
    const [combinedSummary, setCombinedSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [limit, setLimit] = useState(50);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [viewOldBills, setViewOldBills] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
    const [refreshCountdown, setRefreshCountdown] = useState(10);
    
    const intervalRef = useRef(null);
    const countdownRef = useRef(null);

    const fetchCombinedReport = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/debtor-creditor/combined', {
                params: { search: searchTerm, limit, view_old_bills: viewOldBills }
            });
            if (response.data.success) {
                setDebtors(response.data.debtors);
                setCreditors(response.data.creditors);
                setDebtorSummary(response.data.debtor_summary);
                setCreditorSummary(response.data.creditor_summary);
                setCombinedSummary(response.data.combined_summary);
                setLastRefreshTime(new Date());
                
                // Show a subtle notification that data was refreshed
                const refreshNotification = document.createElement('div');
                refreshNotification.textContent = '✓ Data refreshed automatically';
                refreshNotification.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #10b981;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    z-index: 10001;
                    animation: fadeOut 2s ease-out forwards;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                `;
                document.body.appendChild(refreshNotification);
                setTimeout(() => refreshNotification.remove(), 2000);
            }
        } catch (error) {
            console.error('Error fetching combined report:', error);
            // Don't show alert for auto-refresh errors to avoid annoying popups
            if (!autoRefresh) {
                alert('Failed to load report data');
            }
        } finally {
            setLoading(false);
        }
    }, [searchTerm, limit, viewOldBills, autoRefresh]);

    // Countdown timer function
    const startCountdown = useCallback(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
        }
        
        setRefreshCountdown(10);
        countdownRef.current = setInterval(() => {
            setRefreshCountdown(prev => {
                if (prev <= 1) {
                    return 10;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // Set up auto-refresh interval
    useEffect(() => {
        if (autoRefresh) {
            // Initial countdown start
            startCountdown();
            
            // Set up main refresh interval
            intervalRef.current = setInterval(() => {
                fetchCombinedReport();
                startCountdown(); // Reset countdown after refresh
            }, 10000); // Refresh every 10 seconds
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
            setRefreshCountdown(10);
        }
        
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, [autoRefresh, fetchCombinedReport, startCountdown]);

    // Initial data fetch
    useEffect(() => {
        fetchCombinedReport();
        startCountdown();
        
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, [fetchCombinedReport, startCountdown]);

    const fetchDebtorDetails = async (code) => {
        setModalLoading(true);
        setShowDetailsModal(true);
        try {
            const response = await api.get(`/debtor-creditor/debtor/${code}`, {
                params: { view_old_bills: viewOldBills }
            });
            if (response.data.success) {
                setModalData(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching debtor details:', error);
            alert('Failed to load debtor details');
        } finally {
            setModalLoading(false);
        }
    };

    const fetchCreditorDetails = async (code) => {
        setModalLoading(true);
        setShowDetailsModal(true);
        try {
            const response = await api.get(`/debtor-creditor/creditor/${code}`, {
                params: { view_old_bills: viewOldBills }
            });
            if (response.data.success) {
                setModalData(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching creditor details:', error);
            alert('Failed to load creditor details');
        } finally {
            setModalLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    };

    const formatDate = (date) => {
        if (!date) {
            return 'N/A';
        }
        
        if (typeof date === 'object' && date.date) {
            date = date.date;
        }
        
        let parsedDate;
        try {
            parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
                return 'N/A';
            }
        } catch (error) {
            return 'N/A';
        }
        
        return parsedDate.toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getImageUrl = (imagePath) => {
        if (!imagePath) return null;
        if (imagePath.startsWith('http') || imagePath.startsWith('data:')) {
            return imagePath;
        }
        const baseUrl = STORAGE_BASE;
        const cleanPath = imagePath.replace(/^\/+/, '');
        return `${baseUrl}/${cleanPath}`;
    };

    const filteredDebtors = useMemo(() => {
        if (!searchTerm) return debtors;
        const term = searchTerm.toLowerCase();
        return debtors.filter(d =>
            d.code?.toLowerCase().includes(term) ||
            d.name?.toLowerCase().includes(term) ||
            d.telephone?.includes(term) ||
            d.debtor_no?.toLowerCase().includes(term)
        );
    }, [debtors, searchTerm]);

    const filteredCreditors = useMemo(() => {
        if (!searchTerm) return creditors;
        const term = searchTerm.toLowerCase();
        return creditors.filter(c =>
            c.code?.toLowerCase().includes(term) ||
            c.name?.toLowerCase().includes(term) ||
            c.telephone?.includes(term)
        );
    }, [creditors, searchTerm]);

    const currentData = activeTab === 'debtors' ? filteredDebtors : filteredCreditors;
    
    // Calculate custom summaries based on the actual displayed data
    const customSummary = useMemo(() => {
        if (currentData.length === 0) {
            return { totalAmount: 0, totalPaid: 0, totalRemaining: 0 };
        }
        
        let totalAmount = 0;
        let totalPaid = 0;
        let totalRemaining = 0;
        
        currentData.forEach(item => {
            const amount = activeTab === 'debtors' 
                ? (item.total_sales || 0)
                : (item.total_supplier_bill_amount || item.total_supplier_amount || 0);
            
            const paid = item.total_paid || 0;
            const remaining = item.total_remaining || 0;
            
            totalAmount += amount;
            totalPaid += paid;
            totalRemaining += remaining;
        });
        
        return { totalAmount, totalPaid, totalRemaining };
    }, [currentData, activeTab]);

    const getPaymentMethodStyle = (method) => {
        const methods = {
            'Cash': { icon: '💰', color: '#10b981' },
            'Cheque': { icon: '💳', color: '#8b5cf6' },
            'Bank Transfer': { icon: '🏦', color: '#ec489a' },
            'bag_to_box': { icon: '📦', color: '#f59e0b' },
            'bill_to_bill': { icon: '📄', color: '#3b82f6' },
            'bad_debt': { icon: '⚠️', color: '#ef4444' },
            'Credit': { icon: '💳', color: '#f59e0b' }
        };
        return methods[method] || { icon: '💰', color: '#6b7280' };
    };

    // Toggle auto-refresh
    const toggleAutoRefresh = () => {
        setAutoRefresh(prev => !prev);
        if (!autoRefresh) {
            // If turning on, fetch immediately
            fetchCombinedReport();
        }
    };

    // Manual refresh
    const handleManualRefresh = () => {
        fetchCombinedReport();
        startCountdown();
    };

    if (loading && debtors.length === 0 && creditors.length === 0) {
        return (
            <div style={styles.fullScreenContainer}>
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner}>⏳</div>
                    <p style={styles.loadingText}>Loading report data...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.fullScreenContainer}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <span style={styles.headerIcon}>💰</span>
                    <span>Debtor & Creditor Report</span>
                </div>
                <div style={styles.headerSubtitle}>
                    Comprehensive report of all debtors and creditors with their transaction details
                </div>
                
                {/* Auto-refresh status bar */}
                <div style={styles.autoRefreshBar}>
                    <div style={styles.autoRefreshInfo}>
                        <span>🔄 Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}</span>
                        {autoRefresh && (
                            <span style={styles.countdownTimer}>
                                Next refresh in: {refreshCountdown}s
                            </span>
                        )}
                        <span style={styles.lastRefreshTime}>
                            Last updated: {lastRefreshTime.toLocaleTimeString()}
                        </span>
                    </div>
                    <div style={styles.autoRefreshControls}>
                        <button
                            onClick={toggleAutoRefresh}
                            style={{
                                ...styles.autoRefreshBtn,
                                background: autoRefresh ? '#ef4444' : '#10b981'
                            }}
                        >
                            {autoRefresh ? '⏸️ Stop Auto-Refresh' : '▶️ Start Auto-Refresh'}
                        </button>
                        <button
                            onClick={handleManualRefresh}
                            style={styles.manualRefreshBtn}
                            disabled={loading}
                        >
                            {loading ? '⟳ Refreshing...' : '🔄 Refresh Now'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <button
                        onClick={() => {
                            setViewOldBills(!viewOldBills);
                            handleManualRefresh();
                        }}
                        style={{
                            padding: '8px 20px',
                            background: viewOldBills ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #64748b, #475569)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                    >
                        {viewOldBills ? '📅 View Current Bills' : '📜 View Old Bills'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={styles.tabsContainer}>
                <button
                    style={{
                        ...styles.tabButton,
                        ...(activeTab === 'debtors' ? styles.tabButtonActive : {})
                    }}
                    onClick={() => setActiveTab('debtors')}
                >
                    🧾 Debtors ({debtors.length})
                </button>
                <button
                    style={{
                        ...styles.tabButton,
                        ...(activeTab === 'creditors' ? styles.tabButtonActive : {})
                    }}
                    onClick={() => setActiveTab('creditors')}
                >
                    🏪 Creditors ({creditors.length})
                </button>
            </div>

            {/* Search and Filters */}
            <div style={styles.searchBar}>
                <input
                    type="text"
                    placeholder="🔍 Search by code, name, telephone, or debtor number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={styles.searchInput}
                />
                <select
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value))}
                    style={styles.select}
                >
                    <option value={20}>Show 20</option>
                    <option value={50}>Show 50</option>
                    <option value={100}>Show 100</option>
                    <option value={200}>Show 200</option>
                </select>
                <button
                    onClick={handleManualRefresh}
                    style={styles.refreshBtn}
                    disabled={loading}
                >
                    {loading ? '⟳ Refreshing...' : '🔄 Refresh'}
                </button>
            </div>

            {/* Summary for active tab - Using custom calculated values */}
            <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                    <div style={styles.statLabel}>Total {activeTab === 'debtors' ? 'Debtors' : 'Creditors'}</div>
                    <div style={styles.statValue}>{currentData.length}</div>
                </div>

                <div style={styles.statCard}>
                    <div style={styles.statLabel}>Total {activeTab === 'debtors' ? 'Sales' : 'Supplier'} Amount</div>
                    <div style={styles.statValue}>
                        {formatCurrency(customSummary.totalAmount)}
                    </div>
                </div>

                <div style={styles.statCard}>
                    <div style={styles.statLabel}>Total Paid</div>
                    <div style={styles.statValue}>
                        {formatCurrency(customSummary.totalPaid)}
                    </div>
                </div>

                {activeTab === 'debtors' && (
                    <div style={styles.statCard}>
                        <div style={styles.statLabel}>Credit Deductions</div>
                        <div style={{ ...styles.statValue, color: '#f59e0b' }}>
                            {formatCurrency(currentData.reduce((sum, item) => sum + (item.credit_deductions || 0), 0))}
                        </div>
                    </div>
                )}

                <div style={styles.statCard}>
                    <div style={styles.statLabel}>Total {activeTab === 'debtors' ? 'Remaining' : 'Outstanding'}</div>
                    <div style={styles.statValue}>{formatCurrency(customSummary.totalRemaining)}</div>
                </div>
            </div>

            {/* Loading indicator for auto-refresh */}
            {loading && debtors.length > 0 && (
                <div style={styles.refreshLoadingBar}>
                    <div style={styles.refreshProgressBar}></div>
                    <span style={styles.refreshLoadingText}>Updating data...</span>
                </div>
            )}

            {/* Data Table */}
            <div style={styles.tableWrapper}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Debtor No</th>
                            <th style={styles.th}>Code</th>
                            <th style={styles.th}>Name</th>
                            <th style={styles.th}>Telephone</th>
                            <th style={styles.th}>Total {activeTab === 'debtors' ? 'Sales' : 'Bill Amount'}</th>
                            <th style={styles.th}>Paid</th>
                            {activeTab === 'debtors' && <th style={styles.th}>Credit</th>}
                            <th style={styles.th}>Remaining</th>
                            <th style={styles.th}>Bills</th>
                            <th style={styles.th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentData.length === 0 ? (
                            <tr>
                                <td colSpan={activeTab === 'debtors' ? 10 : 9} style={styles.emptyState}>
                                    No {activeTab} found
                                </td>
                            </tr>
                        ) : (
                            currentData.map((item, idx) => {
                                // For creditors, use total_supplier_bill_amount (bills only)
                                const totalAmount = activeTab === 'debtors'
                                    ? (item.total_sales || 0)
                                    : (item.total_supplier_bill_amount || item.total_supplier_amount || 0);

                                const paidAmount = item.total_paid || 0;
                                const creditDeduction = item.credit_deductions || 0;
                                const remainingAmount = item.total_remaining || 0;

                                return (
                                    <tr
                                        key={idx}
                                        style={styles.tableRow}
                                        onClick={() =>
                                            activeTab === 'debtors'
                                                ? fetchDebtorDetails(item.code)
                                                : fetchCreditorDetails(item.code)
                                        }
                                    >
                                        <td style={styles.td}>
                                            <strong>{item.debtor_no || '-'}</strong>
                                        </td>
                                        <td style={styles.td}>
                                            <strong>{item.code}</strong>
                                        </td>
                                        <td style={styles.td}>{item.name || '-'}</td>
                                        <td style={styles.td}>{item.telephone || '-'}</td>
                                        <td style={styles.td}>
                                            <strong>{formatCurrency(totalAmount)}</strong>
                                            {activeTab === 'creditors' && item.total_loan_amount > 0 && (
                                                <div style={{ fontSize: '10px', color: '#8b5cf6', marginTop: '2px' }}>
                                                    (Loan: {formatCurrency(item.total_loan_amount)})
                                                </div>
                                            )}
                                        </td>
                                        <td style={styles.td}>
                                            {formatCurrency(paidAmount)}
                                        </td>
                                        {activeTab === 'debtors' && (
                                            <td style={styles.td}>
                                                <span style={{ color: '#f59e0b', fontWeight: '600' }}>
                                                    {formatCurrency(creditDeduction)}
                                                </span>
                                            </td>
                                        )}
                                        <td style={styles.td}>
                                            <span style={{
                                                color: remainingAmount > 0 ? '#dc2626' : '#10b981'
                                            }}>
                                                {formatCurrency(remainingAmount)}
                                            </span>
                                        </td>
                                        <td style={styles.td}>{item.bill_count || 0}</td>
                                        <td style={styles.td}>
                                            <span style={{
                                                ...styles.statusBadge,
                                                ...(item.status === 'Fully Paid' || item.status === 'Fully Settled'
                                                    ? styles.statusPaid
                                                    : styles.statusPending)
                                            }}>
                                                {item.status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Details Modal */}
            {showDetailsModal && (
                <div style={styles.modalOverlay} onClick={() => setShowDetailsModal(false)}>
                    <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <div>
                                <h3 style={styles.modalTitle}>
                                    {activeTab === 'debtors' ? '🧾 Debtor Details' : '🏪 Creditor Details'}
                                </h3>
                                <p style={styles.modalSubtitle}>
                                    {modalData?.code} {modalData?.debtor_no && `| Debtor No: ${modalData.debtor_no}`}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                style={styles.modalCloseBtn}
                            >
                                ×
                            </button>
                        </div>

                        <div style={styles.modalBody}>
                            {modalLoading ? (
                                <div style={styles.modalLoading}>
                                    <div style={styles.loadingSpinner}>⏳</div>
                                    <p>Loading details...</p>
                                </div>
                            ) : modalData && (
                                <>
                                    {/* Profile Section */}
                                    <div style={styles.profileSection}>
                                        {modalData.profile_pic ? (
                                            <img
                                                src={getImageUrl(modalData.profile_pic)}
                                                alt="Profile"
                                                style={styles.profilePic}
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: '90px',
                                                height: '90px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '40px',
                                                color: 'white'
                                            }}>
                                                👤
                                            </div>
                                        )}
                                        <div style={styles.profileInfo}>
                                            <h4 style={styles.profileName}>{modalData.name || 'N/A'}</h4>
                                            <p style={styles.profileDetail}>📞 {modalData.telephone || 'No phone'}</p>
                                            <p style={styles.profileDetail}>📍 {modalData.address || 'No address'}</p>
                                            {modalData.debtor_no && (
                                                <p style={styles.profileDetail}>🔢 Debtor Number: <strong>{modalData.debtor_no}</strong></p>
                                            )}
                                            {activeTab === 'debtors' && modalData.credit_limit > 0 && (
                                                <p style={styles.profileDetail}>💳 Credit Limit: {formatCurrency(modalData.credit_limit)}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bills Section */}
                                    <h4 style={styles.sectionTitle}>📋 Bills & Transactions</h4>
                                    <div style={styles.tableWrapper}>
                                        <table style={styles.detailsTable}>
                                            <thead>
                                                <tr style={styles.detailsTableHeader}>
                                                    <th style={styles.detailsTh}>Bill No</th>
                                                    <th style={styles.detailsTh}>Date</th>
                                                    <th style={styles.detailsTh}>Total</th>
                                                    <th style={styles.detailsTh}>Paid</th>
                                                    <th style={styles.detailsTh}>Remaining</th>
                                                    <th style={styles.detailsTh}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(modalData.bills || []).length === 0 ? (
                                                    <tr>
                                                        <td colSpan="6" style={styles.emptyState}>
                                                            No bills found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    modalData.bills.map((bill, idx) => {
                                                        const isFullyPaid = bill.remaining_amount <= 0;
                                                        return (
                                                            <tr key={idx} style={styles.detailsTableRow}>
                                                                <td style={styles.detailsTd}>
                                                                    <strong>{bill.bill_no}</strong>
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    {formatDate(bill.date)}
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    <strong>{formatCurrency(bill.total_amount)}</strong>
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    <strong style={{ color: '#059669' }}>
                                                                        {formatCurrency(bill.paid_amount)}
                                                                    </strong>
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    <span style={{
                                                                        color: bill.remaining_amount > 0 ? '#dc2626' : '#10b981'
                                                                    }}>
                                                                        {formatCurrency(bill.remaining_amount)}
                                                                    </span>
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    <span style={{
                                                                        ...styles.statusBadge,
                                                                        ...(isFullyPaid ? styles.statusPaid : styles.statusPending)
                                                                    }}>
                                                                        {isFullyPaid ? 'Paid' : 'Pending'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                            {modalData.total_bill_amount > 0 && (
                                                <tfoot>
                                                    <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                                                        <td colSpan="2" style={{ ...styles.detailsTd, textAlign: 'right' }}>Total Summary:</td>
                                                        <td style={styles.detailsTd}>{formatCurrency(modalData.total_bill_amount)}</td>
                                                        <td style={styles.detailsTd}>{formatCurrency(modalData.total_paid_amount)}</td>
                                                        <td style={styles.detailsTd}>{formatCurrency(modalData.total_remaining)}</td>
                                                        <td style={styles.detailsTd}></td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>

                                    {/* Payment History Section */}
                                    <h4 style={styles.sectionTitle}>📜 Payment History</h4>
                                    <div style={styles.tableWrapper}>
                                        <table style={styles.detailsTable}>
                                            <thead>
                                                <tr style={styles.detailsTableHeader}>
                                                    <th style={styles.detailsTh}>Bill No</th>
                                                    <th style={styles.detailsTh}>Amount</th>
                                                    <th style={styles.detailsTh}>Payment Method</th>
                                                    <th style={styles.detailsTh}>Date</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(modalData.payments || []).length === 0 ? (
                                                    <tr>
                                                        <td colSpan="4" style={styles.emptyState}>
                                                            No payment records found
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    modalData.payments.map((payment, idx) => {
                                                        const methodStyle = getPaymentMethodStyle(payment.method);
                                                        return (
                                                            <tr key={idx} style={styles.detailsTableRow}>
                                                                <td style={styles.detailsTd}>
                                                                    <strong>{payment.bill_no || 'N/A'}</strong>
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    <strong style={{ color: '#059669' }}>
                                                                        {formatCurrency(payment.amount)}
                                                                    </strong>
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    <span style={{ 
                                                                        display: 'inline-flex', 
                                                                        alignItems: 'center', 
                                                                        gap: '6px',
                                                                        padding: '4px 12px',
                                                                        borderRadius: '20px',
                                                                        background: `${methodStyle.color}15`,
                                                                        color: methodStyle.color,
                                                                        fontSize: '12px',
                                                                        fontWeight: '500'
                                                                    }}>
                                                                        <span>{methodStyle.icon}</span>
                                                                        <span>{payment.method_display || payment.method || 'Cash'}</span>
                                                                    </span>
                                                                </td>
                                                                <td style={styles.detailsTd}>
                                                                    {formatDate(payment.date)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const styles = {
    fullScreenContainer: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        background: '#f0f2f5',
        overflowY: 'auto',
        padding: '20px 30px',
        margin: 0,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        boxSizing: 'border-box',
        zIndex: 999
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100%'
    },
    loadingSpinner: {
        fontSize: '48px',
        marginBottom: '16px',
        animation: 'spin 1s linear infinite'
    },
    loadingText: {
        fontSize: '16px',
        color: '#64748b'
    },
    header: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '24px 32px',
        borderRadius: '20px',
        color: 'white',
        marginBottom: '24px',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
    },
    headerTitle: {
        fontSize: '28px',
        fontWeight: '700',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    headerIcon: {
        fontSize: '32px'
    },
    headerSubtitle: {
        fontSize: '14px',
        opacity: 0.9,
        marginTop: '8px'
    },
    autoRefreshBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '16px',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.15)',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        flexWrap: 'wrap',
        gap: '12px'
    },
    autoRefreshInfo: {
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        flexWrap: 'wrap',
        fontSize: '13px'
    },
    countdownTimer: {
        background: 'rgba(0,0,0,0.2)',
        padding: '4px 12px',
        borderRadius: '20px',
        fontFamily: 'monospace',
        fontWeight: 'bold'
    },
    lastRefreshTime: {
        fontSize: '12px',
        opacity: 0.9
    },
    autoRefreshControls: {
        display: 'flex',
        gap: '10px'
    },
    autoRefreshBtn: {
        padding: '6px 16px',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '12px',
        color: 'white',
        transition: 'all 0.2s'
    },
    manualRefreshBtn: {
        padding: '6px 16px',
        background: 'white',
        color: '#667eea',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '12px',
        transition: 'all 0.2s'
    },
    refreshLoadingBar: {
        position: 'relative',
        background: '#e2e8f0',
        borderRadius: '4px',
        height: '4px',
        marginBottom: '16px',
        overflow: 'hidden'
    },
    refreshProgressBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        height: '100%',
        background: 'linear-gradient(90deg, #667eea, #764ba2)',
        animation: 'progress 10s linear infinite'
    },
    refreshLoadingText: {
        position: 'absolute',
        right: '10px',
        top: '-20px',
        fontSize: '11px',
        color: '#64748b'
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
    },
    statCard: {
        background: 'white',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'pointer'
    },
    statLabel: {
        fontSize: '12px',
        color: '#64748b',
        marginBottom: '8px',
        textTransform: 'uppercase',
        fontWeight: '600',
        letterSpacing: '0.5px'
    },
    statValue: {
        fontSize: '32px',
        fontWeight: '800',
        color: '#1e293b'
    },
    tabsContainer: {
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        background: 'white',
        padding: '8px',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    tabButton: {
        padding: '12px 28px',
        border: 'none',
        background: 'transparent',
        fontSize: '15px',
        fontWeight: '600',
        cursor: 'pointer',
        borderRadius: '12px',
        transition: 'all 0.2s',
        color: '#475569'
    },
    tabButtonActive: {
        background: '#667eea',
        color: 'white',
        boxShadow: '0 2px 4px rgba(102,126,234,0.3)'
    },
    searchBar: {
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        alignItems: 'center',
        flexWrap: 'wrap',
        background: 'white',
        padding: '16px',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    searchInput: {
        flex: 1,
        padding: '12px 16px',
        border: '2px solid #e2e8f0',
        borderRadius: '12px',
        fontSize: '14px',
        outline: 'none',
        transition: 'all 0.2s',
        minWidth: '200px',
        background: 'white'
    },
    select: {
        padding: '12px 16px',
        border: '2px solid #e2e8f0',
        borderRadius: '12px',
        background: 'white',
        cursor: 'pointer',
        fontSize: '14px',
        outline: 'none'
    },
    refreshBtn: {
        padding: '12px 24px',
        background: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '14px',
        transition: 'all 0.2s'
    },
    tableWrapper: {
        overflowX: 'auto',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        background: 'white'
    },
    table: {
        width: '100%',
        background: 'white',
        borderRadius: '16px',
        overflow: 'hidden',
        borderCollapse: 'collapse'
    },
    th: {
        padding: '16px 20px',
        textAlign: 'left',
        background: '#f8fafc',
        fontWeight: '600',
        color: '#475569',
        borderBottom: '2px solid #e2e8f0',
        fontSize: '14px'
    },
    td: {
        padding: '14px 20px',
        borderBottom: '1px solid #f1f5f9',
        fontSize: '14px',
        color: '#334155'
    },
    tableRow: {
        transition: 'background 0.2s',
        cursor: 'pointer'
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px',
        color: '#94a3b8',
        fontSize: '14px'
    },
    statusBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '500'
    },
    statusPaid: {
        background: '#d1fae5',
        color: '#065f46'
    },
    statusPending: {
        background: '#fed7aa',
        color: '#9a3412'
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000
    },
    modalContent: {
        background: 'white',
        borderRadius: '24px',
        width: '90%',
        maxWidth: '1200px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        animation: 'slideUp 0.3s ease'
    },
    modalHeader: {
        padding: '20px 28px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        borderRadius: '24px 24px 0 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    modalTitle: {
        margin: 0,
        fontSize: '20px',
        fontWeight: '700'
    },
    modalSubtitle: {
        margin: '4px 0 0 0',
        opacity: 0.9,
        fontSize: '13px'
    },
    modalCloseBtn: {
        background: 'rgba(255,255,255,0.2)',
        border: 'none',
        fontSize: '28px',
        cursor: 'pointer',
        color: 'white',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s'
    },
    modalBody: {
        padding: '28px',
        overflowY: 'auto',
        flex: 1
    },
    modalLoading: {
        textAlign: 'center',
        padding: '60px',
        color: '#64748b'
    },
    profileSection: {
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        marginBottom: '28px',
        paddingBottom: '24px',
        borderBottom: '2px solid #e2e8f0',
        flexWrap: 'wrap'
    },
    profilePic: {
        width: '90px',
        height: '90px',
        borderRadius: '50%',
        objectFit: 'cover',
        border: '4px solid white',
        boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
    },
    profileInfo: {
        flex: 1
    },
    profileName: {
        margin: '0 0 6px 0',
        fontSize: '22px',
        fontWeight: '700',
        color: '#1e293b'
    },
    profileDetail: {
        margin: '4px 0',
        color: '#64748b',
        fontSize: '13px'
    },
    sectionTitle: {
        fontSize: '18px',
        fontWeight: '600',
        marginBottom: '18px',
        marginTop: '24px',
        color: '#1e293b',
        paddingBottom: '8px',
        borderBottom: '2px solid #667eea',
        display: 'inline-block'
    },
    detailsTable: {
        width: '100%',
        fontSize: '13px',
        borderCollapse: 'collapse',
        marginBottom: '24px'
    },
    detailsTableHeader: {
        background: '#f1f5f9'
    },
    detailsTh: {
        padding: '12px 16px',
        textAlign: 'left',
        fontWeight: '600',
        color: '#475569',
        borderBottom: '1px solid #e2e8f0'
    },
    detailsTd: {
        padding: '12px 16px',
        borderBottom: '1px solid #e2e8f0',
        color: '#334155'
    },
    detailsTableRow: {
        transition: 'background 0.2s'
    },
    paymentMethodBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '500'
    }
};

// Add keyframes animation to the document head
const styleSheet = document.createElement("style");
styleSheet.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
    @keyframes progress {
        from {
            width: 0%;
        }
        to {
            width: 100%;
        }
    }
`;
document.head.appendChild(styleSheet);

export default DebtorCreditorReport;