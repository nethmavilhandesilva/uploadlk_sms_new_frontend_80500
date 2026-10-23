import React, { useState } from 'react';
import { supplierService } from '../../services/supplierService';
import { useNavigate, Link } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';

const CreateSupplier = () => {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    telephone_no: '',   // ✅ NEW FIELD ADDED
    profile_pic: null,
    nic_front: null,
    nic_back: null,
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // =================== Check Duplicate Code ===================
  const checkDuplicateCode = async (code) => {
    try {
      const response = await supplierService.checkCode(code);
      return response.data.exists;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // =================== Handle Input Change ===================
  const handleChange = async (e) => {
    const { name, value } = e.target;

    if (name === 'code') {
      const upperCode = value.toUpperCase();
      setFormData(prev => ({ ...prev, code: upperCode }));

      if (upperCode.length > 0) {
        const isDuplicate = await checkDuplicateCode(upperCode);
        setErrors(prev => ({
          ...prev,
          code: isDuplicate ? 'මෙම කේතය දැනටමත් පවතිනවා' : null
        }));
      } else {
        setErrors(prev => ({ ...prev, code: null }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };


  // =================== Handle Submit ===================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (errors.code) {
      alert("මෙම කේතය දැනටමත් පවතිනවා. වෙනත් කේතයක් තෝරන්න.");
      return;
    }

    setLoading(true);
    setErrors({});

    const data = new FormData();
    data.append('code', formData.code);
    data.append('name', formData.name);
    data.append('address', formData.address);
    data.append('telephone_no', formData.telephone_no); // ✅ APPENDED

    if (formData.profile_pic) data.append('profile_pic', formData.profile_pic);
    if (formData.nic_front) data.append('nic_front', formData.nic_front);
    if (formData.nic_back) data.append('nic_back', formData.nic_back);

    try {
      await supplierService.create(data);
      navigate('/suppliers');
    } catch (error) {
      if (error.response && error.response.status === 422) {
        setErrors(error.response.data.errors || {});
      } else {
        setErrors({ general: 'Error creating supplier' });
      }
    } finally {
      setLoading(false);
    }
  };



  return (
    <div style={{ backgroundColor: '#99ff99', minHeight: '100vh', width: '100%' }}>
      <Sidebar />
      <div style={{ marginLeft: '260px', padding: '60px 40px' }}>
        <div className="col-12">
          <div className="p-5 rounded-4 shadow-lg text-light" style={{ backgroundColor: '#004d00' }}>
            <h2 className="text-center mb-5 fw-bold" style={{ fontSize: '2.5rem' }}>
              + නව සැපයුම්කරු
            </h2>

            <form onSubmit={handleSubmit}>
              <div className="row">

                {/* Code */}
                <div className="col-md-6 mb-4">
                  <label className="form-label fs-5 text-light">කේතය (Code)</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    className={`form-control form-control-lg ${errors.code ? 'is-invalid' : ''}`}
                    required
                  />
                  {errors.code && <div className="invalid-feedback">{errors.code}</div>}
                </div>

                {/* Name */}
                <div className="col-md-6 mb-4">
                  <label className="form-label fs-5 text-light">නම (Name)</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="form-control form-control-lg"
                    required
                  />
                </div>

                {/* Telephone Number ✅ NEW FIELD */}
                <div className="col-md-6 mb-4">
                  <label className="form-label fs-5 text-light">දුරකථන අංකය (Telephone No)</label>
                  <input
                    type="text"
                    name="telephone_no"
                    value={formData.telephone_no}
                    onChange={handleChange}
                    className="form-control form-control-lg"
                    required
                  />
                </div>


                {/* Address */}
                <div className="col-12 mb-4">
                  <label className="form-label fs-5 text-light">ලිපිනය (Address)</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="form-control form-control-lg"
                    rows="3"
                    required
                  />
                </div>

              </div>

              <div className="text-center mt-5 d-flex justify-content-center gap-3">
                <button type="submit" className="btn btn-light btn-lg fw-bold px-5" disabled={loading} style={{ color: '#004d00' }}>
                  {loading ? 'Adding...' : 'ADD'}
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

export default CreateSupplier;