import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config';

const SupplierForm = () => {
    const [payload, setPayload] = useState({
        code: '',
        advance_amount: ''
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleChange = (e) => {
        setPayload({ ...payload, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            // Replace with your actual Laravel API URL
            const response = await axios.post(`${API_BASE_URL}/suppliers/advance`, payload);
            
            setMessage({ 
                type: 'success', 
                text: `Success! Supplier ${response.data.data.code} updated.` 
            });
            setPayload({ code: '', advance_amount: '' }); // Clear form
        } catch (error) {
            setMessage({ 
                type: 'error', 
                text: error.response?.data?.message || 'Something went wrong' 
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '20px auto', fontFamily: 'Arial' }}>
            <h2>Supplier Advance Entry</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                    <label>Supplier Code:</label>
                    <input
                        type="text"
                        name="code"
                        value={payload.code}
                        onChange={handleChange}
                        required
                        style={{ width: '100%', padding: '8px' }}
                    />
                </div>
                <div>
                    <label>Advance Amount:</label>
                    <input
                        type="number"
                        name="advance_amount"
                        value={payload.advance_amount}
                        onChange={handleChange}
                        required
                        style={{ width: '100%', padding: '8px' }}
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={loading}
                    style={{ padding: '10px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none' }}
                >
                    {loading ? 'Saving...' : 'Submit Amount'}
                </button>
            </form>

            {message.text && (
                <p style={{ color: message.type === 'success' ? 'green' : 'red', marginTop: '10px' }}>
                    {message.text}
                </p>
            )}
        </div>
    );
};

export default SupplierForm;