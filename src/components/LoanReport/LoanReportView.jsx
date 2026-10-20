import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import api from "../../api"; 

import { BASE_PATH } from '../../config';
const LoanReportView = () => {
    const [loans, setLoans] = useState([]);
    const [companyName, setCompanyName] = useState('Default Company');
    const [settingDate, setSettingDate] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLoanReport();
    }, []);

    const fetchLoanReport = async () => {
        try {
            setLoading(true);
            const response = await api.get('/customers-loans/report');
            const data = response.data;
            setLoans(data.loans || []);
            setCompanyName(data.companyName || 'Default Company');
            setSettingDate(data.settingDate || new Date().toISOString().split('T')[0]);
        } catch (error) {
            console.error('❌ Error fetching loan report:', error);
            alert('Error loading loan report: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = `${BASE_PATH}/login`;
    };

    const getStatusFromColor = (color) => {
        switch(color) {
            case 'orange-highlight': return 'Non realized cheques';
            case 'blue-highlight': return 'Realized cheques';
            case 'red-highlight': return 'Returned cheques';
            default: return 'Normal';
        }
    };

    const handleExportExcel = () => {
        const grandTotal = loans.reduce((total, loan) => total + parseFloat(loan.total_amount || 0), 0);
        const excelData = [['පාරිභෝගික නම', 'මුදල (Rs)', 'Status']];

        loans.forEach(loan => {
            const status = getStatusFromColor(loan.highlight_color);
            excelData.push([loan.customer_short_name, Number(loan.total_amount).toFixed(2), status]);
        });

        excelData.push(['GRAND TOTAL', Number(grandTotal).toFixed(2), '']);
        const worksheet = XLSX.utils.aoa_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Loan Report');
        XLSX.writeFile(workbook, `Loan_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return alert('Please allow popups for printing');
        const grandTotal = loans.reduce((total, loan) => total + parseFloat(loan.total_amount || 0), 0);

        const printContent = `
            <html>
            <head>
                <title>Loan Report</title>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .text-end { text-align: right; }
                </style>
            </head>
            <body>
                <h2>${companyName}</h2>
                <h3>ණය වාර්තාව - Loan Report</h3>
                <p>Date: ${new Date(settingDate).toLocaleDateString()}</p>
                <table>
                    <thead><tr><th>පාරිභෝගික නම</th><th>මුදල (Rs)</th></tr></thead>
                    <tbody>
                        ${loans.map(loan => `<tr><td>${loan.customer_short_name}</td><td class="text-end">${Number(loan.total_amount).toFixed(2)}</td></tr>`).join('')}
                    </tbody>
                    <tfoot><tr><th class="text-end">Grand Total:</th><th class="text-end">${Number(grandTotal).toFixed(2)}</th></tr></tfoot>
                </table>
            </body>
            </html>
        `;
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
    };

    if (loading) return (
        <div className="d-flex justify-content-center align-items-center vh-100" style={{backgroundColor: '#99ff99'}}>
            <div className="spinner-border text-success"></div>
        </div>
    );

    const grandTotal = loans.reduce((total, loan) => total + parseFloat(loan.total_amount || 0), 0);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#99ff99' }}>
            
            {/* --- VERTICAL SIDEBAR --- */}
            <div style={{
                width: '260px', backgroundColor: '#004d00', color: 'white', padding: '20px',
                display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh',
                overflowY: 'auto', boxShadow: '2px 0 5px rgba(0,0,0,0.2)', zIndex: 1000
            }}>
                <Link className="navbar-brand fw-bold d-flex align-items-center mb-4 text-white text-decoration-none" to="/sales">
                    <i className="material-icons me-2">warehouse</i> Dashboard
                </Link>

                <h6 className="text-uppercase text-light opacity-50 small fw-bold mb-3">Master Data</h6>
                <ul className="list-unstyled flex-grow-1">
                    <li className="mb-2">
                        <Link to="/customers" className="nav-link text-white d-flex align-items-center p-2 rounded text-decoration-none">
                            <i className="material-icons me-2">people</i> Customers
                        </Link>
                    </li>
                    <li className="mb-2">
                        <Link to="/items" className="nav-link text-white d-flex align-items-center p-2 rounded text-decoration-none">
                            <i className="material-icons me-2">inventory_2</i> Items
                        </Link>
                    </li>
                    <li className="mb-2">
                        <Link to="/suppliers" className="nav-link text-white d-flex align-items-center p-2 rounded text-decoration-none">
                            <i className="material-icons me-2">local_shipping</i> Suppliers
                        </Link>
                    </li>
                    <li className="mb-2">
                        <Link to="/commissions" className="nav-link text-white d-flex align-items-center p-2 rounded text-decoration-none">
                            <i className="material-icons me-2">attach_money</i> Commissions
                        </Link>
                    </li>
                    <hr className="bg-light" />
                    <li className="mb-2">
                        <button type="button" className="btn btn-warning text-dark fw-bold d-flex align-items-center w-100 border-0 p-2 rounded" onClick={() => window.location.reload()}>
                            <i className="material-icons me-2">account_balance</i> Loan Report
                        </button>
                    </li>
                </ul>

                <div className="mt-auto pt-3 border-top border-secondary">
                    <button onClick={handleLogout} className="btn btn-outline-light w-100 fw-bold d-flex align-items-center justify-content-center">
                        <i className="material-icons me-2">logout</i> Logout
                    </button>
                </div>
            </div>

            {/* --- MAIN CONTENT AREA --- */}
            <div style={{ marginLeft: '260px', flexGrow: 1, padding: '30px', width: 'calc(100vw - 260px)' }}>
                <div className="card shadow-lg border-0 rounded-4" style={{ backgroundColor: '#006400', color: '#fff', overflow: 'hidden' }}>
                    <div className="card-header border-0 py-4 text-center">
                        <h2 className="fw-bold mb-0">{companyName}</h2>
                        <h4 className="opacity-75">ණය වාර්තාව (Loan Report)</h4>
                    </div>

                    <div className="card-body bg-light text-dark">
                        <div className="d-flex justify-content-between mb-4">
                            <div className="text-muted small">
                                <strong>Date:</strong> {new Date(settingDate).toLocaleDateString()}
                            </div>
                            <div>
                                <button className="btn btn-success me-2 fw-bold" onClick={handleExportExcel}>
                                    <i className="material-icons align-middle me-1">description</i> Excel Export
                                </button>
                                <button className="btn btn-danger fw-bold" onClick={handlePrint}>
                                    <i className="material-icons align-middle me-1">picture_as_pdf</i> PDF Print
                                </button>
                            </div>
                        </div>

                        <div className="table-responsive">
                            <table className="table table-hover table-bordered align-middle bg-white shadow-sm">
                                <thead style={{ backgroundColor: '#004d00', color: 'white' }}>
                                    <tr className="text-center">
                                        <th>පාරිභෝගික නම (Customer Name)</th>
                                        <th className="text-end">මුදල (Amount Rs.)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loans.map((loan, index) => (
                                        <tr key={index} className={loan.highlight_color || ''}>
                                            <td className="ps-4 fw-bold">{loan.customer_short_name}</td>
                                          <td className="text-end pe-4 fw-bold">
    {Math.abs(Number(loan.total_amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="table-secondary">
                                    <tr className="fw-bold fs-5">
                                        <td className="text-end">Grand Total:</td>
                                       <td className="text-end pe-4">
                                        Rs. {Math.abs(Number(grandTotal)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                       </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx="true">{`
                .orange-highlight { background-color: #fff3e0 !important; color: #e65100; }
                .blue-highlight { background-color: #e3f2fd !important; color: #0d47a1; }
                .red-highlight { background-color: #ffebee !important; color: #b71c1c; }
                .table-hover tbody tr:hover { filter: brightness(0.95); }
            `}</style>
        </div>
    );
};

export default LoanReportView;