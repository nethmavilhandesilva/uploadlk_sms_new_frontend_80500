import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useNavigate, Link, useParams } from 'react-router-dom';

const EditItem = () => {
    const [formData, setFormData] = useState({
        no: '',
        type: '',
        pack_cost: 0,
        pack_due: 0,
        bag_real_price: '' // Added
    });

    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [itemLoading, setItemLoading] = useState(true);

    const navigate = useNavigate();
    const { id } = useParams();

    useEffect(() => {
        loadItem();
    }, [id]);

    const loadItem = async () => {
        try {
            const response = await api.get(`/items/${id}`);
            setFormData(response.data);
        } catch (error) {
            setErrors({ general: 'Error loading item' });
        } finally {
            setItemLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'no' ? value.toUpperCase() : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            await api.put(`/items/${id}`, formData);
            navigate('/items');
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors || {});
            } else {
                setErrors({ general: 'Error updating item' });
            }
        } finally {
            setLoading(false);
        }
    };

    if (itemLoading) return <div className="text-center">Loading...</div>;

    return (
        <div className="form-card">
            <h3 className="mb-4 text-center text-primary">අයිතමය සංස්කරණය කරන්න (Edit Item)</h3>
            
            {errors.general && <div className="alert alert-danger">{errors.general}</div>}

            <form onSubmit={handleSubmit}>
                <div className="mb-3">
                    <label className="form-label">අංකය</label>
                    <input type="text" name="no" value={formData.no} onChange={handleChange} className="form-control" required />
                </div>

                <div className="mb-3">
                    <label className="form-label">වර්ගය</label>
                    <input type="text" name="type" value={formData.type} onChange={handleChange} className="form-control" required />
                </div>

                {/* --- New Field: Bag Real Price --- */}
                <div className="mb-3">
                    <label className="form-label">පෙට්ටියක/කූඩයක/කෙසෙල් නැට් බර අඩු කිරීම</label>
                    <input 
                        type="number" 
                        name="bag_real_price" 
                        step="0.01" 
                        value={formData.bag_real_price} 
                        onChange={handleChange} 
                        className={`form-control ${errors.bag_real_price ? 'is-invalid' : ''}`}
                        required 
                    />
                    {errors.bag_real_price && <div className="invalid-feedback">{errors.bag_real_price[0]}</div>}
                </div>

                <div className="d-flex justify-content-center mt-4">
                    <button type="submit" className="btn btn-success px-4" disabled={loading}>
                        {loading ? 'Updating...' : 'සංස්කරණය කරන්න'}
                    </button>
                    <Link to="/items" className="btn btn-secondary px-4 ms-2">අවලංගු කරන්න</Link>
                </div>
            </form>
            <style jsx>{`
                .form-card { background-color: #006400 !important; border-radius: 12px; padding: 24px; max-width: 600px; margin: 40px auto; }
                .form-label { font-weight: 700; color: #000000; }
                body { background-color: #99ff99; }
            `}</style>
        </div>
    );
};

export default EditItem;