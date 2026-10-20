import React, { useState, useEffect } from 'react';
import { customerLoanService } from '../../services/customerLoanService';
import { useNavigate } from 'react-router-dom';
import CreateCustomerLoan from './CreateCustomerLoan';
import CustomerOpeningBalances from './CustomerOpeningBalances';

const CustomersLoanList = () => {
    const [loans, setLoans] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [grnCodes, setGrnCodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [editingLoan, setEditingLoan] = useState(null);
    const [showOpeningBalances, setShowOpeningBalances] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const response = await customerLoanService.getAll();
            setLoans(response.data.loans);
            setCustomers(response.data.customers);
            setGrnCodes(response.data.grnCodes);
        } catch (error) {
            console.error('Error loading data:', error);
            setMessage('Error loading data');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (loan) => {
        setEditingLoan(loan);
        // Scroll to the form
        document.getElementById('loan-form-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingLoan(null);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this loan record?')) {
            try {
                await customerLoanService.delete(id);
                setMessage('Loan record deleted successfully!');
                loadData();
                // If we're editing the deleted loan, cancel edit
                if (editingLoan && editingLoan.id === id) {
                    setEditingLoan(null);
                }
            } catch (error) {
                console.error('Error deleting loan:', error);
                setMessage('Error deleting loan record');
            }
        }
    };

    if (loading) {
        return <div className="text-center">Loading...</div>;
    }

    return (
        <div className="container-fluid mt-4">
            <div className="card" style={{ backgroundColor: '#004d00', color: '#fff' }}>
                <div className="card-body">
                    {message && (
                        <div className={`alert ${message.includes('Error') ? 'alert-danger' : 'alert-success'}`}>
                            {message}
                        </div>
                    )}

                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
                        <h3 className="text-white mb-0">Customer Loans Management</h3>
                        <button type="button" className="btn btn-warning fw-bold" onClick={() => navigate('/sales')}>
                            <i className="material-icons align-middle me-1" style={{ fontSize: '18px' }}>point_of_sale</i>
                            බිල්පත් තිරය (Billing Screen)
                        </button>
                    </div>

                    {/* Create/Edit Form */}
                    <div id="loan-form-section">
                        <CreateCustomerLoan 
                            customers={customers}
                            grnCodes={grnCodes}
                            onLoanCreated={loadData}
                            editingLoan={editingLoan}
                            onCancelEdit={handleCancelEdit}
                        />
                    </div>

                    {/* Loans Table */}
                    <div className="mt-4">
                        <h4 className="text-white">Loan Records</h4>
                        <div className="table-responsive">
                            <table className="table table-bordered table-sm bg-white text-dark">
                                <thead>
                                    <tr>
                                        <th>Description</th>
                                        <th>Amount</th>
                                        <th>Customer</th>
                                        <th>Loan Type</th>
                                        <th>Bill No</th>
                                        <th>Settling Way</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loans.filter(loan => loan.loan_type !== 'returns').map((loan) => (
                                        <tr key={loan.id} className={editingLoan?.id === loan.id ? 'table-warning' : ''}>
                                            <td>{loan.description}</td>
                                            <td>{Math.abs(loan.amount).toFixed(2)}</td>
                                            <td>{loan.customer_short_name || '-'}</td>
                                            <td>
                                                <span className={`badge ${
                                                    loan.loan_type === 'old' ? 'bg-primary' :
                                                    loan.loan_type === 'today' ? 'bg-success' :
                                                    loan.loan_type === 'ingoing' ? 'bg-info' :
                                                    loan.loan_type === 'outgoing' ? 'bg-warning' :
                                                    loan.loan_type === 'grn_damage' ? 'bg-danger' : 'bg-secondary'
                                                }`}>
                                                    {loan.loan_type}
                                                </span>
                                            </td>
                                            <td>{loan.bill_no || '-'}</td>
                                            <td>
                                                <span className={`badge ${
                                                    loan.settling_way === 'cheque' ? 'bg-info' : 'bg-secondary'
                                                }`}>
                                                    {loan.settling_way || 'cash'}
                                                </span>
                                            </td>
                                            <td>
                                                <button 
                                                    className="btn btn-sm btn-warning me-1"
                                                    onClick={() => handleEdit(loan)}
                                                    disabled={editingLoan?.id === loan.id}
                                                >
                                                    {editingLoan?.id === loan.id ? 'Editing...' : 'Edit'}
                                                </button>
                                                <button 
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleDelete(loan.id)}
                                                    disabled={editingLoan?.id === loan.id}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {loans.filter(loan => loan.loan_type !== 'returns').length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="text-center">No loan records found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Additional Buttons */}
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-3 mt-4">
                       
                        <button className="btn btn-dark">
                            ණය වාර්තාව
                        </button>
                        <button className="btn btn-dark">
                            නැවත ලබා දීම් වාර්තාව
                        </button>
                        <button className="btn btn-dark">
                            චෙක් ගෙවීම් වාර්තාව බලන්න
                        </button>
                        <button
                            className={`btn ${showOpeningBalances ? 'btn-warning' : 'btn-dark'}`}
                            onClick={() => {
                                setShowOpeningBalances((open) => !open);
                                setTimeout(() => document.getElementById('opening-balance-section')?.scrollIntoView({ behavior: 'smooth' }), 50);
                            }}
                        >
                            Set Balance (ආරම්භක ශේෂය)
                        </button>
                        <button className="btn btn-light fw-bold" onClick={() => navigate('/customers-loans/balances')}>
                            සියලු පාරිභෝගික ශේෂ වාර්තාව
                        </button>
                        <button className="btn btn-light fw-bold" onClick={() => navigate('/customers-loans/statement')}>
                            පාරිභෝගික ණය විස්තර වාර්තාව
                        </button>
                    </div>

                    {showOpeningBalances && <CustomerOpeningBalances />}
                </div>
            </div>
        </div>
    );
};

export default CustomersLoanList;