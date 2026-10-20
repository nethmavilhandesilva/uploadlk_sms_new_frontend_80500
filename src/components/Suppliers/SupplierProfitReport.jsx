// SupplierProfitReport.js
import React, { useState, useEffect } from "react";
import api from "../../api"; // your axios instance
import Sidebar from '../Sidebar'; 

import { BASE_PATH } from '../../config';
export default function SupplierProfitReport() {
    const [profitReport, setProfitReport] = useState([]);
    const [filteredProfitReport, setFilteredProfitReport] = useState([]);
    const [profitSearchTerm, setProfitSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    // Company name and report date
    const [companyName, setCompanyName] = useState("Loading...");
    const [reportDate, setReportDate] = useState(new Date().toLocaleString());

    // Navigate back to the supplier report page
    const closeProfitReport = () => {
        window.location.href = `${BASE_PATH}/supplierreport`;
    };

    // Fetch company name and report date
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await api.get("/settings");
                if (response.data) {
                    setCompanyName(response.data.company || "Default Company");
                    setReportDate(response.data.value || new Date().toLocaleString());
                }
            } catch (err) {
                console.error("Error fetching settings:", err);
            }
        };
        fetchSettings();
    }, []);

    // Fetch aggregated profit from backend
    useEffect(() => {
        const fetchProfitReport = async () => {
            try {
                setIsLoading(true);
                const response = await api.get("/sales/profit-by-supplier");
                const data = response.data || [];

                const sanitized = data.map(item => ({
                    supplier_code: item.supplier_code || "UNKNOWN",
                    total_profit: Number(item.total_profit ?? 0)
                }));

                setProfitReport(sanitized);
                setFilteredProfitReport(sanitized);
            } catch (err) {
                console.error("Error fetching profit report:", err);
                setProfitReport([]);
                setFilteredProfitReport([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfitReport();
    }, []);

    // Search filter
    useEffect(() => {
        const filtered = profitReport.filter(item =>
            item.supplier_code.toLowerCase().includes(profitSearchTerm.toLowerCase())
        );
        setFilteredProfitReport(filtered);
    }, [profitSearchTerm, profitReport]);

    // Styles
    const tableHeaderStyle = { background: "#004d00", color: "#fff", padding: "10px", textAlign: "left" };

    return (
        <div style={{ display: "flex" }}>
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <div style={{ marginLeft: "260px", padding: "20px", width: "100%" }}>
                {/* Report Header */}
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "linear-gradient(90deg, #004d00, #007700)",
                    color: "white",
                    padding: "15px 20px",
                    borderRadius: "8px",
                    marginBottom: "20px"
                }}>
                    <h2 style={{ margin: 0, fontWeight: "700" }}>{companyName}</h2>
                    <h4 style={{ margin: 0 }}>📈 Supplier Profit Report</h4>
                    <div>
                        <span>{reportDate}</span>
                        <button className="btn btn-light btn-sm ms-2" onClick={() => window.print()}>🖨️ Print</button>
                    </div>
                </div>

                {/* Search and Back Button */}
                <div style={{ marginBottom: "20px", display: "flex", gap: "15px", flexWrap: "wrap" }}>
                    <button
                        onClick={closeProfitReport}
                        style={{
                            padding: "8px 14px",
                            background: "#f8f9fa",
                            border: "1px solid #ddd",
                            borderRadius: "6px",
                            cursor: "pointer",
                        }}
                    >
                        ← Back to Bill Status Summary
                    </button>

                    <input
                        type="text"
                        placeholder="🔍 Search by Supplier Code..."
                        value={profitSearchTerm}
                        onChange={(e) => setProfitSearchTerm(e.target.value)}
                        style={{
                            padding: "8px 10px",
                            width: "300px",
                            border: "1px solid #ccc",
                            borderRadius: "6px",
                        }}
                    />
                </div>

                {/* Report Table */}
                {isLoading ? (
                    <p>Loading Profit Data...</p>
                ) : filteredProfitReport.length === 0 ? (
                    <p style={{ color: "#6c757d" }}>No profit data available.</p>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={tableHeaderStyle}>Supplier Code</th>
                                <th style={tableHeaderStyle}>Total Profit (Rs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProfitReport.map((item, index) => (
                                <tr key={index} style={{ background: index % 2 === 0 ? "#fff" : "#f7f7f7" }}>
                                    <td style={{ padding: "10px", borderBottom: "1px solid #eee" }}>
                                        {item.supplier_code}
                                    </td>
                                    <td style={{ padding: "10px", borderBottom: "1px solid #eee" }}>
                                        Rs. {item.total_profit.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
