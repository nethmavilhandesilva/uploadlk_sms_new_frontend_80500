import React, { useState } from 'react';
import api from '../../api';
import { useNavigate, Link } from 'react-router-dom';

const CreateItem = () => {
    const [formData, setFormData] = useState({
        no: '',
        type: '',
        // Packs aren't used any more; the backend still stores 0.
        pack_cost: 0,
        pack_due: 0,
        bag_real_price: '' // Added new field
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'no' ? value.toUpperCase() : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({});
        setLoading(true);

        try {
            await api.post('/items', formData);
            navigate('/items');
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors || {});
            } else {
                setErrors({ general: 'Error creating item' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container-fluid mt-5">
            <div className="row justify-content-center">
                <div className="col-md-8">
                    <div className="custom-card">
                        <h2 className="text-primary mb-4">නව භාණ්ඩය එක් කරන්න (Add New Item)</h2>

                        {errors.general && (
                            <div className="alert alert-danger">{errors.general}</div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor="no" className="form-label">අංකය</label>
                                <input 
                                    type="text"
                                    id="no"
                                    name="no"
                                    value={formData.no}
                                    onChange={handleChange}
                                    className={`form-control ${errors.no ? 'is-invalid' : ''}`}
                                    required
                                    style={{ textTransform: 'uppercase' }}
                                />
                                {errors.no && <div className="invalid-feedback">{errors.no[0]}</div>}
                            </div>

                            <div className="mb-3">
                                <label htmlFor="type" className="form-label">වර්ගය</label>
                                <input 
                                    type="text"
                                    id="type"
                                    name="type"
                                    value={formData.type}
                                    onChange={handleChange}
                                    className={`form-control ${errors.type ? 'is-invalid' : ''}`}
                                    required
                                />
                                {errors.type && <div className="invalid-feedback">{errors.type[0]}</div>}
                            </div>

                            {/* --- New Field: Bag Real Price --- */}
                            <div className="mb-3">
                                <label htmlFor="bag_real_price" className="form-label">සත්‍ය බර (</label>
                                <input 
                                    type="number"
                                    id="bag_real_price"
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
                                <button type="submit" disabled={loading} className="btn btn-success me-2">
                                    {loading ? 'Adding...' : 'එක් කරන්න'}
                                </button>
                                <Link to="/items" className="btn btn-secondary">අවලංගු කරන්න</Link>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            <style jsx>{`
                .custom-card { background-color: #006400 !important; border-radius: 12px; padding: 24px; }
                body { background-color: #99ff99; }
                .form-label { font-weight: 700; color: #000000; }
            `}</style>
        </div>
    );
};

export default CreateItem;