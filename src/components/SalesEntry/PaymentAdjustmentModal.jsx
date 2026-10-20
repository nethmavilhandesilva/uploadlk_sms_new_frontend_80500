// src/components/SalesEntry/PaymentAdjustmentModal.jsx
import React, { useState } from 'react';
import BankAccountSelector from './BankAccountSelector';
import bankService from '../../services/bankService';

const PaymentAdjustmentModal = ({ isOpen, onClose, onConfirm, billNo, customerCode }) => {
    const [adjustmentType, setAdjustmentType] = useState('bag_to_box');
    const [bagCount, setBagCount] = useState('');
    const [boxCount, setBoxCount] = useState('');
    const [bagValue, setBagValue] = useState('');
    const [boxValue, setBoxValue] = useState('');
    const [targetCustomerCode, setTargetCustomerCode] = useState('');
    const [targetBillNo, setTargetBillNo] = useState('');
    const [adjustmentAmount, setAdjustmentAmount] = useState('');
    const [pendingBills, setPendingBills] = useState([]);
    const [loadingBills, setLoadingBills] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    if (!isOpen) return null;

    const handleSearchCustomerBills = async () => {
        if (!targetCustomerCode) {
            alert('Please enter customer code');
            return;
        }
        
        setLoadingBills(true);
        try {
            const response = await bankService.getPendingCustomerBills(targetCustomerCode);
            if (response.success) {
                setPendingBills(response.data);
            }
        } catch (error) {
            alert('Failed to fetch pending bills');
        } finally {
            setLoadingBills(false);
        }
    };

    const handleSubmit = () => {
        if (!adjustmentAmount || parseFloat(adjustmentAmount) <= 0) {
            alert('Please enter a valid adjustment amount');
            return;
        }

        const adjustmentData = {
            bill_no: billNo,
            adjustment_type: adjustmentType,
            adjustment_amount: parseFloat(adjustmentAmount)
        };

        if (adjustmentType === 'bag_to_box') {
            if (!bagCount || !boxCount || !bagValue || !boxValue) {
                alert('Please fill all bag/box fields');
                return;
            }
            adjustmentData.bag_count = parseInt(bagCount);
            adjustmentData.box_count = parseInt(boxCount);
            adjustmentData.bag_value = parseFloat(bagValue);
            adjustmentData.box_value = parseFloat(boxValue);
        }

        if (adjustmentType === 'bill_to_bill') {
            if (!targetCustomerCode || !targetBillNo) {
                alert('Please select target customer and bill');
                return;
            }
            adjustmentData.target_customer_code = targetCustomerCode;
            adjustmentData.target_bill_no = targetBillNo;
        }

        onConfirm(adjustmentData);
    };

    const filteredBills = pendingBills.filter(bill =>
        bill.bill_no.toString().includes(searchTerm.toLowerCase())
    );

    const getAdjustmentIcon = () => {
        switch(adjustmentType) {
            case 'bag_to_box': return '📦';
            case 'bill_to_bill': return '📄';
            case 'bad_debt': return '⚠️';
            default: return '🔧';
        }
    };

    const getAdjustmentColor = () => {
        switch(adjustmentType) {
            case 'bag_to_box': return 'linear-gradient(135deg, #f59e0b, #d97706)';
            case 'bill_to_bill': return 'linear-gradient(135deg, #3b82f6, #2563eb)';
            case 'bad_debt': return 'linear-gradient(135deg, #ef4444, #dc2626)';
            default: return 'linear-gradient(135deg, #6b7280, #4b5563)';
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '20px',
                width: '650px',
                maxWidth: '90%',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                animation: 'slideUp 0.3s ease'
            }} onClick={(e) => e.stopPropagation()}>
                
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '20px 24px',
                    background: getAdjustmentColor(),
                    borderBottom: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '20px 20px 0 0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '28px' }}>{getAdjustmentIcon()}</span>
                        <h3 style={{
                            margin: 0,
                            fontSize: '20px',
                            fontWeight: '700',
                            color: 'white'
                        }}>Payment Adjustment</h3>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        fontSize: '24px',
                        cursor: 'pointer',
                        color: 'white',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}>
                        ×
                    </button>
                </div>

                <div style={{
                    padding: '24px',
                    overflowY: 'auto',
                    flex: 1,
                }}>
                    {/* Bill Info Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, #dbeafe, #eff6ff)',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        marginBottom: '20px',
                        border: '1px solid #bfdbfe'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span style={{ color: '#1e40af' }}>Bill Number:</span>
                            <strong style={{ color: '#1e3a8a' }}>{billNo}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px' }}>
                            <span style={{ color: '#1e40af' }}>Customer Code:</span>
                            <strong style={{ color: '#1e3a8a' }}>{customerCode}</strong>
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: '#334155'
                        }}>Adjustment Type</label>
                        <select
                            value={adjustmentType}
                            onChange={(e) => setAdjustmentType(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                background: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontWeight: '500'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = getAdjustmentColor().match(/#[A-Fa-f0-9]{6}/)?.[0] || '#3b82f6';
                                e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0';
                                e.target.style.boxShadow = 'none';
                            }}
                        >
                            <option value="bag_to_box">📦 Bag to Box Conversion</option>
                            <option value="bill_to_bill">📄 Bill to Bill Transfer</option>
                            <option value="bad_debt">⚠️ Bad Debt Write-off</option>
                        </select>
                    </div>

                    {adjustmentType === 'bag_to_box' && (
                        <>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '16px',
                                marginBottom: '16px'
                            }}>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '6px',
                                        fontWeight: '600',
                                        fontSize: '12px',
                                        color: '#334155'
                                    }}>📦 Number of Bags</label>
                                    <input
                                        type="number"
                                        value={bagCount}
                                        onChange={(e) => setBagCount(e.target.value)}
                                        placeholder="Enter bag count"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '10px',
                                            fontSize: '14px',
                                            transition: 'all 0.2s',
                                            outline: 'none'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#f59e0b';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#e2e8f0';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '6px',
                                        fontWeight: '600',
                                        fontSize: '12px',
                                        color: '#334155'
                                    }}>💰 Value per Bag (Rs.)</label>
                                    <input
                                        type="number"
                                        value={bagValue}
                                        onChange={(e) => setBagValue(e.target.value)}
                                        placeholder="Bag value"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '10px',
                                            fontSize: '14px',
                                            transition: 'all 0.2s',
                                            outline: 'none'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#f59e0b';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#e2e8f0';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '16px',
                                marginBottom: '16px'
                            }}>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '6px',
                                        fontWeight: '600',
                                        fontSize: '12px',
                                        color: '#334155'
                                    }}>📦 Number of Boxes</label>
                                    <input
                                        type="number"
                                        value={boxCount}
                                        onChange={(e) => setBoxCount(e.target.value)}
                                        placeholder="Enter box count"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '10px',
                                            fontSize: '14px',
                                            transition: 'all 0.2s',
                                            outline: 'none'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#f59e0b';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#e2e8f0';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '6px',
                                        fontWeight: '600',
                                        fontSize: '12px',
                                        color: '#334155'
                                    }}>💰 Value per Box (Rs.)</label>
                                    <input
                                        type="number"
                                        value={boxValue}
                                        onChange={(e) => setBoxValue(e.target.value)}
                                        placeholder="Box value"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '10px',
                                            fontSize: '14px',
                                            transition: 'all 0.2s',
                                            outline: 'none'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#f59e0b';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#e2e8f0';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                            </div>
                            <div style={{
                                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                padding: '14px',
                                borderRadius: '12px',
                                marginBottom: '20px',
                                border: '1px solid #fbbf24'
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>📊 Adjustment Summary</div>
                                <div style={{ fontSize: '12px', color: '#78350f' }}>
                                    Total Bag Value: <strong>Rs. {(parseInt(bagCount) * parseFloat(bagValue) || 0).toFixed(2)}</strong><br />
                                    Total Box Value: <strong>Rs. {(parseInt(boxCount) * parseFloat(boxValue) || 0).toFixed(2)}</strong><br />
                                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                                        Difference: Rs. {((parseInt(bagCount) * parseFloat(bagValue) || 0) - (parseInt(boxCount) * parseFloat(boxValue) || 0)).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </>
                    )}

                    {adjustmentType === 'bill_to_bill' && (
                        <>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '6px',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    color: '#334155'
                                }}>🎯 Target Customer Code</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        type="text"
                                        value={targetCustomerCode}
                                        onChange={(e) => setTargetCustomerCode(e.target.value.toUpperCase())}
                                        placeholder="Enter customer code"
                                        style={{
                                            flex: 1,
                                            padding: '10px 12px',
                                            border: '2px solid #e2e8f0',
                                            borderRadius: '10px',
                                            fontSize: '14px',
                                            transition: 'all 0.2s',
                                            outline: 'none'
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#3b82f6';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = '#e2e8f0';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    <button onClick={handleSearchCustomerBills} style={{
                                        padding: '10px 20px',
                                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '13px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.target.style.transform = 'translateY(-1px)'}
                                    onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}>
                                        🔍 Search
                                    </button>
                                </div>
                            </div>

                            {loadingBills && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '20px',
                                    color: '#64748b'
                                }}>Loading pending bills...</div>
                            )}

                            {pendingBills.length > 0 && (
                                <div style={{
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    border: '2px solid #e2e8f0',
                                    borderRadius: '12px',
                                    padding: '8px',
                                    marginTop: '8px',
                                    marginBottom: '16px'
                                }}>
                                    <input
                                        type="text"
                                        placeholder="🔍 Search bills..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            marginBottom: '10px',
                                            outline: 'none'
                                        }}
                                    />
                                    {filteredBills.map(bill => (
                                        <div
                                            key={bill.bill_no}
                                            style={{
                                                padding: '10px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '6px',
                                                border: '2px solid',
                                                borderColor: targetBillNo === bill.bill_no ? '#3b82f6' : '#e2e8f0',
                                                background: targetBillNo === bill.bill_no ? '#eff6ff' : 'white',
                                                transition: 'all 0.2s'
                                            }}
                                            onClick={() => setTargetBillNo(bill.bill_no)}
                                            onMouseEnter={(e) => {
                                                if (targetBillNo !== bill.bill_no) {
                                                    e.currentTarget.style.background = '#f8fafc';
                                                    e.currentTarget.style.borderColor = '#94a3b8';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (targetBillNo !== bill.bill_no) {
                                                    e.currentTarget.style.background = 'white';
                                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                                }
                                            }}
                                        >
                                            <div>
                                                <strong style={{ color: '#1e293b' }}>Bill #{bill.bill_no}</strong>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{bill.customer_code}</div>
                                            </div>
                                            <div style={{ fontWeight: 'bold', color: '#059669' }}>
                                                Rs. {parseFloat(bill.total_amount).toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {adjustmentType === 'bad_debt' && (
                        <div style={{
                            background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                            padding: '14px',
                            borderRadius: '12px',
                            marginBottom: '20px',
                            border: '1px solid #f87171'
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', marginBottom: '8px' }}>
                                ⚠️ Warning: Bad Debt Write-off
                            </div>
                            <div style={{ fontSize: '12px', color: '#7f1d1d' }}>
                                This action will write off the entered amount from this bill. 
                                This action cannot be undone.
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: '#334155'
                        }}>💰 Adjustment Amount (Rs.)</label>
                        <input
                            type="number"
                            value={adjustmentAmount}
                            onChange={(e) => setAdjustmentAmount(e.target.value)}
                            placeholder="Enter adjustment amount"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '16px',
                                fontWeight: '600',
                                transition: 'all 0.2s',
                                outline: 'none',
                                textAlign: 'center'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = getAdjustmentColor().match(/#[A-Fa-f0-9]{6}/)?.[0] || '#3b82f6';
                                e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>
                </div>

                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    background: '#f8fafc',
                    borderRadius: '0 0 20px 20px'
                }}>
                    <button onClick={onClose} style={{
                        padding: '10px 24px',
                        background: '#f1f5f9',
                        color: '#475569',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '13px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.background = '#e2e8f0';
                        e.target.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.background = '#f1f5f9';
                        e.target.style.transform = 'translateY(0)';
                    }}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} style={{
                        padding: '10px 24px',
                        background: getAdjustmentColor(),
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '13px',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}>
                        Apply Adjustment
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
};

export default PaymentAdjustmentModal;