import React, { useState, useEffect } from 'react';
import Sidebar from '../Sidebar';
import api from "../../api"; // ✅ axios wrapper

const SalesReport = () => {
    const [sales, setSales] = useState([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBill, setSelectedBill] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Mode State: 'customer' or 'farmer'
    const [reportMode, setReportMode] = useState('customer');

    useEffect(() => {
        fetchSummary();
    }, [reportMode]);

    // --- 1. CUSTOMER RECEIPT LOGIC ---
    const buildFullReceiptHTML = (salesData, billNo, customerName, mobile, globalLoanAmount = 0, billSize = '3inch') => {
        const formatNumber = (num) => {
            if (typeof num !== 'number' && typeof num !== 'string') return '0';
            const number = parseFloat(num);
            if (isNaN(number)) return '0';
            if (Number.isInteger(number)) {
                return number.toLocaleString('en-US');
            } else {
                const parts = number.toFixed(2).split('.');
                const wholePart = parseInt(parts[0]).toLocaleString('en-US');
                return `${wholePart}.${parts[1]}`;
            }
        };

        const date = new Date().toLocaleDateString();
        const time = new Date().toLocaleTimeString();
        let totalAmountSum = 0;
        const consolidatedSummary = {};

        salesData.forEach(s => {
            const itemName = s.item_name || 'Unknown';
            if (!consolidatedSummary[itemName]) consolidatedSummary[itemName] = { totalWeight: 0, totalPacks: 0 };
            consolidatedSummary[itemName].totalWeight += parseFloat(s.weight) || 0;
            consolidatedSummary[itemName].totalPacks += parseInt(s.packs) || 0;
            totalAmountSum += parseFloat(s.total) || 0;
        });

        const totalPacksSum = Object.values(consolidatedSummary).reduce((sum, item) => sum + item.totalPacks, 0);
        const is4Inch = billSize === '4inch';
        const receiptMaxWidth = is4Inch ? '4in' : '350px';
        const fontSizeBody = '25px';
        const fontSizeHeader = '23px';
        const fontSizeTotal = '28px';

        const colGroups = `<colgroup><col style="width:32%;"><col style="width:21%;"><col style="width:21%;"><col style="width:26%;"></colgroup>`;

        const itemsHtml = salesData.map(s => {
            const packs = parseInt(s.packs) || 0;
            const weight = parseFloat(s.weight) || 0;
            const price = parseFloat(s.price_per_kg) || 0;
            const value = (weight * price).toFixed(2);
            return `
            <tr style="font-size:${fontSizeBody}; font-weight:bold; vertical-align: bottom;">
                <td style="text-align:left; padding:10px 0; white-space: nowrap;">${s.item_name || ""}</td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -70px;">${formatNumber(weight.toFixed(2))}</td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -55px;">${formatNumber(price.toFixed(2))}</td>
                <td style="padding:10px 0; display:flex; flex-direction:column; align-items:flex-end;">
                    <div style="font-size:25px; white-space:nowrap;">${s.supplier_code || "ASW"}</div>
                    <div style="font-weight:900; white-space:nowrap;">${formatNumber(value)}</div>
                </td>
            </tr>`;
        }).join("");

        const totalSales = salesData.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseFloat(s.price_per_kg) || 0)), 0);
        const totalPackCost = salesData.reduce((sum, s) => sum + ((parseFloat(s.CustomerPackCost) || 0) * (parseFloat(s.packs) || 0)), 0);
        const finalGrandTotal = totalSales + totalPackCost;
        const givenAmount = salesData.find(s => parseFloat(s.given_amount) > 0)?.given_amount || 0;
        const remaining = givenAmount > 0 ? Math.abs(givenAmount - finalGrandTotal) : 0;
        const loanRow = globalLoanAmount !== 0 ? `<tr><td style="font-size:20px; padding-top:8px;">පෙර ණය:</td><td style="text-align:right; font-size:22px; font-weight:bold; padding-top:8px;">Rs. ${formatNumber(Math.abs(globalLoanAmount).toFixed(2))}</td></tr>` : '';

        const summaryEntries = Object.entries(consolidatedSummary);
        let summaryHtmlContent = '';
        for (let i = 0; i < summaryEntries.length; i += 2) {
            const [name1, d1] = summaryEntries[i];
            const [name2, d2] = summaryEntries[i + 1] || [null, null];
            summaryHtmlContent += `<tr><td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap;">${name1}:${formatNumber(d1.totalWeight)}</td><td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap;">${name2 ? name2 + ':' + formatNumber(d2.totalWeight) : ''}</td></tr>`;
        }

        return `
        <div style="width:${receiptMaxWidth}; margin:0 auto; padding:10px; font-family: 'Courier New', monospace; color:#000; background:#fff;">
            <div style="text-align:center; font-weight:bold;">
                <div style="font-size:24px;">
                <span style="font-size: 14px; margin-left: -160px; margin-right: 40px; color: #666;">පරණ බිල්</span>xxxx
                </div>
                <div style="font-size:20px; margin-bottom:5px;font-weight:bold;">colombage lanka (Pvt) Ltd</div>
                <div style="display:flex; justify-content:center; gap:15px; margin:12px 0;"><span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">xx</span><span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">${customerName.toUpperCase()}</span></div>
                <div style="font-size:16px;">එළවළු,පළතුරු තොග වෙළෙන්දෝ</div>
                <div style="display:flex; justify-content:space-between; font-size:14px; margin-top:6px; padding:0 5px;"><span>බණ්ඩාරවෙල</span><span>${time}</span></div>
            </div>
            <div style="font-size:19px; margin-top:10px; padding:0 5px;"><div style="font-weight: bold;">දුර: 0777672838 / 071437115</div><div style="display:flex; justify-content:space-between; margin-top:3px;"><span>බිල් අංකය:${billNo}</span><span>දිනය:${date}</span></div></div>
            <hr style="border:none; border-top:2.5px solid #000; margin:10px 0;">
            <table style="width:100%; border-collapse:collapse; font-size:${fontSizeBody}; table-layout: fixed;">${colGroups}<thead><tr style="border-bottom:2.5px solid #000; font-weight:bold;"><th style="text-align:left; padding-bottom:8px; font-size:${fontSizeHeader};">වර්ගය</th><th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -50px; top: 24px;"> කිලෝ </th><th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -45px;top: 24px;">මිල</th><th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader};">අයිතිය<br>අගය</th></tr></thead><tbody>${itemsHtml}</tbody><tfoot><tr style="border-top:2.5px solid #000; font-weight:bold;"><td style="padding-top:12px; font-size:${fontSizeTotal};"></td><td colspan="3" style="padding-top:12px; font-size:${fontSizeTotal};"><div style="text-align:right; float:right; white-space:nowrap;">${Number(totalSales).toFixed(2)}</div></td></tr></tfoot></table>
            <table style="width:100%; margin-top:20px; font-weight:bold; font-size:22px; padding:0 5px;"><tr><td style="font-size:20px; padding-top:8px;">එකතුව:</td><td style="text-align:right; padding-top:8px;"><span style="border-bottom:5px double #000; border-top:2px solid #000; font-size:${fontSizeTotal}; padding:5px 10px;">${(Number(finalGrandTotal).toFixed(2))}</span></td></tr>${loanRow}${givenAmount > 0 ? '<tr><td>දුන් මුදල:</td><td style="text-align:right;">' + formatNumber(parseFloat(givenAmount).toFixed(2)) + '</td></tr><tr><td>ඉතිරිය:</td><td style="text-align:right; font-size:26px;">' + formatNumber(remaining.toFixed(2)) + '</td></tr>' : ''}</table>
            <table style="width:100%; border-collapse:collapse; margin-top:25px; font-size:14px; text-align:center;">${summaryHtmlContent}</table>
            <div style="text-align:center; margin-top:25px; font-size:13px; border-top:2.5px solid #000; padding-top:10px;"><p style="margin:4px 0; font-weight:bold;">භාණ්ඩ පරීක්ෂාකර බලා රැගෙන යන්න</p><p style="margin:4px 0;">නැවත භාර ගනු නොලැබේ</p></div>
        </div>`;
    };

    // --- 2. FARMER RECEIPT LOGIC ---
    const buildFarmerBillHTML = (supplierDetails, currentBillNo, selectedSupplier) => {
        const date = new Date().toLocaleDateString('si-LK');
        const mobile = '0777672838/071437115';
        const receiptMaxWidth = '350px';
        const fontSizeBody = '25px';
        const fontSizeHeader = '23px';
        const fontSizeTotal = '28px';

        const colGroups = `<colgroup><col style="width:32%;"><col style="width:21%;"><col style="width:21%;"><col style="width:26%;"></colgroup>`;

        const formatNumber = (value, maxDecimals = 3) => {
            if (typeof value !== 'number' && typeof value !== 'string') return '0';
            const number = parseFloat(value);
            if (isNaN(number)) return '0';
            if (Number.isInteger(number)) return number.toLocaleString('en-US');
            const parts = number.toFixed(maxDecimals).replace(/\.?0+$/, '').split('.');
            const wholePart = parseInt(parts[0]).toLocaleString('en-US');
            return parts[1] ? `${wholePart}.${parts[1]}` : wholePart;
        };

        const detailedItemsHtml = supplierDetails.map(record => {
            const weight = parseFloat(record.weight) || 0;
            const packs = parseInt(record.packs) || 0;
            const price = parseFloat(record.SupplierPricePerKg) || 0;
            const total = parseFloat(record.SupplierTotal) || 0;
            const customerCode = record.customer_code?.toUpperCase() || '';
            return `
            <tr style="font-size:${fontSizeBody}; font-weight:bold; vertical-align: bottom;">
                <td style="text-align:left; padding:10px 0; white-space: nowrap;">${record.item_name || ''}</td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -70px;">${formatNumber(weight.toFixed(2))}</td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -65px;">${formatNumber(price.toFixed(2))}</td>
                <td style="padding:10px 0; display:flex; flex-direction:column; align-items:flex-end;">
                    <div style="font-size:25px; white-space:nowrap;">${customerCode}</div>
                    <div style="font-weight:900; white-space:nowrap;">${formatNumber(total.toFixed(2))}</div>
                </td>
            </tr>`;
        }).join("");

        const totalsupplierSales = supplierDetails.reduce((sum, r) => sum + (parseFloat(r.SupplierTotal) || 0), 0);
        const totalPacksSum = supplierDetails.reduce((sum, r) => sum + (parseInt(r.packs) || 0), 0);
        const advanceAmount = 0;
        const netPayable = totalsupplierSales - advanceAmount;

        return `
        <div style="width:${receiptMaxWidth}; margin:0 auto; padding:10px; font-family:'Courier New', monospace; color:#000; background:#fff;">
            <div style="text-align:center; font-weight:bold;">
                 <div style="font-size:24px;">
                <span style="font-size: 14px; margin-left: -160px; margin-right: 40px; color: #666;">පරණ බිල්</span>xxxx
                </div>
                <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin:12px 0;"><span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">xx</span><div style="font-size:18px;">ගොවියා: <span style="border:2.5px solid #000; padding:5px 10px; font-size:22px;">${selectedSupplier}</span></div></div>
                <div style="font-size:16px; white-space: nowrap;">එළවළු තොග වෙළෙන්දෝ බණ්ඩාරවෙල</div>
            </div>
            <div style="font-size:19px; margin-top:10px; padding:0 5px;"><div style="font-weight: bold;">දුර:${mobile}</div><div style="display:flex; justify-content:space-between; margin-top:3px;"><span>බිල් අංකය:${currentBillNo}</span><span>දිනය:${date}</span></div></div>
            <hr style="border:none; border-top:2.5px solid #000; margin:10px 0;">
            <table style="width:100%; border-collapse:collapse; font-size:${fontSizeBody}; table-layout: fixed;">${colGroups}<thead><tr style="border-bottom:2.5px solid #000; font-weight:bold;"><th style="text-align:left; padding-bottom:8px; font-size:${fontSizeHeader};">වර්ගය</th><th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -50px; top: 24px;"> කිලෝ </th><th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -45px; top: 24px;">මිල</th><th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader};">කේතය<br>අගය</th></tr></thead><tbody>${detailedItemsHtml}</tbody><tfoot><tr style="border-top:2.5px solid #000; font-weight:bold;"><td style="padding-top:12px; font-size:${fontSizeTotal};"></td><td colspan="3" style="padding-top:12px; font-size:${fontSizeTotal}; text-align:right;">${totalsupplierSales.toFixed(2)}</td></tr></tfoot></table>
            <table style="width:100%; margin-top:20px; font-weight:bold; font-size:22px;"><tr><td>මෙම බිලට ගෙවන්න:</td><td style="text-align:right;"><span style="border-bottom:5px double #000; border-top:2px solid #000; font-size:${fontSizeTotal}; padding:5px 10px;">${totalsupplierSales.toFixed(2)}</span></td></tr><tr style="font-weight:900;"><td>ඉතිරි ශේෂය:</td><td style="text-align:right;"><span style="font-size:${fontSizeTotal};">${netPayable.toFixed(2)}</span></td></tr></table>
            <div style="text-align:center; margin-top:25px; font-size:13px; border-top:2.5px solid #000; padding-top:10px;"><p style="margin:4px 0; font-weight:bold;">භාණ්ඩ පරීක්ෂාකර බලා රැගෙන යන්න</p><p style="margin:4px 0;">නැවත භාර ගනු නොලැබේ</p></div>
        </div>`;
    };

    const fetchSummary = async () => {
        try {
            // Using your custom 'api' instance. 
            // Note: '/api' prefix removed because it's in your baseURL
            const endpoint = reportMode === 'customer' ? '/reports/sales-summary' : '/reports/farmers-summary';
            const res = await api.get(endpoint, {
                params: { start_date: startDate, end_date: endDate }
            });
            setSales(res.data);
        } catch (error) { console.error(error); }
    };

    const openBill = async (billNo, code) => {
        try {
            const endpoint = reportMode === 'customer'
                ? `/reports/bill-details/${billNo}/${code}`
                : `/reports/farmer-bill-details/${billNo}/${code}`;

            const res = await api.get(endpoint, {
                params: { start_date: startDate, end_date: endDate }
            });
            setSelectedBill(res.data);
            setIsModalOpen(true);
        } catch (error) { console.error(error); }
    };

    // --- SEARCH FILTERING LOGIC ---
    const filteredSales = sales.filter(item => {
        const term = searchTerm.toLowerCase();
        if (reportMode === 'customer') {
            const billNo = item.bill_no?.toString().toLowerCase() || '';
            const custCode = item.customer_code?.toLowerCase() || '';
            const custName = item.customer_name?.toLowerCase() || '';
            return billNo.includes(term) || custCode.includes(term) || custName.includes(term);
        } else {
            const billNo = item.supplier_bill_no?.toString().toLowerCase() || '';
            const supCode = item.supplier_code?.toLowerCase() || '';
            return billNo.includes(term) || supCode.includes(term);
        }
    });

    return (
        <div style={{ display: 'flex' }}>
            <Sidebar />
            <div style={mainContentStyle}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, color: '#004d00' }}>{reportMode === 'customer' ? 'විකුණුම් වාර්තාව' : 'ගොවීන්ගේ වාර්තාව (Farmers)'}</h2>
                    <div style={filterBarStyle}>
                        <div style={inputGroupStyle}>
                            <label>සොයන්න (Search):</label>
                            <input
                                type="text"
                                placeholder={reportMode === 'customer' ? "Bill No / Code / Name" : "Bill No / Supplier Code"}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ ...inputStyle, width: '220px', borderColor: '#004d00' }}
                            />
                        </div>

                        <button onClick={() => {
                            setReportMode(reportMode === 'customer' ? 'farmer' : 'customer');
                            setSearchTerm('');
                        }} style={{ ...buttonStyle, backgroundColor: '#007bff' }}>
                            View {reportMode === 'customer' ? 'Farmers' : 'Customers'}
                        </button>
                        <div style={inputGroupStyle}><label>From:</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></div>
                        <div style={inputGroupStyle}><label>To:</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} /></div>
                        <button onClick={fetchSummary} style={buttonStyle}>Filter Date</button>
                    </div>
                </div>

                <div style={tableContainerStyle}>
                    <table style={modernTableStyle}>
                        <thead>
                            <tr>
                                <th style={thCellStyle}>දිනය (Date)</th>
                                <th style={thCellStyle}>බිල් අංකය (Bill No)</th>
                                <th style={thCellStyle}>{reportMode === 'customer' ? 'ගනුදෙනුකරු (Customer)' : 'ගොවියා (Supplier)'}</th>
                                <th style={{ ...thCellStyle, textAlign: 'right' }}>මුළු එකතුව</th>
                                <th style={{ ...thCellStyle, textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSales.map((item, idx) => (
                                <tr key={idx}>
                                    <td style={tdCellStyle}>{item.Date}</td>
                                    <td style={tdCellStyle}>{reportMode === 'customer' ? item.bill_no : item.supplier_bill_no}</td>
                                    <td style={tdCellStyle}>
                                        {reportMode === 'customer'
                                            ? `${item.customer_code}`
                                            : item.supplier_code}
                                    </td>
                                    <td style={{ ...tdCellStyle, textAlign: 'right' }}>{parseFloat(item.total_amount).toFixed(2)}</td>
                                    <td style={{ ...tdCellStyle, textAlign: 'center' }}>
                                        <button onClick={() => openBill(reportMode === 'customer' ? item.bill_no : item.supplier_bill_no, reportMode === 'customer' ? item.customer_code : item.supplier_code)} style={viewButtonStyle}>View Bill</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {isModalOpen && selectedBill && (
                    <div style={modalOverlayStyle}>
                        <div style={modalContentStyle}>
                            <div style={modalHeaderStyle}>
                                <h4 style={{ margin: 0 }}>{reportMode === 'customer' ? 'Customer Bill Preview' : 'Farmer Bill Preview'}</h4>
                                <button onClick={() => setIsModalOpen(false)} style={{ padding: '5px 15px', cursor: 'pointer' }}>Close</button>
                            </div>
                            <div dangerouslySetInnerHTML={{
                                __html: reportMode === 'customer'
                                    ? buildFullReceiptHTML(selectedBill, selectedBill[0].bill_no, selectedBill[0].customer_code)
                                    : buildFarmerBillHTML(selectedBill, selectedBill[0].supplier_bill_no, selectedBill[0].supplier_code)
                            }} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- STYLES ---
const mainContentStyle = { marginLeft: '260px', flexGrow: 1, padding: '25px', backgroundColor: '#f4f7f6', minHeight: '100vh' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };
const filterBarStyle = { display: 'flex', gap: '15px', alignItems: 'flex-end' };
const inputGroupStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 'bold' };
const inputStyle = { padding: '6px 10px', borderRadius: '4px', border: '1px solid #ddd' };
const buttonStyle = { padding: '8px 20px', backgroundColor: '#004d00', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const tableContainerStyle = { backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ccc' };
const modernTableStyle = { width: '100%', borderCollapse: 'collapse' };
const thCellStyle = { padding: '12px 15px', backgroundColor: '#eee', color: '#333', border: '1px solid #ccc', textAlign: 'left', fontSize: '14px' };
const tdCellStyle = { padding: '10px 15px', border: '1px solid #ddd', fontSize: '14px' };
const viewButtonStyle = { padding: '6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalContentStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', maxHeight: '95vh', minWidth: '400px', overflowY: 'auto' };
const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #eee', marginBottom: '15px' };

export default SalesReport;