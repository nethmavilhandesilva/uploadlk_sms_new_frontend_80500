import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import CustomerForm from "./CustomerForm";
import api from "../../api"; 
import { STORAGE_URL, BASE_PATH } from '../../config';

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState(""); // ✅ State for search
  const navigate = useNavigate();

  const fetchCustomers = async () => {
    try {
      const res = await api.get("/customers");
      setCustomers(res.data);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // ✅ Filter Logic: Matches the start of the short_name
  const filteredCustomers = customers.filter((c) =>
    c.short_name.toLowerCase().startsWith(searchTerm.toLowerCase())
  );

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = `${BASE_PATH}/login`;
  };

  const handleCreate = () => {
    setEditingCustomer(null);
    setShowForm(true);
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("මෙම පාරිභෝගිකයා මකන්නද?")) return;
    try {
      const res = await api.delete(`/customers/${id}`);
      if (res.status === 200) {
        setCustomers((prev) => prev.filter((c) => c.id !== id));
        alert("පාරිභෝගිකයා සාර්ථකව මකන ලදී!");
      }
    } catch (err) {
      console.error("Failed to delete customer:", err);
      alert("දෝෂයක් සිදු විය.");
    }
  };

  const handleFormSubmit = async (data) => {
    try {
      if (editingCustomer) {
        await api.post(`/customers/update/${editingCustomer.id}`, data);
      } else {
        await api.post("/customers", data);
      }
      setShowForm(false);
      fetchCustomers();
      alert("සාර්ථකව සුරැකිණි!");
    } catch (err) {
      console.error("Failed to save customer:", err);
    }
  };

  const renderImage = (path, alt) => {
    if (!path) return <span className="text-muted small">නැත</span>;
    return (
      <a href={`${STORAGE_URL}${path}`} target="_blank" rel="noreferrer">
        <img
          src={`${STORAGE_URL}${path}`}
          alt={alt}
          style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px", border: "1px solid #ddd" }}
        />
      </a>
    );
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#99ff99" }}>
      {/* --- SIDEBAR --- */}
      <div style={{ width: "260px", backgroundColor: "#004d00", color: "white", padding: "20px", display: "flex", flexDirection: "column", position: "fixed", height: "100vh", overflowY: "auto", boxShadow: "2px 0 5px rgba(0,0,0,0.2)", zIndex: 1000 }}>
        <Link className="navbar-brand fw-bold d-flex align-items-center mb-4 text-white text-decoration-none" to="/sales">
          <i className="material-icons me-2">warehouse</i> මුල් පිටුව
        </Link>
        <h6 className="text-uppercase text-light opacity-50 small fw-bold mb-3">ප්‍රධාන දත්ත</h6>
        <ul className="list-unstyled flex-grow-1">
          <li className="mb-2">
            <Link to="/customers" className="nav-link text-white d-flex align-items-center p-2 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <i className="material-icons me-2">people</i> ගනුදෙනුකරුවන්
            </Link>
          </li>
          <li className="mb-2">
            <Link to="/items" className="nav-link text-white d-flex align-items-center p-2 rounded">
              <i className="material-icons me-2">inventory_2</i> අයිතමය
            </Link>
          </li>
          <li className="mb-2">
            <Link to="/suppliers" className="nav-link text-white d-flex align-items-center p-2 rounded">
              <i className="material-icons me-2">local_shipping</i> සැපයුම්කරුවන්
            </Link>
          </li>
        </ul>
        <div className="mt-auto pt-3 border-top border-secondary">
          <button onClick={handleLogout} className="btn btn-outline-light w-100 fw-bold d-flex align-items-center justify-content-center">
            <i className="material-icons me-2">logout</i>ඉවත් වන්න
          </button>
        </div>
      </div>

      {/* --- CONTENT --- */}
      <div style={{ marginLeft: "260px", flexGrow: 1, padding: "30px", width: "calc(100vw - 260px)" }}>
        {!showForm ? (
          <div style={{ backgroundColor: "#006400", borderRadius: "12px", padding: "24px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            <h2 className="text-center text-white mb-4">පාරිභෝගික ලැයිස්තුව</h2>
            
            <div className="row mb-3 align-items-center">
              {/* ✅ SEARCH BAR COMPONENT */}
              <div className="col-md-6">
                <div className="input-group">
                  <span className="input-group-text bg-light border-0">
                    <i className="material-icons text-dark">search</i>
                  </span>
                  <input
                    type="text"
                    className="form-control border-0 shadow-none"
                    placeholder="කෙටි නම අනුව සොයන්න (Search by Short Name)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
              </div>
              <div className="col-md-6 text-end">
                <button className="btn btn-success fw-bold" onClick={handleCreate}>
                  + නව පාරිභෝගිකයෙකු එකතු කරන්න
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-bordered table-hover align-middle bg-white">
                <thead>
                  <tr style={{ backgroundColor: "#e6f0ff", color: "#003366", textAlign: "center" }}>
                    <th>ඡායාරූපය</th>
                    <th>කෙටි නම</th>
                    <th>සම්පූර්ණ නම</th>
                    <th>දුරකථන අංකය</th>
                    <th>NIC (F / B)</th>
                    <th>ණය සීමාව (Rs.)</th>
                    <th>මෙහෙයුම්</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-4">
                        {searchTerm ? `"${searchTerm}" නම සහිත පාරිභෝගිකයන් හමු නොවීය` : "පාරිභෝගිකයන් නොමැත"}
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => (
                      <tr key={c.id} style={{ textAlign: "center" }}>
                        <td>{renderImage(c.profile_pic, "Profile")}</td>
                        <td className="text-uppercase fw-bold">{c.short_name}</td>
                        <td>{c.name}</td>
                        <td className="fw-bold">{c.telephone_no || <span className="text-muted small">නැත</span>}</td>
                        <td>
                          <div className="d-flex justify-content-center gap-1">
                            {renderImage(c.nic_front, "NIC Front")}
                            {renderImage(c.nic_back, "NIC Back")}
                          </div>
                        </td>
                        <td>Rs. {Number(c.credit_limit).toFixed(2)}</td>
                        <td>
                          <button className="btn btn-warning btn-sm me-1" onClick={() => handleEdit(c)}>යාවත්කාලීන</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>මකන්න</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card shadow-lg border-0">
            <div className="card-body p-0">
              <CustomerForm
                customer={editingCustomer}
                onSubmit={handleFormSubmit}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}