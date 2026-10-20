import React, { useState, useEffect } from 'react';
import api from '../../api';

const DebtorsList = () => {
    const [debtors, setDebtors] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchDebtors();
    }, []);

    const fetchDebtors = async () => {
        setLoading(true);
        try {
            const response = await api.get('/debtors/pending/all');
            if (response.data.success) {
                setDebtors(response.data.data);
                setSummary(response.data.summary);
            }
        } catch (error) {
            console.error('Error fetching debtors:', error);
            alert('Failed to fetch debtors list');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            pending: { color: '#ef4444', text: 'Pending' },
            partial: { color: '#f59e0b', text: 'Partial' },
            paid: { color: '#10b981', text: 'Paid' }
        };
        const config = statusConfig[status] || statusConfig.pending;
        return (
            <span style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: config.color,
                color: 'white',
                display: 'inline-block'
            }}>
                {config.text}
            </span>
        );
    };

    const filteredDebtors = debtors.filter(debtor =>
        debtor.bill_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        debtor.customer_code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Summary Cards */}
            {summary && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '20px',
                    marginBottom: '30px'
                }}>
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: '4px solid #f59e0b'
                    }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '5px' }}>Total Debtors</div>
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>{summary.total_count}</div>
                    </div>
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: '4px solid #ef4444'
                    }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '5px' }}>Total Credit</div>
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{formatCurrency(summary.total_credit)}</div>
                    </div>
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: '4px solid #10b981'
                    }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '5px' }}>Total Paid</div>
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(summary.total_paid)}</div>
                    </div>
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: '4px solid #f59e0b'
                    }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '5px' }}>Total Remaining</div>
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f59e0b' }}>{formatCurrency(summary.total_remaining)}</div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Debtors / Credit List</h2>
                <button onClick={fetchDebtors} style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                }}>
                    🔄 Refresh
                </button>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="🔍 Search by Bill No or Customer Code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '10px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '15px', textAlign: 'left' }}>Bill No</th>
                            <th style={{ padding: '15px', textAlign: 'left' }}>Customer Code</th>
                            <th style={{ padding: '15px', textAlign: 'right' }}>Credit Amount</th>
                            <th style={{ padding: '15px', textAlign: 'right' }}>Paid Amount</th>
                            <th style={{ padding: '15px', textAlign: 'right' }}>Remaining</th>
                            <th style={{ padding: '15px', textAlign: 'center' }}>Status</th>
                            <th style={{ padding: '15px', textAlign: 'center' }}>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDebtors.map((debtor) => (
                            <tr key={debtor.id} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
                                <td style={{ padding: '15px', fontWeight: '500' }}>{debtor.bill_no}</td>
                                <td style={{ padding: '15px' }}>{debtor.customer_code}</td>
                                <td style={{ padding: '15px', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(debtor.credit_amount)}</td>
                                <td style={{ padding: '15px', textAlign: 'right' }}>{formatCurrency(debtor.paid_amount)}</td>
                                <td style={{ padding: '15px', textAlign: 'right', fontWeight: 'bold', color: debtor.remaining_amount > 0 ? '#ef4444' : '#10b981' }}>
                                    {formatCurrency(debtor.remaining_amount)}
                                </td>
                                <td style={{ padding: '15px', textAlign: 'center' }}>{getStatusBadge(debtor.status)}</td>
                                <td style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                                    {new Date(debtor.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredDebtors.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', background: 'white', borderRadius: '12px', marginTop: '20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                    <p>No debtors found</p>
                </div>
            )}
        </div>
    );
};

export default DebtorsList;