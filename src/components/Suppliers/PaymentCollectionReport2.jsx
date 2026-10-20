import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const PaymentCollectionReport2 = () => {
    const navigate = useNavigate();
    
    const [reportData, setReportData] = useState([]);
    const [totals, setTotals] = useState({
        cash_collection: 0,
        cheques_collection: 0,
        bag_box_total: 0,
        bag_total: 0,
        box_total: 0,
        banks_transfer: 0,
        bad_debt: 0,
        total_collection: 0
    });
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const intervalRef = useRef(null);

    // Navigate to Supplier Report (Mull Pituwa)
    const handleMullPituwa = () => {
        navigate('/supplierreport');
    };

    const fetchReport = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            
            const response = await api.get('/payment-collection-report', { params });
            
            if (response.data.success) {
                setReportData(response.data.data);
                setTotals(response.data.totals);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error('Error fetching report:', error);
            if (showLoading && error.response?.status !== 404) {
                alert('Error loading payment collection report');
            }
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const fetchPaymentDetails = async (billNo, code) => {
        try {
            const response = await api.get(`/payment-details-by-bill`, { 
                params: { bill_no: billNo, code: code }
            });
            if (response.data.success) {
                setPaymentDetails(response.data.data);
                setShowPaymentModal(true);
            }
        } catch (error) {
            console.error('Error fetching payment details:', error);
            alert('Failed to load payment details');
        }
    };

    useEffect(() => {
        fetchReport(true);
        intervalRef.current = setInterval(() => fetchReport(false), 5000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const handleFilter = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        fetchReport(true);
        intervalRef.current = setInterval(() => fetchReport(false), 5000);
    };

    const clearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => fetchReport(true), 100);
        intervalRef.current = setInterval(() => fetchReport(false), 5000);
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const filteredAndSortedData = useMemo(() => {
        let filtered = [...reportData];
        
        if (searchTerm) {
            filtered = filtered.filter(row => 
                (row.customer_bill_no && row.customer_bill_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (row.supplier_code && row.supplier_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (row.supplier_name && row.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        
        filtered.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            
            if (['cash_collection', 'cheques_collection', 'bag_box_total', 'bag_total', 'box_total', 'banks_transfer', 'bad_debt', 'total_paid'].includes(sortConfig.key)) {
                aVal = Number(aVal) || 0;
                bVal = Number(bVal) || 0;
            } else if (sortConfig.key === 'date') {
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
    }, [reportData, searchTerm, sortConfig]);

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return '↕️';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

    const formatCurrency = (amount) => {
        const num = parseFloat(amount) || 0;
        return `Rs. ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatNumber = (num) => {
        return (parseFloat(num) || 0).toLocaleString();
    };

    const formatDate = (date) => {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleDateString('en-LK');
        } catch {
            return 'N/A';
        }
    };

    const getPaymentMethodBadge = (methods) => {
        if (!methods || !Array.isArray(methods)) return null;
        
        const uniqueMethods = [...new Set(methods)];
        const colors = {
            'Cash': '#10b981',
            'Cheque': '#8b5cf6',
            'Bank Transfer': '#ec489a',
            'Bag to Box': '#f59e0b',
            'Bill to Bill': '#06b6d4',
            'Bad Debt': '#ef4444'
        };
        
        return uniqueMethods.map((method, idx) => (
            <span
                key={idx}
                style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    margin: '2px 4px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: colors[method] || '#6b7280',
                    color: 'white'
                }}
            >
                {method}
            </span>
        ));
    };

    const exportToCSV = () => {
        const headers = ['Bill No', 'Supplier Code', 'Supplier Name', 'Date', 'Cash', 'Cheques', 'Bag/Box', 'Bank Transfer', 'Bad Debt', 'Total Paid', 'Payment Methods'];
        const csvData = filteredAndSortedData.map(row => [
            row.customer_bill_no || 'N/A',
            row.supplier_code || 'N/A',
            row.supplier_name || 'N/A',
            formatDate(row.date),
            row.cash_collection || 0,
            row.cheques_collection || 0,
            row.bag_box_total || 0,
            row.banks_transfer || 0,
            row.bad_debt || 0,
            row.total_paid || 0,
            (row.payment_methods || []).join(', ')
        ]);
        
        const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payment_collection_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const printReport = () => {
        const printWindow = window.open('', '_blank', 'width=1400,height=800');
        if (!printWindow) {
            alert('Please allow pop-ups to print');
            return;
        }
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Payment Collection Report</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        h1 { color: #333; }
                        .totals { margin-top: 20px; font-weight: bold; }
                        @media print { body { margin: 0; } }
                    </style>
                </head>
                <body>
                    <h1>Payment Collection Report</h1>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                    ${startDate || endDate ? `<p>Date Range: ${startDate || 'Start'} to ${endDate || 'End'}</p>` : ''}
                    <table>
                        <thead>
                            <tr><th>Bill No</th><th>Supplier</th><th>Date</th><th>Cash</th><th>Cheques</th><th>Bag/Box</th><th>Bank Transfer</th><th>Bad Debt</th><th>Total</th></tr>
                        </thead>
                        <tbody>
                            ${filteredAndSortedData.map(row => `
                                <tr>
                                    <td>${row.customer_bill_no || 'N/A'}</td>
                                    <td>${row.supplier_code || 'N/A'} - ${row.supplier_name || 'N/A'}</td>
                                    <td>${formatDate(row.date)}</td>
                                    <td>${formatCurrency(row.cash_collection)}</td>
                                    <td>${formatCurrency(row.cheques_collection)}</td>
                                    <td>${formatCurrency(row.bag_box_total)}</td>
                                    <td>${formatCurrency(row.banks_transfer)}</td>
                                    <td>${formatCurrency(row.bad_debt)}</td>
                                    <td>${formatCurrency(row.total_paid)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr><th colspan="3">Total</th>
                                <th>${formatCurrency(totals.cash_collection)}</th>
                                <th>${formatCurrency(totals.cheques_collection)}</th>
                                <th>${formatCurrency(totals.bag_box_total)}</th>
                                <th>${formatCurrency(totals.banks_transfer)}</th>
                                <th>${formatCurrency(totals.bad_debt)}</th>
                                <th>${formatCurrency(totals.total_collection)}</th>
                            </tr>
                        </tfoot>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    const PaymentDetailsModal = () => {
        if (!showPaymentModal || !paymentDetails) return null;
        
        return (
            <div style={modalOverlay} onClick={() => setShowPaymentModal(false)}>
                <div style={modalContent} onClick={(e) => e.stopPropagation()}>
                    <div style={modalHeader}>
                        <h2 style={modalTitle}>💰 Payment Details</h2>
                        <button style={modalClose} onClick={() => setShowPaymentModal(false)}>✕</button>
                    </div>
                    <div style={modalBody}>
                        {paymentDetails.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#64748b' }}>No payment details found</p>
                        ) : (
                            paymentDetails.map((payment, idx) => (
                                <div key={idx} style={paymentDetailCard}>
                                    <div style={paymentDetailHeader}>
                                        <span style={paymentIcon}>💵</span>
                                        <span style={paymentMethodBadge}>{payment.type || 'Unknown'}</span>
                                        <span style={paymentAmount}>Rs. {parseFloat(payment.loan_amount || 0).toLocaleString()}</span>
                                    </div>
                                    <div style={paymentDetailBody}>
                                        <p><strong>Date:</strong> {formatDate(payment.Date)}</p>
                                        <p><strong>Bill No:</strong> {payment.bill_no || 'N/A'}</p>
                                        <p><strong>Supplier Code:</strong> {payment.code}</p>
                                        {payment.notes && <p><strong>Notes:</strong> {payment.notes}</p>}
                                        
                                        {payment.type === 'Cheque' && (
                                            <>
                                                <p><strong>Bank:</strong> {payment.bank_name}</p>
                                                <p><strong>Cheque No:</strong> {payment.cheque_no}</p>
                                                <p><strong>Realized Date:</strong> {formatDate(payment.realized_date)}</p>
                                            </>
                                        )}
                                        
                                        {payment.type === 'Bank Transfer' && (
                                            <>
                                                <p><strong>Bank:</strong> {payment.bank_name}</p>
                                                <p><strong>Reference No:</strong> {payment.transfer_reference_no}</p>
                                                <p><strong>Transfer Date:</strong> {formatDate(payment.transfer_date)}</p>
                                                {payment.transfer_notes && <p><strong>Notes:</strong> {payment.transfer_notes}</p>}
                                            </>
                                        )}
                                        
                                        {payment.type === 'bag_to_box' && (
                                            <>
                                                <p><strong>Bags:</strong> {payment.bag_count || 0} × Rs. {parseFloat(payment.bag_value || 0).toLocaleString()}</p>
                                                <p><strong>Boxes:</strong> {payment.box_count || 0} × Rs. {parseFloat(payment.box_value || 0).toLocaleString()}</p>
                                                <p><strong>Adjustment:</strong> Rs. {parseFloat(payment.adjustment_amount || 0).toLocaleString()}</p>
                                            </>
                                        )}
                                        
                                        {payment.type === 'bill_to_bill' && (
                                            <>
                                                <p><strong>Target Customer:</strong> {payment.target_customer_code}</p>
                                                <p><strong>Target Bill:</strong> {payment.target_bill_no} (Rs. {parseFloat(payment.target_bill_value || 0).toLocaleString()})</p>
                                                <p><strong>Target Supplier:</strong> {payment.target_supplier_code}</p>
                                                <p><strong>Target Supplier Bill:</strong> {payment.target_supplier_bill_no} (Rs. {parseFloat(payment.target_supplier_bill_value || 0).toLocaleString()})</p>
                                            </>
                                        )}
                                        
                                        {payment.type === 'bad_debt' && (
                                            <>
                                                <p><strong>Debt Name:</strong> {payment.bad_debt_name}</p>
                                                <p><strong>Debt Amount:</strong> Rs. {parseFloat(payment.bad_debt_amount || 0).toLocaleString()}</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const styles = {
        container: {
            width: '100vw',
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            margin: 0,
            padding: 0,
            overflowX: 'hidden'
        },
        wrapper: { width: '100%', padding: '24px', boxSizing: 'border-box' },
        header: { marginBottom: '24px' },
        title: { fontSize: '28px', fontWeight: '700', color: '#ffffff', marginBottom: '8px', textShadow: '0 2px 4px rgba(0,0,0,0.1)' },
        subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: '14px' },
        autoRefreshBadge: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: 'white', backdropFilter: 'blur(10px)' },
        filterBar: { background: 'rgba(255,255,255,0.95)', borderRadius: '12px', padding: '16px', marginBottom: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
        filterGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
        filterLabel: { fontSize: '12px', fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' },
        filterInput: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none' },
        searchBox: { flex: 1, minWidth: '250px' },
        searchInput: { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none' },
        buttonGroup: { display: 'flex', gap: '10px' },
        actionButton: { padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '500' },
        filterButton: { padding: '8px 20px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' },
        clearButton: { padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' },
        mullPituwaButton: { 
            padding: '8px 20px', 
            background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
        statCard: { background: 'rgba(255,255,255,0.95)', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderLeft: '4px solid', transition: 'transform 0.2s', cursor: 'pointer' },
        statLabel: { fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' },
        statValue: { fontSize: '24px', fontWeight: '700', color: '#0f172a' },
        tableContainer: { background: 'rgba(255,255,255,0.95)', borderRadius: '16px', overflow: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', maxHeight: 'calc(100vh - 380px)' },
        table: { width: '100%', borderCollapse: 'collapse', minWidth: '1200px' },
        th: { textAlign: 'left', padding: '14px 16px', background: '#f8fafc', fontWeight: '600', fontSize: '13px', color: '#475569', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 1 },
        td: { padding: '12px 16px', fontSize: '14px', color: '#334155', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
        totalsRow: { background: '#f8fafc', fontWeight: '700', borderTop: '2px solid #e2e8f0', position: 'sticky', bottom: 0 },
        footerCard: { marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.95)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
        liveIndicator: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#10b981', fontWeight: '500' },
        liveDot: { width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%', animation: 'pulse 1.5s ease-in-out infinite' }
    };

    const modalOverlay = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        overflowY: 'auto'
    };

    const modalContent = {
        backgroundColor: 'white',
        borderRadius: '20px',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '85vh',
        overflowY: 'auto',
        position: 'relative'
    };

    const modalHeader = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 24px',
        borderBottom: '2px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        backgroundColor: 'white',
        zIndex: 1
    };

    const modalTitle = { margin: 0, fontSize: '24px', color: '#1e293b' };
    const modalClose = { background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#64748b' };
    const modalBody = { padding: '24px' };
    
    const paymentDetailCard = {
        background: '#f8fafc',
        borderRadius: '12px',
        marginBottom: '16px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
    };
    
    const paymentDetailHeader = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        background: 'white',
        borderBottom: '1px solid #e2e8f0'
    };
    
    const paymentIcon = { fontSize: '24px' };
    const paymentMethodBadge = { background: '#667eea', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' };
    const paymentAmount = { marginLeft: 'auto', fontSize: '20px', fontWeight: '700', color: '#10b981' };
    const paymentDetailBody = { padding: '16px' };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                    <div style={{ width: '50px', height: '50px', border: '4px solid rgba(255,255,255,0.3)', borderTop: '4px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                </div>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } }`}</style>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.wrapper}>
                <div style={styles.header}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <h1 style={styles.title}>💰 Payment Collection Report</h1>
                            <p style={styles.subtitle}>Complete payment summary from supplier loans</p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            {/* Mull Pituwa Button */}
                            <button 
                                style={styles.mullPituwaButton}
                                onClick={handleMullPituwa}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                🏠 මුල් පිටුව
                            </button>
                            <div style={styles.autoRefreshBadge}>
                                <span>🔄</span>
                                <span>Auto-refresh every 5s</span>
                                <div style={styles.liveDot}></div>
                            </div>
                            <div style={styles.buttonGroup}>
                                <button style={styles.actionButton} onClick={exportToCSV}>📥 Export CSV</button>
                                <button style={styles.actionButton} onClick={printReport}>🖨️ Print</button>
                                <button style={styles.actionButton} onClick={() => fetchReport(true)}>🔄 Refresh</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={styles.filterBar}>
                    <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>Start Date</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.filterInput} />
                    </div>
                    <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>End Date</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.filterInput} />
                    </div>
                    <div style={styles.searchBox}>
                        <label style={styles.filterLabel}>🔍 Search</label>
                        <input type="text" placeholder="Search by bill no, supplier code or name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.searchInput} />
                    </div>
                    <button style={styles.filterButton} onClick={handleFilter}>Apply Filters</button>
                    {(startDate || endDate || searchTerm) && (
                        <button style={styles.clearButton} onClick={clearFilters}>Clear All</button>
                    )}
                </div>

                <div style={styles.statsRow}>
                    {[
                        { label: '💰 Cash Collection', value: totals.cash_collection, color: '#10b981' },
                        { label: '💳 Cheques Collection', value: totals.cheques_collection, color: '#8b5cf6' },
                        { label: '📦 Bag/Box Total', value: totals.bag_box_total, color: '#f59e0b', sub: `Bags: ${formatNumber(totals.bag_total)} | Boxes: ${formatNumber(totals.box_total)}` },
                        { label: '🏦 Bank Transfer', value: totals.banks_transfer, color: '#ec489a' },
                        { label: '⚠️ Bad Debt', value: totals.bad_debt, color: '#ef4444' },
                        { label: '💵 Total Collection', value: totals.total_collection, color: '#06b6d4' }
                    ].map((stat, idx) => (
                        <div key={idx} style={{ ...styles.statCard, borderLeftColor: stat.color }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                            <div style={styles.statLabel}>{stat.label}</div>
                            <div style={styles.statValue}>{formatCurrency(stat.value)}</div>
                            {stat.sub && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>{stat.sub}</div>}
                        </div>
                    ))}
                </div>

                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th} onClick={() => handleSort('customer_bill_no')}>Bill No {getSortIcon('customer_bill_no')}</th>
                                <th style={styles.th} onClick={() => handleSort('supplier_code')}>Supplier {getSortIcon('supplier_code')}</th>
                                <th style={styles.th} onClick={() => handleSort('date')}>Date {getSortIcon('date')}</th>
                                <th style={styles.th} onClick={() => handleSort('cash_collection')}>Cash {getSortIcon('cash_collection')}</th>
                                <th style={styles.th} onClick={() => handleSort('cheques_collection')}>Cheques {getSortIcon('cheques_collection')}</th>
                                <th style={styles.th} onClick={() => handleSort('bag_box_total')}>Bag/Box {getSortIcon('bag_box_total')}</th>
                                <th style={styles.th} onClick={() => handleSort('banks_transfer')}>Bank Transfer {getSortIcon('banks_transfer')}</th>
                                <th style={styles.th} onClick={() => handleSort('bad_debt')}>Bad Debt {getSortIcon('bad_debt')}</th>
                                <th style={styles.th} onClick={() => handleSort('total_paid')}>Total {getSortIcon('total_paid')}</th>
                                <th style={styles.th}>Methods</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedData.length === 0 ? (
                                <tr><td colSpan="10" style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>📊 No data available</td></tr>
                            ) : (
                                filteredAndSortedData.map((row, idx) => (
                                    <tr key={idx} onClick={() => fetchPaymentDetails(row.bill_no, row.supplier_code)} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                        <td style={styles.td}><strong>{row.customer_bill_no || 'N/A'}</strong></td>
                                        <td style={styles.td}>{row.supplier_code || 'N/A'}<br/><small>{row.supplier_name || ''}</small></td>
                                        <td style={styles.td}>{formatDate(row.date)}</td>
                                        <td style={{ ...styles.td, color: '#10b981', fontWeight: '500' }}>{formatCurrency(row.cash_collection)}</td>
                                        <td style={{ ...styles.td, color: '#8b5cf6', fontWeight: '500' }}>{formatCurrency(row.cheques_collection)}</td>
                                        <td style={{ ...styles.td, color: '#f59e0b', fontWeight: '500' }}>{formatCurrency(row.bag_box_total)}</td>
                                        <td style={{ ...styles.td, color: '#ec489a', fontWeight: '500' }}>{formatCurrency(row.banks_transfer)}</td>
                                        <td style={{ ...styles.td, color: '#ef4444', fontWeight: '500' }}>{formatCurrency(row.bad_debt)}</td>
                                        <td style={{ ...styles.td, fontWeight: '700' }}>{formatCurrency(row.total_paid)}</td>
                                        <td style={styles.td}>{getPaymentMethodBadge(row.payment_methods)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot>
                            <tr style={styles.totalsRow}>
                                <td style={styles.td}><strong>Total ({filteredAndSortedData.length})</strong></td>
                                <td style={styles.td}></td>
                                <td style={styles.td}></td>
                                <td style={styles.td}><strong>{formatCurrency(totals.cash_collection)}</strong></td>
                                <td style={styles.td}><strong>{formatCurrency(totals.cheques_collection)}</strong></td>
                                <td style={styles.td}><strong>{formatCurrency(totals.bag_box_total)}</strong></td>
                                <td style={styles.td}><strong>{formatCurrency(totals.banks_transfer)}</strong></td>
                                <td style={styles.td}><strong>{formatCurrency(totals.bad_debt)}</strong></td>
                                <td style={styles.td}><strong>{formatCurrency(totals.total_collection)}</strong></td>
                                <td style={styles.td}></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style={styles.footerCard}>
                    <div><span style={{ fontSize: '13px', color: '#64748b' }}>Showing {filteredAndSortedData.length} of {reportData.length} records</span></div>
                    <div style={styles.liveIndicator}><div style={styles.liveDot}></div><span>Live auto-refresh every 5 seconds</span><span style={{ fontSize: '11px', color: '#94a3b8' }}>(Last updated: {lastUpdated.toLocaleTimeString()})</span></div>
                </div>
            </div>
            <PaymentDetailsModal />
        </div>
    );
};

export default PaymentCollectionReport2;