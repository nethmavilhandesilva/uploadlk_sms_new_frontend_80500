import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { API_BASE_URL } from '../config';

const PublicBill = () => {
    const { token } = useParams();
    const [billData, setBillData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Update this URL to match your Laravel Backend API
        axios.get(`${API_BASE_URL}/public/bill/${token}`)
            .then(res => {
                setBillData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Bill fetch error:", err);
                setLoading(false);
            });
    }, [token]);

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

        const colGroups = `
        <colgroup>
            <col style="width:32%;"> 
            <col style="width:21%;">
            <col style="width:21%;">
            <col style="width:26%;">
        </colgroup>`;

        const itemsHtml = salesData.map(s => {
            const packs = parseInt(s.packs) || 0;
            const weight = parseFloat(s.weight) || 0;
            const price = parseFloat(s.price_per_kg) || 0;
            const value = (weight * price).toFixed(2);

            return `
            <tr style="font-size:${fontSizeBody}; font-weight:bold; vertical-align: bottom;">
                <td style="text-align:left; padding:10px 0; white-space: nowrap;">
                    ${s.item_name || ""}<br>${formatNumber(packs)}
                </td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -70px;">
                   ${formatNumber(weight.toFixed(2))}
                </td>
                <td style="text-align:right; padding:10px 2px; position: relative; left: -55px;">${formatNumber(price.toFixed(2))}</td>
                <td style="padding:10px 0; display:flex; flex-direction:column; align-items:flex-end;">
                    <div style="font-size:25px; white-space:nowrap;">
                        ${s.supplier_code || "ASW"}
                    </div>
                    <div style="font-weight:900; white-space:nowrap;">
                        ${formatNumber(value)}
                    </div>
                </td>
            </tr>`;
        }).join("");

        const totalSales = salesData.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseFloat(s.price_per_kg) || 0)), 0);
        const totalPackCost = salesData.reduce((sum, s) => sum + ((parseFloat(s.CustomerPackCost) || 0) * (parseFloat(s.packs) || 0)), 0);
        const finalGrandTotal = totalSales + totalPackCost;
        const givenAmount = salesData.find(s => parseFloat(s.given_amount) > 0)?.given_amount || 0;
        const remaining = givenAmount > 0 ? Math.abs(givenAmount - finalGrandTotal) : 0;

        const loanRow = globalLoanAmount !== 0 ? `
        <tr>
            <td style="font-size:20px; padding-top:8px;">පෙර ණය:</td>
            <td style="text-align:right; font-size:22px; font-weight:bold; padding-top:8px;">
                Rs. ${formatNumber(Math.abs(globalLoanAmount).toFixed(2))}
            </td>
        </tr>` : '';

        const summaryEntries = Object.entries(consolidatedSummary);
        let summaryHtmlContent = '';
        for (let i = 0; i < summaryEntries.length; i += 2) {
            const [name1, d1] = summaryEntries[i];
            const [name2, d2] = summaryEntries[i + 1] || [null, null];
            const text1 = `${name1}:${formatNumber(d1.totalWeight)}/${formatNumber(d1.totalPacks)}`;
            const text2 = d2 ? `${name2}:${formatNumber(d2.totalWeight)}/${formatNumber(d2.totalPacks)}` : '';
            summaryHtmlContent += `
            <tr>
                <td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap;">${text1}</td>
                <td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap;">${text2}</td>
            </tr>`;
        }

        return `
        <div style="width:${receiptMaxWidth}; margin:0 auto; padding:10px; font-family: 'Courier New', monospace; color:#000; background:#fff;">
            <div style="text-align:center; font-weight:bold;">
                <div style="font-size:24px;">N66</div>
                <div style="font-size:20px; margin-bottom:5px;font-weight:bold;">colombage lanka (Pvt) Ltd</div>
                <div style="display:flex; justify-content:center; gap:15px; margin:12px 0;">
                    <span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">xx</span>
                    <span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">${customerName.toUpperCase()}</span>
                </div>
                <div style="font-size:16px;">එළවළු,පළතුරු තොග වෙළෙන්දෝ</div>
                <div style="display:flex; justify-content:space-between; font-size:14px; margin-top:6px; padding:0 5px;">
                    <span>බණ්ඩාරවෙල</span>
                    <span>${time}</span>
                </div>
            </div>
            <div style="font-size:19px; margin-top:10px; padding:0 5px;">
                <div style="font-weight: bold;">දුර: 0777672838 / 071437115</div>
                <div style="display:flex; justify-content:space-between; margin-top:3px;">
                    <span>බිල් අංකය:${billNo}</span>
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
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -45px;top: 24px;">මිල</th>
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader};">අයිතිය<br>අගය</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot>
                    <tr style="border-top:2.5px solid #000; font-weight:bold;">
                        <td style="padding-top:12px; font-size:${fontSizeTotal};">${formatNumber(totalPacksSum)}</td>
                        <td colspan="3" style="padding-top:12px; font-size:${fontSizeTotal}; text-align:right;">
                            <div style="float:right; white-space:nowrap;">${Number(totalSales).toFixed(2)}</div>
                        </td>
                    </tr>
                </tfoot>
            </table>
            <table style="width:100%; margin-top:20px; font-weight:bold; font-size:22px; padding:0 5px;">
                <tr>
                    <td>මලු:</td>
                    <td style="text-align:right; font-weight:bold;">${formatNumber(totalPackCost.toFixed(2))}</td>
                </tr>
                <tr>
                    <td style="font-size:20px; padding-top:8px;">එකතුව:</td>
                    <td style="text-align:right; padding-top:8px;">
                        <span style="border-bottom:5px double #000; border-top:2px solid #000; font-size:${fontSizeTotal}; padding:5px 10px;">
                            ${(Number(finalGrandTotal).toFixed(2))}
                        </span>
                    </td>
                </tr>
                ${loanRow}
                ${givenAmount > 0 ? `
                <tr>
                    <td style="font-size:18px; padding-top:18px;">දුන් මුදල:</td>
                    <td style="text-align:right; font-size:20px; padding-top:18px; font-weight:bold;">
                        ${formatNumber(parseFloat(givenAmount).toFixed(2))}
                    </td>
                </tr>
                <tr>
                    <td style="font-size:22px;">ඉතිරිය:</td>
                    <td style="text-align:right; font-size:26px;">${formatNumber(remaining.toFixed(2))}</td>
                </tr>` : ''}
            </table>
            <table style="width:100%; border-collapse:collapse; margin-top:25px; font-size:14px; text-align:center;">
                ${summaryHtmlContent}
            </table>
            <div style="text-align:center; margin-top:25px; font-size:13px; border-top:2.5px solid #000; padding-top:10px;">
                <p style="margin:4px 0; font-weight:bold;">භාණ්ඩ පරීක්ෂාකර බලා රැගෙන යන්න</p>
                <p style="margin:4px 0;">නැවත භාර ගනු නොලැබේ</p>
            </div>
        </div>`;
    };

    const handleDownload = () => {
        const element = document.getElementById('bill-content');
        const opt = {
            margin: [10, 5, 10, 5],
            filename: `Bill_${billData.bill_no}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 3, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    };

    if (loading) return <div className="p-10 text-center text-xl">Loading Bill...</div>;
    if (!billData) return <div className="p-10 text-center text-red-500">Bill Not Found.</div>;

    const salesArray = typeof billData.sales_data === 'string'
        ? JSON.parse(billData.sales_data)
        : billData.sales_data;

    return (
        <div className="bg-gray-200 min-h-screen p-4 flex flex-col items-center">
            {/* Styled Download Button */}
           <button 
    onClick={handleDownload}
    className="mb-6 text-white px-12 py-4 rounded-full font-black shadow-2xl uppercase tracking-widest transition-all transform hover:scale-105 active:scale-95 border-b-4 border-red-900"
    style={{ 
        backgroundColor: '#dc2626', // This is tailwind's red-600
        display: 'block',
        margin: '0 auto 24px auto' 
    }}
>
    Download PDF (බාගත කරන්න)
</button>

            <div id="bill-content" className="bg-white shadow-2xl p-2 rounded-sm">
                <div dangerouslySetInnerHTML={{
                    __html: buildFullReceiptHTML(
                        salesArray,
                        billData.bill_no,
                        billData.customer_name,
                        billData.customer_mobile,
                        billData.loan_amount
                    )
                }} />
            </div>
        </div>
    );
};

export default PublicBill;