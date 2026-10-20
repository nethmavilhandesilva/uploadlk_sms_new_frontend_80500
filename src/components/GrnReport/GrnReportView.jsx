import React from 'react';
import * as XLSX from 'xlsx';

const GrnReportView = ({ reportData, onClose }) => {
  const { groupedData, selectedCode } = reportData;

  // Simple and reliable PDF export
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups for printing');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>GRN Report</title>
          <style>
              body { 
                  font-family: 'notosanssinhala', sans-serif; 
                  font-size: 11px; 
                  line-height: 1.4;
                  margin: 15px;
              }
              .header { 
                  text-align: center; 
                  margin-bottom: 15px;
                  border-bottom: 2px solid #333;
                  padding-bottom: 8px;
              }
              .grn-card {
                  background: linear-gradient(135deg, #004d26, #006400);
                  color: white;
                  padding: 15px;
                  margin-bottom: 20px;
                  border-radius: 8px;
                  page-break-inside: avoid;
              }
              table { 
                  width: 100%; 
                  border-collapse: collapse; 
                  margin-top: 10px;
                  margin-bottom: 10px;
              }
              th, td { 
                  border: 1px solid #000; 
                  padding: 6px; 
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
              .profit-positive { color: #00aa00; font-weight: bold; }
              .profit-negative { color: #ff4444; font-weight: bold; }
              .meta-info { 
                  font-size: 10px; 
                  color: #ffd700; 
                  margin-bottom: 8px;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <h2>GRN Report</h2>
              <p>Generated on: ${new Date().toLocaleDateString('en-CA')}</p>
          </div>

          ${Object.entries(groupedData).map(([code, data]) => `
            <div class="grn-card">
                <div style="text-align: right; font-weight: bold;">
                    ${new Date().toLocaleDateString('en-CA')}
                </div>

                <h3 style="margin-top: -20px; font-size: 1.1rem; margin-bottom: 8px;">
                    Code: ${code}
                    <div class="meta-info">
                        Item: ${data.item_name || 'N/A'} |
                        Purchase Price: ${Number(data.purchase_price).toFixed(2)} |
                        Original Weight: ${Number(data.totalOriginalWeight).toFixed(2)} |
                        Original Packs: ${Number(data.totalOriginalPacks).toFixed(2)} |
                        BW: ${data.remaining_weight} |
                        BP: ${data.remaining_packs}
                    </div>
                </h3>

                <h4 style="font-size: 0.9rem; margin-top: 12px; margin-bottom: 6px;">Transactions</h4>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Bill No</th>
                            <th>Customer</th>
                            <th>Weight</th>
                            <th>Price/Unit</th>
                            <th>Packs</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                            let totalWeight = 0;
                            let totalPacks = 0;
                            let totalAmount = 0;
                            let rows = '';
                            
                            data.all_rows.forEach((row, index) => {
                                const weight = isNaN(parseFloat(row.weight)) ? 0 : parseFloat(row.weight);
                                const packs = isNaN(parseFloat(row.packs)) ? 0 : parseFloat(row.packs);
                                const total = isNaN(parseFloat(row.total)) ? 0 : parseFloat(row.total);
                                
                                totalWeight += weight;
                                totalPacks += packs;
                                totalAmount += total;

                                rows += `
                                    <tr>
                                        <td>${row.Date ? new Date(row.Date).toLocaleDateString('en-CA') : '-'}</td>
                                        <td>${row.type}</td>
                                        <td>${row.bill_no || '-'}</td>
                                        <td>${row.customer_code || '-'}</td>
                                        <td class="text-end">${weight.toFixed(2)}</td>
                                        <td class="text-end">${row.price_per_kg || '-'}</td>
                                        <td class="text-end">${packs.toFixed(2)}</td>
                                        <td class="text-end">${total.toFixed(2)}</td>
                                    </tr>
                                `;
                            });

                            rows += `
                                <tr class="totals-row">
                                    <td colspan="4" class="text-center">Total</td>
                                    <td class="text-end">${totalWeight.toFixed(2)}</td>
                                    <td>-</td>
                                    <td class="text-end">${totalPacks.toFixed(2)}</td>
                                    <td class="text-end">${totalAmount.toFixed(2)}</td>
                                </tr>
                            `;
                            
                            return rows;
                        })()}
                    </tbody>
                </table>

                ${data.damage && data.damage.wasted_weight > 0 ? `
                    <h4 style="font-size: 0.9rem; margin-top: 12px; margin-bottom: 6px;">Damage Section</h4>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Wasted Weight</th>
                                <th>Wasted Packs</th>
                                <th>Damage Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${data.updated_at ? new Date(data.updated_at).toLocaleDateString('en-CA') : '-'}</td>
                                <td class="text-end">${data.damage.wasted_weight}</td>
                                <td class="text-end">${data.damage.wasted_packs}</td>
                                <td class="text-end">${Number(data.damage.damage_value).toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                ` : ''}

                <p class="${data.profit >= 0 ? 'profit-positive' : 'profit-negative'}" style="margin-top: 10px;">
                    Profit: ${Number(data.profit).toFixed(2)}
                </p>
            </div>
          `).join('')}
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
    const workbook = XLSX.utils.book_new();
    
    Object.entries(groupedData).forEach(([code, data]) => {
      const excelData = [];
      
      // Add headers for this GRN code
      excelData.push([`GRN Code: ${code}`]);
      excelData.push([`Item: ${data.item_name || 'N/A'}`]);
      excelData.push([`Purchase Price: ${Number(data.purchase_price).toFixed(2)}`]);
      excelData.push(['']); // Empty row
      
      // Transactions header
      excelData.push(['Transactions']);
      excelData.push(['Date', 'Type', 'Bill No', 'Customer', 'Weight', 'Price/Unit', 'Packs', 'Total']);
      
      // Transactions data
      let totalWeight = 0;
      let totalPacks = 0;
      let totalAmount = 0;
      
      data.all_rows.forEach(row => {
        const weight = isNaN(parseFloat(row.weight)) ? 0 : parseFloat(row.weight);
        const packs = isNaN(parseFloat(row.packs)) ? 0 : parseFloat(row.packs);
        const total = isNaN(parseFloat(row.total)) ? 0 : parseFloat(row.total);
        
        totalWeight += weight;
        totalPacks += packs;
        totalAmount += total;

        excelData.push([
          row.Date ? new Date(row.Date).toLocaleDateString('en-CA') : '-',
          row.type,
          row.bill_no || '-',
          row.customer_code || '-',
          weight.toFixed(2),
          row.price_per_kg || '-',
          packs.toFixed(2),
          total.toFixed(2)
        ]);
      });
      
      // Transactions totals
      excelData.push(['Total', '', '', '', totalWeight.toFixed(2), '', totalPacks.toFixed(2), totalAmount.toFixed(2)]);
      excelData.push(['']); // Empty row
      
      // Damage section if exists
      if (data.damage && data.damage.wasted_weight > 0) {
        excelData.push(['Damage Section']);
        excelData.push(['Date', 'Wasted Weight', 'Wasted Packs', 'Damage Value']);
        excelData.push([
          data.updated_at ? new Date(data.updated_at).toLocaleDateString('en-CA') : '-',
          data.damage.wasted_weight,
          data.damage.wasted_packs,
          Number(data.damage.damage_value).toFixed(2)
        ]);
        excelData.push(['']); // Empty row
      }
      
      // Profit
      excelData.push(['Profit:', Number(data.profit).toFixed(2)]);
      excelData.push(['']); // Empty row
      excelData.push(['']); // Empty row
      
      // Create worksheet for this GRN code
      const worksheet = XLSX.utils.aoa_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, `GRN_${code.substring(0, 10)}`);
    });

    // Save the Excel file
    XLSX.writeFile(workbook, `GRN_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Simple browser print (fallback)
  const handleSimplePrint = () => {
    window.print();
  };

  return (
    <div style={{ minHeight: '100vh', padding: '20px', backgroundColor: '#99ff99' }}>
      {/* Export Buttons */}
      <div className="d-flex justify-content-between mb-3 flex-wrap gap-2">
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

      <div id="print-area">
        {Object.entries(groupedData).map(([code, data]) => (
          <div key={code} className="card" style={{
            background: 'linear-gradient(135deg, #004d26, #006400)',
            color: 'white',
            padding: '20px',
            marginBottom: '20px',
            borderRadius: '12px',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Date */}
            <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
              {new Date().toLocaleDateString('en-CA')}
            </div>

            {/* Code & Item Info */}
            <h2 style={{ marginTop: '-30px', fontSize: '1.3rem', marginBottom: '12px' }}>
              Code: {code}
              <span style={{ fontSize: '0.85rem', color: '#ffd700', display: 'block' }}>
                Item: {data.item_name || 'N/A'} |
                Purchase Price: {Number(data.purchase_price).toFixed(2)} |
                Original Weight: {Number(data.totalOriginalWeight).toFixed(2)} |
                Original Packs: {Number(data.totalOriginalPacks).toFixed(2)} |
                BW: {data.remaining_weight} |
                BP: {data.remaining_packs}
              </span>
            </h2>

            {/* Sales + GRN Table */}
            <h4 style={{ fontSize: '1rem', marginTop: '15px', marginBottom: '8px' }}>Transactions</h4>
            <table className="table table-bordered table-sm text-white mb-2" style={{ 
              background: 'rgba(255, 255, 255, 0.05)', 
              borderRadius: '8px', 
              overflow: 'hidden', 
              width: '100%', 
              marginBottom: '10px',
              fontSize: '0.9rem'
            }}>
              <thead>
                <tr>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Date</th>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Type</th>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Bill No</th>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Customer</th>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Weight</th>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Price/Unit</th>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Packs</th>
                  <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let totalWeight = 0;
                  let totalPacks = 0;
                  let totalAmount = 0;

                  return (
                    <>
                      {data.all_rows.map((row, index) => {
                        const weight = isNaN(parseFloat(row.weight)) ? 0 : parseFloat(row.weight);
                        const packs = isNaN(parseFloat(row.packs)) ? 0 : parseFloat(row.packs);
                        const total = isNaN(parseFloat(row.total)) ? 0 : parseFloat(row.total);
                        
                        totalWeight += weight;
                        totalPacks += packs;
                        totalAmount += total;

                        return (
                          <tr key={index}>
                            <td>{row.Date ? new Date(row.Date).toLocaleDateString('en-CA') : '-'}</td>
                            <td>{row.type}</td>
                            <td>{row.bill_no || '-'}</td>
                            <td>{row.customer_code || '-'}</td>
                            <td className="text-end">{weight.toFixed(2)}</td>
                            <td className="text-end">{row.price_per_kg || '-'}</td>
                            <td className="text-end">{packs.toFixed(2)}</td>
                            <td className="text-end">{total.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ fontWeight: 'bold' }}>
                        <td colSpan="4" className="text-center">Total</td>
                        <td className="text-end">{totalWeight.toFixed(2)}</td>
                        <td>-</td>
                        <td className="text-end">{totalPacks.toFixed(2)}</td>
                        <td className="text-end">{totalAmount.toFixed(2)}</td>
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>

            {/* Damage Section */}
            {data.damage && data.damage.wasted_weight > 0 && (
              <>
                <h4 style={{ fontSize: '1rem', marginTop: '15px', marginBottom: '8px' }}>Damage Section</h4>
                <table className="table table-bordered table-sm text-white mb-2" style={{ 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  borderRadius: '8px', 
                  overflow: 'hidden', 
                  width: '100%', 
                  marginBottom: '10px',
                  fontSize: '0.9rem'
                }}>
                  <thead>
                    <tr>
                      <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Date</th>
                      <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Wasted Weight</th>
                      <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Wasted Packs</th>
                      <th style={{ background: 'rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>Damage Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{data.updated_at ? new Date(data.updated_at).toLocaleDateString('en-CA') : '-'}</td>
                      <td className="text-end">{data.damage.wasted_weight}</td>
                      <td className="text-end">{data.damage.wasted_packs}</td>
                      <td className="text-end">{Number(data.damage.damage_value).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* Profit */}
            <p className={data.profit >= 0 ? 'profit-positive' : 'profit-negative'} style={{
              color: data.profit >= 0 ? '#00ff00' : '#ff6347',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}>
              Profit: {Number(data.profit).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      <style jsx>{`
        @media print {
          .btn { display: none !important; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; top: 0; left: 0; width: 100%; }
          table { font-size: 0.7rem; }
          .card { 
            padding: 10px; 
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default GrnReportView;