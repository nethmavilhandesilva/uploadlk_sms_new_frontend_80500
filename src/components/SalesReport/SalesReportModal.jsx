import React, { useState, useEffect } from 'react';
import SalesReportView from './SalesReportView';
import api from '../../api'; // ✅ Using your axios instance

const SalesReportModal = ({ isOpen, onClose }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [billNos, setBillNos] = useState([]);
  const [filters, setFilters] = useState({
    supplier_code: '',
    item_code: '',
    customer_code: '',
    bill_no: '',
    start_date: '',
    end_date: '',
  });

  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (isOpen) {
      console.log("🟡 Sales Report Modal opened");

      setFilters({
        supplier_code: '',
        item_code: '',
        customer_code: '',
        bill_no: '',
        start_date: '',
        end_date: '',
      });

      setReportData(null);
      setShowReport(false);

      fetchFilterData(); // Load dropdown data
    }
  }, [isOpen]);

  // ✅ FETCH SUPPLIERS / ITEMS / CUSTOMERS / BILL NOS
  const fetchFilterData = async () => {
    try {
      const [suppliersRes, itemsRes, customersRes, billsRes] = await Promise.all([
        api.get("/suppliersall"),
        api.get("/allitems"),
        api.get("/customersall"),
        api.get("/bill-numbers")
      ]);

      setSuppliers(suppliersRes.data.suppliers || []);
      setItems(itemsRes.data.items || []);
      setCustomers(customersRes.data.customers || []);
      setBillNos(billsRes.data.billNos || []);

    } catch (error) {
      console.error("❌ Error loading filter data:", error);
      alert("Error loading filter data.");
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // ✅ GENERATE REPORT USING AXIOS
  const handleGenerateReport = async (filters) => {
    console.log("🟢 Generating report with filters:", filters);
    setLoading(true);

    try {
      const response = await api.get("/sales-report", {
        params: filters
      });

      const data = response.data;
      console.log("🟢 Report data:", data);

      if (!data.salesData || data.salesData.length === 0) {
        alert("No processed sales records found for the selected criteria.");
        return;
      }

      setReportData({
        salesData: data.salesData,
        filters: filters
      });

      setShowReport(true);

    } catch (err) {
      console.error("❌ Error generating report:", err);
      alert("Error generating report: " + err.message);
    }

    setLoading(false);
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

  // 📄 SHOW REPORT VIEW
  if (showReport && reportData) {
    return (
      <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="modal-dialog modal-fullscreen">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Sales Report</h5>
              <button className="btn-close" onClick={handleCloseReport}></button>
            </div>
            <div className="modal-body">
              <SalesReportView reportData={reportData} onClose={handleCloseReport} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 🟢 SHOW FILTER MODAL
  if (!isOpen) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content" style={{ backgroundColor: "#99ff99" }}>
          <div className="modal-header">
            <h5 className="modal-title">Filter Sales</h5>
            <button className="btn-close" onClick={onClose} disabled={loading}></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="row g-2">

                {/* Supplier */}
                <div className="col-md-6">
                  <label className="form-label fw-bold">Supplier</label>
                  <select
                    name="supplier_code"
                    className="form-select form-select-sm"
                    value={filters.supplier_code}
                    onChange={handleFilterChange}
                    disabled={loading}
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.code} value={s.code}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Item */}
                <div className="col-md-6">
                  <label className="form-label fw-bold">Item</label>
                  <select
                    name="item_code"
                    className="form-select form-select-sm"
                    value={filters.item_code}
                    onChange={handleFilterChange}
                    disabled={loading}
                  >
                    <option value="">-- Select Item --</option>
                    {items.map(i => (
                      <option key={i.no} value={i.no}>
                        {i.no} - {i.type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Customer */}
                <div className="col-md-6">
                  <label className="form-label fw-bold">පාරිභෝගික කේතය</label>
                  <select
                    name="customer_code"
                    className="form-select form-select-sm"
                    value={filters.customer_code}
                    onChange={handleFilterChange}
                    disabled={loading}
                  >
                    <option value="">-- සියලුම පාරිභෝගිකයන් --</option>
                    {customers.map(c => (
                      <option key={c.customer_code} value={c.customer_code}>
                        {c.customer_code}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bill Number */}
                <div className="col-md-6">
                  <label className="form-label fw-bold">Bill No</label>
                  <select
                    name="bill_no"
                    className="form-select form-select-sm"
                    value={filters.bill_no}
                    onChange={handleFilterChange}
                    disabled={loading}
                  >
                    <option value="">-- All Bills --</option>
                    {billNos.map(b => (
                      <option key={b.bill_no} value={b.bill_no}>
                        {b.bill_no}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div className="col-md-6">
                  <label className="form-label fw-bold">Start Date</label>
                  <input
                    type="date"
                    name="start_date"
                    className="form-control form-control-sm"
                    value={filters.start_date}
                    onChange={handleFilterChange}
                    disabled={loading}
                  />
                </div>

                {/* End Date */}
                <div className="col-md-6">
                  <label className="form-label fw-bold">End Date</label>
                  <input
                    type="date"
                    name="end_date"
                    className="form-control form-control-sm"
                    value={filters.end_date}
                    onChange={handleFilterChange}
                    disabled={loading}
                  />
                </div>

              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Generating Report...
                  </>
                ) : (
                  "Generate Report"
                )}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};

export default SalesReportModal;
