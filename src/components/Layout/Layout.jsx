import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../../api';
import ItemReportModal from '../Itemrepo/ItemReportModal';
import WeightReportModal from '../WeightReport/WeightReportModal';
import GrnSaleReportModal from '../GrnSale/ReportModal';
import GrnReportModal from '../GrnReport/GrnReportModal';
import SalesAdjustmentReportModal from '../SalesAdjustmentReport/SalesAdjustmentReportModal';
import GrnSalesOverviewReport from '../GrnSalesOverview/GrnSalesOverviewReport';
import GrnSalesOverviewReport2 from '../GrnSalesOverview/GrnSalesOverviewReport2';
import SalesReportModal from '../SalesReport/SalesReportModal';
import DayProcessModal from '../Modals/DayProcessModal';
import { BASE_PATH } from '../../config';

const Layout = ({ children, currentView, billSize, handleBillSizeChange }) => {
    const location = useLocation();
    const navigate = useNavigate();

    // === Modal States ===
    const [isItemReportModalOpen, setIsItemReportModalOpen] = useState(false);
    const [isWeightReportModalOpen, setIsWeightReportModalOpen] = useState(false);
    const [isGrnSaleReportModalOpen, setIsGrnSaleReportModalOpen] = useState(false);
    const [isSalesAdjustmentReportModalOpen, setIsSalesAdjustmentReportModalOpen] = useState(false);
    const [isGrnSalesOverviewReportOpen, setIsGrnSalesOverviewReportOpen] = useState(false);
    const [isGrnSalesOverviewReport2Open, setIsGrnSalesOverviewReport2Open] = useState(false);
    const [isSalesReportModalOpen, setIsSalesReportModalOpen] = useState(false);
    const [isGrnReportModalOpen, setIsGrnReportModalOpen] = useState(false);
    const [isDayProcessModalOpen, setIsDayProcessModalOpen] = useState(false);

    // === User & Settings State ===
    const [user, setUser] = useState(null);
    const [settingValue, setSettingValue] = useState('');

    // === Bottom Password States ===
    const [bottomPassword, setBottomPassword] = useState('');
    const [isBottomUnlocked, setIsBottomUnlocked] = useState(true);

    // Sub-folder the app is served from — needed for full-page jumps (window.location.href).
    // <Link to> / navigate() must NOT add it: the router's basename already does.
    const basePath = BASE_PATH;

    useEffect(() => {
        // 1. Handle User Session
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            // Redirect to login with base path
            window.location.href = `${basePath}/login`;
        }

        // 2. Fetch Setting Value
        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                if (response.data) {
                    setSettingValue(response.data.value || response.data[0]?.value || '');
                }
            } catch (error) {
                console.error("Error fetching settings data:", error);
            }
        };

        fetchSettings();
    }, [basePath]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        // Redirect to login with base path
        window.location.href = `${basePath}/login`;
    };

    // === Modal Handlers ===
    const openItemReportModal = () => setIsItemReportModalOpen(true);
    const closeItemReportModal = () => setIsItemReportModalOpen(false);
    const openWeightReportModal = () => setIsWeightReportModalOpen(true);
    const closeWeightReportModal = () => setIsWeightReportModalOpen(false);
    const openGrnSaleReportModal = () => setIsGrnSaleReportModalOpen(true);
    const closeGrnSaleReportModal = () => setIsGrnSaleReportModalOpen(false);
    const openSalesAdjustmentReportModal = () => setIsSalesAdjustmentReportModalOpen(true);
    const closeSalesAdjustmentReportModal = () => setIsSalesAdjustmentReportModalOpen(false);
    const openGrnSalesOverviewReport = () => setIsGrnSalesOverviewReportOpen(true);
    const closeGrnSalesOverviewReport = () => setIsGrnSalesOverviewReportOpen(false);
    const openGrnSalesOverviewReport2 = () => setIsGrnSalesOverviewReport2Open(true);
    const closeGrnSalesOverviewReport2 = () => setIsGrnSalesOverviewReport2Open(false);
    const openSalesReportModal = () => setIsSalesReportModalOpen(true);
    const closeSalesReportModal = () => setIsSalesReportModalOpen(false);
    const openGrnReportModal = () => setIsGrnReportModalOpen(true);
    const closeGrnReportModal = () => setIsGrnReportModalOpen(false);
    const openDayProcessModal = () => setIsDayProcessModalOpen(true);
    const closeDayProcessModal = () => setIsDayProcessModalOpen(false);

    const handleProfitReportClick = () => {
        window.location.href = `${basePath}/sop`;
    };
    const handleProfitReportClick2 = () => {
        window.location.href = `${basePath}/sop2`;
    };
    const handleProfitReportClick3 = () => {
        window.location.href = `${basePath}/commissions`;
    };
    const handleSupplierReportClick = () => {
        navigate('/reports/supplier');
    };

    const isSalesEntryPage = location.pathname === `${basePath}/sales` ||
        location.pathname === '/sales' ||
        location.pathname === `${basePath}/sales-entry` ||
        location.pathname === '/sales-entry';

    const navTextBtn = {
        background: "none",
        border: "none",
        color: "#fff",
        fontWeight: "700",
        fontSize: "14px",
        margin: "0 28px",
        padding: "0",
        cursor: "pointer",
        whiteSpace: "nowrap"
    };

    const handleBottomPasswordChange = (e) => {
        setBottomPassword(e.target.value);
    };

    return (
        <div>
            {/* === Top Navigation Bar === */}
            <nav className="navbar navbar-expand-lg navbar-dark fixed-top" style={{ backgroundColor: '#004d00', width: '100%' }}>
                <div className="container-fluid d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center">
                        {/* AFTER */}
                       <Link className="navbar-brand fw-bold d-flex align-items-center me-3" to="/sales">
                            <i className="material-icons align-middle me-2">warehouse</i>
                            මුල් පිටුව
                        </Link>
                        <div className="navbar-nav d-flex flex-row align-items-center">
                            <div className="nav-item dropdown mx-1">
                                <button className="btn btn-outline-light btn-sm dropdown-toggle" id="masterDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                                    <i className="material-icons align-middle me-1">menu_book</i> ප්‍රධාන ගොනුව
                                </button>
                                <ul className="dropdown-menu dropdown-menu-dark" aria-labelledby="masterDropdown">
                                    <li><Link to={`/customers`} className="dropdown-item"><i className="material-icons align-middle me-1">people</i> පාරිභෝගිකයින්</Link></li>
                                    <li><Link to={`/items`} className="dropdown-item"><i className="material-icons align-middle me-1">inventory_2</i> භාණ්ඩ</Link></li>
                                    <li><Link to={`/suppliers`} className="dropdown-item"><i className="material-icons align-middle me-1">local_shipping</i> සැපයුම්කරුවන්</Link></li>
                                    
                                   
                                    <li><Link to={`/alldeletedrecords`} className="dropdown-item flex items-center"><i className="material-icons me-1">analytics</i>holdbills deleted</Link></li>
                                    <li><Link to={`/customer-sale-loans`} className="dropdown-item"><i className="material-icons align-middle me-1">request_quote</i> පාරිභෝගික ණය (Customer Loans)</Link></li>
                                    <li><Link to={`/sop`} className="dropdown-item"><i className="material-icons align-middle me-1">local_shipping</i> සැපයුම්කරු ගනුදෙනු (Supplier Transactions)</Link></li>
                                    <li><Link to={`/supplier-loans`} className="dropdown-item"><i className="material-icons align-middle me-1">account_balance_wallet</i> සැපයුම්කරු ණය (Supplier Loans)</Link></li>
                                    <li><hr className="dropdown-divider" /></li>
                                    <li>
                                        <button type="button" className="dropdown-item text-warning" onClick={() => window.location.href = `${basePath}/customers-loans/report`}>
                                            <i className="material-icons align-middle me-1 text-warning">account_balance</i> ණය වාර්තාව
                                        </button>
                                    </li>
                                </ul>
                            </div>


                            <Link to={`/customers-loans/list`} className="btn btn-outline-warning btn-sm mx-1" style={{ fontWeight: 'bold', color: '#fff' }}>
                                <i className="material-icons align-middle me-1" style={{ fontSize: '16px' }}>account_balance_wallet</i>පාරිභෝගික ණය
                            </Link>

                            {/* 🛡️ Conditional: Hide for Admin */}
                            {user?.role !== 'Admin' && (
                                <>
                                    <button type="button" className="btn btn-outline-success btn-sm mx-1" style={{ fontWeight: 'bold', color: '#fff' }} onClick={openDayProcessModal}>දින අවසාන ක්‍රියාවලිය</button>
                                </>
                            )}
                        </div>

                        {/* 🛡️ Conditional: Hide Bill Size for Admin */}
                        {isSalesEntryPage && user?.role !== 'Admin' && (
                            <div className="d-flex align-items-center me-3" style={{ marginLeft: '20px' }}>
                                <label htmlFor="bill-size-select" className="text-white me-2" style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Bill Size:</label>
                                <select id="bill-size-select" value={billSize} onChange={handleBillSizeChange} className="form-select form-select-sm" style={{ width: '100px', backgroundColor: '#006400', color: 'white', border: '1px solid #4a5568' }}>
                                    <option value="3inch">3 Inch</option>
                                    <option value="4inch">4 Inch (A4 · Def)</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Right Side: Display fetched value in Red and Logout Button */}
                    {user && (
                        <div className="d-flex align-items-center text-white">
                            <span className="me-3 fw-bold" style={{ color: '#ff4444', fontSize: '1.1rem' }}>{settingValue}</span>
                            <button onClick={handleLogout} className="btn btn-sm btn-outline-light" style={{ fontWeight: 'bold' }}>Logout</button>
                        </div>
                    )}
                </div>
            </nav>

            {/* Main Content */}
            <main className={isSalesEntryPage ? "p-0" : "container-fluid py-4"} style={{ marginTop: '80px', marginBottom: '80px', width: '100%', maxWidth: isSalesEntryPage ? '100%' : undefined }}>
                {children}
            </main>

            {/* Bottom Nav */}
            <nav className="navbar navbar-expand-lg navbar-dark fixed-bottom" style={{ backgroundColor: '#004d00', width: '100%' }}>
                <div className="container-fluid d-flex justify-content-start align-items-center">

                    {[
                        { label: 'එළවළු', onClick: openItemReportModal },
                        { label: 'කිලෝ ප්‍රමාණය', onClick: openWeightReportModal },
                        { label: 'අතැති මුදල්', onClick: () => window.location.href = `${basePath}/financial-report` },
                        { label: 'විකුණුම්', onClick: openSalesReportModal },
                        { label: 'වෙනස් කිරීම', onClick: openSalesAdjustmentReportModal },
                        { label: 'සැපයුම් බිල්පත් ', onClick: handleProfitReportClick },

                    ].map((btn, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={btn.onClick}
                            style={{
                                ...navTextBtn,
                                fontSize: '16px',
                                fontWeight: '700',
                                letterSpacing: '0.5px',
                                opacity: 1,
                                pointerEvents: 'auto',
                                marginRight: '15px'
                            }}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </nav>

            <ItemReportModal isOpen={isItemReportModalOpen} onClose={closeItemReportModal} onGenerateReport={() => { }} loading={false} />
            <WeightReportModal isOpen={isWeightReportModalOpen} onClose={closeWeightReportModal} />
            <GrnSaleReportModal isOpen={isGrnSaleReportModalOpen} onClose={closeGrnSaleReportModal} />
            <SalesAdjustmentReportModal isOpen={isSalesAdjustmentReportModalOpen} onClose={closeSalesAdjustmentReportModal} />
            <GrnSalesOverviewReport isOpen={isGrnSalesOverviewReportOpen} onClose={closeGrnSalesOverviewReport} />
            <GrnSalesOverviewReport2 isOpen={isGrnSalesOverviewReport2Open} onClose={closeGrnSalesOverviewReport2} />
            <SalesReportModal isOpen={isSalesReportModalOpen} onClose={closeSalesReportModal} />
            <GrnReportModal isOpen={isGrnReportModalOpen} onClose={closeGrnReportModal} />
            <DayProcessModal isOpen={isDayProcessModalOpen} onClose={closeDayProcessModal} />
        </div>
    );
};

export default Layout;