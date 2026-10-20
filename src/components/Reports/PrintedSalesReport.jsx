import React, { useState, useEffect } from "react";
import api from "../../api";
import Sidebar from '../Sidebar'; 

const PrintedSalesReport = () => {
    const [reportData, setReportData] = useState({});
    const [transactionType, setTransactionType] = useState("N");
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchReport = async () => {
        setLoading(true);
        try {
            const params = {
                transaction_type: transactionType,
                ...(startDate && { start_date: startDate }),
                ...(endDate && { end_date: endDate })
            };
            
            const response = await api.get(`/sales-report/printed`, { params });
            setReportData(response.data.data || {});
        } catch (error) {
            console.error("Error fetching report:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setStartDate('');
        setEndDate('');
        setTransactionType('N');
    };

    useEffect(() => {
        fetchReport();
    }, [transactionType]);

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    };

    const renderTableBlock = (groups) => {
        const groupKeys = Object.keys(groups);
        if (groupKeys.length === 0) return null;

        return groupKeys.map((customerCode) => {
            const sales = groups[customerCode];
            const totalAmount = sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
            const totalGiven = sales.reduce((sum, s) => sum + parseFloat(s.given_amount || 0), 0);
            const totalBalance = totalAmount - totalGiven;
            
            return (
                <div key={customerCode} className="mb-5 shadow card border-0 overflow-hidden">
                    <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center py-2">
                        <h6 className="mb-0 fw-bold">පාරිභෝගිකයා: <span className="text-warning">{customerCode}</span></h6>
                        <span className="badge bg-light text-dark">බිල්පත් සංඛ්‍යාව: {sales.length}</span>
                    </div>

                    <div className="card-body p-0">
                        <div className="table-responsive">
                            <table className="table table-bordered table-striped table-hover mb-0" style={{ tableLayout: 'fixed', width: '100%' }}>
                                <thead className="table-primary text-center">
                                    <tr>
                                        <th style={{ width: '15%' }}>බිල් අංකය</th>
                                        <th style={{ width: '20%' }}>දිනය</th>
                                        <th style={{ width: '25%' }} className="text-end">මුළු එකතුව (Rs.)</th>
                                        {transactionType === 'Y' && (
                                            <>
                                                <th style={{ width: '20%' }} className="text-end text-success">ගෙවූ මුදල</th>
                                                <th style={{ width: '20%' }} className="text-end text-danger">ශේෂය</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.map((sale, idx) => (
                                        <tr key={idx} className="text-center">
                                            <td className="fw-bold">{sale.bill_no}</td>
                                            <td>{new Date(sale.created_at).toLocaleDateString('en-GB')}</td>
                                            <td className="text-end font-monospace">{formatCurrency(sale.total)}</td>
                                            {transactionType === 'Y' && (
                                                <>
                                                    <td className="text-end text-success font-monospace">{formatCurrency(sale.given_amount)}</td>
                                                    <td className="text-end text-danger fw-bold font-monospace">
                                                        {formatCurrency(parseFloat(sale.total || 0) - parseFloat(sale.given_amount || 0))}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="table-light border-top-2">
                                    <tr className="fw-bold">
                                        <td colSpan="2" className="text-end">පාරිභෝගික එකතුව:</td>
                                        <td className="text-end text-primary font-monospace">{formatCurrency(totalAmount)}</td>
                                        {transactionType === 'Y' && (
                                            <>
                                                <td className="text-end text-success font-monospace">{formatCurrency(totalGiven)}</td>
                                                <td className="text-end text-danger font-monospace">{formatCurrency(totalBalance)}</td>
                                            </>
                                        )}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            );
        });
    };

    return (
        <div style={{ display: 'flex' }}>
            <Sidebar />
            <div style={{ marginLeft: '260px', padding: '30px', width: 'calc(100% - 260px)', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
                
                {/* FILTER SECTION */}
                <div className="card shadow-sm mb-4 border-0 p-3">
                    <div className="row g-3 align-items-end">
                        <div className="col-md-3">
                            <label className="fw-bold mb-1 small text-uppercase">ගනුදෙනු වර්ගය</label>
                            <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className="form-select form-select-sm">
                                <option value="N">අත්පිට මුදල් (Cash)</option>
                                <option value="Y">ණය (Credit)</option>
                            </select>
                        </div>
                        <div className="col-md-3">
                            <label className="fw-bold mb-1 small text-uppercase">ආරම්භ දිනය</label>
                            <input type="date" className="form-control form-control-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div className="col-md-3">
                            <label className="fw-bold mb-1 small text-uppercase">අවසන් දිනය</label>
                            <input type="date" className="form-control form-control-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                        <div className="col-md-3 d-flex gap-2">
                            <button className="btn btn-primary btn-sm flex-grow-1" onClick={fetchReport} disabled={loading}>
                                {loading ? <span className="spinner-border spinner-border-sm"></span> : 'සෙවීම (Search)'}
                            </button>
                            <button className="btn btn-outline-secondary btn-sm" onClick={handleReset}>Reset</button>
                        </div>
                    </div>
                </div>

                {/* HEADER */}
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h4 className="fw-bold mb-0">මුද්‍රිත විකුණුම් වාර්තාව <small className="text-muted">| {transactionType === 'Y' ? 'ණය (Credit)' : 'අත්පිට මුදල් (Cash)'}</small></h4>
                    <button className="btn btn-dark btn-sm px-4" onClick={() => window.print()}>
                        <i className="bi bi-printer me-2"></i>මුද්‍රණය (Print)
                    </button>
                </div>

                {/* CONTENT */}
                {loading ? (
                    <div className="text-center py-5">
                        <div className="spinner-border text-primary mb-2"></div>
                        <p className="text-muted small">දත්ත පූරණය වෙමින් පවතී...</p>
                    </div>
                ) : (
                    <>
                        {Object.keys(reportData).length > 0 ? renderTableBlock(reportData) : <div className="alert alert-warning text-center border-0 shadow-sm">තෝරාගත් කාල සීමාව සඳහා වාර්තා කිසිවක් හමු නොවීය.</div>}
                    </>
                )}

                {/* GRAND TOTAL SUMMARY */}
                {!loading && Object.keys(reportData).length > 0 && (
                    <div className="card shadow border-0 bg-white mt-4">
                        <div className="card-body p-0">
                            <div className="row g-0 text-center">
                                <div className={`p-4 border-end ${transactionType === 'Y' ? 'col-md-4' : 'col-md-12'}`}>
                                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">මුළු විකුණුම් එකතුව (Grand Total)</span>
                                    <h3 className="fw-bold text-primary font-monospace mb-0">
                                        Rs. {formatCurrency(Object.values(reportData).reduce((grandTotal, sales) => grandTotal + sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0), 0))}
                                    </h3>
                                </div>
                                {transactionType === 'Y' && (
                                    <>
                                        <div className="col-md-4 p-4 border-end">
                                            <span className="text-uppercase small fw-bold text-muted d-block mb-1">මුළු ගෙවූ මුදල (Total Paid)</span>
                                            <h3 className="fw-bold text-success font-monospace mb-0">
                                                Rs. {formatCurrency(Object.values(reportData).reduce((grandTotal, sales) => grandTotal + sales.reduce((sum, s) => sum + parseFloat(s.given_amount || 0), 0), 0))}
                                            </h3>
                                        </div>
                                        <div className="col-md-4 p-4">
                                            <span className="text-uppercase small fw-bold text-muted d-block mb-1">මුළු ලැබිය යුතු ශේෂය (Due Balance)</span>
                                            <h3 className="fw-bold text-danger font-monospace mb-0">
                                                Rs. {formatCurrency(Object.values(reportData).reduce((grandTotal, sales) => {
                                                    const tot = sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
                                                    const giv = sales.reduce((sum, s) => sum + parseFloat(s.given_amount || 0), 0);
                                                    return grandTotal + (tot - giv);
                                                }, 0))}
                                            </h3>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PrintedSalesReport;