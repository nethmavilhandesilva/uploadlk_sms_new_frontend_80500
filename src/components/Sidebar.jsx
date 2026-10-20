import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import { BASE_PATH } from '../config';
const Sidebar = () => {
    const location = useLocation();

    // Get user data from localStorage
    const getUser = () => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                return null;
            }
        }
        return null;
    };

    const user = getUser();
    const userRole = user?.role;

    // Determine the appropriate home path based on user role
    const getHomePath = () => {
        if (userRole === 'level4') {
            return '/supplierreport';
        }
        return '/sales';
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = `${BASE_PATH}/login`;
    };

    // Helper to check if a link is active based on current URL
    const isActive = (path) => location.pathname === path;

    const sidebarStyle = {
        width: '260px',
        backgroundColor: '#004d00',
        color: 'white',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        overflowY: 'auto',
        boxShadow: '2px 0 5px rgba(0,0,0,0.2)',
        zIndex: 1000
    };

    const linkStyle = (path) => ({
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        padding: '10px 15px',
        borderRadius: '8px',
        marginBottom: '8px',
        color: 'white',
        backgroundColor: isActive(path) ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
        fontWeight: isActive(path) ? 'bold' : 'normal',
        transition: 'background 0.3s ease',
    });

    return (
        <div style={sidebarStyle}>
            {/* Section Title */}
            <h6
                className="text-uppercase text-light opacity-50 small fw-bold mb-3"
                style={{
                    fontSize: '0.75rem',
                    letterSpacing: '1px',
                    textAlign: 'left'
                }}
            >
                ප්‍රධාන දත්ත
            </h6>

            {/* Dashboard / Home Button - Dynamic routing based on role */}
            <Link
                className="fw-bold d-flex align-items-center mb-4 text-white text-decoration-none"
                to={getHomePath()}
                style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left'
                }}
            >
                <i className="material-icons me-2">warehouse</i>
                මුල් පිටුව
            </Link>

            {/* Navigation */}
            <nav className="flex-grow-1">
                <Link
                    to="/customers"
                    style={{
                        ...linkStyle('/customers'),
                        justifyContent: 'flex-start',
                        textAlign: 'left'
                    }}
                >
                    <i className="material-icons me-2">people</i>
                    ගනුදෙනුකරුවන්
                </Link>

                <Link
                    to="/items"
                    style={{
                        ...linkStyle('/items'),
                        justifyContent: 'flex-start',
                        textAlign: 'left'
                    }}
                >
                    <i className="material-icons me-2">inventory_2</i>
                    අයිතමය
                </Link>

                <Link
                    to="/suppliers"
                    style={{
                        ...linkStyle('/suppliers'),
                        justifyContent: 'flex-start',
                        textAlign: 'left'
                    }}
                >
                    <i className="material-icons me-2">local_shipping</i>
                    සැපයුම්කරුවන්
                </Link>

                <Link
                    to="/commissions"
                    style={{
                        ...linkStyle('/commissions'),
                        justifyContent: 'flex-start',
                        textAlign: 'left'
                    }}
                >
                    <i className="material-icons me-2">attach_money</i>
                    කොමිෂන්
                </Link>
                <Link
                    to="/utility-types"
                    style={{
                        ...linkStyle('/utility-types'),
                        justifyContent: 'flex-start',
                        textAlign: 'left'
                    }}
                >
                    <i className="material-icons me-2">inventory_2</i>
                    Add IC
                </Link>
            </nav>

            {/* Logout */}
            <div className="mt-auto pt-3 border-top border-secondary">
                <button
                    onClick={handleLogout}
                    className="btn btn-outline-light w-100 fw-bold d-flex align-items-center"
                    style={{
                        fontSize: '0.9rem',
                        justifyContent: 'flex-start',
                        textAlign: 'left'
                    }}
                >
                    <i className="material-icons me-2">logout</i>
                    ඉවත් වන්න
                </button>
            </div>
        </div>
    );
};

export default Sidebar;