import React, { useState, useEffect } from 'react';
import api from '../../api'; // Your centralized axios instance
import Sidebar from '../Sidebar'; // Adjust path if necessary

const LoanReportManager = () => {
    const [showModal, setShowModal] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Form States
    const [password, setPassword] = useState('');
    const [filters, setFilters] = useState({
        customer_short_name: '',
        start_date: '',
        end_date: ''
    });

    const correctPassword = 'nethma123';

    // 1. Fetch customers on mount
    useEffect(() => {
        const fetchCustomers = async () => {
            try {
                const response = await api.get('/customers'); 
                setCustomers(response.data);
            } catch (err) {
                console.error("Error fetching customers", err);
            }
        };
        fetchCustomers();
    }, []);

    const handleFetchReport = async (e) => {
        e.preventDefault();
        if (!filters.customer_short_name) return alert("කරුණාකර ගැනුම්කරු තෝරන්න");

        setLoading(true);
        try {
            const response = await api.post('/loan-report-results', filters);
            setReportData(response.data);
            setShowModal(false); 
        } catch (error) {
            console.error("Report fetch error:", error);
            alert("දත්ත ලබා ගැනීමේදී දෝෂයක් සිදු විය");
        } finally {
            setLoading(false);
        }
    };

    // Layout Style: Full page background with sidebar offset
    const pageWrapperStyle = {
        backgroundColor: '#99ff99',
        minHeight: '100vh',
        display: 'flex'
    };

    const mainContentStyle = {
        marginLeft: '260px', // Matches Sidebar width
        width: 'calc(100% - 260px)',
        padding: '0px', // We use 0 here to let the report spread fully if needed
        minHeight: '100vh',
    };

    return (
        <div style={pageWrapperStyle}>
            {/* --- LEFT SIDEBAR --- */}
            <div className="d-print-none">
                <Sidebar />
            </div>

            {/* --- RIGHT CONTENT AREA --- */}
            <div style={mainContentStyle} className="flex-grow-1">
                <div className="container-fluid py-4">
                    
                    {/* --- 1. THE TRIGGER BUTTON --- */}
                    <div className="d-print-none mb-4">
                        <button 
                            className="btn btn-dark shadow px-4 py-2 d-flex align-items-center fw-bold" 
                            onClick={() => setShowModal(true)}
                        >
                            <i className="material-icons me-2">assessment</i>
                            ණය වාර්තාව ලබාගන්න (Get Loan Report)
                        </button>
                    </div>

                    {/* --- 2. FILTER MODAL --- */}
                    {showModal && (
                        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000 }}>
                            <div className="modal-dialog modal-dialog-centered">
                                <div className="modal-content border-0 shadow-lg" style={{ backgroundColor: '#f0fff0' }}>
                                    <div className="modal-header border-0">
                                        <h5 className="modal-title fw-bold text-dark">📄 පාරිභෝගික ණය වාර්තාව</h5>
                                        <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                                    </div>
                                    <form onSubmit={handleFetchReport}>
                                        <div className="modal-body">
                                            <div className="mb-3">
                                                <label className="form-label fw-bold">මුරපදය (Password)</label>
                                                <input 
                                                    type="password" 
                                                    className="form-control" 
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                />
                                            </div>

                                            <div className="mb-3">
                                                <label className="form-label fw-bold">ගැනුම්කරු තෝරන්න</label>
                                                <select 
                                                    className="form-select"
                                                    value={filters.customer_short_name}
                                                    onChange={(e) => setFilters({...filters, customer_short_name: e.target.value})}
                                                >
                                                    <option value="">-- තෝරන්න --</option>
                                                    {customers.map(c => (
                                                        <option key={c.id} value={c.short_name}>{c.short_name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {password === correctPassword && (
                                                <div className="bg-light p-3 rounded shadow-sm border animate-in fade-in transition-all">
                                                    <div className="mb-3">
                                                        <label className="form-label small fw-bold text-muted">ආරම්භ දිනය</label>
                                                        <input type="date" className="form-control" onChange={(e) => setFilters({...filters, start_date: e.target.value})} />
                                                    </div>
                                                    <div className="mb-2">
                                                        <label className="form-label small fw-bold text-muted">අවසන් දිනය</label>
                                                        <input type="date" className="form-control" onChange={(e) => setFilters({...filters, end_date: e.target.value})} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="modal-footer border-0">
                                            <button type="submit" className="btn btn-primary w-100 fw-bold py-2 shadow" disabled={loading}>
                                                {loading ? "දත්ත ලබාගනිමින්..." : "වාර්තාව පෙන්වන්න"}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- 3. THE FULL SPREAD REPORT --- */}
                    {reportData && (
                        <div className="animate-in fade-in duration-500 pb-5">
                            <div className="d-flex justify-content-end mb-3 d-print-none px-2">
                                <button 
                                    className="btn btn-danger btn-sm rounded-pill px-4 shadow-sm fw-bold" 
                                    onClick={() => setReportData(null)}
                                >
                                    X වසන්න (Close)
                                </button>
                            </div>
                            <ReportContent data={reportData} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Report Table Component ---
const ReportContent = ({ data }) => {
    let runningBalance = 0;
    let receivedTotal = 0;
    let paidTotal = 0;

    return (
        <div className="card shadow-lg border-0 rounded-3 overflow-hidden w-100" style={{ backgroundColor: '#006400', color: 'white' }}>
            {/* Report Header */}
            <div className="p-4 border-bottom border-success border-opacity-25">
                <div className="d-flex justify-content-between align-items-center">
                    <div>
                        <h1 className="fw-bold mb-0 text-white letter-spacing-1">{data.companyName}</h1>
                        <h4 className="badge bg-success bg-opacity-75 text-uppercase p-2 mt-2">Loan Report</h4>
                    </div>
                    <div className="text-end">
                        <button className="btn btn-light btn-sm fw-bold d-print-none mb-2 shadow-sm" onClick={() => window.print()}>
                            🖨️ මුද්‍රණය (Print)
                        </button>
                        <p className="mb-0 fw-bold">{data.reportDate}</p>
                    </div>
                </div>
            </div>

            {/* Full Spread Table Area */}
            <div className="table-responsive bg-transparent p-0">
                <table className="table table-dark table-striped table-hover mb-0 align-middle w-100">
                    <thead>
                        <tr className="text-uppercase small">
                            <th className="bg-transparent border-bottom border-success py-3 px-4" style={{ width: '15%' }}>දිනය</th>
                            <th className="bg-transparent border-bottom border-success" style={{ width: '40%' }}>විස්තරය</th>
                            <th className="bg-transparent border-bottom border-success text-end px-3" style={{ width: '15%' }}>ලබීම්</th>
                            <th className="bg-transparent border-bottom border-success text-end px-3" style={{ width: '15%' }}>ගැනීම</th>
                            <th className="bg-transparent border-bottom border-success text-end text-warning px-4" style={{ width: '15%' }}>ශේෂය</th>
                        </tr>
                    </thead>
                    <tbody className="border-0">
                        {data.loans.map((loan, idx) => {
                            const received = loan.loan_type === 'old' ? parseFloat(loan.amount) : 0;
                            const paid = loan.loan_type === 'today' ? parseFloat(loan.amount) : 0;
                            receivedTotal += received;
                            paidTotal += paid;
                            runningBalance += (paid - received);

                            return (
                                <tr key={idx} className="border-0">
                                    <td className="bg-transparent border-bottom border-white border-opacity-10 py-3 px-4">{loan.Date}</td>
                                    <td className="bg-transparent border-bottom border-white border-opacity-10">{loan.description}</td>
                                    <td className="bg-transparent border-bottom border-white border-opacity-10 text-end px-3">
                                        {received > 0 ? received.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}
                                    </td>
                                    <td className="bg-transparent border-bottom border-white border-opacity-10 text-end px-3">
                                        {paid > 0 ? paid.toLocaleString(undefined, {minimumFractionDigits: 2}) : ''}
                                    </td>
                                    <td className="bg-transparent border-bottom border-white border-opacity-10 text-end fw-bold text-warning px-4">
                                        {/* Show absolute value (remove minus sign) */}
                                        {Math.abs(runningBalance).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="fw-bold" style={{ backgroundColor: '#004d00' }}>
                        <tr>
                            <td colSpan="2" className="text-end py-3 px-4">එකතුව (Totals):</td>
                            <td className="text-end px-3">{receivedTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="text-end px-3">{paidTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="text-end px-4 text-warning">
                                {/* Show absolute value of net balance */}
                                {Math.abs(paidTotal - receivedTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </td>
                        </tr>
                        <tr style={{ borderTop: '2px solid rgba(255,255,255,0.3)' }}>
                            <td colSpan="4" className="text-end py-3 px-4 text-uppercase">Net Balance (ශුද්ධ ශේෂය):</td>
                            <td className="text-end px-4 text-warning" style={{ fontSize: '1.25rem' }}>
                                {/* Show absolute value of net balance */}
                                {Math.abs(paidTotal - receivedTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default LoanReportManager;