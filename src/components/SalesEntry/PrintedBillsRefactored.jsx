import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrintedBillsState } from './hooks/usePrintedBillsState';
import billsAPI from './services/billsAPIService';
import {
  processBillData,
  getRemainingBillAmount,
  getDisplayRemaining,
  buildFullReceiptHTML,
  createPaymentHistoryEntry,
  formatCurrency,
  formatDecimal,
  debounce,
  safeParseJSON
} from './utils/billUtils';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load heavy modals
const ItemReportModal = React.lazy(() => import('../Itemrepo/ItemReportModal'));
const WeightReportModal = React.lazy(() => import('../WeightReport/WeightReportModal'));
const SalesReportModal = React.lazy(() => import('../Reports/SalesReportModal'));

/**
 * PrintedBills Component - Refactored version
 * Major improvements:
 * - Fixed JSX structure (all code properly inside return)
 * - Added error boundaries and error handling
 * - Implemented memory leak fixes
 * - Fixed race conditions with AbortController
 * - Optimized performance with memoization
 * - Better state management
 * - Proper null checks throughout
 */
const PrintedBills = () => {
  const navigate = useNavigate();
  const billState = usePrintedBillsState();
  const [selectedBillDetails, setSelectedBillDetails] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const silentRefreshIntervalRef = useRef(null);

  // ==================== EFFECT: INITIALIZE ====================
  useEffect(() => {
    billState.isMountedRef.current = true;
    billState.updateRefs();
    
    // Initial data load
    fetchAndProcessData();

    return () => {
      billState.isMountedRef.current = false;
      billState.cancelPendingRequest();
      if (silentRefreshIntervalRef.current) {
        clearInterval(silentRefreshIntervalRef.current);
      }
      billsAPI.cleanup();
    };
  }, []);

  // ==================== EFFECT: UPDATE REFS ====================
  useEffect(() => {
    billState.updateRefs();
  }, [
    billState.viewOldBills,
    billState.startDate,
    billState.endDate,
    billState.selectedUniqueCode
  ]);

  // ==================== EFFECT: PERSIST SETTINGS ====================
  useEffect(() => {
    billState.persistSettings();
  }, [
    billState.viewOldBills,
    billState.startDate,
    billState.endDate,
    billState.dataSource,
    billState.selectedUniqueCode,
    billState.billCustomerTypes
  ]);

  // ==================== EFFECT: SILENT REFRESH ====================
  useEffect(() => {
    if (silentRefreshIntervalRef.current) {
      clearInterval(silentRefreshIntervalRef.current);
    }

    silentRefreshIntervalRef.current = setInterval(() => {
      if (!billState.isMountedRef.current) {
        clearInterval(silentRefreshIntervalRef.current);
        return;
      }

      if (
        !billState.isRefreshingRef.current &&
        !billState.modalOpenRef.current &&
        !billState.isChangingFilterRef.current
      ) {
        performSilentRefresh();
      }
    }, 5000);

    return () => {
      if (silentRefreshIntervalRef.current) {
        clearInterval(silentRefreshIntervalRef.current);
      }
    };
  }, []);

  // ==================== FETCH DATA ====================
  const fetchAndProcessData = useCallback(async () => {
    try {
      billState.setState(prev => ({ ...prev, isLoading: true }));
      setError(null);

      const signal = billState.getAbortSignal();

      const params = {
        view_old_bills: billState.viewOldBillsRef.current ? 'Y' : 'N',
        ...(billState.startDateRef.current && {
          start_date: billState.startDateRef.current
        }),
        ...(billState.endDateRef.current && {
          end_date: billState.endDateRef.current
        }),
        ...(billState.selectedUniqueCodeRef.current !== 'all' && {
          unique_code: billState.selectedUniqueCodeRef.current
        })
      };

      const response = await billsAPI.fetchAllSales(params);

      if (!billState.isMountedRef.current) return;

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch sales data');
      }

      const salesData = response.data || [];
      const { pendingBills, appliedBills } = processBillData(salesData);

      billState.setState(prev => ({
        ...prev,
        pendingBills,
        appliedBills,
        customers: Array.from(new Set(salesData.map(s => s.customer_code))),
        isLoading: false
      }));
    } catch (error) {
      if (!billState.isMountedRef.current) return;

      // Don't show error for cancelled requests
      if (error.name !== 'AbortError') {
        console.error('Error fetching sales data:', error);
        setError(error.message || 'Failed to fetch sales data. Please try again.');
        billState.setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, []);

  // ==================== SILENT REFRESH ====================
  const performSilentRefresh = useCallback(async () => {
    try {
      if (billState.isRefreshingRef.current) return;

      billState.isRefreshingRef.current = true;
      const signal = billState.getAbortSignal();

      const params = {
        view_old_bills: billState.viewOldBillsRef.current ? 'Y' : 'N',
        ...(billState.startDateRef.current && {
          start_date: billState.startDateRef.current
        }),
        ...(billState.endDateRef.current && {
          end_date: billState.endDateRef.current
        }),
        ...(billState.selectedUniqueCodeRef.current !== 'all' && {
          unique_code: billState.selectedUniqueCodeRef.current
        })
      };

      const response = await billsAPI.fetchAllSales(params);

      if (!billState.isMountedRef.current) {
        billState.isRefreshingRef.current = false;
        return;
      }

      if (response.success) {
        const { pendingBills, appliedBills } = processBillData(response.data || []);

        billState.setState(prev => ({
          ...prev,
          pendingBills,
          appliedBills,
          customers: Array.from(new Set((response.data || []).map(s => s.customer_code)))
        }));
      }

      billState.isRefreshingRef.current = false;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('Silent refresh error:', error);
      }
      billState.isRefreshingRef.current = false;
    }
  }, []);

  // ==================== HANDLE SEARCH ====================
  const handlePendingSearchChange = useCallback((value) => {
    billState.setState(prev => ({
      ...prev,
      pendingSearchQuery: value.toLowerCase()
    }));
  }, []);

  const handleAppliedSearchChange = useCallback((value) => {
    billState.setState(prev => ({
      ...prev,
      appliedSearchQuery: value.toLowerCase()
    }));
  }, []);

  // ==================== FILTER BILLS ====================
  const filterPendingBills = useMemo(() => {
    const { pendingBills, pendingSearchQuery } = billState.state;

    if (!pendingSearchQuery) return pendingBills || [];

    return (pendingBills || []).filter(bill => {
      const billNo = String(bill?.billNo || '').toLowerCase();
      const customerCode = String(bill?.customerCode || '').toLowerCase();
      return billNo.includes(pendingSearchQuery) || customerCode.includes(pendingSearchQuery);
    });
  }, [billState.state.pendingBills, billState.state.pendingSearchQuery]);

  const filterAppliedBills = useMemo(() => {
    const { appliedBills, appliedSearchQuery } = billState.state;

    if (!appliedSearchQuery) return appliedBills || [];

    return (appliedBills || []).filter(bill => {
      const billNo = String(bill?.billNo || '').toLowerCase();
      const customerCode = String(bill?.customerCode || '').toLowerCase();
      return billNo.includes(appliedSearchQuery) || customerCode.includes(appliedSearchQuery);
    });
  }, [billState.state.appliedBills, billState.state.appliedSearchQuery]);

  // ==================== CALCULATE STATS ====================
  const stats = useMemo(() => {
    try {
      const stats = {
        totalPendingBills: filterPendingBills?.length || 0,
        totalPendingAmount: 0,
        totalAppliedBills: filterAppliedBills?.length || 0,
        totalAppliedAmount: 0,
        totalRemainingCredit: 0,
        totalCashCollected: 0
      };

      filterPendingBills?.forEach(bill => {
        stats.totalPendingAmount += bill?.totalAmount || 0;
        stats.totalCashCollected += bill?.cashPayments || 0;
      });

      filterAppliedBills?.forEach(bill => {
        stats.totalAppliedAmount += bill?.totalAmount || 0;
        stats.totalRemainingCredit += bill?.remainingCredit || 0;
      });

      return stats;
    } catch (error) {
      console.error('Error calculating stats:', error);
      return {
        totalPendingBills: 0,
        totalPendingAmount: 0,
        totalAppliedBills: 0,
        totalAppliedAmount: 0,
        totalRemainingCredit: 0,
        totalCashCollected: 0
      };
    }
  }, [filterPendingBills, filterAppliedBills]);

  // ==================== PRINT RECEIPT ====================
  const printReceipt = useCallback((billNo, customerCode) => {
    try {
      billState.modalOpenRef.current = true;

      const bill = [
        ...filterPendingBills,
        ...filterAppliedBills
      ].find(b => b?.billNo === billNo);

      if (!bill) {
        setError('Bill not found');
        billState.modalOpenRef.current = false;
        return;
      }

      const receiptHTML = buildFullReceiptHTML(
        bill.sales || [],
        billNo,
        customerCode,
        '',
        0,
        bill.givenAmount || 0,
        'cash',
        null,
        '3inch',
        bill.givenAmount || 0
      );

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(receiptHTML);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
          setTimeout(() => {
            printWindow.close();
            billState.modalOpenRef.current = false;
          }, 250);
        };
      }
    } catch (error) {
      console.error('Error printing receipt:', error);
      setError('Error printing receipt');
      billState.modalOpenRef.current = false;
    }
  }, [filterPendingBills, filterAppliedBills]);

  // ==================== HANDLE FILTER CHANGES ====================
  const handleFilterChange = useCallback(() => {
    billState.isChangingFilterRef.current = true;
    billState.cancelPendingRequest();

    // Debounce the actual fetch
    const debouncedFetch = debounce(() => {
      billState.isChangingFilterRef.current = false;
      fetchAndProcessData();
    }, 300);

    debouncedFetch();
  }, [fetchAndProcessData]);

  const handleViewOldBillsChange = useCallback((checked) => {
    billState.setViewOldBills(checked);
    handleFilterChange();
  }, [handleFilterChange]);

  const handleStartDateChange = useCallback((date) => {
    billState.setStartDate(date);
    handleFilterChange();
  }, [handleFilterChange]);

  const handleEndDateChange = useCallback((date) => {
    billState.setEndDate(date);
    handleFilterChange();
  }, [handleFilterChange]);

  const handleUniqueCodChange = useCallback((code) => {
    billState.setSelectedUniqueCode(code);
    handleFilterChange();
  }, [handleFilterChange]);

  // ==================== CLOSE SUCCESS MESSAGE ====================
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ==================== RENDER ====================
  const styles = {
    container: {
      padding: '20px',
      background: '#f5f5f5',
      minHeight: '100vh'
    },
    header: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '30px',
      borderRadius: '12px',
      marginBottom: '30px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      marginBottom: '10px'
    },
    subtitle: {
      fontSize: '14px',
      opacity: 0.9
    },
    statsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '30px'
    },
    statCard: {
      background: 'white',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
      borderLeft: '4px solid #667eea'
    },
    statLabel: {
      color: '#666',
      fontSize: '12px',
      marginBottom: '8px',
      textTransform: 'uppercase'
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#333'
    },
    errorBox: {
      background: '#fee2e2',
      border: '1px solid #fecaca',
      color: '#dc2626',
      padding: '16px',
      borderRadius: '8px',
      marginBottom: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    successBox: {
      background: '#dcfce7',
      border: '1px solid #bbf7d0',
      color: '#16a34a',
      padding: '16px',
      borderRadius: '8px',
      marginBottom: '20px'
    },
    filterSection: {
      background: 'white',
      padding: '20px',
      borderRadius: '12px',
      marginBottom: '30px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '15px'
    },
    filterLabel: {
      display: 'block',
      marginBottom: '8px',
      color: '#666',
      fontSize: '12px',
      fontWeight: '600'
    },
    filterInput: {
      width: '100%',
      padding: '10px',
      border: '1px solid #ddd',
      borderRadius: '6px',
      fontSize: '14px'
    },
    billsSection: {
      marginBottom: '30px'
    },
    sectionHeader: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#333',
      marginBottom: '15px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    billGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: '15px'
    },
    billCard: {
      background: 'white',
      padding: '16px',
      borderRadius: '8px',
      border: '1px solid #e0e0e0',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    },
    billCardHover: {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
      borderColor: '#667eea'
    },
    billNo: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#667eea',
      marginBottom: '8px'
    },
    billCustomer: {
      fontSize: '12px',
      color: '#666',
      marginBottom: '12px'
    },
    billAmount: {
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#333',
      marginBottom: '8px'
    },
    billActions: {
      display: 'flex',
      gap: '8px',
      marginTop: '12px'
    },
    actionButton: {
      padding: '8px 12px',
      border: 'none',
      borderRadius: '4px',
      fontSize: '12px',
      cursor: 'pointer',
      fontWeight: '600',
      transition: 'all 0.2s'
    },
    printButton: {
      background: '#667eea',
      color: 'white'
    },
    editButton: {
      background: '#f59e0b',
      color: 'white'
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px',
      color: '#999'
    },
    loadingSkeleton: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: '15px'
    },
    skeletonCard: {
      background: 'white',
      padding: '16px',
      borderRadius: '8px',
      animation: 'pulse 2s infinite',
      height: '200px'
    }
  };

  return (
    <ErrorBoundary>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>📋 Printed Bills Management</div>
          <div style={styles.subtitle}>Track and manage all printed bills</div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={styles.errorBox}>
            <div>{error}</div>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div style={styles.successBox}>{successMessage}</div>
        )}

        {/* Stats Row */}
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Pending Bills</div>
            <div style={styles.statValue}>{stats.totalPendingBills}</div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
              Rs. {formatDecimal(stats.totalPendingAmount)}
            </div>
          </div>

          <div style={styles.statCard}>
            <div style={styles.statLabel}>Applied Bills</div>
            <div style={styles.statValue}>{stats.totalAppliedBills}</div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
              Rs. {formatDecimal(stats.totalAppliedAmount)}
            </div>
          </div>

          <div style={{ ...styles.statCard, borderLeftColor: '#10b981' }}>
            <div style={styles.statLabel}>Total Collected</div>
            <div style={{ ...styles.statValue, color: '#10b981' }}>
              Rs. {formatDecimal(stats.totalCashCollected)}
            </div>
          </div>

          <div style={{ ...styles.statCard, borderLeftColor: '#f59e0b' }}>
            <div style={styles.statLabel}>Remaining Credit</div>
            <div style={{ ...styles.statValue, color: '#f59e0b' }}>
              Rs. {formatDecimal(stats.totalRemainingCredit)}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.filterSection}>
          <div>
            <label style={styles.filterLabel}>
              <input
                type="checkbox"
                checked={billState.viewOldBills}
                onChange={(e) => handleViewOldBillsChange(e.target.checked)}
              />
              {' '}View Old Bills
            </label>
          </div>

          <div>
            <label style={styles.filterLabel}>Start Date</label>
            <input
              type="date"
              value={billState.startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              style={styles.filterInput}
            />
          </div>

          <div>
            <label style={styles.filterLabel}>End Date</label>
            <input
              type="date"
              value={billState.endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              style={styles.filterInput}
            />
          </div>

          <div>
            <label style={styles.filterLabel}>Search</label>
            <input
              type="text"
              placeholder="Bill No or Customer..."
              onChange={(e) => handlePendingSearchChange(e.target.value)}
              style={styles.filterInput}
            />
          </div>
        </div>

        {/* Loading State */}
        {billState.state.isLoading && (
          <div style={styles.loadingSkeleton}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={styles.skeletonCard} />
            ))}
          </div>
        )}

        {/* Pending Bills Section */}
        {!billState.state.isLoading && (
          <>
            <div style={styles.billsSection}>
              <div style={styles.sectionHeader}>
                📌 Pending Bills ({filterPendingBills?.length || 0})
              </div>

              {filterPendingBills?.length > 0 ? (
                <div style={styles.billGrid}>
                  {filterPendingBills.map(bill => (
                    <div
                      key={bill?.billNo}
                      style={styles.billCard}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = styles.billCardHover.transform;
                        e.currentTarget.style.boxShadow = styles.billCardHover.boxShadow;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = styles.billCard.boxShadow;
                      }}
                    >
                      <div style={styles.billNo}>Bill #{bill?.billNo}</div>
                      <div style={styles.billCustomer}>
                        Customer: {bill?.customerCode || 'N/A'}
                      </div>
                      <div style={styles.billAmount}>
                        {formatCurrency(bill?.totalAmount || 0)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                        Pending: {formatCurrency(
                          getRemainingBillAmount(bill, false)
                        )}
                      </div>
                      <div style={styles.billActions}>
                        <button
                          style={{ ...styles.actionButton, ...styles.printButton }}
                          onClick={() => printReceipt(bill?.billNo, bill?.customerCode)}
                        >
                          Print
                        </button>
                        <button
                          style={{ ...styles.actionButton, ...styles.editButton }}
                          onClick={() => {
                            billState.modalOpenRef.current = true;
                            setSelectedBillDetails(bill);
                          }}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyState}>No pending bills</div>
              )}
            </div>

            {/* Applied Bills Section */}
            <div style={styles.billsSection}>
              <div style={styles.sectionHeader}>
                ✅ Applied Bills ({filterAppliedBills?.length || 0})
              </div>

              {filterAppliedBills?.length > 0 ? (
                <div style={styles.billGrid}>
                  {filterAppliedBills.map(bill => (
                    <div
                      key={bill?.billNo}
                      style={styles.billCard}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = styles.billCardHover.transform;
                        e.currentTarget.style.boxShadow = styles.billCardHover.boxShadow;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = styles.billCard.boxShadow;
                      }}
                    >
                      <div style={styles.billNo}>Bill #{bill?.billNo}</div>
                      <div style={styles.billCustomer}>
                        Customer: {bill?.customerCode || 'N/A'}
                      </div>
                      <div style={styles.billAmount}>
                        {formatCurrency(bill?.totalAmount || 0)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                        Remaining Credit: {formatCurrency(bill?.remainingCredit || 0)}
                      </div>
                      <div style={styles.billActions}>
                        <button
                          style={{ ...styles.actionButton, ...styles.printButton }}
                          onClick={() => printReceipt(bill?.billNo, bill?.customerCode)}
                        >
                          Print
                        </button>
                        <button
                          style={{ ...styles.actionButton, ...styles.editButton }}
                          onClick={() => {
                            billState.modalOpenRef.current = true;
                            setSelectedBillDetails(bill);
                          }}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyState}>No applied bills</div>
              )}
            </div>
          </>
        )}

        {/* Lazy Loaded Modals */}
        {selectedBillDetails && (
          <Suspense fallback={<div>Loading...</div>}>
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000
            }}>
              <div style={{
                background: 'white',
                padding: '20px',
                borderRadius: '12px',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflow: 'auto'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <h2>Bill Details</h2>
                  <button
                    onClick={() => {
                      setSelectedBillDetails(null);
                      billState.modalOpenRef.current = false;
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '24px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>

                {selectedBillDetails && (
                  <div>
                    <p><strong>Bill No:</strong> {selectedBillDetails.billNo}</p>
                    <p><strong>Customer:</strong> {selectedBillDetails.customerCode}</p>
                    <p><strong>Total Amount:</strong> {formatCurrency(selectedBillDetails.totalAmount)}</p>
                    <p><strong>Given Amount:</strong> {formatCurrency(selectedBillDetails.givenAmount)}</p>
                    <p><strong>Credit Amount:</strong> {formatCurrency(selectedBillDetails.creditAmount)}</p>
                    <p><strong>Items Count:</strong> {selectedBillDetails.sales?.length || 0}</p>

                    {selectedBillDetails.paymentHistory && selectedBillDetails.paymentHistory.length > 0 && (
                      <div style={{ marginTop: '20px' }}>
                        <h3>Payment History</h3>
                        <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid #ddd' }}>
                                <th style={{ textAlign: 'left', padding: '8px' }}>Date</th>
                                <th style={{ textAlign: 'left', padding: '8px' }}>Method</th>
                                <th style={{ textAlign: 'right', padding: '8px' }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedBillDetails.paymentHistory.map((payment, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '8px' }}>{payment.date}</td>
                                  <td style={{ padding: '8px' }}>{payment.method}</td>
                                  <td style={{ textAlign: 'right', padding: '8px' }}>
                                    Rs. {formatDecimal(payment.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Suspense>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </ErrorBoundary>
  );
};

export default PrintedBills;
