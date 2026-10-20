import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import api from '../../api';
import Sidebar from '../Sidebar';
import { useNavigate } from 'react-router-dom';
import { SupplierOpeningBalances } from '../Suppliers/SupplierBalancePages';

const getInitialFormState = () => ({
    loan_id: '',
    loan_type: 'old',
    settling_way: 'cash',
    supplier_code: null,
    bill_no: '',
    amount: '',
    description: '',
    cheque_no: '',
    bank: '',
    cheque_date: new Date().toISOString().slice(0, 10),
});

const FarmerLoanManager = () => {
    const [form, setForm] = useState(getInitialFormState());
    const [farmers, setFarmers] = useState([]);
    const [loans, setLoans] = useState([]);
    const [totalLoanDisplay, setTotalLoanDisplay] = useState('');
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const isCheque = form.settling_way === 'cheque';

    // Fetch Farmers for dropdown
    const fetchFarmers = useCallback(async () => {
        try {
            const { data } = await api.get('/suppliers'); 
            const formatted = data.map(f => ({
                value: f.code,
                label: `${f.code} - ${f.name}`
            }));
            setFarmers(formatted);
        } catch (error) {
            console.error('Error fetching farmers:', error);
        }
    }, []);

    // Fetch transactions for the table (Today's records)
    const fetchLoans = useCallback(async () => {
        try {
            const { data } = await api.get('/farmer-loans/data');
            setLoans(data);
        } catch (error) {
            console.error('Error fetching loans:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch Balance logic (Old - Today)
    const fetchFarmerBalance = useCallback(async (code) => {
        if (code) {
            try {
                const { data } = await api.get(`/farmer-loans/balance/${code}`);
                // Includes the supplier's opening balance: opening + added (old) - paid (today).
                const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                // Same balance as the supplier loan statement: opening + added - paid + bills.
                                setTotalLoanDisplay(`ශේෂය: ${fmt(data.balance)} (ආරම්භක ${fmt(data.opening_balance)} + එකතු ${fmt(data.added)} − ගෙවීම් ${fmt(data.paid)} + බිල්පත් ${fmt(data.bills)})`);
            } catch (error) {
                setTotalLoanDisplay('ශේෂය ලබාගත නොහැක');
            }
        } else {
            setTotalLoanDisplay('');
        }
    }, []);

    useEffect(() => {
        fetchFarmers();
        fetchLoans();
    }, [fetchFarmers, fetchLoans]);

    useEffect(() => {
        fetchFarmerBalance(form.supplier_code);
    }, [form.supplier_code, fetchFarmerBalance]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    // Auto-description logic
    useEffect(() => {
        const { loan_type, settling_way, bank } = form;
        let newDescription = "";
        if (loan_type === 'old') {
            newDescription = settling_way === 'cheque' ? `Cheque from farmer - ${bank}` : "ගොවි ණයට එකතු කිරීම";
        } else if (loan_type === 'today') {
            newDescription = "ගොවියන්ගේ ණය ගෙවීම";
        }
        if (newDescription && !editingId) setForm(prev => ({ ...prev, description: newDescription }));
    }, [form.loan_type, form.settling_way, form.bank, editingId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (editingId) {
                // Update existing record
                await api.put(`/farmer-loans/${editingId}`, form);
                alert('දත්ත සාර්ථකව යාවත්කාලීන කරන ලදී!');
                setEditingId(null);
            } else {
                // Create new record
                await api.post('/farmer-loans', form);
                alert('දත්ත සාර්ථකව ඇතුලත් කරන ලදී!');
            }
            
            setForm(getInitialFormState());
            fetchLoans();
            fetchFarmerBalance(form.supplier_code);
        } catch (error) {
            alert(editingId ? 'යාවත්කාලීන කිරීම අසාර්ථකයි' : 'ඇතුලත් කිරීම අසාර්ථකයි');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (loan) => {
        setEditingId(loan.id);
        setForm({
            loan_id: loan.id,
            loan_type: loan.loan_type,
            settling_way: loan.settling_way || 'cash',
            supplier_code: loan.supplier_code,
            bill_no: loan.bill_no || '',
            amount: loan.amount,
            description: loan.description || '',
            cheque_no: loan.cheque_no || '',
            bank: loan.bank || '',
            cheque_date: loan.cheque_date || new Date().toISOString().slice(0, 10),
        });
        
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/farmer-loans/${id}`);
            alert('දත්ත සාර්ථකව මකා දමන ලදී!');
            fetchLoans();
            setDeleteConfirm(null);
            
            // If we were editing this record, reset the form
            if (editingId === id) {
                setEditingId(null);
                setForm(getInitialFormState());
            }
        } catch (error) {
            alert('මකා දැමීම අසාර්ථකයි');
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setForm(getInitialFormState());
    };

    // Delete Confirmation Modal
    const DeleteConfirmModal = () => {
        if (!deleteConfirm) return null;
        
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000
            }}>
                <div style={{
                    backgroundColor: 'white',
                    padding: '25px',
                    borderRadius: '8px',
                    width: '400px',
                    textAlign: 'center'
                }}>
                    <h4>මකා දැමීම තහවුරු කරන්න</h4>
                    <p>ඔබට මෙම ගනුදෙනුව මකා දැමීමට අවශ්‍ය බව විශ්වාසද?</p>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                        <button 
                            onClick={() => handleDelete(deleteConfirm)}
                            style={{ padding: '8px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            ඔව්, මකන්න
                        </button>
                        <button 
                            onClick={() => setDeleteConfirm(null)}
                            style={{ padding: '8px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            අවලංගු කරන්න
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const navigate = useNavigate();
    const [showOpeningBalances, setShowOpeningBalances] = useState(false);

    if (loading) return <div className="text-center mt-5">Loading...</div>;

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <div style={{ marginLeft: '260px', flexGrow: 1, padding: '20px' }}>
                <style>{`
                    body { background-color: #e6f3ff !important; }
                    .custom-card { background-color: #003366 !important; color: #fff; padding: 25px; border-radius: 10px; }
                    label { color: #fff; font-size: 0.85rem; font-weight: bold; }
                    .balance-display { background: #ffcc00; color: #000; padding: 8px 15px; border-radius: 5px; font-weight: 800; display: inline-block; margin-top: 10px; border: 2px solid #000; }
                    .action-buttons { display: flex; gap: 8px; justify-content: center; }
                    .edit-btn { background-color: #28a745; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
                    .delete-btn { background-color: #dc3545; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
                    .cancel-btn { background-color: #6c757d; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; margin-left: 10px; }
                `}</style>

                <div className="custom-card">
                    <h3 className="mb-4">
                        {editingId ? 'ගනුදෙනුව සංශෝධනය කරන්න' : 'ගොවි ණය කළමනාකරණය (Farmer Loan)'}
                    </h3>

                    <form onSubmit={handleSubmit} className="p-3 border rounded bg-dark">
                        <div className="row gy-3">
                            <div className="col-md-12">
                                {['old', 'today'].map(type => (
                                    <label key={type} className="me-4">
                                        <input 
                                            type="radio" 
                                            name="loan_type" 
                                            value={type} 
                                            checked={form.loan_type === type} 
                                            onChange={handleInputChange}
                                            disabled={!!editingId}
                                        />
                                        {' '}
                                        {type === 'old' && 'ගොවි ණයට එකතු කිරීම (Old)'}
                                        {type === 'today' && 'ගොවියන්ගේ ණය ගෙවීම (Today)'}
                                    </label>
                                ))}
                            </div>

                            <div className="col-md-4">
                                <label>ගොවියා තෝරන්න (Farmer)</label>
                                <Select
                                    options={farmers}
                                    onChange={(opt) => setForm({...form, supplier_code: opt ? opt.value : null})}
                                    value={farmers.find(f => f.value === form.supplier_code)}
                                    placeholder="සොයන්න..."
                                    className="text-dark"
                                    isDisabled={!!editingId}
                                />
                                {form.supplier_code && totalLoanDisplay && (
                                    <div className="balance-display">
                                        {totalLoanDisplay}
                                    </div>
                                )}
                            </div>

                            <div className="col-md-2">
                                <label>මුදල</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    name="amount" 
                                    className="form-control form-control-sm" 
                                    value={form.amount} 
                                    onChange={handleInputChange} 
                                    required 
                                />
                            </div>

                            <div className="col-md-4">
                                <label>විස්තරය</label>
                                <input 
                                    type="text" 
                                    name="description" 
                                    className="form-control form-control-sm" 
                                    value={form.description} 
                                    onChange={handleInputChange} 
                                />
                            </div>

                            <div className="col-md-12">
                                <label className="d-block">ගෙවීමේ ක්‍රමය:</label>
                                {['cash', 'cheque'].map(way => (
                                    <label key={way} className="me-3">
                                        <input 
                                            type="radio" 
                                            name="settling_way" 
                                            value={way} 
                                            checked={form.settling_way === way} 
                                            onChange={handleInputChange}
                                            disabled={!!editingId}
                                        />
                                        {' '} {way.toUpperCase()}
                                    </label>
                                ))}
                            </div>

                            {isCheque && (
                                <div className="col-md-12 row g-2 bg-secondary p-2 rounded ms-0">
                                    <div className="col-md-4">
                                        <label>චෙක් අංකය</label>
                                        <input type="text" name="cheque_no" className="form-control form-control-sm" value={form.cheque_no} onChange={handleInputChange}/>
                                    </div>
                                    <div className="col-md-4">
                                        <label>බැංකුව</label>
                                        <input type="text" name="bank" className="form-control form-control-sm" value={form.bank} onChange={handleInputChange}/>
                                    </div>
                                    <div className="col-md-4">
                                        <label>දිනය</label>
                                        <input type="date" name="cheque_date" className="form-control form-control-sm" value={form.cheque_date} onChange={handleInputChange}/>
                                    </div>
                                </div>
                            )}

                            <div className="col-12">
                                <button type="submit" className="btn btn-warning btn-sm fw-bold">
                                    {editingId ? 'යාවත්කාලීන කරන්න' : 'දත්ත ඇතුලත් කරන්න'}
                                </button>
                                {editingId && (
                                    <button 
                                        type="button" 
                                        onClick={handleCancelEdit}
                                        className="cancel-btn"
                                    >
                                        අවලංගු කරන්න
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>

                    <h4 className="mt-5">අද දින වාර්තාව</h4>
                    <div className="table-responsive">
                        <table className="table table-bordered table-sm mt-2 bg-white text-dark">
                            <thead className="table-secondary">
                                <tr>
                                    <th>ගොවියා</th>
                                    <th>වර්ගය</th>
                                    <th>විස්තරය</th>
                                    <th className="text-end">මුදල</th>
                                    <th className="text-center">ක්‍රියා</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loans.map(loan => (
                                    <tr key={loan.id} style={editingId === loan.id ? { backgroundColor: '#fff3cd' } : {}}>
                                        <td>{loan.supplier_code}</td>
                                        <td>{loan.loan_type === 'old' ? 'ණයට එකතු කිරීම' : 'ණය ගෙවීම'}</td>
                                        <td>{loan.description}</td>
                                        <td className="text-end">{parseFloat(loan.amount).toFixed(2)}</td>
                                        <td className="text-center">
                                            <div className="action-buttons">
                                                <button 
                                                    onClick={() => handleEdit(loan)}
                                                    className="edit-btn"
                                                    title="Edit"
                                                >
                                                    ✏️ සංස්කරණය
                                                </button>
                                                <button 
                                                    onClick={() => setDeleteConfirm(loan.id)}
                                                    className="delete-btn"
                                                    title="Delete"
                                                >
                                                    🗑️ මකන්න
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {loans.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="text-center text-muted">
                                            අද දින කිසිදු ගනුදෙනුවක් නොමැත
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Supplier opening balances and balance reports */}
                <div className="d-flex flex-wrap gap-2 mt-3">
                    <button type="button" className={`btn fw-bold ${showOpeningBalances ? 'btn-warning' : 'btn-dark'}`}
                        onClick={() => {
                            setShowOpeningBalances((open) => !open);
                            setTimeout(() => document.getElementById('opening-balance-section')?.scrollIntoView({ behavior: 'smooth' }), 50);
                        }}>
                        Set Balance (ආරම්භක ශේෂය)
                    </button>
                    <button type="button" className="btn btn-primary fw-bold" onClick={() => navigate('/farmer-loans/balances')}>
                        සියලු සැපයුම්කරු ශේෂ වාර්තාව
                    </button>
                    <button type="button" className="btn btn-primary fw-bold" onClick={() => navigate('/farmer-loans/statement')}>
                        සැපයුම්කරු ණය විස්තර වාර්තාව
                    </button>
                </div>
                {showOpeningBalances && <SupplierOpeningBalances />}
            </div>
            <DeleteConfirmModal />
        </div>
    );
};

export default FarmerLoanManager;