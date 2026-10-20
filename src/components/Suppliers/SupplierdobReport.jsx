import React, { useState, useEffect } from 'react';
import api from '../../api'; 
import Sidebar from '../../components/Sidebar';

const SupplierReport = () => {
    const [reportData, setReportData] = useState([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async (params = {}) => {
        setLoading(true);
        try {
            const response = await api.get('/suppliers-report', { params });
            setReportData(response.data);
        } catch (error) {
            console.error("Error fetching report:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = (e) => {
        e.preventDefault();
        if (startDate && endDate) {
            fetchReport({ start_date: startDate, end_date: endDate });
        } else {
            alert("කරුණාකර දිනයන් තෝරන්න.");
        }
    };
                                                                                                                                                                                                                                     
    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#99ff99' }}>
            <Sidebar />
            <div style={{ marginLeft: '260px', flexGrow: 1, padding: '30px' }}>
                <div className="card shadow-lg border-0 rounded-4 overflow-hidden">
                    <div className="card-header border-0 py-4 text-center" style={{ backgroundColor: '#004d00', color: 'white' }}>
                        <h2 className="fw-bold mb-0">📅 සැපයුම්කරු වාර්තාව (Supplier Report)</h2>
                    </div>

                    <div className="card-body bg-light">
                        {/* Filters */}
                        <div className="row g-3 align-items-end mb-4 p-3 rounded bg-white shadow-sm">
                            <div className="col-md-3">
                                <label className="form-label fw-bold">සිට (From)</label>
                                <input type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label fw-bold">දක්වා (To)</label>
                                <input type="date" className="form-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                            </div>
                            <div className="col-md-2">
                                <button onClick={handleFilter} className="btn btn-success w-100 fw-bold">සොයන්න</button>
                            </div>
                            <div className="col-md-2">
                                <button onClick={() => fetchReport({ today_birthday: 'true' })} className="btn btn-primary w-100 fw-bold">🎈 අද උපන් දින</button>
                            </div>
                            <div className="col-md-2">
                                <button onClick={() => fetchReport()} className="btn btn-secondary w-100 fw-bold">සියල්ල</button>
                            </div>
                        </div>

                        {/* Results Table */}
                        <div className="table-responsive">
                            <table className="table table-hover bg-white text-center shadow-sm">
                                <thead className="table-dark">
                                    <tr>
                                        <th>සංකේතය (Code)</th>
                                        <th>නම (Name)</th>
                                        <th>උපන් දිනය (DOB)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="3">Loading...</td></tr>
                                    ) : reportData.length > 0 ? (
                                        reportData.map((item) => (
                                            <tr key={item.id}>
                                                <td className="fw-bold text-success">{item.code}</td>
                                                <td>{item.name}</td>
                                                <td>{item.dob}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="3" className="text-muted py-4">දත්ත කිසිවක් හමු නොවීය.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupplierReport;