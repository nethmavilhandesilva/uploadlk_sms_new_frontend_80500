import React, { useState, useEffect, useCallback } from 'react';
import api from "../../api";
import { useNavigate } from 'react-router-dom';

const SupplierLoanReport = () => {
    const navigate = useNavigate();
    const [loans, setLoans] = useState([]);
    const [summary, setSummary] = useState({ total_loan_balance: 0, total_paid: 0, count: 0 });
    const [isLoading, setIsLoading] = useState(true);
    
    // Filter States
    const [filters, setFilters] = useState({
        type: '', // Cash, Cheque
        status: '', // loan, not_loan
    });

    const fetchReport = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams(filters).toString();
            const response = await api.get(`/supplier-loans/report?${params}`);
            if (response.data.success) {
                setLoans(response.data.data);
                setSummary(response.data.summary);
            }
        } catch (error) {
            console.error("Error fetching report:", error);
        } finally {
            setIsLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <h1 style={{ margin: 0, fontSize: '24px' }}>ණය සහ ගෙවීම් වාර්තාව (Loan Report)</h1>
                <button onClick={() => navigate(-1)} style={backButtonStyle}>ආපසු (Back)</button>
            </div>

            {/* Summary Cards */}
            <div style={cardRowStyle}>
                <div style={{ ...cardStyle, borderLeft: '5px solid #00d2ff' }}>
                    <span style={cardLabelStyle}>මුළු ශේෂය (Total Balance)</span>
                    <span style={cardValueStyle}>රු. {summary.total_loan_balance.toLocaleString()}</span>
                </div>
                <div style={{ ...cardStyle, borderLeft: '5px solid #28a745' }}>
                    <span style={cardLabelStyle}>ගෙවූ මුළු මුදල (Total Paid)</span>
                    <span style={cardValueStyle}>රු. {summary.total_paid.toLocaleString()}</span>
                </div>
                <div style={{ ...cardStyle, borderLeft: '5px solid #ffc107' }}>
                    <span style={cardLabelStyle}>වාර්තා ගණන (Total Records)</span>
                    <span style={cardValueStyle}>{summary.count}</span>
                </div>
            </div>

            {/* Filter Bar */}
            <div style={filterBarStyle}>
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>ගෙවීම් ක්‍රමය (Type)</label>
                    <select name="type" onChange={handleFilterChange} style={selectStyle}>
                        <option value="">සියල්ල (All Types)</option>
                        <option value="Cash">මුදල් (Cash)</option>
                        <option value="Cheque">චෙක්පත් (Cheque)</option>
                    </select>
                </div>

                <div style={inputGroupStyle}>
                    <label style={labelStyle}>ණය තත්ත්වය (Status)</label>
                    <select name="status" onChange={handleFilterChange} style={selectStyle}>
                        <option value="">සියල්ල (All Status)</option>
                        <option value="loan">ණය සහිත (Loan Payments)</option>
                        <option value="not_loan">ණය රහිත (Fully Paid)</option>
                    </select>
                </div>
                
                <button onClick={() => window.print()} style={printButtonStyle}>බිල්පත මුද්‍රණය (Print)</button>
            </div>

            {/* Data Table */}
            <div style={tableContainerStyle}>
                {isLoading ? (
                    <div style={{ padding: '50px', textAlign: 'center' }}>වාර්තාව සකස් කරමින්...</div>
                ) : (
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={thStyle}>දිනය</th>
                                <th style={thStyle}>කේතය</th>
                                <th style={thStyle}>බිල් අංකය</th>
                                <th style={thStyle}>ක්‍රමය</th>
                                <th style={thStyle}>ගෙවූ මුදල</th>
                                <th style={thStyle}>ඉතිරි ණය</th>
                                <th style={thStyle}>බැංකුව / විස්තර</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.map((loan, index) => (
                                <tr key={loan.id} style={index % 2 === 0 ? rowEvenStyle : rowOddStyle}>
                                    <td style={tdStyle}>{new Date(loan.created_at).toLocaleDateString()}</td>
                                    <td style={tdStyle}><strong>{loan.code}</strong></td>
                                    <td style={tdStyle}>{loan.bill_no || 'N/A'}</td>
                                    <td style={tdStyle}>
                                        <span style={loan.type === 'Cash' ? cashBadge : chequeBadge}>
                                            {loan.type}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, color: '#28a745', fontWeight: 'bold' }}>{parseFloat(loan.loan_amount).toFixed(2)}</td>
                                    <td style={{ ...tdStyle, color: loan.total_amount > 0 ? '#ff4d4d' : '#00ff00', fontWeight: 'bold' }}>
                                        {parseFloat(loan.total_amount).toFixed(2)}
                                    </td>
                                    <td style={tdStyle}>
                                        {loan.type === 'Cheque' ? (
                                            <div style={{ fontSize: '12px' }}>
                                                {loan.bank_name} | {loan.cheque_no}<br/>
                                                <small>මාරු වන දිනය: {loan.realized_date}</small>
                                            </div>
                                        ) : (
                                            <small>{loan.notes || '-'}</small>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// Modern Styles
const containerStyle = { padding: '40px', backgroundColor: '#091d3d', minHeight: '100vh', color: '#fff', fontFamily: 'Roboto, Arial' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' };
const backButtonStyle = { padding: '10px 20px', backgroundColor: '#1E88E5', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const cardRowStyle = { display: 'flex', gap: '20px', marginBottom: '30px' };
const cardStyle = { flex: 1, backgroundColor: '#112240', padding: '20px', borderRadius: '10px', display: 'flex', flexDirection: 'column' };
const cardLabelStyle = { fontSize: '14px', color: '#8892b0', marginBottom: '10px' };
const cardValueStyle = { fontSize: '24px', fontWeight: 'bold' };
const filterBarStyle = { display: 'flex', gap: '20px', backgroundColor: '#112240', padding: '20px', borderRadius: '10px', marginBottom: '20px', alignItems: 'flex-end' };
const inputGroupStyle = { display: 'flex', flexDirection: 'column', gap: '5px' };
const labelStyle = { fontSize: '12px', color: '#ccd6f6' };
const selectStyle = { padding: '10px', borderRadius: '5px', border: '1px solid #233554', backgroundColor: '#0a192f', color: '#fff', minWidth: '180px' };
const printButtonStyle = { padding: '10px 20px', backgroundColor: '#28a745', border: 'none', color: 'white', borderRadius: '5px', cursor: 'pointer', marginLeft: 'auto' };
const tableContainerStyle = { backgroundColor: '#112240', borderRadius: '10px', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', textAlign: 'left' };
const thStyle = { padding: '15px', backgroundColor: '#233554', color: '#64ffda', fontSize: '14px' };
const tdStyle = { padding: '15px', borderBottom: '1px solid #233554' };
const rowEvenStyle = { backgroundColor: '#112240' };
const rowOddStyle = { backgroundColor: '#0d1b33' };
const cashBadge = { padding: '4px 8px', backgroundColor: '#28a74533', color: '#28a745', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' };
const chequeBadge = { padding: '4px 8px', backgroundColor: '#1E88E533', color: '#1E88E5', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' };

export default SupplierLoanReport;