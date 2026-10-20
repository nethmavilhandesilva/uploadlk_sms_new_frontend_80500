import React, { useState, useEffect } from 'react';
import WeightReportView from './WeightReportView';
import api from "../../api";

const WeightReportModal = ({ isOpen, onClose }) => {
  const [filters, setFilters] = useState({
    grn_code: '',
    start_date: '',
    end_date: '',
  });
  const [password, setPassword] = useState('');
  const [showDateRange, setShowDateRange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFilters({ grn_code: '', start_date: '', end_date: '' });
      setPassword('');
      setShowDateRange(false);
      setReportData(null);
      setShowReport(false);
    }
  }, [isOpen]);

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    // TEMPORARILY DISABLED PASSWORD CHECK: Always show date range
    setShowDateRange(true);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    
    // TEMPORARILY DISABLED PASSWORD CHECK: Remove password requirement
    // if (!password) {
    //   alert("මුරපදය ඇතුලත් කරන්න");
    //   return;
    // }

    try {
      setLoading(true);
      // Using the axios instance 'api' you configured earlier
      const response = await api.post("/report/weight", filters);

      const data = response.data;

      if (!data.sales || data.sales.length === 0) {
        alert("No sales records found for the selected criteria.");
        return;
      }

      setReportData({
        sales: data.sales,
        filters: filters,
        selectedGrnEntry: data.selectedGrnEntry,
        selectedGrnCode: data.selectedGrnCode
      });

      setShowReport(true);
    } catch (err) {
      console.error("❌ API ERROR:", err);
      alert("Error: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1050 }}>
      {/* Modal size switches to extra-large when showing the report */}
      <div className={`modal-dialog ${showReport ? 'modal-xl' : 'modal-md'}`}>
        <div className="modal-content" style={{ borderRadius: '12px', border: 'none', overflow: 'hidden' }}>
          
          <div className="modal-header" style={{ backgroundColor: showReport ? '#f8f9fa' : '#99ff99' }}>
            <h5 className="modal-title fw-bold">
              {showReport ? '📊 Weight Based Report' : '⚖️ බර අනුව වාර්තාව'}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={loading}></button>
          </div>

          <div className="modal-body" style={{ backgroundColor: showReport ? '#fff' : '#f9fff9' }}>
            {showReport && reportData ? (
              <WeightReportView reportData={reportData} onClose={onClose} />
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="form-label fw-bold">මුරපදය ඇතුලත් කරන්න (Password)</label>
                  <input
                    type="password"
                    className="form-control form-control-lg"
                    placeholder="Type password..."
                    value={password}
                    onChange={handlePasswordChange}
                    autoFocus
                  />
                </div>

                {/* TEMPORARILY: Always show date range without password requirement */}
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <label className="form-label fw-bold">ආරම්භ දිනය</label>
                    <input
                      type="date"
                      className="form-control"
                      value={filters.start_date}
                      onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-bold">අවසන් දිනය</label>
                    <input
                      type="date"
                      className="form-control"
                      value={filters.end_date}
                      onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary btn-lg w-100 shadow-sm"
                  disabled={loading}
                  // TEMPORARILY REMOVED: || !password
                >
                  {loading ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Loading...</>
                  ) : (
                    "වාර්තාව ලබාගන්න"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeightReportModal;