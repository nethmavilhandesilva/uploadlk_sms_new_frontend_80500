import React, { useState, useEffect } from 'react';
import GrnReportView from './GrnReportView';
import { API_BASE_URL } from '../../config';

const BACKEND_URL = API_BASE_URL;

const GrnReportModal = ({ isOpen, onClose }) => {
  const [codes, setCodes] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [showReport, setShowReport] = useState(false);

  // Fetch available codes when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCodes();
      // Reset form state
      setSelectedCode('');
      setReportData(null);
      setShowReport(false);
    }
  }, [isOpen]);

  const fetchCodes = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/grn-codes`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setCodes(data.codes || []);
    } catch (error) {
      console.error('❌ Error fetching codes:', error);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      
      const params = {};
      if (selectedCode) params.code = selectedCode;

      const queryParams = new URLSearchParams(params).toString();
      const apiUrl = `${BACKEND_URL}/grn-report?${queryParams}`;
      
      console.log('🟢 Generating GRN report with URL:', apiUrl);

      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status} status`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      console.log('🟢 GRN report data received:', data);
      
      // Set the report data and show the report view
      setReportData({ 
        groupedData: data.groupedData,
        selectedCode: data.selectedCode 
      });
      setShowReport(true);
      
    } catch (err) {
      console.error('❌ Error generating GRN report:', err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleGenerateReport();
  };

  const handleCloseReport = () => {
    setShowReport(false);
    setReportData(null);
    onClose();
  };

  // If report is ready, show the report view
  if (showReport && reportData) {
    return (
      <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="modal-dialog modal-fullscreen"> {/* Use fullscreen for GRN report */}
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">GRN Report</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={handleCloseReport}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body p-0">
              <GrnReportView 
                reportData={reportData} 
                onClose={handleCloseReport} 
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise show the modal form
  if (!isOpen) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content" style={{ backgroundColor: '#99ff99' }}>
          <div className="modal-header">
            <h5 className="modal-title">📋 GRN වාර්තාව</h5>
            <button 
              type="button" 
              className="btn-close" 
              onClick={onClose}
              aria-label="Close"
              disabled={loading}
            ></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="mb-3">
                <label htmlFor="code_select" className="form-label" style={{ fontWeight: 'bold', color: 'black' }}>
                  කේතය
                </label>
                <select
                  id="code_select"
                  className="form-select"
                  value={selectedCode}
                  onChange={(e) => setSelectedCode(e.target.value)}
                  disabled={loading}
                >
                  <option value="">-- සියලුම වාර්තා සඳහා --</option>
                  {codes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                type="submit" 
                className="btn btn-success w-100" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Generating Report...
                  </>
                ) : (
                  'වාර්තාව ලබාගන්න'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default GrnReportModal;