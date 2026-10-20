import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';

// Material-UI Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TableRowsIcon from '@mui/icons-material/TableRows';
import GridViewIcon from '@mui/icons-material/GridView';

const AdvanceReport = () => {
    // State Management
    const [suppliers, setSuppliers] = useState([]);
    const [filteredSuppliers, setFilteredSuppliers] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'
    const [viewType, setViewType] = useState('table'); // 'table' or 'grid'
    
    const reportRef = useRef(null);

    // Fetch all suppliers on component mount
    useEffect(() => {
        fetchSuppliers();
    }, []);

    // Fetch suppliers from API - Only those with advance_amount > 0
    const fetchSuppliers = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/supplier-report-list');
            
            if (response.data.success) {
                // Filter only suppliers with advance_amount > 0
                const filtered = response.data.suppliers.filter(
                    supplier => supplier.advance_amount > 0
                );
                setSuppliers(filtered);
                setFilteredSuppliers(filtered);
            } else {
                setError('Failed to fetch suppliers');
            }
        } catch (err) {
            console.error('Error fetching suppliers:', err);
            setError(err.response?.data?.message || 'Error fetching suppliers. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch supplier report details
    const fetchSupplierReport = async (code) => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get(`/supplier-report-details/${code}`);
            
            if (response.data.success) {
                setReportData(response.data.data);
                setSelectedSupplier(response.data.data.supplier);
                setViewMode('detail');
            } else {
                setError('Failed to fetch supplier report');
            }
        } catch (err) {
            console.error('Error fetching supplier report:', err);
            setError(err.response?.data?.message || 'Error fetching supplier report. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle supplier selection
    const handleSelectSupplier = (code) => {
        fetchSupplierReport(code);
    };

    // Handle back to list
    const handleBackToList = () => {
        setViewMode('list');
        setSelectedSupplier(null);
        setReportData(null);
        setSearchTerm('');
    };

    // Handle search
    const handleSearch = (e) => {
        const term = e.target.value.toLowerCase();
        setSearchTerm(term);
        
        if (term.trim() === '') {
            setFilteredSuppliers(suppliers);
        } else {
            const filtered = suppliers.filter(supplier => 
                supplier.name?.toLowerCase().includes(term) ||
                supplier.code?.toLowerCase().includes(term) ||
                supplier.telephone_no?.includes(term)
            );
            setFilteredSuppliers(filtered);
        }
    };

    // Clear search
    const clearSearch = () => {
        setSearchTerm('');
        setFilteredSuppliers(suppliers);
    };

    // Format currency
    const formatCurrency = (amount) => {
        if (!amount) return 'LKR 0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'LKR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    };

    // Format date
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    // Handle print
    const handlePrint = () => {
        window.print();
    };

    // Get status badge
    const getStatusBadge = (jsonNote) => {
        if (jsonNote?.printed === 'Y') {
            return <span className="badge badge-success">✅ Printed</span>;
        }
        return <span className="badge badge-warning">⏳ Pending</span>;
    };

    // Toggle view type
    const toggleViewType = () => {
        setViewType(viewType === 'table' ? 'grid' : 'table');
    };

    // Loading component
    if (loading && viewMode === 'list') {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading suppliers with advance payments...</p>
            </div>
        );
    }

    // Error component
    if (error && viewMode === 'list') {
        return (
            <div className="error-container">
                <div className="error-icon">⚠️</div>
                <h3>Error Loading Suppliers</h3>
                <p>{error}</p>
                <button className="btn-primary" onClick={fetchSuppliers}>
                    Retry
                </button>
            </div>
        );
    }

    // Supplier List View - Table View
    if (viewMode === 'list' && viewType === 'table') {
        return (
            <div className="advance-report-container">
                <div className="report-header">
                    <h1 className="report-title">
                        <ReceiptIcon className="header-icon" />
                        Supplier Advance Report
                        <span className="report-badge">
                            {filteredSuppliers.length} Active
                        </span>
                    </h1>
                    <div className="header-actions">
                        <button className="btn-toggle" onClick={toggleViewType}>
                            <GridViewIcon /> Grid View
                        </button>
                        <button className="btn-print" onClick={handlePrint}>
                            <PrintIcon /> Print
                        </button>
                    </div>
                </div>

                <div className="search-section">
                    <div className="search-box">
                        <SearchIcon className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search by name, code, or phone number..."
                            value={searchTerm}
                            onChange={handleSearch}
                            className="search-input"
                        />
                        {searchTerm && (
                            <button className="clear-search" onClick={clearSearch}>
                                <ClearIcon />
                            </button>
                        )}
                    </div>
                    <div className="supplier-count">
                        {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''} with advance
                    </div>
                </div>

                {filteredSuppliers.length === 0 ? (
                    <div className="no-suppliers">
                        <div className="no-data-icon">🔍</div>
                        <h3>No Suppliers Found</h3>
                        <p>No suppliers with advance payments match your search criteria</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="supplier-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Telephone</th>
                                    <th>Advance Amount</th>
                                    <th>Latest Bill</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSuppliers.map((supplier, index) => (
                                    <tr key={supplier.code} className="supplier-row">
                                        <td>{index + 1}</td>
                                        <td>
                                            <span className="code-badge">{supplier.code}</span>
                                        </td>
                                        <td>
                                            <div className="supplier-name-cell">
                                                <PersonIcon className="cell-icon" />
                                                {supplier.name || 'Unnamed'}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="phone-cell">
                                                <PhoneIcon className="cell-icon-small" />
                                                {supplier.telephone_no || 'N/A'}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="advance-cell">
                                                {formatCurrency(supplier.advance_amount)}
                                            </span>
                                        </td>
                                        <td>
                                            {supplier.json_note?.bill_no ? (
                                                <span className="bill-number-cell">
                                                    {supplier.json_note.bill_no}
                                                </span>
                                            ) : (
                                                <span className="no-bill">No bill</span>
                                            )}
                                        </td>
                                        <td>
                                            {getStatusBadge(supplier.json_note)}
                                        </td>
                                        <td>
                                            <button 
                                                className="view-btn"
                                                onClick={() => handleSelectSupplier(supplier.code)}
                                            >
                                                <VisibilityIcon className="btn-icon" />
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // Supplier List View - Grid View
    if (viewMode === 'list' && viewType === 'grid') {
        return (
            <div className="advance-report-container">
                <div className="report-header">
                    <h1 className="report-title">
                        <ReceiptIcon className="header-icon" />
                        Supplier Advance Report
                        <span className="report-badge">
                            {filteredSuppliers.length} Active
                        </span>
                    </h1>
                    <div className="header-actions">
                        <button className="btn-toggle" onClick={toggleViewType}>
                            <TableRowsIcon /> Table View
                        </button>
                        <button className="btn-print" onClick={handlePrint}>
                            <PrintIcon /> Print
                        </button>
                    </div>
                </div>

                <div className="search-section">
                    <div className="search-box">
                        <SearchIcon className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search by name, code, or phone number..."
                            value={searchTerm}
                            onChange={handleSearch}
                            className="search-input"
                        />
                        {searchTerm && (
                            <button className="clear-search" onClick={clearSearch}>
                                <ClearIcon />
                            </button>
                        )}
                    </div>
                    <div className="supplier-count">
                        {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''} with advance
                    </div>
                </div>

                {filteredSuppliers.length === 0 ? (
                    <div className="no-suppliers">
                        <div className="no-data-icon">🔍</div>
                        <h3>No Suppliers Found</h3>
                        <p>No suppliers with advance payments match your search criteria</p>
                    </div>
                ) : (
                    <div className="supplier-grid">
                        {filteredSuppliers.map((supplier) => (
                            <div 
                                key={supplier.code} 
                                className="supplier-card"
                                onClick={() => handleSelectSupplier(supplier.code)}
                            >
                                <div className="card-header">
                                    <div className="supplier-avatar">
                                        <PersonIcon style={{ fontSize: 40 }} />
                                    </div>
                                    <div className="card-status">
                                        {getStatusBadge(supplier.json_note)}
                                    </div>
                                </div>
                                
                                <div className="card-body">
                                    <h3 className="supplier-name">{supplier.name || 'Unnamed Supplier'}</h3>
                                    <p className="supplier-code">Code: {supplier.code}</p>
                                    
                                    <div className="supplier-info">
                                        <div className="info-item">
                                            <PhoneIcon className="info-icon" />
                                            <span>{supplier.telephone_no || 'No phone'}</span>
                                        </div>
                                        <div className="info-item highlight">
                                            <AttachMoneyIcon className="info-icon" />
                                            <span className="advance-amount">
                                                {formatCurrency(supplier.advance_amount)}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {supplier.json_note?.bill_no && (
                                        <div className="bill-info">
                                            <span className="bill-label">Latest Bill:</span>
                                            <span className="bill-number">{supplier.json_note.bill_no}</span>
                                            {supplier.json_note.printed_at && (
                                                <span className="bill-date">
                                                    {formatDate(supplier.json_note.printed_at)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="card-footer">
                                    <button className="view-report-btn">
                                        View Report →
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Supplier Detail Report View
    if (viewMode === 'detail' && reportData) {
        const { supplier, json_note, bills, total_advance, bill_count } = reportData;

        return (
            <div className="advance-report-container" ref={reportRef}>
                <div className="detail-header">
                    <button className="back-button" onClick={handleBackToList}>
                        <ArrowBackIcon /> Back to List
                    </button>
                    <div className="header-actions">
                        <button className="btn-print" onClick={handlePrint}>
                            <PrintIcon /> Print
                        </button>
                        <button className="btn-download" onClick={handlePrint}>
                            <PictureAsPdfIcon /> Download PDF
                        </button>
                    </div>
                </div>

                {/* Supplier Info Card */}
                <div className="supplier-profile-card">
                    <div className="profile-header">
                        <div className="profile-avatar">
                            {supplier.profile_pic ? (
                                <img src={supplier.profile_pic} alt={supplier.name} />
                            ) : (
                                <PersonIcon style={{ fontSize: 60 }} />
                            )}
                        </div>
                        <div className="profile-info">
                            <h2>{supplier.name || 'Unnamed Supplier'}</h2>
                            <p className="profile-code">Code: {supplier.code}</p>
                            <div className="profile-status">
                                {getStatusBadge(json_note)}
                            </div>
                        </div>
                        <div className="profile-advance">
                            <div className="advance-total">
                                <span className="advance-label">Total Advance</span>
                                <span className="advance-amount-large">
                                    {formatCurrency(total_advance)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="profile-details">
                        <div className="detail-row">
                            <div className="detail-item">
                                <PhoneIcon className="detail-icon" />
                                <div>
                                    <label>Telephone</label>
                                    <p>{supplier.telephone_no || 'N/A'}</p>
                                </div>
                            </div>
                            <div className="detail-item">
                                <LocationOnIcon className="detail-icon" />
                                <div>
                                    <label>Address</label>
                                    <p>{supplier.address || 'N/A'}</p>
                                </div>
                            </div>
                            <div className="detail-item">
                                <CreditCardIcon className="detail-icon" />
                                <div>
                                    <label>Creditor</label>
                                    <p>{supplier.creditor === 'Y' ? 'Yes' : 'No'}</p>
                                </div>
                            </div>
                            {supplier.creditor_no && (
                                <div className="detail-item">
                                    <ReceiptIcon className="detail-icon" />
                                    <div>
                                        <label>Creditor Number</label>
                                        <p>{supplier.creditor_no}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* JSON Note Information */}
                    {json_note && Object.keys(json_note).length > 0 && (
                        <div className="json-note-section">
                            <h3>📋 Transaction Details</h3>
                            <div className="json-note-grid">
                                {json_note.printed === 'Y' && (
                                    <div className="note-item">
                                        <span className="note-label">Printed</span>
                                        <span className="note-value badge-success">Yes</span>
                                    </div>
                                )}
                                {json_note.bill_no && (
                                    <div className="note-item">
                                        <span className="note-label">Bill Number</span>
                                        <span className="note-value bill-number">{json_note.bill_no}</span>
                                    </div>
                                )}
                                {json_note.printed_at && (
                                    <div className="note-item">
                                        <span className="note-label">Printed At</span>
                                        <span className="note-value">{formatDate(json_note.printed_at)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bills History */}
                    <div className="bills-section">
                        <div className="bills-header">
                            <h3>📄 Bill History</h3>
                            <span className="bill-count">Total: {bill_count} bills</span>
                        </div>
                        
                        {bills && bills.length > 0 ? (
                            <div className="bills-table-container">
                                <table className="bills-table">
                                    <thead>
                                        <tr>
                                            <th>Bill No</th>
                                            <th>Advance Amount</th>
                                            <th>Created At</th>
                                            <th>Sales Items</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bills.map((bill, index) => (
                                            <tr key={index}>
                                                <td className="bill-no">{bill.bill_no}</td>
                                                <td className="amount">{formatCurrency(bill.advance_amount)}</td>
                                                <td>{formatDate(bill.created_at)}</td>
                                                <td>
                                                    {bill.sales_data && Array.isArray(bill.sales_data) ? (
                                                        <div className="sales-items">
                                                            {bill.sales_data.slice(0, 3).map((item, idx) => (
                                                                <span key={idx} className="sales-item">
                                                                    {item.item_name || item.name || 'Item'}
                                                                </span>
                                                            ))}
                                                            {bill.sales_data.length > 3 && (
                                                                <span className="more-items">
                                                                    +{bill.sales_data.length - 3} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="no-data">No items</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="no-bills">
                                <p>No bills found for this supplier</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Print Styles */}
                <style>{`
                    @media print {
                        .back-button, .btn-print, .btn-download, .header-actions, .btn-toggle {
                            display: none !important;
                        }
                        .advance-report-container {
                            padding: 0 !important;
                        }
                        .supplier-profile-card {
                            box-shadow: none !important;
                            border: 1px solid #ddd !important;
                        }
                        .search-section {
                            display: none !important;
                        }
                    }
                `}</style>
            </div>
        );
    }

    return null;
};

// ============================================
// STYLES - CSS in JS
// ============================================
const styles = `
    /* Main Container */
    .advance-report-container {
        padding: 24px;
        max-width: 1400px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        background: #f5f7fa;
        min-height: 100vh;
    }

    /* Header */
    .report-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        background: white;
        padding: 20px 24px;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        flex-wrap: wrap;
        gap: 12px;
    }

    .report-title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 28px;
        font-weight: 600;
        color: #1a2332;
        margin: 0;
        flex-wrap: wrap;
    }

    .report-badge {
        font-size: 14px;
        font-weight: 500;
        background: #e0e7ff;
        color: #4f6ef7;
        padding: 4px 12px;
        border-radius: 20px;
        margin-left: 8px;
    }

    .header-icon {
        color: #4f6ef7;
        font-size: 32px !important;
    }

    .header-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }

    .btn-print, .btn-download, .btn-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .btn-print {
        background: #4f6ef7;
        color: white;
    }

    .btn-print:hover {
        background: #3a56d4;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(79, 110, 247, 0.4);
    }

    .btn-download {
        background: #28a745;
        color: white;
    }

    .btn-download:hover {
        background: #218838;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
    }

    .btn-toggle {
        background: #6c757d;
        color: white;
    }

    .btn-toggle:hover {
        background: #5a6268;
        transform: translateY(-2px);
    }

    /* Search Section */
    .search-section {
        margin-bottom: 30px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
    }

    .search-box {
        flex: 1;
        min-width: 300px;
        display: flex;
        align-items: center;
        background: white;
        border-radius: 12px;
        padding: 0 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        transition: all 0.3s ease;
    }

    .search-box:focus-within {
        box-shadow: 0 4px 16px rgba(79, 110, 247, 0.15);
        transform: translateY(-2px);
    }

    .search-icon {
        color: #8896ab;
        margin-right: 12px;
    }

    .search-input {
        flex: 1;
        padding: 14px 0;
        border: none;
        outline: none;
        font-size: 15px;
        background: transparent;
        color: #1a2332;
    }

    .search-input::placeholder {
        color: #a0aec0;
    }

    .clear-search {
        background: none;
        border: none;
        color: #8896ab;
        cursor: pointer;
        padding: 8px;
        display: flex;
        align-items: center;
        transition: color 0.3s ease;
    }

    .clear-search:hover {
        color: #e53e3e;
    }

    .supplier-count {
        font-size: 14px;
        color: #718096;
        font-weight: 500;
        padding: 8px 16px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        white-space: nowrap;
    }

    /* Table View Styles */
    .table-container {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .supplier-table {
        width: 100%;
        border-collapse: collapse;
    }

    .supplier-table thead {
        background: #f8fafc;
    }

    .supplier-table th {
        padding: 16px 20px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 2px solid #e2e8f0;
    }

    .supplier-table td {
        padding: 14px 20px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 14px;
        color: #1a2332;
        vertical-align: middle;
    }

    .supplier-row {
        transition: background-color 0.2s ease;
        cursor: pointer;
    }

    .supplier-row:hover {
        background-color: #f8fafc;
    }

    .code-badge {
        display: inline-block;
        padding: 4px 10px;
        background: #e0e7ff;
        color: #4f6ef7;
        border-radius: 6px;
        font-weight: 600;
        font-size: 13px;
        font-family: monospace;
    }

    .supplier-name-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
    }

    .cell-icon {
        font-size: 18px !important;
        color: #64748b;
    }

    .cell-icon-small {
        font-size: 16px !important;
        color: #64748b;
        margin-right: 4px;
    }

    .phone-cell {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #475569;
    }

    .advance-cell {
        font-weight: 600;
        color: #4f6ef7;
    }

    .bill-number-cell {
        font-family: monospace;
        font-weight: 500;
        color: #1a2332;
        background: #f1f5f9;
        padding: 2px 8px;
        border-radius: 4px;
    }

    .no-bill {
        color: #94a3b8;
        font-style: italic;
        font-size: 13px;
    }

    .view-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        background: #4f6ef7;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .view-btn:hover {
        background: #3a56d4;
        transform: scale(1.05);
    }

    .btn-icon {
        font-size: 16px !important;
    }

    /* Grid View Styles (from original) */
    .supplier-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 24px;
    }

    .supplier-card {
        background: white;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        transition: all 0.3s ease;
        cursor: pointer;
        position: relative;
        overflow: hidden;
    }

    .supplier-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, #4f6ef7, #7c3aed);
        opacity: 0;
        transition: opacity 0.3s ease;
    }

    .supplier-card:hover {
        transform: translateY(-6px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }

    .supplier-card:hover::before {
        opacity: 1;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
    }

    .supplier-avatar {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #4f6ef7;
    }

    .card-status {
        display: flex;
        gap: 8px;
    }

    .badge {
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
    }

    .badge-success {
        background: #d4edda;
        color: #155724;
    }

    .badge-warning {
        background: #fff3cd;
        color: #856404;
    }

    .card-body {
        flex: 1;
    }

    .supplier-name {
        font-size: 18px;
        font-weight: 600;
        color: #1a2332;
        margin: 0 0 4px 0;
    }

    .supplier-code {
        font-size: 14px;
        color: #718096;
        margin: 0 0 12px 0;
    }

    .supplier-info {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
    }

    .info-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: #4a5568;
    }

    .info-item.highlight {
        background: #f0f4ff;
        padding: 6px 12px;
        border-radius: 8px;
    }

    .info-icon {
        font-size: 18px !important;
        color: #718096;
    }

    .advance-amount {
        font-weight: 600;
        color: #4f6ef7;
    }

    .bill-info {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: 8px 12px;
        background: #f7fafc;
        border-radius: 8px;
        font-size: 13px;
    }

    .bill-label {
        color: #718096;
        font-weight: 500;
    }

    .bill-number {
        font-weight: 600;
        color: #1a2332;
        font-family: monospace;
    }

    .bill-date {
        color: #718096;
        font-size: 12px;
    }

    .card-footer {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
    }

    .view-report-btn {
        width: 100%;
        padding: 10px;
        background: linear-gradient(135deg, #4f6ef7, #7c3aed);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .view-report-btn:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 12px rgba(79, 110, 247, 0.3);
    }

    /* No Data States */
    .no-suppliers, .no-bills {
        text-align: center;
        padding: 60px 20px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .no-data-icon {
        font-size: 64px;
        margin-bottom: 16px;
    }

    .no-suppliers h3, .no-bills p {
        color: #4a5568;
    }

    /* Loading & Error States */
    .loading-container, .error-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        background: white;
        border-radius: 12px;
        padding: 40px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .loading-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid #e2e8f0;
        border-top: 4px solid #4f6ef7;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .error-icon {
        font-size: 48px;
        margin-bottom: 16px;
    }

    .error-container h3 {
        color: #e53e3e;
        margin-bottom: 8px;
    }

    .error-container p {
        color: #718096;
        margin-bottom: 20px;
    }

    .btn-primary {
        padding: 10px 24px;
        background: #4f6ef7;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .btn-primary:hover {
        background: #3a56d4;
        transform: translateY(-2px);
    }

    /* Detail View Styles */
    .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 12px;
    }

    .back-button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        background: white;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #4a5568;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .back-button:hover {
        background: #f7fafc;
        border-color: #4f6ef7;
        color: #4f6ef7;
    }

    /* Supplier Profile Card */
    .supplier-profile-card {
        background: white;
        border-radius: 16px;
        padding: 32px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        margin-bottom: 24px;
    }

    .profile-header {
        display: flex;
        align-items: center;
        gap: 24px;
        flex-wrap: wrap;
        margin-bottom: 24px;
        padding-bottom: 24px;
        border-bottom: 2px solid #f7fafc;
    }

    .profile-avatar {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #4f6ef7;
        overflow: hidden;
    }

    .profile-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .profile-info {
        flex: 1;
    }

    .profile-info h2 {
        font-size: 24px;
        font-weight: 600;
        color: #1a2332;
        margin: 0 0 4px 0;
    }

    .profile-code {
        font-size: 15px;
        color: #718096;
        margin: 0 0 8px 0;
    }

    .profile-status {
        display: flex;
        gap: 8px;
    }

    .profile-advance {
        text-align: right;
    }

    .advance-total {
        background: linear-gradient(135deg, #f0f4ff, #e0e7ff);
        padding: 16px 24px;
        border-radius: 12px;
    }

    .advance-label {
        display: block;
        font-size: 14px;
        color: #4a5568;
        font-weight: 500;
    }

    .advance-amount-large {
        display: block;
        font-size: 28px;
        font-weight: 700;
        color: #4f6ef7;
    }

    .profile-details {
        margin-bottom: 24px;
    }

    .detail-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
    }

    .detail-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px;
        background: #f7fafc;
        border-radius: 8px;
    }

    .detail-icon {
        color: #4f6ef7;
        font-size: 24px !important;
        margin-top: 2px;
    }

    .detail-item label {
        display: block;
        font-size: 12px;
        color: #718096;
        font-weight: 500;
        margin-bottom: 2px;
    }

    .detail-item p {
        margin: 0;
        font-size: 14px;
        color: #1a2332;
        font-weight: 500;
    }

    /* JSON Note Section */
    .json-note-section {
        margin-bottom: 24px;
        padding: 20px;
        background: #f7fafc;
        border-radius: 12px;
    }

    .json-note-section h3 {
        margin: 0 0 16px 0;
        font-size: 18px;
        color: #1a2332;
    }

    .json-note-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
    }

    .note-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .note-label {
        font-size: 12px;
        color: #718096;
        font-weight: 500;
    }

    .note-value {
        font-size: 15px;
        font-weight: 600;
        color: #1a2332;
    }

    .note-value.bill-number {
        color: #4f6ef7;
        font-family: monospace;
    }

    .note-value.highlight {
        color: #4f6ef7;
    }

    /* Bills Section */
    .bills-section {
        margin-top: 16px;
    }

    .bills-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }

    .bills-header h3 {
        margin: 0;
        font-size: 18px;
        color: #1a2332;
    }

    .bill-count {
        font-size: 14px;
        color: #718096;
        background: #f7fafc;
        padding: 4px 12px;
        border-radius: 20px;
    }

    .bills-table-container {
        overflow-x: auto;
    }

    .bills-table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
    }

    .bills-table thead {
        background: #f7fafc;
    }

    .bills-table th {
        padding: 12px 16px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        color: #4a5568;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .bills-table td {
        padding: 12px 16px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 14px;
        color: #1a2332;
    }

    .bills-table tr:hover td {
        background: #f7fafc;
    }

    .bills-table .bill-no {
        font-weight: 600;
        color: #4f6ef7;
        font-family: monospace;
    }

    .bills-table .amount {
        font-weight: 600;
        color: #1a2332;
    }

    .sales-items {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .sales-item {
        background: #e2e8f0;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        color: #4a5568;
    }

    .more-items {
        font-size: 12px;
        color: #718096;
        font-weight: 500;
    }

    .no-data {
        color: #a0aec0;
        font-size: 13px;
    }

    /* Print Styles - Override */
    @media print {
        .advance-report-container {
            padding: 16px !important;
            background: white !important;
        }
        
        .supplier-card {
            break-inside: avoid;
            page-break-inside: avoid;
        }
        
        .supplier-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;
        }
        
        .supplier-row {
            break-inside: avoid;
        }
    }

    /* Responsive */
    @media (max-width: 768px) {
        .advance-report-container {
            padding: 12px;
        }
        
        .report-title {
            font-size: 20px;
        }
        
        .supplier-table th,
        .supplier-table td {
            padding: 10px 12px;
            font-size: 13px;
        }
        
        .header-actions {
            width: 100%;
            justify-content: flex-start;
        }
        
        .btn-print, .btn-download, .btn-toggle {
            padding: 8px 14px;
            font-size: 12px;
        }
        
        .search-box {
            min-width: 200px;
        }
    }
`;

// Inject styles into document head
if (typeof document !== 'undefined') {
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
}

export default AdvanceReport;