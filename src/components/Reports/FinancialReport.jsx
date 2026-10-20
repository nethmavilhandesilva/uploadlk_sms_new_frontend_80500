import React, { useState, useEffect } from 'react';
import api from '../../api';
import Layout from '../Layout/Layout';
import './FinancialReport.css';

const FinancialReport = () => {
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [showProfit, setShowProfit] = useState(false);

    // State for financial report
    const [financialData, setFinancialData] = useState({
        totalDr: 0,
        totalCr: 0,
        salesTotal: 0,
        supplierTotalCost: 0,
        totalProfit: 0,
        totalDamages: 0,
        totalOldLoans: 0,
        totaltodayLoans: 0,
        totalQtySold: 0,
        totalBillsPrinted: 0,
        firstBillTime: '',
        lastBillTime: '',
        firstBillNo: '',
        lastBillNo: '',
        companyName: 'Loading...',
        reportDate: new Date().toLocaleString(),
    });

    useEffect(() => {
        fetchSettings();
        fetchFinancialReport();
    }, []);

    // Fetch company name and report date from backend
    const fetchSettings = async () => {
        try {
            const response = await api.get('/settings');
            if (response.data) {
                setFinancialData(prev => ({
                    ...prev,
                    companyName: response.data.company || 'Default Company',
                    reportDate: response.data.value || new Date().toLocaleString()
                }));
            }
        } catch (err) {
            console.error("Error fetching settings:", err);
        }
    };

    const fetchFinancialReport = async () => {
        try {
            setLoading(true);
            const response = await api.get('/financial-report');
            if (response.data.success) {
                const data = response.data.data;
                setReportData(data.reportData || []);
                setFinancialData(prev => ({
                    ...prev,
                    totalDr: data.totalDr || 0,
                    totalCr: data.totalCr || 0,
                    salesTotal: data.salesTotal || 0,
                    supplierTotalCost: data.supplierTotalCost || 0,
                    totalProfit: data.totalProfit || 0,
                    totalDamages: data.totalDamages || 0,
                    totalOldLoans: data.totalOldLoans || 0,
                    totaltodayLoans: data.totaltodayLoans || 0,
                    totalQtySold: data.totalQtySold || 0,
                    totalBillsPrinted: data.totalBillsPrinted || 0,
                    firstBillTime: data.firstBillTime || 'N/A',
                    lastBillTime: data.lastBillTime || 'N/A',
                    firstBillNo: data.firstBillNo || 'N/A',
                    lastBillNo: data.lastBillNo || 'N/A',
                }));
            } else {
                setError('Failed to load financial report');
            }
        } catch (err) {
            setError('Error fetching financial report: ' + (err.response?.data?.message || err.message));
            console.error('Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => window.print();

    const handlePasswordSubmit = () => {
        if (password === 'nethma123') setShowProfit(true);
        else alert('Incorrect password');
    };

    const formatNumber = (num) => {
        if (num === null || num === undefined) return '';
        return parseFloat(num).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const calculateBalance = () => financialData.totalDr + financialData.totalCr;

    // Calculate the actual difference (Dr - Cr)
    const calculateNetAmount = () => {
        return financialData.totalDr - Math.abs(financialData.totalCr);
    };

    if (loading) return (
        <Layout>
            <div className="container mt-4 text-center">
                <div className="spinner-border text-success" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-2">Loading financial report...</p>
            </div>
        </Layout>
    );

    if (error) return (
        <Layout>
            <div className="container mt-4">
                <div className="alert alert-danger">{error}</div>
            </div>
        </Layout>
    );

    const netAmount = calculateNetAmount();

    return (
        <Layout>
            <div className="container mt-4 financial-report-container">
                <div className="report-card">
                    <div className="report-title-bar" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'linear-gradient(90deg, #004d00, #007700)',
                        color: 'white',
                        padding: '15px 20px',
                        borderRadius: '8px',
                        marginBottom: '20px'
                    }}>
                        <h2 style={{ margin: 0, fontWeight: '700' }}>{financialData.companyName}</h2>
                        <h4 style={{ margin: 0 }}>📄 විකුණුම් වාර්තාව</h4>
                        <div>
                            <span>{financialData.reportDate}</span>
                            <button className="btn btn-light btn-sm ms-2" onClick={handlePrint}>🖨️ මුද්‍රණය</button>
                        </div>
                    </div>

                    {/* Sales Total and Supplier Cost Summary */}
                    <div className="row mb-3">
                        <div className="col-md-6">
                            <div className="alert alert-info fw-bold">
                                විකිණුම් මුළු එකතුව: {formatNumber(financialData.salesTotal)}
                            </div>
                        </div>
                        <div className="col-md-6">
                            <div className="alert alert-warning fw-bold">
                                සැපයුම්කරු පිරිවැය: {formatNumber(financialData.supplierTotalCost)}
                            </div>
                        </div>
                    </div>

                    {/* Report Table */}
                    <div className="table-responsive">
                        <table className="table table-bordered table-striped">
                            <thead>
                                <tr>
                                    <th>විස්තරය</th>
                                    <th>ලැබීම්</th>
                                    <th>ගෙවීම</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.map((row, index) => (
                                    <tr key={index}>
                                        <td>{row.description}</td>
                                        <td className="text-end">{row.dr ? formatNumber(Math.abs(row.dr)) : ''}</td>
                                        <td className="text-end">{row.cr ? formatNumber(Math.abs(row.cr)) : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="fw-bold">
                                    <td>මුළු</td>
                                    <td className="text-end">{formatNumber(Math.abs(financialData.totalDr))}</td>
                                    <td className="text-end">{formatNumber(Math.abs(financialData.totalCr))}</td>
                                </tr>

                                {/* UPDATED: Show the calculated difference (Dr - Cr) */}
                                <tr className="fw-bold table-warning">
                                    <td>ඇතැති මුදල්</td>
                                    <td colSpan="2" className="text-end">
                                        {(() => {
                                            // Calculate net amount: Dr - Cr
                                            const netAmount = financialData.totalDr - Math.abs(financialData.totalCr);
                                            const calculationString = `${formatNumber(Math.abs(financialData.totalDr))} - ${formatNumber(Math.abs(financialData.totalCr))} = ${formatNumber(netAmount)}`;
                                            
                                            return netAmount < 0 ? (
                                                <span className="text-danger">{netAmount}</span>
                                            ) : (
                                                <span className="text-success">{netAmount}</span>
                                            );
                                        })()}
                                    </td>
                                </tr>

                                <tr className="fw-bold table-warning">
                                    <td>💰ලාභය</td>
                                    <td colSpan="2" className="text-end">
                                        {showProfit ? (
                                            <span className="text-success">{formatNumber(financialData.totalProfit)}</span>
                                        ) : (
                                            <div className="d-flex align-items-center gap-2">
                                                <input
                                                    type="password"
                                                    className="form-control form-control-sm"
                                                    placeholder="Enter password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    style={{ width: '150px' }}
                                                />
                                                <button 
                                                    className="btn btn-sm btn-success"
                                                    onClick={handlePasswordSubmit}
                                                >
                                                    Show
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>

                                <tr className="fw-bold table-warning">
                                    <td>මුළු හානිය</td>
                                    <td colSpan="2" className="text-end text-danger">
                                        {formatNumber(financialData.totalDamages)}
                                    </td>
                                </tr>

                                {/* Supplier Cost Display */}
                                <tr className="fw-bold table-warning">
                                    <td>සැපයුම්කරු පිරිවැය</td>
                                    <td colSpan="2" className="text-end">
                                        <span className="text-info">{formatNumber(financialData.supplierTotalCost)}</span>
                                    </td>
                                </tr>

                                {/* Loans */}
                                <tr className="fw-bold table-warning">
                                    <td colSpan="3">
                                        <div className="d-flex flex-wrap gap-3">
                                            <div className="loan-box">
                                                <div>අද දින පරණ නය</div>
                                                <div className="fw-bold">{formatNumber(financialData.totalOldLoans)}</div>
                                            </div>
                                            <div className="loan-box">
                                                <div>අද දින නය ගැනීම</div>
                                                <div className="fw-bold">{formatNumber(Math.abs(financialData.totaltodayLoans))}</div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                                {/* Sales Stats */}
                                <tr className="fw-bold table-warning">
                                    <td colSpan="3">
                                        <div className="d-flex flex-wrap gap-3">
                                            <div className="stat-box">
                                                <div>මුළු විකිණුම් ප්‍රමාණය</div>
                                                <div className="fw-bold">{formatNumber(financialData.totalQtySold)}</div>
                                            </div>
                                            <div className="stat-box">
                                                <div>මුළු මුද්‍රිත බිල්පත්</div>
                                                <div className="fw-bold">{financialData.totalBillsPrinted}</div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                                {/* Bill Times */}
                                <tr className="fw-bold table-warning">
                                    <td colSpan="3">
                                        <div className="d-flex flex-wrap gap-3">
                                            <div className="bill-time-box">
                                                <div>පළමු බිල් මුද්‍රණ කාලය</div>
                                                <div className="fw-bold">{financialData.firstBillTime}</div>
                                                <small>බිල් අංකය: {financialData.firstBillNo}</small>
                                            </div>
                                            <div className="bill-time-box">
                                                <div>අවසන් බිල් මුද්‍රණ කාලය</div>
                                                <div className="fw-bold">{financialData.lastBillTime}</div>
                                                <small>බිල් අංකය: {financialData.lastBillNo}</small>
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default FinancialReport;