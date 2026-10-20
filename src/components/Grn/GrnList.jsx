import React, { useState, useEffect } from 'react';
import { grnService } from '../../services/grnService';
import { Link } from 'react-router-dom';

const GrnList = () => {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadEntries();
    }, []);

    const loadEntries = async () => {
        try {
            const response = await grnService.getAll();
            setEntries(response.data);
        } catch (error) {
            console.error('Error loading GRN entries:', error);
            setMessage('Error loading GRN entries');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this GRN entry?')) {
            try {
                await grnService.delete(id);
                setMessage('GRN entry deleted successfully!');
                loadEntries();
            } catch (error) {
                console.error('Error deleting GRN entry:', error);
                setMessage('Error deleting GRN entry');
            }
        }
    };

    if (loading) {
        return <div className="text-center">Loading...</div>;
    }

    return (
        <div className="container-fluid mt-5">
            <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                    <h2 className="mb-0">GRN List</h2>
                    <Link to="/grn/create" className="btn btn-primary">
                        Add New GRN
                    </Link>
                </div>
                <div className="card-body">
                    {message && (
                        <div className={`alert ${message.includes('Error') ? 'alert-danger' : 'alert-success'}`}>
                            {message}
                        </div>
                    )}

                    {entries.length === 0 ? (
                        <div className="alert alert-info text-center">
                            No GRN entries found.
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-bordered table-striped">
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Item Name</th>
                                        <th>Supplier</th>
                                        <th>Packs</th>
                                        <th>Weight</th>
                                        <th>GRN No</th>
                                        <th>Date</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.map((entry) => (
                                        <tr key={entry.id}>
                                            <td>{entry.code}</td>
                                            <td>{entry.item_name}</td>
                                            <td>{entry.supplier_code}</td>
                                            <td>{entry.packs}</td>
                                            <td>{entry.weight}</td>
                                            <td>{entry.grn_no}</td>
                                            <td>{entry.txn_date}</td>
                                            <td>
                                                <Link 
                                                    to={`/grn/edit/${entry.id}`} 
                                                    className="btn btn-sm btn-info me-1"
                                                >
                                                    Edit
                                                </Link>
                                                <button 
                                                    onClick={() => handleDelete(entry.id)}
                                                    className="btn btn-sm btn-danger"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GrnList;