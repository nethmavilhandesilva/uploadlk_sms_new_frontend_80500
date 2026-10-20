// src/components/SalesEntry/BankAccountSelector.jsx
import React, { useState, useEffect } from 'react';
import bankService from '../../services/bankService';

const BankAccountSelector = ({ selectedAccountId, onSelect, disabled = false }) => {
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchBanks();
    }, []);

    const fetchBanks = async () => {
        setLoading(true);
        try {
            const response = await bankService.getAllBanks();
            if (response.success) {
                setBanks(response.data);
            } else {
                setError('Failed to load bank accounts');
            }
        } catch (error) {
            setError('Unable to load bank accounts');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div style={styles.loading}>Loading bank accounts...</div>;
    }

    if (error) {
        return <div style={styles.error}>{error}</div>;
    }

    return (
        <div style={styles.container}>
            <label style={styles.label}>
                Select Bank Account <span style={styles.required}>*</span>
            </label>
            <select
                value={selectedAccountId || ''}
                onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
                disabled={disabled}
                style={styles.select}
            >
                <option value="">-- Select Bank Account --</option>
                {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>
                        {bank.bank_name} - {bank.branch} (Acc: {bank.account_no})
                    </option>
                ))}
            </select>
        </div>
    );
};

const styles = {
    container: {
        marginBottom: '15px',
    },
    label: {
        display: 'block',
        marginBottom: '5px',
        fontWeight: '500',
        fontSize: '13px',
        color: '#334155',
    },
    required: {
        color: '#ef4444',
    },
    select: {
        width: '100%',
        padding: '10px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        fontSize: '14px',
        background: 'white',
        cursor: 'pointer',
    },
    loading: {
        padding: '10px',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '12px',
    },
    error: {
        padding: '10px',
        textAlign: 'center',
        color: '#ef4444',
        fontSize: '12px',
    },
};

export default BankAccountSelector;