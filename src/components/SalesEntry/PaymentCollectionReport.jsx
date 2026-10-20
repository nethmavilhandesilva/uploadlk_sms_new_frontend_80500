import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const PaymentCollectionReport = () => {
    const navigate = useNavigate();
    
    const [reportData, setReportData] = useState([]);
    const [totals, setTotals] = useState({
        cash_collection: 0,
        cheques_collection: 0,
        bag_box_total: 0,
        bag_total: 0,
        box_total: 0,
        banks_transfer: 0,
        bad_debt: 0
    });
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'customer_bill_no', direction: 'asc' });
    const [selectedRow, setSelectedRow] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const intervalRef = useRef(null);

    // Navigate to Bank Statement
    const handleBankStatement = () => {
        navigate('/bank-dashboard');
    };

    const fetchReport = async (showLoading = true) => {
        if (showLoading) {
            setLoading(true);
        }
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            
            const response = await api.get('/payment-collection-report', { params });
            
            if (response.data.success) {
                setReportData(response.data.data);
                setTotals(response.data.totals);
                setLastUpdated(new Date());
            } else if (showLoading) {
                alert('Failed to load report');
            }
        } catch (error) {
            console.error('Error fetching report:', error);
            if (showLoading) {
                alert('Error loading payment collection report');
            }
        } finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchReport(true);
        
        // Set up auto-refresh every 3 seconds
        intervalRef.current = setInterval(() => {
            fetchReport(false); // Silent refresh - no loading indicator
        }, 3000);
        
        // Cleanup interval on component unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    // Re-fetch when date filters change (but don't interfere with auto-refresh)
    const handleFilter = () => {
        // Clear the existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        // Fetch with new filters
        fetchReport(true);
        // Restart the interval
        intervalRef.current = setInterval(() => {
            fetchReport(false);
        }, 3000);
    };

    const clearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
        
        // Clear the existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        // Fetch with cleared filters
        setTimeout(() => fetchReport(true), 100);
        // Restart the interval
        intervalRef.current = setInterval(() => {
            fetchReport(false);
        }, 3000);
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
                row.customer_bill_no.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        filtered.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            
            if (['cash_collection', 'cheques_collection', 'bag_box_total', 'bag_total', 'box_total', 'banks_transfer', 'bad_debt'].includes(sortConfig.key)) {
                aVal = Number(aVal) || 0;
                bVal = Number(bVal) || 0;
            } else {
                aVal = String(aVal).toLowerCase();
                bVal = String(bVal).toLowerCase();
            }
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return filtered;
    }, [reportData, searchTerm, sortConfig]);

    const handleRowClick = (row) => {
        setSelectedRow(selectedRow?.customer_bill_no === row.customer_bill_no ? null : row);
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return '↕️';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatNumber = (num) => {
        return (num || 0).toLocaleString();
    };

    const exportToCSV = () => {
        const headers = ['Customer/Bill No', 'Cash Collection', 'Cheques Collection', 'Bag Box Total', 'Bag Total', 'Box Total', 'Banks Transfer', 'Bad Debt'];
        const csvData = filteredAndSortedData.map(row => [
            row.customer_bill_no,
            row.cash_collection,
            row.cheques_collection,
            row.bag_box_total,
            row.bag_total,
            row.box_total,
            row.banks_transfer,
            row.bad_debt
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
        const printWindow = window.open('', '_blank', 'width=1200,height=800');
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
                        @media print {
                            body { margin: 0; }
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <h1>Payment Collection Report</h1>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                    ${startDate || endDate ? `<p>Date Range: ${startDate || 'Start'} to ${endDate || 'End'}</p>` : ''}
                    <table>
                        <thead>
                            <tr>
                                <th>Customer/Bill No</th>
                                <th>Cash Collection</th>
                                <th>Cheques Collection</th>
                                <th>Bag Box Total</th>
                                <th>Bag Total</th>
                                <th>Box Total</th>
                                <th>Banks Transfer</th>
                                <th>Bad Debt</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredAndSortedData.map(row => `
                                <tr>
                                    <td>${row.customer_bill_no}</td>
                                    <td>${formatCurrency(row.cash_collection)}</td>
                                    <td>${formatCurrency(row.cheques_collection)}</td>
                                    <td>${formatCurrency(row.bag_box_total)}</td>
                                    <td>${formatNumber(row.bag_total)}</td>
                                    <td>${formatNumber(row.box_total)}</td>
                                    <td>${formatCurrency(row.banks_transfer)}</td>
                                    <td>${formatCurrency(row.bad_debt)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td><strong>Total</strong></td>
                                <td><strong>${formatCurrency(totals.cash_collection)}</strong></td>
                                <td><strong>${formatCurrency(totals.cheques_collection)}</strong></td>
                                <td><strong>${formatCurrency(totals.bag_box_total)}</strong></td>
                                <td><strong>${formatNumber(totals.bag_total)}</strong></td>
                                <td><strong>${formatNumber(totals.box_total)}</strong></td>
                                <td><strong>${formatCurrency(totals.banks_transfer)}</strong></td>
                                <td><strong>${formatCurrency(totals.bad_debt)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="totals">
                        <p>Total Records: ${filteredAndSortedData.length}</p>
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    const manualRefresh = () => {
        // Clear interval temporarily
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        // Fetch fresh data
        fetchReport(true);
        // Restart interval
        intervalRef.current = setInterval(() => {
            fetchReport(false);
        }, 3000);
    };

    const statColors = {
        cash: '#10b981',
        cheque: '#8b5cf6',
        bagBox: '#f59e0b',
        bankTransfer: '#ec489a',
        badDebt: '#ef4444'
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
        wrapper: {
            width: '100%',
            padding: '24px',
            boxSizing: 'border-box'
        },
        header: {
            marginBottom: '24px'
        },
        title: {
            fontSize: '28px',
            fontWeight: '700',
            color: '#ffffff',
            marginBottom: '8px',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        subtitle: {
            color: 'rgba(255,255,255,0.9)',
            fontSize: '14px'
        },
        autoRefreshBadge: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.2)',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            color: 'white',
            backdropFilter: 'blur(10px)'
        },
        bankStatementBtn: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            padding: '8px 20px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '600',
            color: 'white',
            cursor: 'pointer',
            border: 'none',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        filterBar: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            display: 'flex',
            gap: '16px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
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
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
            background: 'white'
        },
        searchBox: {
            flex: 1,
            minWidth: '250px'
        },
        searchInput: {
            width: '100%',
            padding: '10px 14px',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
            background: 'white'
        },
        buttonGroup: {
            display: 'flex',
            gap: '10px',
            alignItems: 'center'
        },
        actionButton: {
            padding: '8px 16px',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: '500',
            transition: 'all 0.2s'
        },
        filterButton: {
            padding: '8px 20px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px',
            transition: 'all 0.2s'
        },
        clearButton: {
            padding: '8px 20px',
            background: '#f1f5f9',
            color: '#475569',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px',
            transition: 'all 0.2s'
        },
        statsRow: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
        },
        statCard: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            borderLeft: '4px solid',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)'
        },
        statLabel: {
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            marginBottom: '8px'
        },
        statValue: {
            fontSize: '28px',
            fontWeight: '700',
            color: '#0f172a'
        },
        tableContainer: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '16px',
            overflow: 'auto',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            maxHeight: 'calc(100vh - 350px)',
            backdropFilter: 'blur(10px)'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '1000px'
        },
        th: {
            textAlign: 'left',
            padding: '14px 16px',
            background: '#f8fafc',
            fontWeight: '600',
            fontSize: '13px',
            color: '#475569',
            borderBottom: '2px solid #e2e8f0',
            cursor: 'pointer',
            userSelect: 'none',
            position: 'sticky',
            top: 0,
            zIndex: 1
        },
        td: {
            padding: '12px 16px',
            fontSize: '14px',
            color: '#334155',
            borderBottom: '1px solid #f1f5f9',
            cursor: 'pointer',
            transition: 'background 0.2s'
        },
        totalsRow: {
            background: '#f8fafc',
            fontWeight: '700',
            borderTop: '2px solid #e2e8f0',
            position: 'sticky',
            bottom: 0
        },
        loadingContainer: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh'
        },
        loadingSpinner: {
            width: '50px',
            height: '50px',
            border: '4px solid rgba(255,255,255,0.3)',
            borderTop: '4px solid white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
        },
        footerCard: {
            marginTop: '20px',
            padding: '16px',
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            backdropFilter: 'blur(10px)'
        },
        liveIndicator: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#10b981',
            fontWeight: '500'
        },
        liveDot: {
            width: '8px',
            height: '8px',
            backgroundColor: '#10b981',
            borderRadius: '50%',
            animation: 'pulse 1.5s ease-in-out infinite'
        }
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner}></div>
                </div>
                <style>
                    {`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}
                </style>
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
                            <p style={styles.subtitle}>Comprehensive summary of all payment collections by bill</p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button
                                onClick={handleBankStatement}
                                style={styles.bankStatementBtn}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                }}
                            >
                                🏦 Bank Statement
                            </button>
                            <div style={styles.autoRefreshBadge}>
                                <span>🔄</span>
                                <span>Auto-refresh every 3s</span>
                                <div style={styles.liveDot}></div>
                            </div>
                            <div style={styles.buttonGroup}>
                                <button 
                                    style={styles.actionButton}
                                    onClick={exportToCSV}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                    📥 Export CSV
                                </button>
                                <button 
                                    style={styles.actionButton}
                                    onClick={printReport}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                    🖨️ Print
                                </button>
                                <button 
                                    style={styles.actionButton}
                                    onClick={manualRefresh}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                    🔄 Refresh Now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={styles.filterBar}>
                    <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={styles.filterInput}
                            onFocus={(e) => e.target.style.borderColor = '#667eea'}
                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>
                    <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={styles.filterInput}
                            onFocus={(e) => e.target.style.borderColor = '#667eea'}
                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>
                    <div style={styles.searchBox}>
                        <label style={styles.filterLabel}>🔍 Search Customer/Bill</label>
                        <input
                            type="text"
                            placeholder="Search by customer or bill number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={styles.searchInput}
                            onFocus={(e) => e.target.style.borderColor = '#667eea'}
                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>
                    <button 
                        style={styles.filterButton} 
                        onClick={handleFilter}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        Apply Filters
                    </button>
                    {(startDate || endDate || searchTerm) && (
                        <button 
                            style={styles.clearButton} 
                            onClick={clearFilters}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                        >
                            Clear All
                        </button>
                    )}
                </div>

                <div style={styles.statsRow}>
                    <div 
                        style={{ ...styles.statCard, borderLeftColor: statColors.cash }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 12px -3px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                    >
                        <div style={styles.statLabel}>💰 Cash Collection</div>
                        <div style={styles.statValue}>{formatCurrency(totals.cash_collection)}</div>
                    </div>
                    <div 
                        style={{ ...styles.statCard, borderLeftColor: statColors.cheque }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 12px -3px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                    >
                        <div style={styles.statLabel}>💳 Cheques Collection</div>
                        <div style={styles.statValue}>{formatCurrency(totals.cheques_collection)}</div>
                    </div>
                    <div 
                        style={{ ...styles.statCard, borderLeftColor: statColors.bagBox }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 12px -3px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                    >
                        <div style={styles.statLabel}>📦 Bag/Box Total</div>
                        <div style={styles.statValue}>{formatCurrency(totals.bag_box_total)}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                            🎒 Bags: {formatNumber(totals.bag_total)} | 📦 Boxes: {formatNumber(totals.box_total)}
                        </div>
                    </div>
                    <div 
                        style={{ ...styles.statCard, borderLeftColor: statColors.bankTransfer }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 12px -3px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                    >
                        <div style={styles.statLabel}>🏦 Bank Transfer</div>
                        <div style={styles.statValue}>{formatCurrency(totals.banks_transfer)}</div>
                    </div>
                    <div 
                        style={{ ...styles.statCard, borderLeftColor: statColors.badDebt }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 12px -3px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                    >
                        <div style={styles.statLabel}>⚠️ Bad Debt</div>
                        <div style={styles.statValue}>{formatCurrency(totals.bad_debt)}</div>
                    </div>
                </div>

                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th} onClick={() => handleSort('customer_bill_no')}>
                                    Customer/Bill No {getSortIcon('customer_bill_no')}
                                </th>
                                <th style={styles.th} onClick={() => handleSort('cash_collection')}>
                                    Cash Collection {getSortIcon('cash_collection')}
                                </th>
                                <th style={styles.th} onClick={() => handleSort('cheques_collection')}>
                                    Cheques Collection {getSortIcon('cheques_collection')}
                                </th>
                                <th style={styles.th} onClick={() => handleSort('bag_box_total')}>
                                    Bag Box Total {getSortIcon('bag_box_total')}
                                </th>
                                <th style={styles.th} onClick={() => handleSort('bag_total')}>
                                    Bag Total {getSortIcon('bag_total')}
                                </th>
                                <th style={styles.th} onClick={() => handleSort('box_total')}>
                                    Box Total {getSortIcon('box_total')}
                                </th>
                                <th style={styles.th} onClick={() => handleSort('banks_transfer')}>
                                    Banks Transfer {getSortIcon('banks_transfer')}
                                </th>
                                <th style={styles.th} onClick={() => handleSort('bad_debt')}>
                                    Bad Debt {getSortIcon('bad_debt')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedData.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                        📊 No data available
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedData.map((row, index) => (
                                    <tr 
                                        key={index}
                                        onClick={() => handleRowClick(row)}
                                        style={{ 
                                            background: selectedRow?.customer_bill_no === row.customer_bill_no ? '#eff6ff' : 'transparent',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (selectedRow?.customer_bill_no !== row.customer_bill_no) {
                                                e.currentTarget.style.background = '#f8fafc';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (selectedRow?.customer_bill_no !== row.customer_bill_no) {
                                                e.currentTarget.style.background = 'transparent';
                                            }
                                        }}
                                    >
                                        <td style={styles.td}>
                                            <strong>{row.customer_bill_no}</strong>
                                        </td>
                                        <td style={{ ...styles.td, color: '#10b981', fontWeight: '500' }}>
                                            {formatCurrency(row.cash_collection)}
                                        </td>
                                        <td style={{ ...styles.td, color: '#8b5cf6', fontWeight: '500' }}>
                                            {formatCurrency(row.cheques_collection)}
                                        </td>
                                        <td style={{ ...styles.td, color: '#f59e0b', fontWeight: '500' }}>
                                            {formatCurrency(row.bag_box_total)}
                                        </td>
                                        <td style={styles.td}>{formatNumber(row.bag_total)}</td>
                                        <td style={styles.td}>{formatNumber(row.box_total)}</td>
                                        <td style={{ ...styles.td, color: '#ec489a', fontWeight: '500' }}>
                                            {formatCurrency(row.banks_transfer)}
                                        </td>
                                        <td style={{ ...styles.td, color: '#ef4444', fontWeight: '500' }}>
                                            {formatCurrency(row.bad_debt)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredAndSortedData.length > 0 && (
                            <tfoot>
                                <tr style={styles.totalsRow}>
                                    <td style={styles.td}><strong>Total ({filteredAndSortedData.length} records)</strong></td>
                                    <td style={styles.td}><strong>{formatCurrency(totals.cash_collection)}</strong></td>
                                    <td style={styles.td}><strong>{formatCurrency(totals.cheques_collection)}</strong></td>
                                    <td style={styles.td}><strong>{formatCurrency(totals.bag_box_total)}</strong></td>
                                    <td style={styles.td}><strong>{formatNumber(totals.bag_total)}</strong></td>
                                    <td style={styles.td}><strong>{formatNumber(totals.box_total)}</strong></td>
                                    <td style={styles.td}><strong>{formatCurrency(totals.banks_transfer)}</strong></td>
                                    <td style={styles.td}><strong>{formatCurrency(totals.bad_debt)}</strong></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                <div style={styles.footerCard}>
                    <div>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>
                            Showing {filteredAndSortedData.length} of {reportData.length} records
                        </span>
                    </div>
                    <div style={styles.liveIndicator}>
                        <div style={styles.liveDot}></div>
                        <span>Live auto-refresh every 3 seconds</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            (Last updated: {lastUpdated.toLocaleTimeString()})
                        </span>
                    </div>
                </div>
            </div>

            <style>
                {`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    
                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.5; transform: scale(1.2); }
                    }
                    
                    ::-webkit-scrollbar {
                        width: 8px;
                        height: 8px;
                    }
                    
                    ::-webkit-scrollbar-track {
                        background: rgba(255,255,255,0.2);
                        border-radius: 4px;
                    }
                    
                    ::-webkit-scrollbar-thumb {
                        background: rgba(255,255,255,0.4);
                        border-radius: 4px;
                    }
                    
                    ::-webkit-scrollbar-thumb:hover {
                        background: rgba(255,255,255,0.6);
                    }
                `}
            </style>
        </div>
    );
};

export default PaymentCollectionReport;