import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../../config';

const BACKEND_URL = API_BASE_URL;

const GrnSalesOverviewReport = ({ isOpen, onClose }) => {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('Default Company');
  const [settingDate, setSettingDate] = useState('');
  const [isClient, setIsClient] = useState(false);
  const printRef = useRef();

  // Ensure we're on client side before printing
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      console.log('🟡 GRN Sales Overview Report opened');
      fetchReportData();
    }
  }, [isOpen]);

  const fetchReportData = async () => {
    try {
      console.log('🟢 Setting loading to true');
      setLoading(true);

      const apiUrl = `${API_BASE_URL}/reports/grn-sales-overview`;
      
      console.log('🟢 API URL constructed:', apiUrl);

      console.log('🟢 About to call fetch...');
      const response = await fetch(apiUrl);
      console.log('🟢 Fetch completed, response status:', response.status);
      
      if (!response.ok) {
        console.log('❌ Response not OK');
        throw new Error(`Server returned ${response.status} status`);
      }

      console.log('🟢 About to parse JSON response...');
      const data = await response.json();
      console.log('🟢 JSON parsed successfully:', data);
      
      if (data.error) {
        console.log('❌ API returned error:', data.error);
        throw new Error(data.error);
      }

      console.log('🟢 Setting report data...');
      setReportData(data.reportData || []);
      setCompanyName(data.companyName || 'Default Company');
      setSettingDate(data.settingDate || new Date().toLocaleDateString('en-CA'));
      
    } catch (err) {
      console.error('❌ CATCH BLOCK - Error:', err);
      console.error('Error details:', err.message);
      alert('Error: ' + err.message);
    } finally {
      console.log('🟢 FINALLY BLOCK - Setting loading to false');
      setLoading(false);
    }
  };

  // Calculate grand totals
  const calculateGrandTotals = () => {
    return reportData.reduce((acc, item) => {
      acc.grandTotalOriginalPacks += Number(item.original_packs) || 0;
      acc.grandTotalOriginalWeight += Number(item.original_weight) || 0;
      acc.grandTotalSoldPacks += Number(item.sold_packs) || 0;
      acc.grandTotalSoldWeight += Number(item.sold_weight) || 0;
      acc.grandTotalSalesValue += Number(item.total_sales_value) || 0;
      acc.grandTotalRemainingPacks += Number(item.remaining_packs) || 0;
      acc.grandTotalRemainingWeight += Number(item.remaining_weight) || 0;
      acc.grandTotalPrice += Number(item.sp) || 0;
      return acc;
    }, {
      grandTotalOriginalPacks: 0,
      grandTotalOriginalWeight: 0,
      grandTotalSoldPacks: 0,
      grandTotalSoldWeight: 0,
      grandTotalSalesValue: 0,
      grandTotalRemainingPacks: 0,
      grandTotalRemainingWeight: 0,
      grandTotalPrice: 0
    });
  };

  // Group data by GRN code and item name
  const getGroupedData = () => {
    const grouped = {};
    
    reportData.forEach(item => {
      const key = `${item.grn_code}-${item.item_name}`;
      if (!grouped[key]) {
        grouped[key] = {
          grnCode: item.grn_code,
          itemName: item.item_name,
          original_packs: 0,
          original_weight: 0,
          sold_packs: 0,
          sold_weight: 0,
          total_sales_value: 0,
          remaining_packs: 0,
          remaining_weight: 0,
          sp: 0,
          count: 0
        };
      }
      
      grouped[key].original_packs += Number(item.original_packs) || 0;
      grouped[key].original_weight += Number(item.original_weight) || 0;
      grouped[key].sold_packs += Number(item.sold_packs) || 0;
      grouped[key].sold_weight += Number(item.sold_weight) || 0;
      grouped[key].total_sales_value += Number(item.total_sales_value) || 0;
      grouped[key].remaining_packs += Number(item.remaining_packs) || 0;
      grouped[key].remaining_weight += Number(item.remaining_weight) || 0;
      grouped[key].sp += Number(item.sp) || 0;
      grouped[key].count += 1;
    });

    // Calculate average price
    Object.keys(grouped).forEach(key => {
      if (grouped[key].count > 0) {
        grouped[key].sp = grouped[key].sp / grouped[key].count;
      }
    });

    return Object.values(grouped).sort((a, b) => a.itemName.localeCompare(b.itemName));
  };

  // PDF Export functionality
  const handlePrint = () => {
    if (!isClient) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups for printing');
      return;
    }

    const groupedData = getGroupedData();
    const grandTotals = calculateGrandTotals();

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>GRN Sales Overview Report</title>
          <style>
              body { 
                  font-family: 'notosanssinhala', sans-serif; 
                  font-size: 11px; 
                  line-height: 1.3;
                  margin: 15px;
                  background-color: #99ff99;
              }
              .header { 
                  text-align: center; 
                  margin-bottom: 20px;
                  border-bottom: 2px solid #333;
                  padding-bottom: 10px;
                  background-color: #004d00;
                  color: white;
                  padding: 15px;
                  border-radius: 5px;
              }
              table { 
                  width: 100%; 
                  border-collapse: collapse; 
                  margin-top: 15px;
                  background-color: white;
              }
              th, td { 
                  border: 1px solid #000; 
                  padding: 6px; 
                  text-align: center; 
                  vertical-align: middle;
              }
              th { 
                  background-color: #f2f2f2; 
                  font-weight: bold;
              }
              .text-end { text-align: right; }
              .text-center { text-align: center; }
              .total-row { 
                  font-weight: bold; 
                  background-color: #e9ecef;
              }
              .item-summary-row { 
                  background-color: #f8f9fa;
              }
              .no-data { 
                  text-align: center; 
                  color: #6c757d; 
                  padding: 20px;
                  background-color: #f8f9fa;
              }
              .company-name {
                  font-size: 18px;
                  font-weight: bold;
                  margin-bottom: 5px;
              }
              .report-title {
                  font-size: 16px;
                  font-weight: bold;
                  margin-bottom: 5px;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <div class="company-name">${companyName}</div>
              <div class="report-title">📦 විකිුණුම්/බර මත්තෙහි ඉතිරි වාර්තාව</div>
              <div>Report Date: ${settingDate}</div>
          </div>

          <table>
              <thead>
                  <tr>
                      <th rowspan="2">වර්ගය</th>
                      <th rowspan="2">price</th>
                      <th colspan="1">මිලදී ගැනීම</th>
                      <th colspan="1">විකුණුම්</th>
                      <th rowspan="2">එකතුව</th>
                      <th colspan="1">ඉතිරි</th>
                  </tr>
                  <tr>
                      <th>බර</th>
                      <th>බර</th>
                      <th>බර</th>
                  </tr>
              </thead>
              <tbody>
                  ${groupedData.length > 0 ? groupedData.map((item, index) => `
                      <tr class="item-summary-row">
                          <td style="text-align: left;"><strong>${item.itemName} (${item.grnCode})</strong></td>
                          <td><strong>${Number(item.sp).toFixed(2)}</strong></td>
                          <td><strong>${Number(item.original_weight).toFixed(2)}</strong></td>
                          <td><strong>${Number(item.sold_weight).toFixed(2)}</strong></td>
                          <td><strong>Rs. ${Number(item.total_sales_value).toFixed(2)}</strong></td>
                          <td><strong>${Number(item.remaining_weight).toFixed(2)}</strong></td>
                      </tr>
                  `).join('') : `
                      <tr>
                          <td colspan="6" class="no-data">දත්ත නොමැත.</td>
                      </tr>
                  `}
                  
                  ${groupedData.length > 0 ? `
                      <tr class="total-row">
                          <td style="text-align: right;"><strong>සමස්ත එකතුව:</strong></td>
                          <td><strong>${Number(grandTotals.grandTotalPrice).toFixed(2)}</strong></td>
                          <td><strong>${Number(grandTotals.grandTotalOriginalWeight).toFixed(2)}</strong></td>
                          <td><strong>${Number(grandTotals.grandTotalSoldWeight).toFixed(2)}</strong></td>
                          <td><strong>Rs. ${Number(grandTotals.grandTotalSalesValue).toFixed(2)}</strong></td>
                          <td><strong>${Number(grandTotals.grandTotalRemainingWeight).toFixed(2)}</strong></td>
                      </tr>
                  ` : ''}
              </tbody>
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
    const groupedData = getGroupedData();
    const grandTotals = calculateGrandTotals();

    const excelData = [];
    
    // Add headers
    const headers = [
      'වර්ගය', 
      'price', 
      'මිලදී ගැනීම - බර', 
      'විකුණුම් - බර', 
      'එකතුව', 
      'ඉතිරි - බර'
    ];
    excelData.push(headers);
    
    // Add data rows
    if (groupedData.length > 0) {
      groupedData.forEach(item => {
        excelData.push([
          `${item.itemName} (${item.grnCode})`,
          Number(item.sp).toFixed(2),
          Number(item.original_weight).toFixed(2),
          Number(item.sold_weight).toFixed(2),
          Number(item.total_sales_value).toFixed(2),
          Number(item.remaining_weight).toFixed(2),
        ]);
      });
      
      // Add empty row
      excelData.push([]);
      
      // Add totals row
      excelData.push([
        'සමස්ත එකතුව:',
        Number(grandTotals.grandTotalPrice).toFixed(2),
        Number(grandTotals.grandTotalOriginalWeight).toFixed(2),
        Number(grandTotals.grandTotalSoldWeight).toFixed(2),
        Number(grandTotals.grandTotalSalesValue).toFixed(2),
        Number(grandTotals.grandTotalRemainingWeight).toFixed(2),
      ]);
    }

    // Create workbook and export
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'GRN Sales Overview');
    XLSX.writeFile(workbook, `GRN_Sales_Overview_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Simple browser print (fallback)
  const handleSimplePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const groupedData = getGroupedData();
  const grandTotals = calculateGrandTotals();

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-fullscreen">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">GRN Sales Overview Report</h5>
            <button 
              type="button" 
              className="btn-close" 
              onClick={onClose}
              aria-label="Close"
              disabled={loading}
            ></button>
          </div>
          
          <div className="modal-body printable-area" style={{ backgroundColor: '#99ff99', overflow: 'auto' }}>
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-2">Loading report data...</p>
              </div>
            ) : (
              <div className="container-fluid py-4" ref={printRef}>
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

                <div className="card shadow-sm mb-4">
                  <div className="card-header text-center" style={{ backgroundColor: '#004d00' }}>
                    <div className="report-title-bar">
                      <h2 className="company-name text-white">{companyName}</h2>
                      <h4 className="fw-bold text-white">📦 විකිුණුම්/බර මත්තෙහි ඉතිරි වාර්තාව</h4>
                      <span className="right-info text-white">
                        {settingDate}
                      </span>
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="table-responsive">
                      <table className="table table-striped table-hover table-bordered">
                        <thead>
                          <tr>
                            <th rowSpan="2">වර්ගය</th>
                            <th rowSpan="2">price</th>
                            <th colSpan="1">මිලදී ගැනීම</th>
                            <th colSpan="1">විකුණුම්</th>
                            <th rowSpan="2">එකතුව</th>
                            <th colSpan="1">ඉතිරි</th>
                          </tr>
                          <tr>
                            <th>බර</th>
                            <th>බර</th>
                            <th>බර</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedData.length > 0 ? (
                            <>
                              {groupedData.map((item, index) => (
                                <tr key={index} className="item-summary-row">
                                  <td><strong>{item.itemName} ({item.grnCode})</strong></td>
                                  <td><strong>{Number(item.sp).toFixed(2)}</strong></td>
                                  <td><strong>{Number(item.original_weight).toFixed(2)}</strong></td>
                                  <td><strong>{Number(item.sold_weight).toFixed(2)}</strong></td>
                                  <td><strong>Rs. {Number(item.total_sales_value).toFixed(2)}</strong></td>
                                  <td><strong>{Number(item.remaining_weight).toFixed(2)}</strong></td>
                                </tr>
                              ))}
                              
                              <tr className="total-row">
                                <td className="text-end"><strong>සමස්ත එකතුව:</strong></td>
                                <td><strong>{Number(grandTotals.grandTotalPrice).toFixed(2)}</strong></td>
                                <td><strong>{Number(grandTotals.grandTotalOriginalWeight).toFixed(2)}</strong></td>
                                <td><strong>{Number(grandTotals.grandTotalSoldWeight).toFixed(2)}</strong></td>
                                <td><strong>Rs. {Number(grandTotals.grandTotalSalesValue).toFixed(2)}</strong></td>
                                <td><strong>{Number(grandTotals.grandTotalRemainingWeight).toFixed(2)}</strong></td>
                              </tr>
                            </>
                          ) : (
                            <tr>
                              <td colSpan="6" className="text-center text-muted py-4">දත්ත නොමැත.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Print Styles */}
                <style jsx>{`
                  @media print {
                    .btn { display: none !important; }
                    .modal-header { display: none !important; }
                    .modal-content { 
                      border: none !important; 
                      box-shadow: none !important; 
                    }
                    .modal-body { 
                      background-color: #99ff99 !important;
                      padding: 0 !important;
                    }
                    .card {
                      border: none !important;
                      box-shadow: none !important;
                    }
                    .card-header {
                      background-color: #004d00 !important;
                      color: white !important;
                    }
                    table {
                      width: 100%;
                      border-collapse: collapse;
                    }
                    th, td {
                      border: 1px solid #000 !important;
                      padding: 4px;
                    }
                  }
                `}</style>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrnSalesOverviewReport;