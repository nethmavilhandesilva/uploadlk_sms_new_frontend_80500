import React, { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api';

const WeightReportView = ({ reportData, onClose }) => {
    const printRef = useRef();
    const [isClient, setIsClient] = useState(false);
    const [companyName, setCompanyName] = useState('???');
    const [currentDate, setCurrentDate] = useState('N/A');

    const { sales, filters, selectedGrnEntry, selectedGrnCode } = reportData;

    useEffect(() => {
        setIsClient(true);
        setCurrentDate(new Date().toLocaleDateString());
    }, []);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                if (response.data) {
                    setCompanyName(response.data.company || '???');
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            }
        };
        fetchSettings();
    }, []);

    // ================= TOTAL CALCULATIONS =================
    const totals = sales.reduce(
        (acc, sale) => {
            const packs = Number(sale.packs) || 0;
            const weight = Number(sale.weight) || 0;
            const pack_cost = Number(sale.pack_cost) || 0; // UPDATED
            const item_total = Number(sale.total) || 0;

            const pack_total_cost = packs * pack_cost;
            // Assuming Net Total adds the pack cost to the item total
            const net_total = item_total + pack_total_cost; 

            acc.total_packs += packs;
            acc.total_weight += weight;
            acc.total_pack_cost += pack_total_cost;
            acc.total_net_total += net_total;

            return acc;
        },
        { total_packs: 0, total_weight: 0, total_pack_cost: 0, total_net_total: 0 }
    );

    // ================= PRINT =================
    const handlePrint = () => {
        if (!isClient) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return alert('Please allow popups');

        const printContent = printRef.current.innerHTML;
        printWindow.document.write(`
            <html>
            <head>
                <title>Weight Report</title>
                <style>
                    body { font-size:12px; font-family:sans-serif; padding: 20px; }
                    table { width:100%; border-collapse:collapse; margin-top: 10px; }
                    th, td { border:1px solid #000; padding:8px; text-align: center; }
                    th { background:#f2f2f2; }
                    .text-end { text-align:right; }
                    .fw-bold { font-weight:bold; }
                </style>
            </head>
            <body>${printContent}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.print();
            printWindow.close();
        };
    };

    // ================= EXCEL EXPORT =================
    const handleExcel = () => {
        const data = [['අයිතම', 'බර', 'එකතුව']];
        sales.forEach(s => {
            const packs = Number(s.packs) || 0;
            const pack_cost = Number(s.pack_cost) || 0; // UPDATED
            const total = Number(s.total) || 0;
            const pack_total_cost = packs * pack_cost;
            
            data.push([
                s.item_name, 
                Number(s.weight), 
                (total + pack_total_cost)
            ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Weight Report');
        XLSX.writeFile(wb, `Weight_Report_${currentDate}.xlsx`);
    };

    return (
        <div className="report-container">
            <div className="d-flex justify-content-between mb-3 no-print">
                <div>
                    <button className="btn btn-success btn-sm me-2" onClick={handleExcel}>📊 Excel</button>
                    <button className="btn btn-primary btn-sm me-2" onClick={handlePrint}>📄 PDF / Print</button>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
            </div>

            <div ref={printRef} className="p-2">
                <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
                    <h2 style={{ margin: 0 }}>{companyName}</h2>
                    <h4 style={{ margin: '5px 0' }}>📦 බර අනුව වාර්තාව (Weight Based Report)</h4>
                    <p style={{ margin: 0 }}>Date: {currentDate}</p>
                    {selectedGrnCode && <p style={{ margin: 0 }}><strong>GRN:</strong> {selectedGrnCode}</p>}
                    {(filters.start_date || filters.end_date) && (
                        <p style={{ margin: 0 }}>
                            {filters.start_date} සිට {filters.end_date} දක්වා
                        </p>
                    )}
                </div>

                <div className="table-responsive">
                    <table className="table table-bordered table-sm align-middle">
                        <thead className="table-light">
                            <tr>
                                <th>අයිතම</th>
                                <th className="text-end">බර (Weight)</th>
                                <th className="text-end">එකතුව (Net)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sales.map((s, i) => {
                                const weight = Number(s.weight) || 0;
                                const packs = Number(s.packs) || 0;
                                const pack_cost = Number(s.pack_cost) || 0; // UPDATED
                                const total = Number(s.total) || 0;
                                const pack_total_cost = packs * pack_cost;
                                const net = total + pack_total_cost;

                                return (
                                    <tr key={i}>
                                        <td>{s.item_name}</td>
                                        <td className="text-end">{weight.toFixed(2)}</td>
                                        <td className="text-end">{net.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="fw-bold table-secondary">
                            <tr>
                                <td>මුළු එකතුව (Total)</td>
                                <td className="text-end">{Number(totals.total_weight).toFixed(2)}</td>
                                <td className="text-end">{Number(totals.total_net_total).toFixed(2)}</td>
                            </tr>
                            <tr className="table-dark text-white">
                                <td colSpan="2" className="text-end">අවසන් මුළු එකතුව (Grand Total)</td>
                                <td className="text-end">
                                    {Number(totals.total_net_total).toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default WeightReportView;