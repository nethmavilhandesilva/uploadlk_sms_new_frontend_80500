import React, { useState, useEffect } from 'react';
import { supplierService } from '../../services/supplierService';
import { useNavigate, Link, useParams } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import { PUBLIC_URL } from '../../config';

// ⭐ UPDATED TO LOCALHOST FOR IMAGES
const STORAGE_URL = PUBLIC_URL;

const EditSupplier = () => {

    const [formData, setFormData] = useState({
        code: '',
        name: '',
        dob: '', // Added DOB
        address: '',
        profile_pic: null,
        nic_front: null,
        nic_back: null
    });


    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [supplierLoading, setSupplierLoading] = useState(true);

    const navigate = useNavigate();
    const { id } = useParams();

    /* =====================================================
       LOAD SUPPLIER DATA
    ===================================================== */
    useEffect(() => {
        loadSupplier();
    }, [id]);

    const loadSupplier = async () => {
        try {
            const response = await supplierService.get(id);
            const supplier = response.data;

            setFormData(prev => ({
                ...prev,
                code: supplier.code || '',
                name: supplier.name || '',
                dob: supplier.dob || '', // Load DOB from backend
                address: supplier.address || ''
            }));


        } catch (error) {
            console.error('Error loading supplier:', error);
            setErrors({ general: 'Error loading supplier' });
        } finally {
            setSupplierLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'code' ? value.toUpperCase() : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        const data = new FormData();
        data.append('code', formData.code);
        data.append('name', formData.name);
        data.append('dob', formData.dob); // Append DOB to submission
        data.append('address', formData.address);
        
        // Laravel specific: If using PUT/PATCH with FormData, you often need to spoof the method
        data.append('_method', 'PUT');

        if (formData.profile_pic instanceof File) data.append('profile_pic', formData.profile_pic);
        if (formData.nic_front instanceof File) data.append('nic_front', formData.nic_front);
        if (formData.nic_back instanceof File) data.append('nic_back', formData.nic_back);

        try {
            await supplierService.update(id, data);
            navigate('/suppliers');
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors || {});
            } else {
                setErrors({ general: 'Error updating supplier' });
            }
        } finally {
            setLoading(false);
        }
    };

    if (supplierLoading) {
        return <div className="text-center mt-5">Loading...</div>;
    }



    return (
        <div style={{ backgroundColor: '#99ff99', minHeight: '100vh', width: '100%' }}>

            <Sidebar />

            <div style={{ marginLeft: '260px', padding: '60px 40px' }}>
                <div className="col-12">
                    <div className="p-5 rounded-4 shadow-lg text-light" style={{ backgroundColor: '#004d00' }}>

                        <h2 className="text-center mb-5 fw-bold" style={{ fontSize: '2.5rem' }}>
                            ✏️ සැපයුම්කරු සංස්කරණය
                        </h2>

                        {errors.general && (
                            <div className="alert alert-danger">{errors.general}</div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="row">

                                <div className="col-md-6 mb-4">
                                    <label className="form-label">කේතය (Code)</label>
                                    <input type="text" name="code" value={formData.code} onChange={handleChange} className="form-control" required />
                                </div>

                                <div className="col-md-6 mb-4">
                                    <label className="form-label">නම (Name)</label>
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} className="form-control" required />
                                </div>

                                {/* ⭐ ADDED DOB INPUT */}
                                <div className="col-md-12 mb-4">
                                    <label className="form-label">උපන් දිනය (Date of Birth)</label>
                                    <input 
                                        type="date" 
                                        name="dob" 
                                        value={formData.dob} 
                                        onChange={handleChange} 
                                        className="form-control" 
                                        required 
                                    />
                                </div>

                                <div className="col-12 mb-4">
                                    <label className="form-label">ලිපිනය (Address)</label>
                                    <textarea name="address" value={formData.address} onChange={handleChange} className="form-control" rows="3" required />
                                </div>

                            </div>

                            <div className="text-center mt-5 d-flex justify-content-center gap-3">
                                <button type="submit" className="btn btn-light btn-lg fw-bold px-5" disabled={loading} style={{ color: '#004d00' }}>
                                    {loading ? 'Updating...' : 'UPDATE'}
                                </button>

                                <Link to="/suppliers" className="btn btn-outline-light btn-lg px-5">
                                    CANCEL
                                </Link>
                            </div>

                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditSupplier;