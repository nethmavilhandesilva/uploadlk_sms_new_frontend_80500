import React, { useState, useEffect } from 'react';
import { grnService } from '../../services/grnService';
import { useNavigate, useParams } from 'react-router-dom';

const EditGrn = () => {
    const [formData, setFormData] = useState({
        item_code: '',
        item_name: '',
        supplier_code: '',
        packs: '',
        weight: '',
        txn_date: '',
        grn_no: '',
        warehouse_no: '',
        total_grn: '',
        per_kg_price: ''
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);
    const navigate = useNavigate();
    const { id } = useParams();

    useEffect(() => {
        loadEntry();
    }, [id]);

    const loadEntry = async () => {
        try {
            const response = await grnService.get(id);
            setFormData({
                item_code: response.data.item_code,
                item_name: response.data.item_name,
                supplier_code: response.data.supplier_code,
                packs: response.data.packs,
                weight: response.data.weight,
                txn_date: response.data.txn_date,
                grn_no: response.data.grn_no,
                warehouse_no: response.data.warehouse_no,
                total_grn: response.data.total_grn,
                per_kg_price: response.data.PerKGPrice
            });
        } catch (error) {
            console.error('Error loading entry:', error);
            setErrors({ general: 'Error loading entry data' });
        } finally {
            setDataLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            await grnService.update(id, formData);
            navigate('/grn');
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors || {});
            } else {
                setErrors({ general: 'Error updating GRN entry' });
            }
        } finally {
            setLoading(false);
        }
    };

    if (dataLoading) {
        return <div className="text-center">Loading...</div>;
    }

    return (
        <div className="container-fluid mt-5">
            <div className="card">
                <div className="card-header">
                    <h2 className="mb-0">Edit GRN</h2>
                </div>
                <div className="card-body">
                    {errors.general && (
                        <div className="alert alert-danger">{errors.general}</div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="row">
                            <div className="col-md-6 mb-3">
                                <label className="form-label">Item Code *</label>
                                <input
                                    type="text"
                                    name="item_code"
                                    value={formData.item_code}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Item Name *</label>
                                <input
                                    type="text"
                                    name="item_name"
                                    value={formData.item_name}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                />
                            </div>

                            <div className="col-md-6 mb-3">
                                <label className="form-label">Supplier Code *</label>
                                <input
                                    type="text"
                                    name="supplier_code"
                                    value={formData.supplier_code}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                />
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
                                {loading ? 'Updating...' : 'Update GRN'}
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

export default EditGrn;