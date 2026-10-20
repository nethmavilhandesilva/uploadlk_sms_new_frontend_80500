// src/components/SupplierDetailsPanel.jsx
import React, { useMemo, useEffect, useState, useCallback } from 'react';
import api from '../../api';

// Props needed: data fetched by parent (details, isLoading), identifiers (supplierCode, billNo, isUnprintedBill), and parent callback (onClose/onDone).
const SupplierDetailsPanel = ({ 
    supplierCode, 
    billNo: initialBillNo, 
    isUnprintedBill, 
    details: initialDetails, 
    isLoading: initialLoading,
    onDone 
}) => {
    const [details, setDetails] = useState(initialDetails);
    const [billNo, setBillNo] = useState(initialBillNo);
    const [isLoading, setIsLoading] = useState(initialLoading);
    const [error, setError] = useState(null);

    // --- HELPER FUNCTIONS ---
    const formatDecimal = (value, decimals = 2) => (parseFloat(value) || 0).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    
    const getRowStyle = (index) => index % 2 === 0 ? { backgroundColor: '#f8f9fa' } : { backgroundColor: '#ffffff' };

    // Sync external props on change
    useEffect(() => {
        setDetails(initialDetails);
        setIsLoading(initialLoading);
        setBillNo(initialBillNo);
        setError(null);
    }, [initialDetails, initialLoading, initialBillNo]);

    // --- CALCULATIONS (useMemo) ---
    const {
        totalWeight,
        totalCommission,
        amountPayable,
        itemSummaryData,
        detailedItemsHtml,
        totalPacksSum,
        totalsupplierSales,
        totalSupplierPackCost,
    } = useMemo(() => {
        let totalWeight = 0;
        let totalsupplierSales = 0;
        let totalCommission = 0;
        let totalPacksSum = 0;
        let totalSupplierPackCost = 0;

        const itemSummary = {};
        const itemsHtmlArray = [];

        initialDetails.forEach(record => {
            const weight = parseFloat(record.weight) || 0;
            const commission = parseFloat(record.commission_amount) || 0;
            const packs = parseInt(record.packs) || 0;
            const SupplierPricePerKg = parseFloat(record.SupplierPricePerKg) || 0;
            const SupplierTotal = parseFloat(record.SupplierTotal) || 0;
            const itemName = record.item_name || 'Unknown Item';
            const SupplierPackCost = parseFloat(record.SupplierPackCost) || 0;

            totalWeight += weight;
            totalsupplierSales += SupplierTotal;
            totalCommission += commission;
            totalPacksSum += packs;
            totalSupplierPackCost += SupplierPackCost;

            itemsHtmlArray.push(`
                <tr style="font-size: 1.1em;">
                    <td style="text-align:left;padding:3px;border-bottom:1px solid #eee;">
                        <span style="font-weight: bold;">${itemName}</span><br>${packs}
                    </td>
                    <td style="text-align:center;padding:3px;border-bottom:1px solid #eee;"><br>${weight.toFixed(3)}</td>
                    <td style="text-align:center;padding:3px;border-bottom:1px solid #eee;"><br>${SupplierPricePerKg.toFixed(2)}</td>
                    <td style="text-align:right;padding:3px;border-bottom:1px solid #eee;">
                        <span style="font-weight: bold; font-size: 0.9em;">${record.customer_code.toUpperCase()}</span><br>${SupplierTotal.toFixed(2)}
                    </td>
                </tr>
            `);

            if (!itemSummary[itemName]) {
                itemSummary[itemName] = { totalWeight: 0, totalPacks: 0 };
            }
            itemSummary[itemName].totalWeight += weight;
            itemSummary[itemName].totalPacks += packs;
        });

        const finalAmountPayable = totalsupplierSales - totalCommission;

        return {
            totalWeight,
            totalCommission,
            amountPayable: finalAmountPayable,
            itemSummaryData: itemSummary,
            detailedItemsHtml: itemsHtmlArray.join(''),
            totalPacksSum,
            totalsupplierSales,
            totalSupplierPackCost,
        };
    }, [initialDetails]);

    // --- API call to mark records as printed ---
    const markRecordsAsPrinted = useCallback(async (finalBillNo, ids) => {
        // ... (API call logic remains the same)
        const payload = {
            bill_no: finalBillNo,
            transaction_ids: ids,
        };

        try {
            const response = await api.post('/suppliers/mark-as-printed', payload);
            console.log(`✅ Successfully marked ${response.data.updated_count || ids.length} records with bill no: ${finalBillNo}`);
        } catch (err) {
            console.error('❌ Failed to mark supplier records as printed:', err);
            const errorMessage = err.response?.data?.error || err.message;
            alert(`Warning: Bill generated (${finalBillNo}) but failed to mark records as printed on the server. Details: ${errorMessage}. Please notify admin.`);
        }
    }, []);

    // --- BILL CONTENT GENERATION ---
    const getBillContent = useCallback((currentBillNo) => {
        // ... (Bill content generation logic remains the same)
        const date = new Date().toLocaleDateString('si-LK');
        const time = new Date().toLocaleTimeString('si-LK');

        const mobile = '071XXXXXXX';
        const totalPackDueCost = totalSupplierPackCost;
        const finaltotal = totalsupplierSales + totalSupplierPackCost;

        const itemSummaryKeys = Object.keys(itemSummaryData);
        const itemSummaryHtml = itemSummaryKeys.map(itemName => {
            const sum = itemSummaryData[itemName];
            return `
                <tr>
                    <td style="width: 50%;">${itemName}</td>
                    <td style="width: 50%; text-align: right;">${sum.totalPacks} / ${sum.totalWeight.toFixed(3)}kg</td>
                </tr>
            `;
        }).join('');

        return `<div class="receipt-container" style="width:100%;max-width:300px;margin:0 auto;padding:5px;">
    <div style="text-align:center;margin-bottom:5px;">
        <h3 style="font-size:1.8em;font-weight:bold;margin:0;">NVDS</h3>
    </div>
    <div style="text-align:left;margin-bottom:5px;">
        <table style="width:100%;font-size:9px;border-collapse:collapse;">
            <tr><td style="width:50%;">දිනය : ${date}</td><td style="width:50%;text-align:right;">${time}</td></tr>
            <tr><td colspan="2">දුර : ${mobile || ''}</td></tr>
            <tr><td>බිල් අංකය : <strong>${currentBillNo || 'N/A'}</strong></td><td style="text-align:right;"><strong style="font-size:2.0em;">${supplierCode.toUpperCase()}</strong></td></tr>
        </table>
    </div>
    <hr style="border:1px solid #000;margin:5px 0;opacity:1;">
    <table style="width:100%;font-size:9px;border-collapse:collapse;">
        <thead style="font-size:1.8em;">
            <tr><th style="text-align:left;padding:2px;">වර්ගය<br>මලු</th><th style="padding:2px;">කිලෝ</th><th style="padding:2px;">මිල</th><th style="text-align:right;padding:2px;">අගය</th></tr>
        </thead>
        <tbody>
            <tr><td colspan="4"><hr style="border:1px solid #000;margin:5px 0;opacity:1;"></td></tr>
            ${detailedItemsHtml}
            <tr><td colspan="4"><hr style="border:1px solid #000;margin:5px 0;opacity:1;"></td></tr>
            <tr><td colspan="2" style="text-align:left;font-weight:bold;font-size:1.8em;">${totalPacksSum}</td><td colspan="2" style="text-align:right;font-weight:bold;font-size:1.5em;">${totalsupplierSales.toFixed(2)}</td></tr>
        </tbody>
    </table>
    <table style="width:100%;font-size:15px;border-collapse:collapse;">
        <tr><td>කුලිය:</td><td style="text-align:right;font-weight:bold;">${totalPackDueCost.toFixed(2)}</td></tr>
        <tr><td>අගය:</td><td style="text-align:right;font-weight:bold;"><span style="display:inline-block; border-top:1px solid #000; border-bottom:3px double #000; padding:2px 4px; min-width:80px; text-align:right; font-size:1.5em;">${(finaltotal).toFixed(2)}</span></td></tr>
    </table>
    <div style="font-size:10px;">
        <table style="width:100%;font-size:10px;border-collapse:collapse;margin-top:10px;">
            ${itemSummaryHtml}
        </table>
    </div>
    <tr><td colspan="4"><hr style="border:1px solid #000;margin:5px 0;opacity:1;"></td></tr>
    <div style="text-align:center;margin-top:10px;font-size:10px;">
        <p style="margin:0;">භාණ්ඩ පරීක්ෂාකර බලා රැගෙන යන්න</p><p style="margin:0;">නැවත භාර ගනු නොලැබේ</p>
    </div>
</div>`;
    }, [supplierCode, detailedItemsHtml, totalPacksSum, totalsupplierSales, totalSupplierPackCost, itemSummaryData]);

    // --- UPDATED: handlePrint function to generate Bill No, Print, and Mark ---
    const handlePrint = useCallback(async () => {
        if (!details || details.length === 0) {
            console.log('Cannot print: No details available.');
            return;
        }

        let finalBillNo = billNo;

        if (isUnprintedBill) {
            setIsLoading(true);
            try {
                const billResponse = await api.get('/generate-f-series-bill');
                finalBillNo = billResponse.data.new_bill_no;
                setBillNo(finalBillNo);
            } catch (err) {
                console.error('Error generating bill number:', err);
                setIsLoading(false);
                alert('Failed to generate a new bill number. Print cancelled.');
                return;
            }
        } else {
            const confirmPrint = window.confirm(`This bill (${billNo}) has already been marked as printed. Do you want to print a copy?`);
            if (!confirmPrint) {
                return;
            }
        }

        const content = getBillContent(finalBillNo);
        const printWindow = window.open('', '_blank', 'height=600,width=800');

        if (printWindow) {
            printWindow.document.write('<html><head><title>Bill Print</title>');
            printWindow.document.write(`<style>body { font-family: sans-serif; margin: 0; padding: 0; }.receipt-container { width: 80mm; padding: 5px; margin: 0 auto; }@media print { body { margin: 0; } }</style>`);
            printWindow.document.write('</head><body>');
            printWindow.document.write(content);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.focus();

            printWindow.print();

            if (isUnprintedBill) {
                const transactionIds = details.map(record => record.id).filter(id => id);
                if (transactionIds.length > 0 && finalBillNo && finalBillNo !== 'N/A') {
                    setTimeout(async () => {
                        await markRecordsAsPrinted(finalBillNo, transactionIds);
                        onDone(); // Use onDone to tell parent to refresh and show summary
                    }, 50);
                } else {
                    onDone();
                }
            } else {
                onDone(); // Just refresh/close after re-printing
            }
        } else {
            alert("Please allow pop-ups to print the bill.");
        }
    }, [details, billNo, isUnprintedBill, getBillContent, markRecordsAsPrinted, onDone]);

    // --- KEYBOARD EVENT LISTENER (F4) ---
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'F4' || event.keyCode === 115) {
                event.preventDefault();
                if (typeof event.stopImmediatePropagation === 'function') {
                    event.stopImmediatePropagation();
                }
                if (details && details.length > 0 && !isLoading) {
                    handlePrint();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [details, handlePrint, isLoading]);

    // --- INLINE STYLES (Adapted for Panel) ---
    const panelContainerStyle = {
        backgroundColor: '#ffffff', 
        padding: '30px', 
        borderRadius: '12px',
        maxWidth: '680px', 
        maxHeight: 'calc(100vh - 120px)', 
        overflowY: 'auto',
        position: 'relative', 
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        fontFamily: 'Roboto, Arial, sans-serif',
        border: '3px solid #007bff', 
        marginTop: '-90px',// Highlight for center panel
        maxWidth: '820px',
    };
    const headerStyle = {
        color: '#007bff', borderBottom: '2px solid #e9ecef', paddingBottom: '10px',
        marginTop: '0', marginBottom: '20px', fontSize: '1.8rem', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
    };
    const supplierCodeBadgeStyle = {
        backgroundColor: '#28a745', color: 'white', padding: '5px 10px',
        borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold',
    };
    const tableContainerStyle = {
        marginTop: '20px', overflowX: 'auto',
    };
    const tableStyle = {
        width: '100%', borderCollapse: 'collapse', minWidth: '900px',
        fontSize: '0.9rem', marginBottom: '30px',
    };
    const thStyle = {
        backgroundColor: '#007bff', color: 'white', fontWeight: '600',
        padding: '12px 15px', textAlign: 'left', position: 'sticky',
        top: '0', zIndex: 10,
    };
    const tdStyle = {
        padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #dee2e6',
        whiteSpace: 'nowrap',
    };
    const summaryBoxContainerStyle = {
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap',
        gap: '20px', padding: '20px 0', borderBottom: '2px solid #e9ecef',
    };
    const summaryBoxStyle = (color) => ({
        flex: '1', minWidth: '200px',
        backgroundColor: color === 'blue' ? '#e7f3ff' : color === 'red' ? '#ffe7e7' : '#e6ffed',
        padding: '15px', borderRadius: '8px', textAlign: 'center',
        border: `1px solid ${color === 'blue' ? '#007bff' : color === 'red' ? '#dc3545' : '#28a745'}`,
    });
    const summaryValueStyle = {
        fontSize: '1.5rem', fontWeight: 'bold', color: '#343a40', marginTop: '5px',
    };
    const itemSummaryHeaderStyle = {
        marginTop: '30px', fontSize: '1.5rem', color: '#495057',
        borderBottom: '1px dashed #dee2e6', paddingBottom: '10px', marginBottom: '15px',
    };
    const itemSummaryTableStyle = {
        width: '100%', borderCollapse: 'collapse', marginTop: '15px',
    };
    const itemSummaryThStyle = {
        ...thStyle, backgroundColor: '#6c757d', padding: '10px 15px', fontSize: '0.95rem',
    };
    const itemSummaryTdStyle = {
        ...tdStyle, padding: '10px 15px',
    };
    const printButtonStyle = {
        padding: '10px 20px', fontSize: '1.1rem', fontWeight: 'bold',
        backgroundColor: '#ffc107', color: '#343a40', border: 'none',
        borderRadius: '6px', cursor: 'pointer', marginTop: '20px', transition: 'background-color 0.2s',
    };
    const backButtonStyle = {
        background: 'none',
        border: 'none',
        color: '#6c757d',
        cursor: 'pointer',
        fontSize: '1rem',
        marginBottom: '20px',
        padding: '5px 0',
        display: 'block',
        fontWeight: '500',
        transition: 'color 0.2s',
        textAlign: 'left',
    };
    
    // --- Item Summary Component ---
    const ItemSummary = ({ summaryData }) => {
        const itemNames = Object.keys(summaryData);
        if (itemNames.length === 0) return null;

        return (
            <div>
                <h3 style={itemSummaryHeaderStyle}>📦 Item Summary</h3>
                <table style={itemSummaryTableStyle}>
                    <thead>
                        <tr>
                            <th style={itemSummaryThStyle}>Item Name</th>
                            <th style={itemSummaryThStyle}>Total Weight (kg)</th>
                            <th style={itemSummaryThStyle}>Total Packs</th>
                        </tr>
                    </thead>
                    <tbody>
                        {itemNames.map((itemName, index) => (
                            <tr key={itemName} style={getRowStyle(index)}>
                                <td style={itemSummaryTdStyle}>{itemName}</td>
                                <td style={itemSummaryTdStyle}>{formatDecimal(summaryData[itemName].totalWeight, 3)}</td>
                                <td style={itemSummaryTdStyle}>{summaryData[itemName].totalPacks}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    if (isLoading) {
        return <div style={panelContainerStyle}><p style={{ textAlign: 'center', fontSize: '1.2em', color: '#007bff' }}>{isUnprintedBill ? 'Generating Bill No and Loading...' : 'Loading bill details...'}</p></div>;
    }

    if (error || details.length === 0) {
        return (
            <div style={panelContainerStyle}>
                <button onClick={onDone} style={backButtonStyle}>&larr; Back to Summary</button>
                <p style={{ color: '#6c757d' }}>{error ? `Error: ${error}` : 'No records found for this supplier or bill.'}</p>
            </div>
        );
    }

    // --- MAIN RENDER ---
    return (
        <div style={panelContainerStyle}>
            <button onClick={onDone} style={backButtonStyle}>&larr; Back to Summary</button>

            {/* --- SUPPLIER CODE IN HEADER (Displays currently known billNo) --- */}
            <div style={headerStyle}>
                <h2>Transaction Details (Bill No: <strong>{billNo || (isUnprintedBill ? 'Pending...' : 'N/A')}</strong>)</h2>
                <span style={supplierCodeBadgeStyle}>{supplierCode}</span>
            </div>

            {/* --- GRAND SUMMARY BOXES --- */}
          
            
            {/* --- DETAILED TABLE --- */}
            <div style={tableContainerStyle}>
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Date</th>
                            <th style={thStyle}>Bill No</th>
                            <th style={thStyle}>Customer</th>
                            <th style={thStyle}>Item</th>
                            <th style={thStyle}>Packs</th>
                            <th style={thStyle}>Weight</th>
                            <th style={thStyle}>Price/kg</th>
                            <th style={thStyle}>Gross Total</th>
                            <th style={thStyle}>Commission</th>
                            <th style={thStyle}>Net Payable</th>
                        </tr>
                    </thead>
                    <tbody>
                        {details.map((record, index) => (
                            <tr
                                key={record.id || index}
                                style={getRowStyle(index)}
                            >
                                <td style={tdStyle}>{record.Date}</td>
                                <td style={tdStyle}>{record.supplier_bill_no || billNo}</td>
                                <td style={tdStyle}>{record.customer_code}</td>
                                <td style={tdStyle}><strong>{record.item_name}</strong></td>
                                <td style={tdStyle}>{record.packs}</td>
                                <td style={tdStyle}>{formatDecimal(record.weight, 3)}</td>
                                <td style={tdStyle}>{formatDecimal(record.SupplierPricePerKg)}</td>
                                <td style={tdStyle}>{formatDecimal(record.SupplierTotal)}</td>
                                <td style={tdStyle}>{formatDecimal(record.commission_amount)}</td>
                                <td style={tdStyle}>{formatDecimal(parseFloat(record.SupplierTotal) - parseFloat(record.commission_amount))}</td>
                            </tr>
                        ))}
                        <tr style={{ ...getRowStyle(details.length), fontWeight: 'bold', borderTop: '2px solid #000' }}>
                            <td style={tdStyle} colSpan="4"><strong>TOTALS</strong></td>
                            <td style={tdStyle}>{totalPacksSum}</td>
                            <td style={tdStyle}>{formatDecimal(totalWeight, 3)}</td>
                            <td style={tdStyle}>-</td>
                            <td style={tdStyle}>{formatDecimal(totalsupplierSales)}</td>
                            <td style={tdStyle}>{formatDecimal(totalCommission)}</td>
                            <td style={{ ...tdStyle, fontSize: '1.1em', color: '#17a2b8' }}>{formatDecimal(amountPayable)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* --- ITEM SUMMARY --- */}
            <ItemSummary summaryData={itemSummaryData} />

            {/* --- PRINT BUTTON --- */}
            <div style={{ textAlign: 'center' }}>
                <button
                    style={printButtonStyle}
                    onClick={handlePrint}
                    onMouseOver={e => e.currentTarget.style.backgroundColor = '#e0a800'}
                    onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffc107'}
                    disabled={isLoading}
                >
                    🖨️ {isUnprintedBill ? `Print & Finalize Bill (F4)` : `Print Copy (F4)`}
                </button>
            </div>
        </div>
    );
};

export default SupplierDetailsPanel;