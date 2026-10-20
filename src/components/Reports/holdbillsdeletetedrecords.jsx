import React, { useState, useEffect } from 'react';
import api from '../../api';

const HoldBillsDeletedRecords = () => {
  // State management
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: 20,
    total: 0,
    last_page: 1
  });
  
  // Filter states
  const [filters, setFilters] = useState({
    code: '',
    customer_code: '',
    supplier_code: '',
    date_from: '',
    date_to: '',
    search: '',
    sort_by: 'Date',
    sort_order: 'desc'
  });

  // Summary state
  const [summary, setSummary] = useState(null);

  // Fetch data from API
  const fetchData = async (page = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page,
        per_page: pagination.per_page,
        ...filters
      });

      for (let [key, value] of params.entries()) {
        if (value === '' || value === null || value === undefined) {
          params.delete(key);
        }
      }

      const response = await api.get(`/sales-adjustment2?${params.toString()}`);
      
      if (response.data.success) {
        const responseData = response.data.data;
        setData(responseData.data || []);
        setPagination({
          current_page: responseData.current_page || 1,
          per_page: responseData.per_page || 20,
          total: responseData.total || 0,
          last_page: responseData.last_page || 1
        });
      } else {
        setError('Failed to fetch data: ' + response.data.message);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.message || 'Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch summary data
  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams({
        date_from: filters.date_from,
        date_to: filters.date_to
      });

      const response = await api.get(`/sales-adjustment2/summary?${params.toString()}`);
      
      if (response.data.success) {
        setSummary(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  };

  // Initial data load
  useEffect(() => {
    fetchData();
    fetchSummary();
  }, []);

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Apply filters
  const applyFilters = () => {
    fetchData(1);
    fetchSummary();
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      code: '',
      customer_code: '',
      supplier_code: '',
      date_from: '',
      date_to: '',
      search: '',
      sort_by: 'Date',
      sort_order: 'desc'
    });
    setTimeout(() => {
      fetchData(1);
      fetchSummary();
    }, 100);
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.last_page) {
      fetchData(newPage);
    }
  };

  // Handle sort
  const handleSort = (field) => {
    const newOrder = filters.sort_by === field && filters.sort_order === 'asc' ? 'desc' : 'asc';
    setFilters(prev => ({
      ...prev,
      sort_by: field,
      sort_order: newOrder
    }));
    setTimeout(() => fetchData(1), 100);
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '0.00';
    return parseFloat(amount).toFixed(2);
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB');
  };

  // Get sort indicator
  const getSortIndicator = (field) => {
    if (filters.sort_by === field) {
      return filters.sort_order === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  return (
    <div className="hold-bills-container">
      {/* Page Header with Icon */}
      <div className="hold-bills-header">
        <div className="hold-bills-header-content">
          <div className="hold-bills-header-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <div>
            <h1 className="hold-bills-title">Hold Bills Deleted Records</h1>
            <p className="hold-bills-subtitle">View and manage deleted sales adjustment records</p>
          </div>
        </div>
        <div className="hold-bills-badge">
          <span className="hold-bills-badge-dot"></span>
          Live Data
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="hold-bills-summary-grid">
          <div className="hold-bills-summary-card hold-bills-summary-card-blue">
            <div className="hold-bills-summary-icon">📊</div>
            <div className="hold-bills-summary-content">
              <div className="hold-bills-summary-label">Total Records</div>
              <div className="hold-bills-summary-value">{summary.total_records || 0}</div>
            </div>
          </div>
          <div className="hold-bills-summary-card hold-bills-summary-card-green">
            <div className="hold-bills-summary-icon">⚖️</div>
            <div className="hold-bills-summary-content">
              <div className="hold-bills-summary-label">Total Weight (kg)</div>
              <div className="hold-bills-summary-value">{formatCurrency(summary.total_weight)}</div>
            </div>
          </div>
          <div className="hold-bills-summary-card hold-bills-summary-card-purple">
            <div className="hold-bills-summary-icon">💰</div>
            <div className="hold-bills-summary-content">
              <div className="hold-bills-summary-label">Total Amount</div>
              <div className="hold-bills-summary-value">LKR {formatCurrency(summary.total_amount)}</div>
            </div>
          </div>
          <div className="hold-bills-summary-card hold-bills-summary-card-orange">
            <div className="hold-bills-summary-icon">📦</div>
            <div className="hold-bills-summary-content">
              <div className="hold-bills-summary-label">Total Packs</div>
              <div className="hold-bills-summary-value">{summary.total_packs || 0}</div>
            </div>
          </div>
          <div className="hold-bills-summary-card hold-bills-summary-card-red">
            <div className="hold-bills-summary-icon">📈</div>
            <div className="hold-bills-summary-content">
              <div className="hold-bills-summary-label">Average Price/kg</div>
              <div className="hold-bills-summary-value">LKR {formatCurrency(summary.average_price)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="hold-bills-filters">
        <div className="hold-bills-filters-header">
          <span className="hold-bills-filters-title">🔍 Filter Records</span>
          <div className="hold-bills-filters-actions">
            <button className="hold-bills-btn hold-bills-btn-apply" onClick={applyFilters}>
              Apply Filters
            </button>
            <button className="hold-bills-btn hold-bills-btn-reset" onClick={resetFilters}>
              Reset All
            </button>
          </div>
        </div>
        <div className="hold-bills-filters-grid">
          <div className="hold-bills-filter-group">
            <label className="hold-bills-filter-label">Date From</label>
            <input
              type="date"
              name="date_from"
              value={filters.date_from}
              onChange={handleFilterChange}
              className="hold-bills-filter-input"
            />
          </div>
          <div className="hold-bills-filter-group">
            <label className="hold-bills-filter-label">Date To</label>
            <input
              type="date"
              name="date_to"
              value={filters.date_to}
              onChange={handleFilterChange}
              className="hold-bills-filter-input"
            />
          </div>
          <div className="hold-bills-filter-group">
            <label className="hold-bills-filter-label">Search</label>
            <input
              type="text"
              name="search"
              placeholder="Search by item or bill no..."
              value={filters.search}
              onChange={handleFilterChange}
              className="hold-bills-filter-input"
            />
          </div>
          <div className="hold-bills-filter-group">
            <label className="hold-bills-filter-label">Code</label>
            <input
              type="text"
              name="code"
              placeholder="Enter code..."
              value={filters.code}
              onChange={handleFilterChange}
              className="hold-bills-filter-input"
            />
          </div>
          <div className="hold-bills-filter-group">
            <label className="hold-bills-filter-label">Customer Code</label>
            <input
              type="text"
              name="customer_code"
              placeholder="Enter customer code..."
              value={filters.customer_code}
              onChange={handleFilterChange}
              className="hold-bills-filter-input"
            />
          </div>
          <div className="hold-bills-filter-group">
            <label className="hold-bills-filter-label">Supplier Code</label>
            <input
              type="text"
              name="supplier_code"
              placeholder="Enter supplier code..."
              value={filters.supplier_code}
              onChange={handleFilterChange}
              className="hold-bills-filter-input"
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="hold-bills-error">
          <span className="hold-bills-error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div className="hold-bills-loading">
          <div className="hold-bills-spinner"></div>
          <p>Loading records...</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          <div className="hold-bills-table-wrapper">
            <table className="hold-bills-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('id')} className="hold-bills-th">
                    ID{getSortIndicator('id')}
                  </th>
                  <th onClick={() => handleSort('Date')} className="hold-bills-th">
                    Date{getSortIndicator('Date')}
                  </th>
                  <th onClick={() => handleSort('code')} className="hold-bills-th">
                    Code{getSortIndicator('code')}
                  </th>
                  <th className="hold-bills-th">Customer Code</th>
                  <th className="hold-bills-th">Supplier Code</th>
                  <th onClick={() => handleSort('item_code')} className="hold-bills-th">
                    Item Code{getSortIndicator('item_code')}
                  </th>
                  <th className="hold-bills-th">Item Name</th>
                  <th onClick={() => handleSort('weight')} className="hold-bills-th hold-bills-th-right">
                    Weight (kg){getSortIndicator('weight')}
                  </th>
                  <th onClick={() => handleSort('price_per_kg')} className="hold-bills-th hold-bills-th-right">
                    Price/kg{getSortIndicator('price_per_kg')}
                  </th>
                  <th onClick={() => handleSort('total')} className="hold-bills-th hold-bills-th-right">
                    Total{getSortIndicator('total')}
                  </th>
                  <th className="hold-bills-th hold-bills-th-right">Packs</th>
                  <th className="hold-bills-th">Bill No</th>
                  <th className="hold-bills-th">Type</th>
                </tr>
              </thead>
              <tbody>
                {data.length > 0 ? (
                  data.map((record, index) => (
                    <tr key={record.id} className="hold-bills-tr">
                      <td className="hold-bills-td hold-bills-td-id">{record.id}</td>
                      <td className="hold-bills-td">{formatDate(record.Date)}</td>
                      <td className="hold-bills-td">
                        <span className="hold-bills-td-code">{record.code || '-'}</span>
                      </td>
                      <td className="hold-bills-td">{record.customer_code || '-'}</td>
                      <td className="hold-bills-td">{record.supplier_code || '-'}</td>
                      <td className="hold-bills-td">
                        <span className="hold-bills-td-item-code">{record.item_code || '-'}</span>
                      </td>
                      <td className="hold-bills-td hold-bills-td-item-name">{record.item_name || '-'}</td>
                      <td className="hold-bills-td hold-bills-td-right">{formatCurrency(record.weight)}</td>
                      <td className="hold-bills-td hold-bills-td-right">{formatCurrency(record.price_per_kg)}</td>
                      <td className="hold-bills-td hold-bills-td-right hold-bills-td-total">
                        LKR {formatCurrency(record.total)}
                      </td>
                      <td className="hold-bills-td hold-bills-td-right">{record.packs || 0}</td>
                      <td className="hold-bills-td">
                        <span className="hold-bills-td-bill">{record.bill_no || '-'}</span>
                      </td>
                      <td className="hold-bills-td">
                        <span className="hold-bills-td-type">{record.type || '-'}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="13" className="hold-bills-td hold-bills-td-no-data">
                      <div className="hold-bills-no-data">
                        <span className="hold-bills-no-data-icon">📭</span>
                        <p>No records found</p>
                        <span className="hold-bills-no-data-sub">Try adjusting your filters</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="hold-bills-pagination">
            <div className="hold-bills-pagination-info">
              Showing <strong>{data.length > 0 ? ((pagination.current_page - 1) * pagination.per_page) + 1 : 0}</strong> 
              to <strong>{Math.min(pagination.current_page * pagination.per_page, pagination.total)}</strong> 
              of <strong>{pagination.total}</strong> records
            </div>
            <div className="hold-bills-pagination-controls">
              <button
                onClick={() => handlePageChange(1)}
                disabled={pagination.current_page === 1}
                className="hold-bills-pagination-btn"
              >
                « First
              </button>
              <button
                onClick={() => handlePageChange(pagination.current_page - 1)}
                disabled={pagination.current_page === 1}
                className="hold-bills-pagination-btn"
              >
                ‹ Previous
              </button>
              <span className="hold-bills-pagination-current">
                Page {pagination.current_page} of {pagination.last_page}
              </span>
              <button
                onClick={() => handlePageChange(pagination.current_page + 1)}
                disabled={pagination.current_page === pagination.last_page}
                className="hold-bills-pagination-btn"
              >
                Next ›
              </button>
              <button
                onClick={() => handlePageChange(pagination.last_page)}
                disabled={pagination.current_page === pagination.last_page}
                className="hold-bills-pagination-btn"
              >
                Last »
              </button>
            </div>
          </div>
        </>
      )}

      {/* CSS Styles - Overrides app.css */}
      <style>{`
        /* Main Container */
        .hold-bills-container {
          all: initial;
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          padding: 24px;
          max-width: 100%;
          overflow-x: auto;
          background: #f0f2f5;
          min-height: 100vh;
          box-sizing: border-box;
        }

        .hold-bills-container * {
          box-sizing: border-box;
        }

        /* Header */
        .hold-bills-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 24px 32px;
          border-radius: 12px;
          margin-bottom: 24px;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
          flex-wrap: wrap;
          gap: 16px;
        }

        .hold-bills-header-content {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .hold-bills-header-icon {
          width: 48px;
          height: 48px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .hold-bills-title {
          color: white;
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .hold-bills-subtitle {
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          margin: 4px 0 0 0;
        }

        .hold-bills-badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 8px 16px;
          border-radius: 20px;
          color: white;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          backdrop-filter: blur(10px);
        }

        .hold-bills-badge-dot {
          width: 8px;
          height: 8px;
          background: #4ade80;
          border-radius: 50%;
          display: inline-block;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Summary Cards */
        .hold-bills-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .hold-bills-summary-card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: transform 0.2s, box-shadow 0.2s;
          border-left: 4px solid #667eea;
        }

        .hold-bills-summary-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }

        .hold-bills-summary-card-blue { border-left-color: #3b82f6; }
        .hold-bills-summary-card-green { border-left-color: #22c55e; }
        .hold-bills-summary-card-purple { border-left-color: #a855f7; }
        .hold-bills-summary-card-orange { border-left-color: #f59e0b; }
        .hold-bills-summary-card-red { border-left-color: #ef4444; }

        .hold-bills-summary-icon {
          font-size: 28px;
          width: 48px;
          height: 48px;
          background: #f8fafc;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hold-bills-summary-content {
          flex: 1;
        }

        .hold-bills-summary-label {
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .hold-bills-summary-value {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 2px;
        }

        /* Filters */
        .hold-bills-filters {
          background: white;
          padding: 20px;
          border-radius: 12px;
          margin-bottom: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .hold-bills-filters-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .hold-bills-filters-title {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
        }

        .hold-bills-filters-actions {
          display: flex;
          gap: 8px;
        }

        .hold-bills-filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .hold-bills-filter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .hold-bills-filter-label {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .hold-bills-filter-input {
          padding: 8px 12px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
          background: #f8fafc;
          color: #0f172a;
          width: 100%;
        }

        .hold-bills-filter-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          background: white;
        }

        .hold-bills-filter-input::placeholder {
          color: #94a3b8;
        }

        /* Buttons */
        .hold-bills-btn {
          padding: 8px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .hold-bills-btn-apply {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .hold-bills-btn-apply:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .hold-bills-btn-reset {
          background: #f1f5f9;
          color: #475569;
        }

        .hold-bills-btn-reset:hover {
          background: #e2e8f0;
        }

        /* Error */
        .hold-bills-error {
          background: #fef2f2;
          color: #dc2626;
          padding: 14px 18px;
          border-radius: 8px;
          margin-bottom: 16px;
          border: 1px solid #fecaca;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hold-bills-error-icon {
          font-size: 18px;
        }

        /* Loading */
        .hold-bills-loading {
          text-align: center;
          padding: 60px 20px;
          background: white;
          border-radius: 12px;
        }

        .hold-bills-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e2e8f0;
          border-top: 4px solid #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 12px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .hold-bills-loading p {
          color: #64748b;
          font-size: 14px;
          margin: 0;
        }

        /* Table */
        .hold-bills-table-wrapper {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          margin-bottom: 16px;
        }

        .hold-bills-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .hold-bills-th {
          background: #f8fafc;
          color: #475569;
          font-weight: 600;
          padding: 14px 12px;
          text-align: left;
          border-bottom: 2px solid #e2e8f0;
          cursor: pointer;
          white-space: nowrap;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: background 0.2s;
        }

        .hold-bills-th:hover {
          background: #f1f5f9;
        }

        .hold-bills-th-right {
          text-align: right;
        }

        .hold-bills-tr {
          transition: background 0.15s;
        }

        .hold-bills-tr:hover {
          background: #f8fafc;
        }

        .hold-bills-td {
          padding: 12px;
          border-bottom: 1px solid #f1f5f9;
          color: #0f172a;
          white-space: nowrap;
        }

        .hold-bills-td-id {
          font-weight: 600;
          color: #667eea;
        }

        .hold-bills-td-right {
          text-align: right;
        }

        .hold-bills-td-code {
          background: #f1f5f9;
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .hold-bills-td-item-code {
          background: #eef2ff;
          color: #4f46e5;
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .hold-bills-td-item-name {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .hold-bills-td-total {
          font-weight: 600;
          color: #059669;
        }

        .hold-bills-td-bill {
          background: #fef3c7;
          color: #92400e;
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .hold-bills-td-type {
          background: #e0e7ff;
          color: #3730a3;
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .hold-bills-td-no-data {
          text-align: center !important;
          padding: 40px 20px !important;
        }

        .hold-bills-no-data {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .hold-bills-no-data-icon {
          font-size: 48px;
        }

        .hold-bills-no-data p {
          font-size: 16px;
          font-weight: 600;
          color: #475569;
          margin: 8px 0 0 0;
        }

        .hold-bills-no-data-sub {
          font-size: 13px;
          color: #94a3b8;
        }

        /* Pagination */
        .hold-bills-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          padding: 8px 0;
        }

        .hold-bills-pagination-info {
          font-size: 14px;
          color: #64748b;
        }

        .hold-bills-pagination-info strong {
          color: #0f172a;
        }

        .hold-bills-pagination-controls {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
        }

        .hold-bills-pagination-btn {
          padding: 6px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: white;
          color: #475569;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .hold-bills-pagination-btn:hover:not(:disabled) {
          background: #667eea;
          color: white;
          border-color: #667eea;
        }

        .hold-bills-pagination-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .hold-bills-pagination-current {
          padding: 6px 14px;
          font-weight: 600;
          color: #0f172a;
          font-size: 14px;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .hold-bills-container {
            padding: 12px;
          }

          .hold-bills-header {
            padding: 16px 20px;
          }

          .hold-bills-title {
            font-size: 18px;
          }

          .hold-bills-summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }

          .hold-bills-filters-grid {
            grid-template-columns: 1fr;
          }

          .hold-bills-filters-header {
            flex-direction: column;
            align-items: stretch;
          }

          .hold-bills-filters-actions {
            flex-direction: column;
          }

          .hold-bills-filters-actions button {
            width: 100%;
          }

          .hold-bills-pagination {
            flex-direction: column;
            align-items: center;
          }

          .hold-bills-pagination-controls {
            justify-content: center;
          }

          .hold-bills-table {
            font-size: 12px;
          }

          .hold-bills-th,
          .hold-bills-td {
            padding: 8px 6px;
          }

          .hold-bills-td-item-name {
            max-width: 80px;
          }
        }

        /* Scrollbar Styling */
        .hold-bills-table-wrapper::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .hold-bills-table-wrapper::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }

        .hold-bills-table-wrapper::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }

        .hold-bills-table-wrapper::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default HoldBillsDeletedRecords;