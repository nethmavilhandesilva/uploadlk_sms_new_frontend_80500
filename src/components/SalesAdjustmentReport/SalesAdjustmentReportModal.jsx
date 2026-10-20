import React, { useState, useEffect } from 'react';
import SalesAdjustmentReportView from './SalesAdjustmentReportView';
import api from "../../api";

const SalesAdjustmentReportModal = ({ isOpen, onClose }) => {
  const [filters, setFilters] = useState({
    code: '',
    start_date: '',
    end_date: '',
    show_deleted_only: false  // Added this field
  });
  const [password, setPassword] = useState('');
  const [showDateRange, setShowDateRange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFilters({ 
        code: '', 
        start_date: '', 
        end_date: '',
        show_deleted_only: false 
      });
      setPassword('');
      setShowDateRange(false);
      setReportData(null);
      setShowReport(false);
    }
  }, [isOpen]);

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    setShowDateRange(value === 'nethma123');

    if (value !== 'nethma123') {
      setFilters((prev) => ({ ...prev, start_date: '', end_date: '' }));
    }
  };

  const handleGenerateReport = async (filters) => {
    try {
      setLoading(true);

      const requestBody = {};
      if (filters.code) requestBody.code = filters.code;
      if (filters.start_date) requestBody.start_date = filters.start_date;
      if (filters.end_date) requestBody.end_date = filters.end_date;
      if (filters.show_deleted_only) requestBody.show_deleted = 'true';

      const response = await api.post('/reports/salesadjustment/filter', requestBody);

      const data = response.data;

      if (!data.entries || data.entries.data.length === 0) {
        alert('No sales adjustment records found for the selected criteria.');
        return;
      }

      setReportData({
        entries: data.entries,
        filters: filters
      });

      setShowReport(true);

    } catch (err) {
      console.error('❌ Error generating report:', err);

      if (err.response) {
        alert(`Error: ${err.response.data.message || 'Server Error'}`);
      } else {
        alert(err.message);
      }

    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleGenerateReport(filters);
  };

  const handleCloseReport = () => {
    setShowReport(false);
    setReportData(null);
    onClose();
  };

  if (showReport && reportData) {
    return (
      <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="modal-dialog modal-xl">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">වෙනස්කිරීම් වාර්තාව</h5>
              <button type="button" className="btn-close" onClick={handleCloseReport}></button>
            </div>
            <div className="modal-body">
              <SalesAdjustmentReportView 
                reportData={reportData}
                onClose={handleCloseReport}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content" style={{ backgroundColor: '#99ff99' }}>
          <div className="modal-header">
            <h5 className="modal-title">📦 වෙනස් කිරීම</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={loading}></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">

              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 'bold', color: 'black' }}>
                  පස්වර්ඩ් ඇතුල් කරන්න
                </label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="පස්වර්ඩ්"
                  value={password}
                  onChange={handlePasswordChange}
                  disabled={loading}
                />
                <small className="text-muted">* පැරණි වාර්තා බැලීමට පස්වර්ඩ් ඇතුල් කරන්න</small>
              </div>

              {/* Customer Code Field - Always visible */}
              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 'bold', color: 'black' }}>
                  🔍 පාරිභෝගික කේතය (විකල්ප)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="උදා: CUST001"
                  value={filters.code}
                  onChange={(e) => setFilters((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  disabled={loading}
                />
                <small className="text-muted">* නිශ්චිත පාරිභෝගිකයෙකුගේ වාර්තා පමණක් බැලීමට</small>
              </div>

              {showDateRange && (
                <>
                  <div className="mb-3">
                    <label className="form-label" style={{ fontWeight: 'bold', color: 'black' }}>
                      📅 ආරම්භ දිනය
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={filters.start_date}
                      onChange={(e) => setFilters((prev) => ({ ...prev, start_date: e.target.value }))}
                      disabled={loading}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label" style={{ fontWeight: 'bold', color: 'black' }}>
                      📅 අවසන් දිනය
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={filters.end_date}
                      onChange={(e) => setFilters((prev) => ({ ...prev, end_date: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                </>
              )}

              {/* Show Deleted Only Checkbox - Always visible */}
              <div className="mb-3 form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="showDeletedOnly"
                  checked={filters.show_deleted_only}
                  onChange={(e) => setFilters((prev) => ({ ...prev, show_deleted_only: e.target.checked }))}
                  disabled={loading}
                  style={{ 
                    width: '18px', 
                    height: '18px',
                    cursor: 'pointer'
                  }}
                />
                <label className="form-check-label" htmlFor="showDeletedOnly" style={{ 
                  fontWeight: 'bold', 
                  color: '#dc3545',
                  fontSize: '15px',
                  cursor: 'pointer'
                }}>
                  🗑️ මකා දැමූ වාර්තා පමණක් පෙන්වන්න
                </label>
                <br />
                <small className="text-muted">* මකා දැමූ වාර්තා පමණක් බැලීමට මෙය තෝරන්න</small>
              </div>

              {/* Show current filters summary */}
              {(filters.code || filters.start_date || filters.end_date || filters.show_deleted_only) && (
                <div className="alert alert-info alert-sm" style={{ fontSize: '13px' }}>
                  <strong>වත්මන් පෙරහන්:</strong>
                  {filters.code && <span className="badge bg-primary ms-1 me-1">{filters.code}</span>}
                  {filters.start_date && <span className="badge bg-success ms-1 me-1">සිට: {filters.start_date}</span>}
                  {filters.end_date && <span className="badge bg-success ms-1 me-1">දක්වා: {filters.end_date}</span>}
                  {filters.show_deleted_only && <span className="badge bg-danger ms-1">🗑️ මකා දැමූ පමණක්</span>}
                </div>
              )}

            </div>

            <div className="modal-footer">
              <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    වාර්තාව සකස් වෙමින්...
                  </>
                ) : (
                  '📊 වාර්තාව ලබාගන්න'
                )}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};

export default SalesAdjustmentReportModal;