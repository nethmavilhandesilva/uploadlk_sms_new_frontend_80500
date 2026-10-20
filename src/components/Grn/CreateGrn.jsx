import React, { useState, useEffect } from 'react';
import { grnService } from '../../services/grnService';
import { useNavigate } from 'react-router-dom';

const CreateGrn = () => {
    const [formData, setFormData] = useState({
        item_code: '',
        supplier_name: '',
        packs: '',
        weight: '',
        txn_date: new Date().toISOString().split('T')[0],
        grn_no: '',
        warehouse_no: '',
        total_grn: '',
        per_kg_price: ''
    });
    const [items, setItems] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadCreateData();
    }, []);

    const loadCreateData = async () => {
        try {
            const response = await grnService.getCreateData();
            setItems(response.data.items);
            setSuppliers(response.data.suppliers);
        } catch (error) {
            console.error('Error loading create data:', error);
            setErrors({ general: 'Error loading data' });
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Auto-calculate Per KG Price
        if (name === 'total_grn' || name === 'weight') {
            const totalGrn = name === 'total_grn' ? value : formData.total_grn;
            const weight = name === 'weight' ? value : formData.weight;
            
            if (totalGrn && weight && parseFloat(totalGrn) > 0 && parseFloat(weight) > 0) {
                const perKgPrice = (parseFloat(totalGrn) / parseFloat(weight)).toFixed(2);
                setFormData(prev => ({
                    ...prev,
                    per_kg_price: perKgPrice
                }));
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            await grnService.create(formData);
            navigate('/grn');
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors || {});
            } else {
                setErrors({ general: error.response?.data?.error || 'Error creating GRN entry' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container-fluid mt-5">
            <div className="card">
                <div className="card-header">
                    <h2 className="mb-0">Create New GRN</h2>
                </div>
                <div className="card-body">
                    {errors.general && (
                        <div className="alert alert-danger">{errors.general}</div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="row">
                            <div className="col-md-6 mb-3">
                                <label className="form-label">Item *</label>
                                <select
                                    name="item_code"
                                    value={formData.item_code}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                >
                                    <option value="">Select Item</option>
                                    {items.map(item => (
                                        <option key={item.id} value={item.no}>
                                            {item.no} - {item.type}
                                        </option>
                                    ))}
                                </select>
                                {errors.item_code && <div className="text-danger">{errors.item_code[0]}</div>}
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Supplier *</label>
                                <input
                                    type="text"
                                    name="supplier_name"
                                    list="suppliers"
                                    value={formData.supplier_name}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                />
                                <datalist id="suppliers">
                                    {suppliers.map(supplier => (
                                        <option key={supplier.id} value={supplier.code} />
                                    ))}
                                </datalist>
                                {errors.supplier_name && <div className="text-danger">{errors.supplier_name[0]}</div>}
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">GRN No *</label>
                                <input
                                    type="text"
                                    name="grn_no"
                                    value={formData.grn_no}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Warehouse No *</label>
                                <input
                                    type="text"
                                    name="warehouse_no"
                                    value={formData.warehouse_no}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Packs *</label>
                                <input
                                    type="number"
                                    name="packs"
                                    value={formData.packs}
                                    onChange={handleChange}
                                    className="form-control"
                                    min="1"
                                    required
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Weight (kg) *</label>
                                <input
                                    type="number"
                                    name="weight"
                                    value={formData.weight}
                                    onChange={handleChange}
                                    className="form-control"
                                    step="0.01"
                                    min="0.01"
                                    required
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Total GRN</label>
                                <input
                                    type="number"
                                    name="total_grn"
                                    value={formData.total_grn}
                                    onChange={handleChange}
                                    className="form-control"
                                    step="0.01"
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Per KG Price</label>
                                <input
                                    type="number"
                                    name="per_kg_price"
                                    value={formData.per_kg_price}
                                    onChange={handleChange}
                                    className="form-control"
                                    step="0.01"
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Date *</label>
                                <input
                                    type="date"
                                    name="txn_date"
                                    value={formData.txn_date}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                />
                            </div>
                        </div>

                        <div className="mt-3">
                            <button 
                                type="submit" 
                                className="btn btn-primary me-2"
                                disabled={loading}
                            >
                                {loading ? 'Creating...' : 'Create GRN'}
                            </button>
                            <button 
                                type="button" 
                                className="btn btn-secondary"
                                onClick={() => navigate('/grn')}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreateGrn;