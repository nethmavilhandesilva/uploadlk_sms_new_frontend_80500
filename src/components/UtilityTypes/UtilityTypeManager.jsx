import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const UtilityTypeManager = () => {
    const navigate = useNavigate();
    const [utilityTypes, setUtilityTypes] = useState([]);
    const [statistics, setStatistics] = useState({
        total: 0,
        income: 0,
        expense: 0,
        active: 0,
        inactive: 0
    });
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({
        type: 'expense',
        name: '',
        description: '',
        is_active: true
    });
    const [filterType, setFilterType] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItems, setSelectedItems] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Fetch utility types
    const fetchUtilityTypes = async () => {
        setLoading(true);
        try {
            let url = '/utility-types';
            if (filterType !== 'all') {
                url += `?type=${filterType}`;
            }
            const response = await api.get(url);
            if (response.data.success) {
                setUtilityTypes(response.data.data);
                setStatistics(response.data.statistics);
            }
        } catch (error) {
            console.error('Error fetching utility types:', error);
            alert('Failed to load utility types');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUtilityTypes();
    }, [filterType]);

    // Handle form input changes
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            type: 'expense',
            name: '',
            description: '',
            is_active: true
        });
        setEditingItem(null);
        setShowForm(false);
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.name.trim()) {
            alert('Please enter a name');
            return;
        }

        try {
            let response;
            if (editingItem) {
                response = await api.put(`/utility-types/${editingItem.id}`, formData);
            } else {
                response = await api.post('/utility-types', formData);
            }

            if (response.data.success) {
                alert(editingItem ? 'Updated successfully!' : 'Created successfully!');
                resetForm();
                fetchUtilityTypes();
            }
        } catch (error) {
            console.error('Error saving utility type:', error);
            if (error.response?.data?.errors) {
                const errors = error.response.data.errors;
                alert(Object.values(errors).flat().join('\n'));
            } else {
                alert(error.response?.data?.message || 'Failed to save utility type');
            }
        }
    };

    // Handle edit
    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            type: item.type,
            name: item.name,
            description: item.description || '',
            is_active: item.is_active
        });
        setShowForm(true);
    };

    // Handle delete
    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            try {
                const response = await api.delete(`/utility-types/${id}`);
                if (response.data.success) {
                    alert('Deleted successfully!');
                    fetchUtilityTypes();
                    setSelectedItems(selectedItems.filter(item => item !== id));
                }
            } catch (error) {
                console.error('Error deleting:', error);
                alert('Failed to delete');
            }
        }
    };

    // Handle bulk delete
    const handleBulkDelete = async () => {
        if (selectedItems.length === 0) {
            alert('Please select items to delete');
            return;
        }

        if (window.confirm(`Are you sure you want to delete ${selectedItems.length} item(s)?`)) {
            try {
                const response = await api.post('/utility-types/bulk-delete', { ids: selectedItems });
                if (response.data.success) {
                    alert(`${response.data.deleted_count} item(s) deleted successfully!`);
                    setSelectedItems([]);
                    fetchUtilityTypes();
                    setShowDeleteConfirm(false);
                }
            } catch (error) {
                console.error('Error bulk deleting:', error);
                alert('Failed to delete items');
            }
        }
    };

    // Handle toggle status
    const handleToggleStatus = async (id) => {
        try {
            const response = await api.patch(`/utility-types/${id}/toggle-status`);
            if (response.data.success) {
                fetchUtilityTypes();
            }
        } catch (error) {
            console.error('Error toggling status:', error);
            alert('Failed to toggle status');
        }
    };

    // Handle select all
    const handleSelectAll = () => {
        if (selectedItems.length === filteredItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(filteredItems.map(item => item.id));
        }
    };

    // Handle single select
    const handleSelectItem = (id) => {
        if (selectedItems.includes(id)) {
            setSelectedItems(selectedItems.filter(item => item !== id));
        } else {
            setSelectedItems([...selectedItems, id]);
        }
    };

    // Filter items based on search
    const filteredItems = utilityTypes.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTypeStyle = (type) => {
        return type === 'income' 
            ? { background: '#10b981', color: 'white' }
            : { background: '#ef4444', color: 'white' };
    };

    // Handle back navigation
    const handleBackToExpenses = () => {
        navigate('/printed-bills');
    };

    // Full page styles that override everything
    const styles = {
        // Global reset styles
        globalReset: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            margin: 0,
            padding: 0,
            overflow: 'auto',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        },
        container: {
            width: '100%',
            minHeight: '100vh',
            padding: '24px',
            boxSizing: 'border-box'
        },
        header: {
            marginBottom: '24px'
        },
        headerRow: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '16px'
        },
        title: {
            fontSize: '32px',
            fontWeight: '700',
            color: 'white',
            marginBottom: '8px',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        subtitle: {
            color: 'rgba(255,255,255,0.9)',
            fontSize: '14px'
        },
        backButton: {
            padding: '10px 24px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            backdropFilter: 'blur(10px)'
        },
        statsRow: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
        },
        statCard: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '16px',
            padding: '20px',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer'
        },
        statLabel: {
            fontSize: '13px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px'
        },
        statValue: {
            fontSize: '28px',
            fontWeight: '700',
            color: '#1e293b'
        },
        card: {
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)'
        },
        formGroup: {
            marginBottom: '20px'
        },
        label: {
            display: 'block',
            fontSize: '14px',
            fontWeight: '600',
            color: '#475569',
            marginBottom: '8px'
        },
        input: {
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e2e8f0',
            borderRadius: '12px',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
            backgroundColor: 'white',
            boxSizing: 'border-box'
        },
        select: {
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e2e8f0',
            borderRadius: '12px',
            fontSize: '14px',
            backgroundColor: 'white',
            outline: 'none',
            transition: 'all 0.2s',
            cursor: 'pointer'
        },
        textarea: {
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e2e8f0',
            borderRadius: '12px',
            fontSize: '14px',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
            boxSizing: 'border-box'
        },
        button: {
            padding: '10px 24px',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
        },
        buttonPrimary: {
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        buttonSecondary: {
            background: '#f1f5f9',
            color: '#475569',
            border: '1px solid #e2e8f0'
        },
        buttonDanger: {
            background: '#ef4444',
            color: 'white',
            boxShadow: '0 2px 4px rgba(239,68,68,0.2)'
        },
        buttonSuccess: {
            background: '#10b981',
            color: 'white',
            boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
        },
        filterBar: {
            display: 'flex',
            gap: '12px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            alignItems: 'center'
        },
        filterButton: {
            padding: '8px 20px',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: '#f1f5f9',
            color: '#475569'
        },
        filterButtonActive: {
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            borderRadius: '12px',
            overflow: 'hidden'
        },
        th: {
            textAlign: 'left',
            padding: '16px',
            background: '#f8fafc',
            fontWeight: '600',
            fontSize: '13px',
            color: '#475569',
            borderBottom: '2px solid #e2e8f0'
        },
        td: {
            padding: '16px',
            fontSize: '14px',
            color: '#334155',
            borderBottom: '1px solid #e2e8f0'
        },
        badge: {
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600'
        },
        actionButtons: {
            display: 'flex',
            gap: '8px'
        },
        iconButton: {
            padding: '6px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '18px',
            borderRadius: '6px',
            transition: 'all 0.2s'
        },
        searchInput: {
            flex: 1,
            minWidth: '250px',
            padding: '10px 16px',
            border: '2px solid #e2e8f0',
            borderRadius: '12px',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
            backgroundColor: 'white'
        },
        checkbox: {
            width: '18px',
            height: '18px',
            cursor: 'pointer'
        },
        // Hover effects
        hoverEffect: {
            transition: 'all 0.2s'
        }
    };

    // Add global styles to document head
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body, html {
                margin: 0;
                padding: 0;
                overflow-x: hidden;
            }
            
            input:focus, select:focus, textarea:focus {
                border-color: #667eea !important;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
            }
            
            button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            }
            
            button:active {
                transform: translateY(0);
            }
            
            tr:hover td {
                background-color: #f8fafc;
            }
            
            ::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }
            
            ::-webkit-scrollbar-track {
                background: rgba(255,255,255,0.2);
                border-radius: 10px;
            }
            
            ::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.4);
                border-radius: 10px;
            }
            
            ::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.6);
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .slide-in {
                animation: slideIn 0.3s ease-out;
            }
        `;
        document.head.appendChild(style);
        
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    if (loading && utilityTypes.length === 0) {
        return (
            <div style={styles.globalReset}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    width: '100vw'
                }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        border: '4px solid rgba(255,255,255,0.3)',
                        borderTop: '4px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.globalReset}>
            <div style={styles.container}>
                <div style={styles.header}>
                    <div style={styles.headerRow}>
                        <div>
                            <h1 style={styles.title}>💰 Income & Expense Manager</h1>
                            <p style={styles.subtitle}>Manage income and expense categories for your business</p>
                        </div>
                        <button
                            onClick={handleBackToExpenses}
                            style={styles.backButton}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            ← Back to Expenses
                        </button>
                    </div>
                </div>

                {/* Statistics Cards */}
                <div style={styles.statsRow}>
                    <div 
                        style={styles.statCard}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                        }}
                    >
                        <div style={styles.statLabel}>Total Categories</div>
                        <div style={styles.statValue}>{statistics.total}</div>
                    </div>
                    <div 
                        style={styles.statCard}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                        }}
                    >
                        <div style={styles.statLabel}>💰 Income</div>
                        <div style={styles.statValue}>{statistics.income}</div>
                    </div>
                    <div 
                        style={styles.statCard}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                        }}
                    >
                        <div style={styles.statLabel}>📉 Expense</div>
                        <div style={styles.statValue}>{statistics.expense}</div>
                    </div>
                    <div 
                        style={styles.statCard}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                        }}
                    >
                        <div style={styles.statLabel}>✅ Active</div>
                        <div style={styles.statValue}>{statistics.active}</div>
                    </div>
                    <div 
                        style={styles.statCard}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                        }}
                    >
                        <div style={styles.statLabel}>⭕ Inactive</div>
                        <div style={styles.statValue}>{statistics.inactive}</div>
                    </div>
                </div>

                {/* Add/Edit Form */}
                {showForm && (
                    <div style={styles.card} className="slide-in">
                        <h3 style={{ margin: '0 0 20px 0', color: '#1e293b', fontSize: '20px' }}>
                            {editingItem ? '✏️ Edit Category' : '➕ Add New Category'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Type *</label>
                                <select
                                    name="type"
                                    value={formData.type}
                                    onChange={handleInputChange}
                                    style={styles.select}
                                    required
                                >
                                    <option value="expense">📉 Expense</option>
                                    <option value="income">💰 Income</option>
                                </select>
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    placeholder="e.g., Rent, Salary, Sales, etc."
                                    style={styles.input}
                                    required
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>Description</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    rows="3"
                                    placeholder="Optional description"
                                    style={styles.textarea}
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={formData.is_active}
                                        onChange={handleInputChange}
                                        style={{ marginRight: '8px', width: '16px', height: '16px' }}
                                    />
                                    Active
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    style={{ ...styles.button, ...styles.buttonSecondary }}
                                    onClick={resetForm}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{ ...styles.button, ...styles.buttonPrimary }}
                                >
                                    {editingItem ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Toolbar */}
                <div style={styles.card}>
                    <div style={styles.filterBar}>
                        <button
                            style={{ ...styles.filterButton, ...(filterType === 'all' ? styles.filterButtonActive : {}) }}
                            onClick={() => setFilterType('all')}
                        >
                            All
                        </button>
                        <button
                            style={{ ...styles.filterButton, ...(filterType === 'income' ? styles.filterButtonActive : {}) }}
                            onClick={() => setFilterType('income')}
                        >
                            💰 Income
                        </button>
                        <button
                            style={{ ...styles.filterButton, ...(filterType === 'expense' ? styles.filterButtonActive : {}) }}
                            onClick={() => setFilterType('expense')}
                        >
                            📉 Expense
                        </button>
                        
                        <input
                            type="text"
                            placeholder="🔍 Search by name or type..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={styles.searchInput}
                        />
                        
                        <div style={{ flex: 1 }}></div>
                        
                        {!showForm && (
                            <button
                                style={{ ...styles.button, ...styles.buttonPrimary }}
                                onClick={() => setShowForm(true)}
                            >
                                + Add New
                            </button>
                        )}
                        
                        {selectedItems.length > 0 && (
                            <button
                                style={{ ...styles.button, ...styles.buttonDanger }}
                                onClick={handleBulkDelete}
                            >
                                🗑️ Delete ({selectedItems.length})
                            </button>
                        )}
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto', borderRadius: '12px' }}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>
                                        <input
                                            type="checkbox"
                                            style={styles.checkbox}
                                            checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                    <th style={styles.th}>Type</th>
                                    <th style={styles.th}>Name</th>
                                    <th style={styles.th}>Description</th>
                                    <th style={styles.th}>Status</th>
                                    <th style={styles.th}>Created</th>
                                    <th style={styles.th}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                            📊 No items found
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map((item) => (
                                        <tr key={item.id}>
                                            <td style={styles.td}>
                                                <input
                                                    type="checkbox"
                                                    style={styles.checkbox}
                                                    checked={selectedItems.includes(item.id)}
                                                    onChange={() => handleSelectItem(item.id)}
                                                />
                                            </td>
                                            <td style={styles.td}>
                                                <span style={{
                                                    ...styles.badge,
                                                    ...getTypeStyle(item.type)
                                                }}>
                                                    {item.type === 'income' ? '💰 Income' : '📉 Expense'}
                                                </span>
                                            </td>
                                            <td style={styles.td}>
                                                <strong>{item.name}</strong>
                                            </td>
                                            <td style={styles.td}>
                                                {item.description || '-'}
                                            </td>
                                            <td style={styles.td}>
                                                <button
                                                    onClick={() => handleToggleStatus(item.id)}
                                                    style={{
                                                        ...styles.badge,
                                                        background: item.is_active ? '#10b981' : '#ef4444',
                                                        color: 'white',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: '4px 12px',
                                                        fontSize: '12px',
                                                        fontWeight: '600'
                                                    }}
                                                >
                                                    {item.is_active ? '✅ Active' : '❌ Inactive'}
                                                </button>
                                            </td>
                                            <td style={styles.td}>
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </td>
                                            <td style={styles.td}>
                                                <div style={styles.actionButtons}>
                                                    <button
                                                        style={styles.iconButton}
                                                        onClick={() => handleEdit(item)}
                                                        title="Edit"
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        style={styles.iconButton}
                                                        onClick={() => handleDelete(item.id)}
                                                        title="Delete"
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UtilityTypeManager;