import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from "../api";
import { API_BASE_URL } from '../config';

const ViewSupplierBill = () => {
    const { token } = useParams();
    const [bill, setBill] = useState(null);
    const [billSize, setBillSize] = useState('3mm');
    const [loading, setLoading] = useState(true);

    // Configuration
    const mobile = ' 0777672838 / 071437115';
    const is4Inch = billSize === '4mm';
    const receiptMaxWidth = is4Inch ? '4in' : '350px';
    const fontSizeBody = '25px';
    const fontSizeHeader = '23px';
    const fontSizeTotal = '28px';

    useEffect(() => {
        fetchBillData();
    }, [token]);

    const fetchBillData = () => {
        setLoading(true);
        api.get(`${API_BASE_URL}/public/supplier-bill/${token}`)
            .then(res => {
                setBill(res.data);
                if (res.data && res.data.bill_no) {
                    document.title = `${res.data.bill_no}`;
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching bill:", err);
                setLoading(false);
            });
    };

    const handlePrint = () => {
        if (bill && bill.bill_no) {
            document.title = `${bill.bill_no}`;
        }
        window.print();
    };

    const toggleBillSize = () => {
        setBillSize(billSize === '3mm' ? '4mm' : '3mm');
    };

    const formatNumber = (value, maxDecimals = 3) => {
        if (typeof value !== 'number' && typeof value !== 'string') return '0';
        const number = parseFloat(value);
        if (isNaN(number)) return '0';
        if (Number.isInteger(number)) return number.toLocaleString('en-US');
        const parts = number.toFixed(maxDecimals).replace(/\.?0+$/, '').split('.');
        const wholePart = parseInt(parts[0]).toLocaleString('en-US');
        return parts[1] ? `${wholePart}.${parts[1]}` : wholePart;
    };

    const formatDecimal = (value, decimals = 2) => (parseFloat(value) || 0).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

    if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading Bill...</div>;
    if (!bill) return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Bill Not Found</div>;

    // Data Parsing - Using current data from the bill object
    const items = typeof bill.sales_data === 'string' 
        ? JSON.parse(bill.sales_data) 
        : bill.sales_data || [];
    
    const advanceAmount = parseFloat(bill.advance_amount || 0);
    const totalsupplierSales = items.reduce((s, i) => s + parseFloat(i.SupplierTotal || 0), 0);
    const totalPacksSum = items.reduce((s, i) => s + (parseInt(i.packs) || 0), 0);
    const netPayable = totalsupplierSales - advanceAmount;
    const date = new Date(bill.created_at || Date.now()).toLocaleDateString('si-LK');

    // Build item summary data
    const itemSummaryData = {};
    items.forEach(record => {
        const itemName = record.item_name || 'Unknown Item';
        const weight = parseFloat(record.weight) || 0;
        const packs = parseInt(record.packs) || 0;
        
        if (!itemSummaryData[itemName]) {
            itemSummaryData[itemName] = { totalWeight: 0, totalPacks: 0 };
        }
        itemSummaryData[itemName].totalWeight += weight;
        itemSummaryData[itemName].totalPacks += packs;
    });

    // Build item summary HTML
    const summaryEntries = Object.entries(itemSummaryData);
    let itemSummaryHtml = '';
    for (let i = 0; i < summaryEntries.length; i += 2) {
        const [name1, d1] = summaryEntries[i];
        const [name2, d2] = summaryEntries[i + 1] || [null, null];
        const text1 = `${name1}:${formatNumber(d1.totalWeight)}/${formatNumber(d1.totalPacks)}`;
        const text2 = d2 ? `${name2}:${formatNumber(d2.totalWeight)}/${formatNumber(d2.totalPacks)}` : '';
        itemSummaryHtml += `<tr><td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap; font-size:14px;">${text1}</td><td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap; font-size:14px;">${text2}</td></tr>`;
    }

    const colGroups = `
        <colgroup>
            <col style="width:32%;"> 
            <col style="width:21%;">
            <col style="width:21%;">
            <col style="width:26%;">
        </colgroup>`;

    const detailedItemsHtml = items.map((record, index) => {
        const weight = parseFloat(record.weight) || 0;
        const packs = parseInt(record.packs) || 0;
        const price = parseFloat(record.SupplierPricePerKg) || 0;
        const total = parseFloat(record.SupplierTotal) || 0;
        const itemName = record.item_name || '';
        const customerCode = record.customer_code?.toUpperCase() || '';

        return `
        <tr style="font-size:${fontSizeBody}; font-weight:bold; vertical-align: bottom;">
            <td style="text-align:left; padding:10px 0; white-space: nowrap;">${itemName}<br>${formatNumber(packs)}</td>
            <td style="text-align:right; padding:10px 2px; position: relative; left: -70px;">${formatNumber(weight.toFixed(2))}</td>
            <td style="text-align:right; padding:10px 2px; position: relative; left: -65px;">${formatNumber(price.toFixed(2))}</td>
            <td style="padding:10px 0; display:flex; flex-direction:column; align-items:flex-end;">
                <div style="font-size:25px; white-space:nowrap;">${customerCode}</div>
                <div style="font-weight:900; white-space:nowrap;">${formatNumber(total.toFixed(2))}</div>
            </td>
        </tr>`;
    }).join("");

    return (
        <div style={{ padding: '20px', background: '#f0f0f0', minHeight: '100vh' }}>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '20px' }}>
                <button 
                    onClick={toggleBillSize}
                    className="no-print"
                    style={{ 
                        padding: '12px 24px', 
                        cursor: 'pointer', 
                        backgroundColor: '#2563eb', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '5px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                >
                    බිල්පත් ප්‍රමාණය: {billSize}
                </button>
                <button 
                    onClick={handlePrint} 
                    className="no-print"
                    style={{ 
                        padding: '12px 24px', 
                        cursor: 'pointer', 
                        backgroundColor: '#007bff', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '5px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                >
                    📥 Download PDF (Bill: {bill.bill_no})
                </button>
            </div>

            {/* MAIN RECEIPT CONTAINER */}
            <div 
                id="bill-content"
                style={{ 
                    width: receiptMaxWidth, 
                    margin: '0 auto', 
                    padding: '10px', 
                    fontFamily: "'Courier New', monospace", 
                    color: '#000', 
                    background: '#fff',
                    boxShadow: '0 0 10px rgba(0,0,0,0.1)' 
                }}
                dangerouslySetInnerHTML={{
                    __html: `
                    <div style="width:${receiptMaxWidth}; margin:0 auto; padding:10px; font-family:'Courier New', monospace; color:#000; background:#fff;">
                        <div style="text-align:center; font-weight:bold;">
                            <div style="font-size:24px;">N66</div>
                            <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin:12px 0;">
                                <span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">xx</span>
                                <div style="font-size:18px;">ගොවියා: <span style="border:2.5px solid #000; padding:5px 10px; font-size:22px;">${bill.supplier_code}</span></div>
                            </div>
                          <div style="font-size:16px; white-space: nowrap;">එළවළු තොග වෙළෙන්දෝ බණ්ඩාරවෙල</div>
                        </div>
                        <div style="font-size:19px; margin-top:10px; padding:0 5px;">
                            <div style="font-weight: bold;">දුර:${mobile}</div>
                            <div style="display:flex; justify-content:space-between; margin-top:3px;">
                                <span>බිල් අංකය:${bill.bill_no}</span>
                                <span>දිනය:${date}</span>
                            </div>
                        </div>
                        <hr style="border:none; border-top:2.5px solid #000; margin:10px 0;">
                        <table style="width:100%; border-collapse:collapse; font-size:${fontSizeBody}; table-layout: fixed;">
                            ${colGroups}
                            <thead>
                                <tr style="border-bottom:2.5px solid #000; font-weight:bold;">
                                    <th style="text-align:left; padding-bottom:8px; font-size:${fontSizeHeader};">වර්ගය<br>මලු</th>
                                    <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -50px; top: 24px;"> කිලෝ </th>
                                     <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -45px; top: 24px;">මිල</th>
                                    <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader};">කේතය<br>අගය</th>
                                </tr>
                            </thead>
                            <tbody>${detailedItemsHtml}</tbody>
                            <tfoot>
                                <tr style="border-top:2.5px solid #000; font-weight:bold;">
                                    <td style="padding-top:12px; font-size:${fontSizeTotal};">${formatNumber(totalPacksSum)}</td>
                                    <td colspan="3" style="padding-top:12px; font-size:${fontSizeTotal};"><div style="text-align:right; float:right; white-space:nowrap;">${formatDecimal(totalsupplierSales)}</div></td>
                                </tr>
                            </tfoot>
                        </table>

                        <table style="width:100%; margin-top:20px; font-weight:bold; font-size:22px; padding:0 5px;">
                            <tr>
                              <td style="font-size:15px; white-space:nowrap; position:relative; left:-15px;">මෙම බිලට ගෙවන්න:</td>
                              <td style="text-align:right;"><span style="border-bottom:5px double #000; border-top:2px solid #000; font-size:${fontSizeTotal}; padding:5px 10px; padding-left:25px;">${formatDecimal(totalsupplierSales)}</span></td>
                            </tr>
                            
                           <tr style="font-size:18px;">
                              <td style="font-size:15px; padding-top:10px;">අත්තිකාරම්</td>
                              <td style="text-align:right; padding-top:10px; color:#000;">
                                - ${advanceAmount.toFixed(2)}
                              </td>
                            </tr>

                           <tr style="font-weight:900;">
                              <td style="font-size:18px; padding-top:5px;">ඉතිරි ශේෂය:</td>
                              <td style="text-align:right; padding-top:5px;">
                                <span style="color:#000; font-size:${fontSizeTotal};">
                                  ${netPayable.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                        </table>

                        <div style="margin-top:25px; border-top:1px dashed #000; padding-top:10px;">
                            <table style="width:100%; border-collapse:collapse; font-size:14px; text-align:center;">
                                ${itemSummaryHtml}
                            </table>
                        </div>
                    </div>
                    `
                }}
            />

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; padding: 0 !important; }
                    @page { margin: 0; }
                }
            `}</style>
        </div>
    );
};

export default ViewSupplierBill;