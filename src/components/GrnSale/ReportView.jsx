import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

const GrnSaleReportView = ({ reportData, onClose }) => {
    const [isClient, setIsClient] = useState(false);
    const { sales, filters, selectedGrnEntry, selectedGrnCode } = reportData;

    // Ensure we're on client side before printing
    useEffect(() => {
        setIsClient(true);
    }, []);

    const totals = sales.reduce((acc, sale) => {
        acc.total_packs += Number(sale.packs) || 0;
        acc.total_weight += Number(sale.weight) || 0;
        acc.total_amount += Number(sale.total) || 0;
        return acc;
    }, { total_packs: 0, total_weight: 0, total_amount: 0 });

    // PDF Export functionality
    const handlePrint = () => {
        if (!isClient) return;
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups for printing');
            return;
        }

        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>GRN Code-based Sales Report</title>
                <style>
                    body { 
                        font-family: 'notosanssinhala', sans-serif; 
                        font-size: 12px; 
                        line-height: 1.4;
                        margin: 20px;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 20px;
                        border-bottom: 2px solid #333;
                        padding-bottom: 10px;
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin-top: 15px;
                    }
                    th, td { 
                        border: 1px solid #000; 
                        padding: 8px; 
                        text-align: left; 
                    }
                    th { 
                        background-color: #f2f2f2; 
                        font-weight: bold;
                    }
                    .text-end { text-align: right; }
                    .text-center { text-align: center; }
                    .totals-row { 
                        font-weight: bold; 
                        background-color: #e9ecef;
                    }
                    .meta-info { 
                        margin-bottom: 15px; 
                        padding: 10px;
                        background-color: #f8f9fa;
                        border-radius: 5px;
                    }
                    .filters { margin-bottom: 10px; }
                    .no-data { 
                        text-align: center; 
                        color: #6c757d; 
                        padding: 20px;
                        background-color: #f8f9fa;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>TGK ට්‍රේඩර්ස්</h2>
                    <h3>📄 GRN කේතය අනුව විකුණුම් වාර්තාව</h3>
                    <p>Report Date: ${new Date().toLocaleDateString('en-CA')}</p>
                </div>

                <div class="meta-info">
                    <strong>තෝරාගත් GRN කේතය:</strong> ${selectedGrnCode || 'N/A'}
                    ${(filters.start_date || filters.end_date) ? `
                        <br>
                        <strong>දිනයන්:</strong>
                        ${filters.start_date ? ` ${filters.start_date}` : ''}
                        ${filters.end_date ? ` සිට ${filters.end_date} දක්වා` : ''}
                    ` : ''}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>🗓️ දිනය</th>
                            <th>බිල් අංකය</th>
                            <th>ගෙණුම්කරු කේතය</th>
                            <th>බර (kg)</th>
                            <th>මිල (1kg)</th>
                            <th>පැක්</th>
                            <th>මුළු මුදල (Rs.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sales.length > 0 ? sales.map(sale => `
                            <tr>
                                <td>${sale.Date || sale.created_at}</td>
                                <td>${sale.bill_no}</td>
                                <td>${sale.customer_code}</td>
                                <td class="text-end">${Number(sale.weight).toFixed(2)}</td>
                                <td class="text-end">${Number(sale.price_per_kg).toFixed(2)}</td>
                                <td class="text-end">${Number(sale.packs).toFixed(0)}</td>
                                <td class="text-end" style="font-weight: bold;">${Number(sale.total).toFixed(2)}</td>
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="7" class="no-data">🚫 වාර්තා නැත</td>
                            </tr>
                        `}
                    </tbody>
                    ${sales.length > 0 ? `
                        <tfoot>
                            <tr class="totals-row">
                                <td colspan="3" class="text-end">මුළු එකතුව:</td>
                                <td class="text-end">${Number(totals.total_weight).toFixed(2)}</td>
                                <td></td>
                                <td class="text-end">${Number(totals.total_packs).toFixed(0)}</td>
                                <td class="text-end">${Number(totals.total_amount).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    ` : ''}
                </table>
            </body>
            </html>
        `;

        printWindow.document.write(printContent);
        printWindow.document.close();
        
        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
        };
    };

    // Excel Export functionality
    const handleExportExcel = () => {
        const excelData = [];
        
        // Add headers
        const headers = ['දිනය', 'බිල් අංකය', 'ගෙණුම්කරු කේතය', 'බර (kg)', 'මිල (1kg)', 'පැක්', 'මුළු මුදල (Rs.)'];
        excelData.push(headers);
        
        // Add data rows
        sales.forEach(sale => {
            excelData.push([
                sale.Date || sale.created_at,
                sale.bill_no,
                sale.customer_code,
                Number(sale.weight).toFixed(2),
                Number(sale.price_per_kg).toFixed(2),
                Number(sale.packs).toFixed(0),
                Number(sale.total).toFixed(2)
            ]);
        });
        
        // Add totals row
        if (sales.length > 0) {
            excelData.push([
                'මුළු එකතුව:',
                '',
                '',
                Number(totals.total_weight).toFixed(2),
                '',
                Number(totals.total_packs).toFixed(0),
                Number(totals.total_amount).toFixed(2)
            ]);
        }

        // Create workbook and export
        const worksheet = XLSX.utils.aoa_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'GRN Code Sales Report');
        XLSX.writeFile(workbook, `GRN_Code_Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Simple browser print (fallback)
    const handleSimplePrint = () => {
        window.print();
    };

    return (
        <div className="card shadow border-0 rounded-3 p-4 custom-card mt-4">
            {/* Export Buttons */}
            <div className="d-flex justify-content-between mb-3">
                <div>
                    <button className="btn btn-success me-2" onClick={handleExportExcel}>
                        📊 Export Excel
                    </button>
                    <button className="btn btn-primary me-2" onClick={handlePrint}>
                        📄 Export PDF
                    </button>
                    <button className="btn btn-info me-2" onClick={handleSimplePrint}>
                        🖨️ Quick Print
                    </button>
                </div>
                <button className="btn btn-secondary" onClick={onClose}>
                    Close Report
                </button>
            </div>

            {/* Report Header */}
            <div className="report-title-bar">
                <h2 className="company-name">TGK ට්‍රේඩර්ස්</h2>
                <h4 className="fw-bold text-white">📄 GRN කේතය අනුව විකුණුම් වාර්තාව</h4>
                <span className="right-info">
                    {new Date().toLocaleDateString('en-CA')}
                </span>
            </div>

            {/* Filters Summary */}
            <div className="mb-3 text-white">
                <strong>තෝරාගත් GRN කේතය:</strong> {selectedGrnCode}
                {(filters.start_date || filters.end_date) && (
                    <span className="ms-3">
                        <strong>දිනයන්:</strong> 
                        {filters.start_date && ` ${filters.start_date}`}
                        {filters.end_date && ` සිට ${filters.end_date} දක්වා`}
                    </span>
                )}
            </div>

            {/* Report Table */}
            <table className="table table-bordered table-striped table-sm text-center align-middle">
                <thead className="table-dark">
                    <tr>
                        <th>🗓️ දිනය</th>
                        <th>බිල් අංකය</th>
                        <th>ගෙණුම්කරු කේතය</th>
                        <th>බර (kg)</th>
                        <th>මිල (1kg)</th>
                        <th>පැක්</th>
                        <th>මුළු මුදල (Rs.)</th>
                    </tr>
                </thead>
                <tbody>
                    {sales.length > 0 ? (
                        sales.map((sale, index) => (
                            <tr key={index}>
                                <td>{sale.Date || sale.created_at}</td>
                                <td>{sale.bill_no}</td>
                                <td>{sale.customer_code}</td>
                                <td className="text-end">{Number(sale.weight).toFixed(2)}</td>
                                <td className="text-end">{Number(sale.price_per_kg).toFixed(2)}</td>
                                <td className="text-end">{Number(sale.packs).toFixed(0)}</td>
                                <td className="text-end fw-bold">{Number(sale.total).toFixed(2)}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="7" className="text-center text-muted py-3">🚫 වාර්තා නැත</td>
                        </tr>
                    )}
                </tbody>

                {/* Totals Footer */}
                {sales.length > 0 && (
                    <tfoot>
                        <tr className="table-secondary fw-bold">
                            <td colSpan="3" className="text-end">මුළු එකතුව:</td>
                            <td className="text-end">{Number(totals.total_weight).toFixed(2)}</td>
                            <td></td>
                            <td className="text-end">{Number(totals.total_packs).toFixed(0)}</td>
                            <td className="text-end">{Number(totals.total_amount).toFixed(2)}</td>
                        </tr>
                    </tfoot>
                )}
            </table>

            {/* Print Styles */}
            <style jsx>{`
                @media print {
                    .btn { display: none !important; }
                    .card { 
                        border: none !important; 
                        box-shadow: none !important; 
                        padding: 0 !important;
                    }
                    .report-title-bar {
                        background: #333 !important;
                        color: white !important;
                        padding: 15px;
                        text-align: center;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    th, td {
                        border: 1px solid #000 !important;
                        padding: 5px;
                    }
                    .table-striped tbody tr:nth-child(odd) {
                        background-color: #f2f2f2 !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default GrnSaleReportView;