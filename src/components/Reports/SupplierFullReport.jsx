import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from "../../api";
import { useNavigate } from 'react-router-dom';
import { STORAGE_URL } from '../../config';

const SupplierReport = () => {
    const navigate = useNavigate();

    // --- Standard States ---
    const [summary, setSummary] = useState({ printed: [], unprinted: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [loanSummary, setLoanSummary] = useState([]);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, target: null });
    const [selectedLoanRecord, setSelectedLoanRecord] = useState(null);
    const [billSize, setBillSize] = useState('3mm');
    const [printedSearchTerm, setPrintedSearchTerm] = useState('');
    const [unprintedSearchTerm, setUnprintedSearchTerm] = useState('');
    const [phoneNo, setPhoneNo] = useState('');
    const [phoneStatus, setPhoneStatus] = useState(''); 
    const [payingAmount, setPayingAmount] = useState('');
    const [loanStatus, setLoanStatus] = useState(''); 
    const [profilePic, setProfilePic] = useState(null);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [selectedBillNo, setSelectedBillNo] = useState(null);
    const [isUnprintedBill, setIsUnprintedBill] = useState(false);
    const [supplierDetails, setSupplierDetails] = useState([]);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [advanceAmount, setAdvanceAmount] = useState(0);
    const [editingRecord, setEditingRecord] = useState(null);

    // 🚀 FARMER REPORT STATES
    const [isFarmerModalOpen, setIsFarmerModalOpen] = useState(false);
    const [allSuppliers, setAllSuppliers] = useState([]); 
    const [selectedFarmerForReport, setSelectedFarmerForReport] = useState('');
    const [fullReportData, setFullReportData] = useState(null); 

    // --- Data Fetching ---
    const fetchSummary = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/suppliers/supplierloans');
            if (response.data) setSummary({ printed: response.data.printed || [], unprinted: response.data.unprinted || [] });
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
    }, []);

    const fetchLoanSummary = useCallback(async () => {
        try {
            const response = await api.get('/suppliers/loan-summary');
            if (response.data.success) setLoanSummary(response.data.data);
        } catch (error) { console.error(error); }
    }, []);

    const fetchAllSuppliersList = async () => {
        try {
            const res = await api.get('/suppliers/all-codes');
            setAllSuppliers(Array.isArray(res.data) ? res.data : []);
        } catch (e) { console.error("Error fetching codes:", e); }
    };

    useEffect(() => {
        fetchSummary();
        fetchLoanSummary();
        fetchAllSuppliersList();
    }, [fetchSummary, fetchLoanSummary]);

    // --- Report Action ---
    const handleOpenFarmerReport = async () => {
        if (!selectedFarmerForReport) {
            alert("කරුණාකර කේතයක් තෝරන්න");
            return;
        }
        try {
            const res = await api.get(`/suppliers/full-report?code=${selectedFarmerForReport}`);
            if (res.data.success) {
                setFullReportData(res.data);
                setIsFarmerModalOpen(false);
            }
        } catch (e) { alert("දත්ත ලබාගැනීම අසාර්ථක විය."); }
    };

    // --- Right Click/Delete ---
    const handleContextMenu = (e, loan) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.pageX, y: e.pageY, target: loan });
    };
    const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });
    const handleDeleteRecord = async () => {
        const loan = contextMenu.target;
        if (!loan) return;
        if (window.confirm("මකා දැමීමට ඔබට විශ්වාසද?")) {
            try {
                await api.post('/suppliers/delete-loan-record', { code: loan.supplier_code, bill_no: loan.supplier_bill_no });
                fetchLoanSummary(); fetchSummary();
            } catch (error) { alert("Error"); } finally { closeContextMenu(); }
        }
    };

    const handleUnprintedBillClick = async (code, bill) => {
        setSelectedSupplier(code); setSelectedBillNo(bill); setIsUnprintedBill(true);
        setIsDetailsLoading(true);
        try {
            const response = await api.get(`/suppliers/${code}/unprinted-details2`);
            setSupplierDetails(response.data);
            const loanRes = await api.get(`/supplier-loan/search?code=${code}&bill_no=${bill || ''}`);
            if (loanRes.data) { setSelectedLoanRecord(loanRes.data); setPayingAmount(loanRes.data.loan_amount); }
            const supRes = await api.get(`/suppliers/search-by-code/${code}`);
            if (supRes.data) { setAdvanceAmount(supRes.data.advance_amount); setProfilePic(supRes.data.profile_pic); }
        } catch (e) { console.error(e); } finally { setIsDetailsLoading(false); }
    };

    const handlePrintedBillClick = async (code, bill) => {
        setSelectedSupplier(code); setSelectedBillNo(bill); setIsUnprintedBill(false);
        setIsDetailsLoading(true);
        try {
            const response = await api.get(`/suppliers/bill/${bill}/details`);
            setSupplierDetails(response.data);
            const loanRes = await api.get(`/supplier-loan/search?code=${code}&bill_no=${bill}`);
            if (loanRes.data) setSelectedLoanRecord(loanRes.data);
            const supRes = await api.get(`/suppliers/search-by-code/${code}`);
            if (supRes.data) { setAdvanceAmount(supRes.data.advance_amount); setProfilePic(supRes.data.profile_pic); }
        } catch (e) { console.error(e); } finally { setIsDetailsLoading(false); }
    };

    const formatDecimal = (val) => (parseFloat(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const getRowStyle = (i) => ({ backgroundColor: i % 2 === 0 ? '#f8f9fa' : '#ffffff' });
    const goToSalesEntry = () => navigate('/sales');

    // 🚀 UI: MODERN SELECTION MODAL
    const renderFarmerSelectorModal = () => {
        if (!isFarmerModalOpen) return null;
        return (
            <div style={modernModalOverlay}>
                <div style={modernSelectionCard}>
                    <div style={modalHeaderDecoration}></div>
                    <h2 style={{ color: '#1a2a6c', margin: '20px 0 10px 0' }}>සැපයුම්කරු වාර්තාව</h2>
                    <p style={{ color: '#777', fontSize: '0.9rem', marginBottom: '25px' }}>විස්තරාත්මක වාර්තාව බැලීම සඳහා ගොවි කේතය තෝරන්න</p>
                    
                    <select 
                        style={modernSelectInput} 
                        value={selectedFarmerForReport} 
                        onChange={(e) => setSelectedFarmerForReport(e.target.value)}
                    >
                        <option value="">සැපයුම්කරු කේතය තෝරන්න...</option>
                        {allSuppliers.map(s => <option key={s.id} value={s.code}>{s.code} - {s.name}</option>)}
                    </select>

                    <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
                        <button onClick={handleOpenFarmerReport} style={modernSubmitBtn}>වාර්තාව බලන්න</button>
                        <button onClick={() => setIsFarmerModalOpen(false)} style={modernCancelBtn}>අවලංගු කරන්න</button>
                    </div>
                </div>
            </div>
        );
    };

    // 🚀 UI: FULL DASHBOARD REPORT
    const renderFullReportView = () => {
        if (!fullReportData) return null;
        const { profile, loans, sales } = fullReportData;
        const storageUrl = STORAGE_URL;

        return (
            <div style={dashboardOverlay}>
                <div style={dashboardContainer}>
                    {/* Header Strip */}
                    <div style={dashboardHeaderStrip}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <img src={profile.profile_pic ? `${storageUrl}${profile.profile_pic}` : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'} style={dashboardProfileImg} alt="Farmer" />
                            <div>
                                <h1 style={{ margin: 0, color: '#fff', fontSize: '1.8rem' }}>{profile.name}</h1>
                                <span style={dashboardBadge}>{profile.code}</span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <button onClick={() => setFullReportData(null)} style={dashboardCloseBtn}>✕ Close Dashboard</button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div style={statsGrid}>
                        <div style={{ ...statCard, borderLeft: '6px solid #4e73df' }}>
                            <small>ලිපිනය</small>
                            <p>{profile.address}</p>
                        </div>
                        <div style={{ ...statCard, borderLeft: '6px solid #1cc88a' }}>
                            <small>දුරකථන අංකය</small>
                            <p>{profile.telephone_no}</p>
                        </div>
                        <div style={{ ...statCard, borderLeft: '6px solid #f6c23e' }}>
                            <small>පවතින අත්තිකාරම්</small>
                            <h2 style={{ margin: 0, color: '#f6c23e' }}>රු. {formatDecimal(profile.advance_amount)}</h2>
                        </div>
                    </div>

                    {/* Main Content Sections */}
                    <div style={dashboardMainGrid}>
                        {/* Sales Section */}
                        <div style={dashboardCard}>
                            <div style={cardHeader}>📦 විකුණුම් ඉතිහාසය (Sales)</div>
                            <div style={cardBody}>
                                <table style={modernTable}>
                                    <thead>
                                        <tr><th>දිනය</th><th>අයිතමය</th><th>බර (kg)</th><th>අගය (රු.)</th></tr>
                                    </thead>
                                    <tbody>
                                        {sales.map(s => (
                                            <tr key={s.id}>
                                                <td>{s.Date}</td>
                                                <td style={{ fontWeight: '600' }}>{s.item_name}</td>
                                                <td>{s.weight}</td>
                                                <td style={{ textAlign: 'right' }}>{formatDecimal(s.SupplierTotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Payments Section */}
                        <div style={dashboardCard}>
                            <div style={cardHeader}>💳 ගෙවීම් සහ ණය (Payments)</div>
                            <div style={cardBody}>
                                <table style={modernTable}>
                                    <thead>
                                        <tr><th>බිල් අං</th><th>ගෙවූ (රු.)</th><th>ඉතිරි (රු.)</th><th>වර්ගය</th></tr>
                                    </thead>
                                    <tbody>
                                        {loans.map(l => (
                                            <tr key={l.id}>
                                                <td><span style={billBadge}>{l.bill_no || 'N/A'}</span></td>
                                                <td style={{ color: '#1cc88a', fontWeight: 'bold' }}>{formatDecimal(l.loan_amount)}</td>
                                                <td style={{ color: '#e74a3b', fontWeight: 'bold' }}>{formatDecimal(l.total_amount)}</td>
                                                <td>{l.type === 'Cash' ? '💵 Cash' : '📝 Cheque'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const filteredPrintedItems = summary.printed.filter(item => item.supplier_code.toLowerCase().includes(printedSearchTerm.toLowerCase()));

    return (
        <>
            {contextMenu.visible && (
                <div style={{ position: 'absolute', top: contextMenu.y, left: contextMenu.x, backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '4px', zIndex: 11000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    <button onClick={handleDeleteRecord} style={{ padding: '12px 20px', color: '#e74a3b', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>🗑️ Delete Transaction</button>
                </div>
            )}

            <nav style={navBarStyle}>
                <h1 style={{ color: 'white', fontSize: '1.5rem', margin: 0 }}>සැපයුම්කරු වාර්තාව</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button 
                        style={farmerReportNavBtn} 
                        onClick={() => setIsFarmerModalOpen(true)}
                    >
                        📊 ගොවි වාර්තාව
                    </button>
                    <button style={navBtnPink} onClick={() => navigate('/supplier-loan-report')}>ගොවි ණය</button>
                    <button style={navBtnCyan} onClick={() => setBillSize(billSize === '3mm' ? '4mm' : '3mm')}>බිල්පත: {billSize}</button>
                    <button style={navBtnGreen} onClick={goToSalesEntry}>මුල් පිටුව</button>
                </div>
            </nav>

            <div style={reportContainerStyle}>
                <div style={sectionsContainerStyle}>
                    <div style={printedContainerStyle}>
                        <div style={printedSectionStyle}>
                            <h2 style={sectionHeader}>මුද්‍රණය කළ</h2>
                            <input type="text" placeholder="🔍 සෙවීම..." value={printedSearchTerm} onChange={(e) => setPrintedSearchTerm(e.target.value)} style={searchBarStyle} />
                            <div style={listContainerStyle}>
                                {filteredPrintedItems.map((item, i) => (
                                    <button key={i} onClick={() => handlePrintedBillClick(item.supplier_code, item.supplier_bill_no)} style={printedBtn}>{item.supplier_code}-{item.supplier_bill_no}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={centerPanelContainerStyle}>
                        <div style={mainDetailsPanel}>
                            <div style={headerStyle}>
                                <h2 style={{ color: 'white' }}>බිල්පත් විස්තර: {selectedBillNo || '...'}</h2>
                                {profilePic && <img src={`${STORAGE_URL}${profilePic}`} style={profilePicStyle} alt="S" />}
                            </div>
                            <table style={dataTable}>
                                <thead><tr style={{ backgroundColor: '#4e73df', color: 'white' }}><th>බිල්</th><th>ගනුදෙ</th><th>අයිතමය</th><th>බර</th><th>එකතුව</th></tr></thead>
                                {supplierDetails.length > 0 ? (
                                    <tbody>{supplierDetails.map((r, i) => <tr key={i} style={getRowStyle(i)}><td>{r.bill_no}</td><td>{r.customer_code}</td><td>{r.item_name}</td><td>{r.weight}</td><td>{r.SupplierTotal}</td></tr>)}</tbody>
                                ) : (<tbody><tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#888' }}>Select a record to view details</td></tr></tbody>)}
                            </table>
                            {selectedLoanRecord && (
                                <div style={loanSummaryBox}>
                                    <div><span style={{ fontSize: '0.8rem', opacity: 0.8 }}>ගෙවූ මුදල</span><h3 style={{ margin: 0, color: '#1cc88a' }}>රු. {formatDecimal(selectedLoanRecord.loan_amount)}</h3></div>
                                    <div><span style={{ fontSize: '0.8rem', opacity: 0.8 }}>ඉතිරි ශේෂය</span><h3 style={{ margin: 0, color: '#e74a3b' }}>රු. {formatDecimal(selectedLoanRecord.total_amount)}</h3></div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={unprintedContainerStyle}>
                        <div style={unprintedSectionStyle}>
                            <h2 style={sectionHeader}>ණය ලබාගත්</h2>
                            <div style={listContainerStyle}>
                                {loanSummary.map((loan, index) => (
                                    <button key={index} onClick={() => handleUnprintedBillClick(loan.supplier_code, loan.supplier_bill_no)} onContextMenu={(e) => handleContextMenu(e, loan)} style={unprintedBtn}>
                                        <strong>{loan.supplier_code}</strong><br/><small>බිල්: {loan.supplier_bill_no}</small>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {renderFarmerSelectorModal()}
            {renderFullReportView()}
        </>
    );
};

// --- MODERN STYLES ---
const modernModalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(10, 20, 50, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 12000 };
const modernSelectionCard = { backgroundColor: 'white', padding: '40px', borderRadius: '24px', width: '450px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', position: 'relative', overflow: 'hidden' };
const modalHeaderDecoration = { position: 'absolute', top: 0, left: 0, width: '100%', height: '10px', background: 'linear-gradient(90deg, #4e73df, #6f42c1)' };
const modernSelectInput = { width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid #eaecf4', fontSize: '1rem', outline: 'none', backgroundColor: '#f8f9fc', color: '#4e73df', fontWeight: 'bold' };
const modernSubmitBtn = { flex: 1, padding: '14px', backgroundColor: '#4e73df', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' };
const modernCancelBtn = { flex: 1, padding: '14px', backgroundColor: '#f8f9fc', color: '#5a5c69', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' };

const dashboardOverlay = { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#f8f9fc', zIndex: 13000, overflowY: 'auto' };
const dashboardContainer = { maxWidth: '1400px', margin: '0 auto', padding: '40px' };
const dashboardHeaderStrip = { background: 'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)', padding: '30px 40px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' };
const dashboardProfileImg = { width: '80px', height: '80px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.3)', objectFit: 'cover' };
const dashboardBadge = { backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '0.9rem', marginTop: '5px', display: 'inline-block' };
const dashboardCloseBtn = { backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' };

const statsGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px', marginTop: '30px' };
const statCard = { backgroundColor: 'white', padding: '25px', borderRadius: '15px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' };

const dashboardMainGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '30px' };
const dashboardCard = { backgroundColor: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid #eaecf4' };
const cardHeader = { padding: '20px 25px', backgroundColor: '#f8f9fc', borderBottom: '1px solid #eaecf4', fontWeight: 'bold', color: '#4e73df', fontSize: '1.1rem' };
const cardBody = { padding: '20px', maxHeight: '500px', overflowY: 'auto' };

const modernTable = { width: '100%', borderCollapse: 'collapse' };
// td/th inside modernTable should have padding 15px and border-bottom 1px solid #f1f1f1
const billBadge = { padding: '4px 8px', backgroundColor: '#eaecf4', borderRadius: '6px', fontSize: '0.8rem', color: '#4e73df', fontWeight: 'bold' };

// --- STANDARD STYLES ---
const navBarStyle = { backgroundColor: '#343a40', padding: '15px 50px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 };
const farmerReportNavBtn = { padding: '10px 20px', fontWeight: 'bold', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(111, 66, 193, 0.3)' };
const navBtnPink = { padding: '8px 15px', fontWeight: 'bold', backgroundColor: '#e83e8c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const navBtnCyan = { padding: '8px 15px', fontWeight: 'bold', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const navBtnGreen = { padding: '10px 20px', fontWeight: 'bold', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const reportContainerStyle = { minHeight: '100vh', padding: '110px 50px 50px 50px', backgroundColor: '#1ec139ff' };
const sectionsContainerStyle = { display: 'flex', justifyContent: 'space-between', gap: '20px' };
const printedContainerStyle = { width: '220px', border: '2px solid black', borderRadius: '12px', overflow: 'hidden' };
const unprintedContainerStyle = { width: '220px', border: '2px solid black', borderRadius: '12px', overflow: 'hidden' };
const centerPanelContainerStyle = { flex: '3', minWidth: '700px' };
const printedSectionStyle = { backgroundColor: '#1ec139ff', height: 'calc(100vh - 250px)', padding: '10px' };
const unprintedSectionStyle = { backgroundColor: '#1ec139ff', height: 'calc(100vh - 250px)', padding: '10px' };
const sectionHeader = { textAlign: 'center', color: 'white', borderBottom: '1px solid white', paddingBottom: '10px' };
const searchBarStyle = { width: '100%', padding: '10px', borderRadius: '6px', marginBottom: '10px', border: 'none' };
const listContainerStyle = { display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto', height: '85%' };
const printedBtn = { padding: '12px', backgroundColor: '#1E88E5', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', width: '100%' };
const unprintedBtn = { padding: '12px', backgroundColor: '#FF7043', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%' };
const mainDetailsPanel = { backgroundColor: '#091d3d', padding: '30px', borderRadius: '16px', minHeight: '600px', boxShadow: '0 15px 30px rgba(0,0,0,0.3)' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '20px' };
const dataTable = { width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' };
const loanSummaryBox = { marginTop: '30px', display: 'flex', justifyContent: 'space-around', backgroundColor: '#0d2347', padding: '20px', borderRadius: '12px', border: '1px solid #17a2b8', color: 'white' };
const profilePicStyle = { width: '60px', height: '60px', borderRadius: '50%', border: '2px solid white' };

export default SupplierReport;