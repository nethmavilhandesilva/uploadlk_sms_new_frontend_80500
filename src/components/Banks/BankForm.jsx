import React, { useState, useEffect } from 'react';
import bankService from "../../services/bankService";

const Banks = () => {
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        bank_name: '',
        branch: '',
        account_no: ''
    });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchBanks();
    }, []);

    const fetchBanks = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await bankService.getAllBanks();
            if (response.success) {
                setBanks(response.data);
            } else {
                setError('Failed to load bank accounts');
            }
        } catch (error) {
            setError('Unable to connect to server. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setErrors({});
        setSuccess('');

        try {
            const response = await bankService.createBank(formData);
            setSuccess('Bank account added successfully!');
            setFormData({ bank_name: '', branch: '', account_no: '' });
            fetchBanks();
            setTimeout(() => setSuccess(''), 3000);
        } catch (error) {
            if (error.response && error.response.status === 422) {
                setErrors(error.response.data.errors);
            } else {
                setErrors({ general: error.response?.data?.message || 'Failed to add bank account' });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this bank account?')) return;
        
        setDeletingId(id);
        try {
            await bankService.deleteBank(id);
            fetchBanks();
        } catch (error) {
            setError('Failed to delete bank account');
        } finally {
            setDeletingId(null);
        }
    };

    const filteredBanks = banks.filter(bank =>
        bank.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bank.branch.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bank.account_no.includes(searchTerm)
    );

    const getBankGradient = (bankName) => {
        const name = bankName.toLowerCase();
        if (name.includes('sbi')) return 'linear-gradient(135deg, #3b82f6, #1e3a8a)';
        if (name.includes('hdfc')) return 'linear-gradient(135deg, #ef4444, #991b1b)';
        if (name.includes('icici')) return 'linear-gradient(135deg, #8b5cf6, #5b21b6)';
        if (name.includes('axis')) return 'linear-gradient(135deg, #f97316, #c2410c)';
        return 'linear-gradient(135deg, #4b5563, #1f2937)';
    };

    const styles = {
        container: {
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #eff6ff 0%, #f3e8ff 50%, #fce7f3 100%)',
            padding: '48px 24px',
            position: 'relative'
        },
        maxWidth: {
            maxWidth: '1280px',
            margin: '0 auto',
            position: 'relative',
            zIndex: 2
        },
        header: {
            textAlign: 'center',
            marginBottom: '48px'
        },
        headerIcon: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
            marginBottom: '24px'
        },
        title: {
            fontSize: '48px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed, #db2777)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '12px'
        },
        subtitle: {
            color: '#6b7280',
            fontSize: '18px'
        },
        successMessage: {
            marginBottom: '24px',
            padding: '16px',
            background: 'linear-gradient(135deg, #f0fdf4, #d1fae5)',
            borderLeft: '4px solid #10b981',
            borderRadius: '8px',
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)'
        },
        errorMessage: {
            marginBottom: '24px',
            padding: '16px',
            background: 'linear-gradient(135deg, #fef2f2, #fce7f3)',
            borderLeft: '4px solid #ef4444',
            borderRadius: '8px',
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)'
        },
        grid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '32px'
        },
        card: {
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden'
        },
        cardHeader: {
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            padding: '20px 24px'
        },
        cardHeaderTitle: {
            color: 'white',
            fontSize: '20px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center'
        },
        cardHeaderSub: {
            color: '#bfdbfe',
            fontSize: '14px',
            marginTop: '4px'
        },
        form: {
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
        },
        formGroup: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        },
        label: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#374151'
        },
        requiredStar: {
            color: '#ef4444'
        },
        inputWrapper: {
            position: 'relative'
        },
        inputIcon: {
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af'
        },
        input: {
            width: '100%',
            padding: '12px 16px 12px 44px',
            border: `2px solid ${errors.bank_name ? '#ef4444' : '#e5e7eb'}`,
            borderRadius: '12px',
            fontSize: '14px',
            transition: 'all 0.2s',
            outline: 'none'
        },
        inputError: {
            color: '#ef4444',
            fontSize: '12px',
            marginTop: '4px'
        },
        button: {
            width: '100%',
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
        },
        statsCard: {
            background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
            borderRadius: '16px',
            padding: '24px',
            color: 'white',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
        },
        listCard: {
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
        },
        listHeader: {
            background: '#1f2937',
            padding: '16px 24px'
        },
        searchInput: {
            padding: '8px 12px 8px 36px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            width: '100%',
            maxWidth: '256px'
        },
        listContainer: {
            padding: '24px',
            maxHeight: '500px',
            overflowY: 'auto'
        },
        bankItem: {
            background: 'linear-gradient(135deg, #f9fafb, white)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px',
            border: '1px solid #e5e7eb',
            transition: 'all 0.2s'
        },
        bankIcon: {
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            marginRight: '12px',
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)'
        },
        deleteButton: {
            background: 'none',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            transition: 'all 0.2s'
        }
    };

    return (
        <div style={styles.container}>
            {/* Decorative Background */}
            <div style={{
                position: 'absolute',
                top: '80px',
                left: '40px',
                width: '300px',
                height: '300px',
                background: '#c084fc',
                borderRadius: '50%',
                filter: 'blur(60px)',
                opacity: 0.2,
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                bottom: '80px',
                right: '40px',
                width: '400px',
                height: '400px',
                background: '#60a5fa',
                borderRadius: '50%',
                filter: 'blur(60px)',
                opacity: 0.2,
                pointerEvents: 'none'
            }} />

            <div style={styles.maxWidth}>
                {/* Header */}
                <div style={styles.header}>
                 
                    <h1 style={styles.title}>Bank Account Manager</h1>
                  
                </div>

                {/* Messages */}
                {success && (
                    <div style={styles.successMessage}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" color="#059669">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span style={{ fontWeight: 500, color: '#065f46' }}>{success}</span>
                        </div>
                    </div>
                )}

                {error && (
                    <div style={styles.errorMessage}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" color="#dc2626">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span style={{ fontWeight: 500, color: '#991b1b' }}>{error}</span>
                            </div>
                            <button onClick={fetchBanks} style={{ color: '#dc2626', fontSize: '14px', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Grid */}
                <div style={styles.grid}>
                    {/* Left Column */}
                    <div>
                        {/* Form Card */}
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <div style={styles.cardHeaderTitle}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ marginRight: '8px' }}>
                                        <path d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add New Bank Account
                                </div>
                                <div style={styles.cardHeaderSub}>Fill in the details below</div>
                            </div>

                            <form onSubmit={handleSubmit} style={styles.form}>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>
                                        Bank Name <span style={styles.requiredStar}>*</span>
                                    </label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>🏦</span>
                                        <input
                                            type="text"
                                            name="bank_name"
                                            value={formData.bank_name}
                                            onChange={handleChange}
                                            style={{
                                                ...styles.input,
                                                borderColor: errors.bank_name ? '#ef4444' : '#e5e7eb'
                                            }}
                                            placeholder="e.g., SBI, HDFC Bank, ICICI Bank"
                                            required
                                        />
                                    </div>
                                    {errors.bank_name && <p style={styles.inputError}>{errors.bank_name[0]}</p>}
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>
                                        Branch Name <span style={styles.requiredStar}>*</span>
                                    </label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                        </span>
                                        <input
                                            type="text"
                                            name="branch"
                                            value={formData.branch}
                                            onChange={handleChange}
                                            style={{
                                                ...styles.input,
                                                borderColor: errors.branch ? '#ef4444' : '#e5e7eb'
                                            }}
                                            placeholder="e.g., Main Branch, Andheri West"
                                            required
                                        />
                                    </div>
                                    {errors.branch && <p style={styles.inputError}>{errors.branch[0]}</p>}
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>
                                        Account Number <span style={styles.requiredStar}>*</span>
                                    </label>
                                    <div style={styles.inputWrapper}>
                                        <span style={styles.inputIcon}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                            </svg>
                                        </span>
                                        <input
                                            type="text"
                                            name="account_no"
                                            value={formData.account_no}
                                            onChange={handleChange}
                                            style={{
                                                ...styles.input,
                                                borderColor: errors.account_no ? '#ef4444' : '#e5e7eb',
                                                fontFamily: 'monospace'
                                            }}
                                            placeholder="Enter your account number"
                                            required
                                        />
                                    </div>
                                    {errors.account_no && <p style={styles.inputError}>{errors.account_no[0]}</p>}
                                    {errors.general && <p style={styles.inputError}>{errors.general}</p>}
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    style={{
                                        ...styles.button,
                                        opacity: submitting ? 0.5 : 1,
                                        cursor: submitting ? 'not-allowed' : 'pointer'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!submitting) {
                                            e.target.style.transform = 'scale(1.02)';
                                            e.target.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.2)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.transform = 'scale(1)';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                >
                                    {submitting ? 'Processing...' : 'Add Bank Account'}
                                </button>
                            </form>
                        </div>

                        {/* Stats Card */}
                        <div style={{ ...styles.statsCard, marginTop: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <p style={{ color: '#bfdbfe', fontSize: '14px' }}>Total Bank Accounts</p>
                                    <p style={{ fontSize: '36px', fontWeight: 'bold', marginTop: '8px' }}>{banks.length}</p>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '16px', borderRadius: '50%' }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white">
                                        <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Bank List */}
                    <div>
                        <div style={styles.listCard}>
                            <div style={styles.listHeader}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white">
                                            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>Your Bank Accounts</h2>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            placeholder="Search accounts..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={styles.searchInput}
                                        />
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }}>
                                            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div style={styles.listContainer}>
                                {loading ? (
                                    <div style={{ textAlign: 'center', padding: '48px' }}>
                                        <div style={{ display: 'inline-block', width: '48px', height: '48px', border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                        <p style={{ color: '#6b7280', marginTop: '16px' }}>Loading bank accounts...</p>
                                    </div>
                                ) : filteredBanks.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '48px' }}>
                                        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏦</div>
                                        <p style={{ color: '#6b7280', fontSize: '18px' }}>No bank accounts found</p>
                                        <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '8px' }}>Add your first bank account using the form</p>
                                    </div>
                                ) : (
                                    filteredBanks.map((bank) => (
                                        <div
                                            key={bank.id}
                                            style={styles.bankItem}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.02)';
                                                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                                                        <div style={{
                                                            ...styles.bankIcon,
                                                            background: getBankGradient(bank.bank_name)
                                                        }}>
                                                            🏦
                                                        </div>
                                                        <div>
                                                            <h3 style={{ fontWeight: 'bold', color: '#111827', fontSize: '18px' }}>{bank.bank_name}</h3>
                                                            <p style={{ color: '#6b7280', fontSize: '14px' }}>{bank.branch}</p>
                                                        </div>
                                                    </div>
                                                    <div style={{ marginLeft: '52px' }}>
                                                        <p style={{ background: '#f3f4f6', display: 'inline-block', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#374151' }}>
                                                            Account: {bank.account_no}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDelete(bank.id)}
                                                    disabled={deletingId === bank.id}
                                                    style={styles.deleteButton}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                                >
                                                    {deletingId === bank.id ? (
                                                        <div style={{ width: '20px', height: '20px', border: '2px solid #ef4444', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                                    ) : (
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                input:focus {
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
                }
            `}</style>
        </div>
    );
};

export default Banks;