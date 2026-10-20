import React, { useState, useEffect, useMemo } from "react";
import api from "../../api";
import ItemReportModal from '../Itemrepo/ItemReportModal';
import WeightReportModal from '../WeightReport/WeightReportModal';
import GrnSaleReportModal from '../GrnSale/ReportModal';
import GrnReportModal from '../GrnReport/GrnReportModal';
import SalesAdjustmentReportModal from '../SalesAdjustmentReport/SalesAdjustmentReportModal';
import GrnSalesOverviewReport from '../GrnSalesOverview/GrnSalesOverviewReport';
import GrnSalesOverviewReport2 from '../GrnSalesOverview/GrnSalesOverviewReport2';
import SalesReportModal from '../SalesReport/SalesReportModal';
import DayProcessModal from '../Modals/DayProcessModal';
import { useNavigate } from 'react-router-dom';

const routes = {
    sales: "/sales",
    customers: "/customers",
    getAllSales: "/sales/all",
    updateGivenAmountApplied: "/sales/update-given-amount-applied",
    getBanks: "/banks",
    applyAdjustment: "/adjustments/apply",
    pendingCustomerBills: "/adjustments/pending-customer-bills",
    pendingFarmerBills: "/adjustments/pending-farmer-bills",
    paymentHistory: "/sales/payment-history",
    checkCustomer: "/customers/check-short-name",
    updateDebtorStatus: "/customers/update-debtor-status",
    paymentReport: "/sales/payment-report",
    dashboardStats: "/sales/dashboard-stats",
    debtors: {
        create: "/debtors/create",
        updatePayment: "/debtors/update-payment",
        getByBill: "/debtors",
        getByCustomer: "/debtors/customer",
        getPending: "/debtors/pending/all"
    }
};
// ==================== CUSTOMER TYPE SELECTOR ====================
// ==================== CUSTOMER TYPE SELECTOR ====================
const CustomerTypeSelector = ({ selectedType, onSelect, disabled = false, onDebtorClick, billCustomerCode = null, billNo = null }) => {
    const [showDebtorConfirm, setShowDebtorConfirm] = useState(false);
    const [customerCode, setCustomerCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [customerExists, setCustomerExists] = useState(false);
    const [existingCustomer, setExistingCustomer] = useState(null);
    const [matchingCustomers, setMatchingCustomers] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [allCustomers, setAllCustomers] = useState([]);
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
    const [selectedFromDropdown, setSelectedFromDropdown] = useState(false);
    const [customersLoaded, setCustomersLoaded] = useState(false);

    // Fetch all customers when component mounts
    useEffect(() => {
        fetchAllCustomers();
    }, []);

    // Also fetch when modal opens to ensure fresh data
    useEffect(() => {
        if (showDebtorConfirm && !customersLoaded) {
            fetchAllCustomers();
        }
    }, [showDebtorConfirm]);

    const fetchAllCustomers = async () => {
        setIsLoadingCustomers(true);
        try {
            console.log('Fetching customers from API...');
            const response = await api.get(routes.customers);
            console.log('Raw API Response:', response.data);

            let customersData = [];

            // The API returns a direct array
            if (Array.isArray(response.data)) {
                customersData = response.data;
                console.log('Response is directly an array');
            } else if (response.data.data && Array.isArray(response.data.data)) {
                customersData = response.data.data;
                console.log('Found data in response.data.data');
            } else if (response.data.customers && Array.isArray(response.data.customers)) {
                customersData = response.data.customers;
                console.log('Found data in response.data.customers');
            }

            console.log('Number of customers loaded:', customersData.length);

            // Specifically check for NVDS customers
            const nvdsCustomers = customersData.filter(c => c.short_name === 'NVDS');
            console.log('NVDS customers found:', nvdsCustomers.length);

            setAllCustomers(customersData);
            setCustomersLoaded(true);

            // If there's a customer code already typed, search for matches AFTER state is updated
            if (customerCode) {
                // Use setTimeout to ensure state is updated
                setTimeout(() => {
                    searchMatchingCustomers(customerCode);
                }, 100);
            }
        } catch (error) {
            console.error('Error fetching customers:', error);
            alert('Failed to load customers list. Please refresh and try again.');
        } finally {
            setIsLoadingCustomers(false);
        }
    };

    // Pre-fill customer code when modal opens with bill's customer code
    useEffect(() => {
        if (showDebtorConfirm && billCustomerCode) {
            setCustomerCode(billCustomerCode);
            setSelectedFromDropdown(false);
            // Wait for customers to be loaded before searching
            if (billCustomerCode) {
                const searchTimer = setTimeout(() => {
                    if (allCustomers.length > 0) {
                        searchMatchingCustomers(billCustomerCode);
                        setShowSuggestions(true);
                    } else {
                        // If customers not loaded yet, wait a bit more
                        const waitTimer = setInterval(() => {
                            if (allCustomers.length > 0) {
                                searchMatchingCustomers(billCustomerCode);
                                setShowSuggestions(true);
                                clearInterval(waitTimer);
                            }
                        }, 100);
                        // Clear after 5 seconds
                        setTimeout(() => clearInterval(waitTimer), 5000);
                    }
                }, 200);
                return () => clearTimeout(searchTimer);
            }
        }
    }, [showDebtorConfirm, billCustomerCode, allCustomers.length]);

    const searchMatchingCustomers = (searchTerm) => {
        console.log('Searching for:', searchTerm);
        console.log('All customers available:', allCustomers.length);

        if (!searchTerm || searchTerm.trim() === '') {
            setMatchingCustomers([]);
            setShowSuggestions(false);
            return;
        }

        const term = searchTerm.toUpperCase();
        const matches = allCustomers
            .filter(customer => {
                const shortName = (customer.short_name || '').toUpperCase();
                const matches = shortName === term || shortName.startsWith(term);
                if (matches) {
                    console.log('Match found:', shortName, 'Debtor_no:', customer.Debtor_no);
                }
                return matches;
            })
            .slice(0, 10);

        console.log('Matching customers found:', matches.length);
        setMatchingCustomers(matches);
        setShowSuggestions(matches.length > 0);

        // If no matches found, log the first few customers for debugging
        if (matches.length === 0 && allCustomers.length > 0) {
            console.log('First 5 customers in list:', allCustomers.slice(0, 5).map(c => c.short_name));
        }
    };

    const handleCustomerCodeChange = (e) => {
        const value = e.target.value.toUpperCase();
        setCustomerCode(value);
        setSelectedFromDropdown(false);
        searchMatchingCustomers(value);
        setCustomerExists(false);
        setExistingCustomer(null);
    };

    const handleSelectCustomer = (customer) => {
        console.log('Selected customer:', customer);
        setCustomerCode(customer.short_name);
        setSelectedFromDropdown(true);
        setShowSuggestions(false);

        // Show message with the actual debtor number
        if (customer.Debtor === 'Y' && customer.Debtor_no) {
            alert(`✅ Customer "${customer.short_name}" selected!\n📋 Debtor Number: ${customer.Debtor_no}\n\nThis debtor number will be used for Bill #${billNo}`);
        } else if (customer.Debtor === 'Y') {
            alert(`✅ Customer "${customer.short_name}" selected!\n\nProceeding with this existing customer.`);
        } else {
            alert(`👤 Customer "${customer.short_name}" selected! They will be registered as a Debtor.`);
        }

        // Pass the entire customer object to avoid API call
        setTimeout(() => {
            handleCheckCustomerWithCode(customer.short_name, true, customer);
        }, 100);
    };
    const handleCheckCustomerWithCode = async (code, useExisting = false, selectedCustomerData = null) => {
        if (!code.trim()) {
            alert('Please enter a customer code');
            return;
        }

        setLoading(true);
        try {
            let customerData;
            let selectedDebtorNo;
            let selectedCustomerId = null;

            // If we have selected customer data from dropdown, use it directly
            if (selectedCustomerData) {
                console.log('Using selected customer data directly:', selectedCustomerData);
                customerData = {
                    exists: true,
                    customer: selectedCustomerData
                };
                selectedDebtorNo = selectedCustomerData.Debtor_no;
                selectedCustomerId = selectedCustomerData.id; // Get the customer ID
            } else {
                // Only call API if user typed the code
                const response = await api.get(`${routes.checkCustomer}/${code}`);
                customerData = response.data;
                selectedDebtorNo = customerData.customer?.Debtor_no;
                selectedCustomerId = customerData.customer?.id;
            }

            console.log('Customer data:', customerData);
            console.log('Selected from dropdown:', selectedFromDropdown);
            console.log('Current bill number:', billNo);
            console.log('Selected debtor number:', selectedDebtorNo);
            console.log('Selected customer ID:', selectedCustomerId);

            if (customerData.exists) {
                if (selectedFromDropdown || useExisting) {
                    console.log('Using EXISTING customer with debtor_no:', selectedDebtorNo);

                    // Pass the customer_id to identify the specific customer
                    const updateResponse = await api.put(routes.updateDebtorStatus, {
                        short_name: code,
                        customer_id: selectedCustomerId, // Add customer_id
                        Debtor: 'Y',
                        bill_no: billNo
                    });

                    const debtorNo = updateResponse.data.debtor_no || selectedDebtorNo;
                    const wasNewRecordCreated = updateResponse.data.was_new_record_created;

                    if (wasNewRecordCreated) {
                        alert(`✅ New debtor record created for Bill #${billNo}\n📋 Debtor Number: ${debtorNo}\n\nProceeding with payment.`);
                    } else {
                        alert(`✅ Using EXISTING Debtor!\n📋 Customer: ${code}\n📋 Debtor Number: ${debtorNo || 'N/A'}\n📋 Bill Number: ${billNo || 'N/A'}\n\nProceeding with payment.`);
                    }

                    setShowDebtorConfirm(false);
                    onSelect('walking');
                    setCustomerCode('');
                    setCustomerExists(false);
                    setExistingCustomer(null);
                    setMatchingCustomers([]);
                    setShowSuggestions(false);
                    setSelectedFromDropdown(false);

                } else {
                    // Rest of your code...
                    const confirmNew = window.confirm(
                        `⚠️ CUSTOMER ALREADY EXISTS BUT NOT SELECTED FROM DROPDOWN ⚠️\n\n` +
                        `Customer Code: ${code}\n` +
                        `Existing Customer Found: ${customerData.customer.name || 'Unknown'}\n` +
                        `Existing Debtor No: ${customerData.customer.Debtor_no || 'Not assigned'}\n\n` +
                        `You did NOT select this customer from the dropdown.\n` +
                        `Do you want to CREATE a NEW debtor record for "${code}"?\n\n` +
                        `This will create a new entry with a DIFFERENT Debtor Number.\n` +
                        `Click OK to create NEW record, Cancel to use existing record.`
                    );

                    if (confirmNew) {
                        alert(`✅ Creating NEW debtor record for "${code}" with a NEW Debtor Number.\nPlease fill in the debtor registration form.`);
                        setShowDebtorConfirm(false);
                        onDebtorClick(code, billNo);
                        setCustomerCode('');
                        setMatchingCustomers([]);
                        setShowSuggestions(false);
                        setSelectedFromDropdown(false);
                    } else {
                        alert(`✅ Using EXISTING debtor record for "${code}".\nCreating debtor record for Bill #${billNo} if not exists.`);

                        const updateResponse = await api.put(routes.updateDebtorStatus, {
                            short_name: code,
                            customer_id: selectedCustomerId,
                            Debtor: 'Y',
                            bill_no: billNo
                        });

                        const debtorNo = updateResponse.data.debtor_no || customerData.customer.Debtor_no;

                        setShowDebtorConfirm(false);
                        onSelect('walking');
                        setCustomerCode('');
                        setCustomerExists(false);
                        setExistingCustomer(null);
                        setMatchingCustomers([]);
                        setShowSuggestions(false);
                        setSelectedFromDropdown(false);
                    }
                }
            } else {
                console.log('Customer NOT found, creating NEW customer record');
                setShowDebtorConfirm(false);
                onDebtorClick(code, billNo);
                setCustomerCode('');
                setMatchingCustomers([]);
                setShowSuggestions(false);
                setSelectedFromDropdown(false);
            }
        } catch (error) {
            console.error('Error checking customer:', error);
            alert('Failed to check customer. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckCustomer = async () => {
        await handleCheckCustomerWithCode(customerCode, false);
    };

    const handleSkip = () => {
        setShowDebtorConfirm(false);
        setCustomerCode('');
        setCustomerExists(false);
        setExistingCustomer(null);
        setMatchingCustomers([]);
        setShowSuggestions(false);
        setSelectedFromDropdown(false);
    };
    return (
        <>
            <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)', borderRadius: '12px', border: '2px solid #bae6fd' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '12px', color: '#0369a1' }}>
                    👤 Customer Type
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => onSelect('walking')}
                        disabled={disabled}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: selectedType === 'walking' ? 'linear-gradient(135deg, #10b981, #059669)' : 'white',
                            color: selectedType === 'walking' ? 'white' : '#475569',
                            border: selectedType === 'walking' ? 'none' : '2px solid #e2e8f0',
                            borderRadius: '10px',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            opacity: disabled ? 0.6 : 1
                        }}
                    >
                        🚶 Walking Customer
                    </button>
                    <button
                        onClick={() => setShowDebtorConfirm(true)}
                        disabled={disabled}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: selectedType === 'debtor' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'white',
                            color: selectedType === 'debtor' ? 'white' : '#475569',
                            border: selectedType === 'debtor' ? 'none' : '2px solid #e2e8f0',
                            borderRadius: '10px',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            opacity: disabled ? 0.6 : 1
                        }}
                    >
                        📋 Debtor
                    </button>
                </div>
                <div style={{ fontSize: '10px', color: '#0369a1', marginTop: '8px', textAlign: 'center' }}>
                    💡 Tip: Select from dropdown to use existing customer. Type and click Continue to create new debtor
                </div>
            </div>

            {showDebtorConfirm && (
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
                    zIndex: 20000,
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '20px',
                        width: '500px',
                        maxWidth: '90%',
                        padding: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                    }}>
                        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                            <span style={{ fontSize: '48px' }}>📋</span>
                            <h3 style={{ margin: '10px 0 5px 0', fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                                {billCustomerCode ? `Register Debtor: ${billCustomerCode}` : 'Enter Customer Code'}
                            </h3>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                                {billCustomerCode
                                    ? `Customer "${billCustomerCode}" not found. Please confirm to register as Debtor.`
                                    : 'Please enter the customer code to register as Debtor'}
                            </p>
                            {billNo && (
                                <p style={{ fontSize: '11px', color: '#92400e', marginTop: '5px' }}>
                                    Bill Number: {billNo}
                                </p>
                            )}
                        </div>

                        <div style={{ marginBottom: '20px', position: 'relative' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px', color: '#334155' }}>
                                Customer Code
                            </label>
                            <input
                                type="text"
                                value={customerCode}
                                onChange={handleCustomerCodeChange}
                                placeholder="Enter customer code (e.g., RTY)"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    border: '2px solid #e2e8f0',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    outline: 'none',
                                    fontFamily: 'monospace',
                                    fontWeight: 'bold'
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleCheckCustomer();
                                    }
                                }}
                                onBlur={() => {
                                    setTimeout(() => setShowSuggestions(false), 200);
                                }}
                                onFocus={() => {
                                    if (customerCode && matchingCustomers.length > 0) {
                                        setShowSuggestions(true);
                                    }
                                }}
                            />

                            {/* Loading indicator */}
                            {isLoadingCustomers && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: 'white',
                                    padding: '10px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    marginTop: '4px',
                                    textAlign: 'center',
                                    fontSize: '12px',
                                    color: '#64748b'
                                }}>
                                    ⏳ Loading customers...
                                </div>
                            )}

                            {/* Suggestions Dropdown */}
                            {!isLoadingCustomers && showSuggestions && matchingCustomers.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                    zIndex: 20001,
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    marginTop: '4px'
                                }}>
                                    {matchingCustomers.map((customer, index) => (
                                        <div
                                            key={index}
                                            onClick={() => handleSelectCustomer(customer)}
                                            style={{
                                                padding: '12px 14px',
                                                cursor: 'pointer',
                                                borderBottom: index < matchingCustomers.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                transition: 'background 0.2s',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = '#f8fafc';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'white';
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>
                                                    {customer.short_name}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    {customer.name || 'No name'}
                                                </div>
                                            </div>
                                            <div style={{
                                                background: customer.Debtor === 'Y' ? '#fef3c7' : '#f1f5f9',
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                color: customer.Debtor === 'Y' ? '#92400e' : '#64748b'
                                            }}>
                                                {customer.Debtor === 'Y' ? (
                                                    <>📋 Debtor: {customer.Debtor_no || 'N/A'}</>
                                                ) : (
                                                    <>👤 Regular</>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* No customers message */}
                            {!isLoadingCustomers && customerCode && matchingCustomers.length === 0 && allCustomers.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: '#fef3c7',
                                    padding: '10px',
                                    border: '1px solid #fde68a',
                                    borderRadius: '8px',
                                    marginTop: '4px',
                                    fontSize: '12px',
                                    color: '#92400e'
                                }}>
                                    No matching customers found for "{customerCode}"
                                </div>
                            )}
                        </div>

                        <div style={{
                            background: '#e0f2fe',
                            padding: '10px',
                            borderRadius: '8px',
                            marginBottom: '16px',
                            fontSize: '12px',
                            color: '#0369a1'
                        }}>
                            <strong>📌 How it works:</strong><br />
                            • <strong>Select from dropdown</strong> → Use existing customer (same Debtor No)<br />
                            • <strong>Type & click Continue</strong> → Create NEW debtor (different Debtor No)<br />
                            • Same customer code can have multiple Debtor Numbers!
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleSkip}
                                style={{
                                    padding: '10px 20px',
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '13px'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCheckCustomer}
                                disabled={loading}
                                style={{
                                    padding: '10px 20px',
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '13px',
                                    opacity: loading ? 0.6 : 1
                                }}
                            >
                                {loading ? 'Checking...' : 'Continue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
// ==================== DEBTOR FORM MODAL ====================
const DebtorFormModal = ({ isOpen, onClose, onSave, customerCode, billNo = null, existingDebtorNo = null }) => {
    const [formData, setFormData] = useState({
        name: '',
        ID_NO: '',
        telephone_no: '',
        address: '',
        credit_limit: '',
        profile_pic: null,
        nic_front: null,
        nic_back: null
    });
    const [loading, setLoading] = useState(false);
    const [previewImages, setPreviewImages] = useState({
        profile_pic: null,
        nic_front: null,
        nic_back: null
    });
    const [generatedDebtorNo, setGeneratedDebtorNo] = useState(null);

    useEffect(() => {
        if (isOpen && customerCode) {
            setFormData(prev => ({ ...prev, short_name: customerCode.toUpperCase() }));
            // If existing debtor number exists, display it
            if (existingDebtorNo) {
                setGeneratedDebtorNo(existingDebtorNo);
            } else {
                setGeneratedDebtorNo(null);
            }
        }
    }, [isOpen, customerCode, existingDebtorNo]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const { name, files } = e.target;
        const file = files[0];
        if (file) {
            setFormData(prev => ({ ...prev, [name]: file }));
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImages(prev => ({ ...prev, [name]: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    // In DebtorFormModal, update the handleSubmit function:
    const handleSubmit = async () => {
        setLoading(true);
        try {
            const formDataToSend = new FormData();
            formDataToSend.append('short_name', customerCode.toUpperCase());
            if (formData.name) formDataToSend.append('name', formData.name);
            if (formData.ID_NO) formDataToSend.append('ID_NO', formData.ID_NO);
            if (formData.telephone_no) formDataToSend.append('telephone_no', formData.telephone_no);
            if (formData.address) formDataToSend.append('address', formData.address);
            if (formData.credit_limit) formDataToSend.append('credit_limit', formData.credit_limit);
            formDataToSend.append('Debtor', 'Y');

            // ✅ IMPORTANT: Pass bill_no to the backend
            if (billNo) {
                formDataToSend.append('bill_no', billNo);
                console.log('Adding bill_no to form data:', billNo);
            }

            if (formData.profile_pic) formDataToSend.append('profile_pic', formData.profile_pic);
            if (formData.nic_front) formDataToSend.append('nic_front', formData.nic_front);
            if (formData.nic_back) formDataToSend.append('nic_back', formData.nic_back);

            const response = await api.post('/customers', formDataToSend, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.status === 200 || response.status === 201) {
                const debtorNo = response.data.Debtor_no;
                setGeneratedDebtorNo(debtorNo);

                alert(`Customer registered as Debtor successfully!\nDebtor Number: ${debtorNo}${billNo ? `\nBill No: ${billNo}` : ''}`);
                onSave(true, debtorNo);
                onClose();
            }
        } catch (error) {
            console.error('Error saving debtor:', error);
            alert('Failed to save debtor information. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
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
                zIndex: 10001,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '20px',
                    width: '500px',
                    maxWidth: '90%',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    style={{
                        padding: '16px 20px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '20px 20px 0 0',
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📝</span> Register Debtor: {customerCode}
                        {billNo && <span style={{ fontSize: '12px', marginLeft: '8px' }}>(Bill: {billNo})</span>}
                    </h3>
                </div>

                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    {/* Display generated debtor number if available */}
                    {generatedDebtorNo && (
                        <div
                            style={{
                                background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                                padding: '12px',
                                borderRadius: '10px',
                                marginBottom: '16px',
                                border: '1px solid #10b981',
                                textAlign: 'center',
                            }}
                        >
                            <div style={{ fontSize: '12px', color: '#065f46', fontWeight: '500' }}>Debtor Number</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#047857' }}>{generatedDebtorNo}</div>
                        </div>
                    )}

                    <div
                        style={{
                            background: '#fef3c7',
                            padding: '10px',
                            borderRadius: '8px',
                            marginBottom: '16px',
                            fontSize: '12px',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                        }}
                    >
                        ⚠️ Customer "{customerCode}" not found. Please provide information to register as Debtor.
                        <br />
                        <small>All fields are optional</small>
                        <br />
                        <small>A unique Debtor Number will be automatically generated.</small>
                        {billNo && (
                            <>
                                <br />
                                <small>This debtor will be linked to Bill No: {billNo}</small>
                            </>
                        )}
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>Full Name</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Enter full name"
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>ID Number</label>
                        <input
                            type="text"
                            name="ID_NO"
                            value={formData.ID_NO}
                            onChange={handleChange}
                            placeholder="Enter NIC/ID number"
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>Telephone Number</label>
                        <input
                            type="tel"
                            name="telephone_no"
                            value={formData.telephone_no}
                            onChange={handleChange}
                            placeholder="Enter phone number"
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>Address</label>
                        <textarea
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            placeholder="Enter address"
                            rows="2"
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                resize: 'vertical',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>Credit Limit (Rs.)</label>
                        <input
                            type="number"
                            name="credit_limit"
                            value={formData.credit_limit}
                            onChange={handleChange}
                            placeholder="Enter credit limit"
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '13px',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>Profile Picture</label>
                        <input
                            type="file"
                            name="profile_pic"
                            onChange={handleFileChange}
                            accept="image/jpeg,image/jpg,image/png"
                            style={{
                                width: '100%',
                                padding: '6px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '12px',
                            }}
                        />
                        {previewImages.profile_pic && (
                            <img
                                src={previewImages.profile_pic}
                                alt="Preview"
                                style={{ marginTop: '6px', maxWidth: '100%', maxHeight: '80px', borderRadius: '6px' }}
                            />
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>NIC Front</label>
                            <input
                                type="file"
                                name="nic_front"
                                onChange={handleFileChange}
                                accept="image/jpeg,image/jpg,image/png"
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                }}
                            />
                            {previewImages.nic_front && (
                                <img
                                    src={previewImages.nic_front}
                                    alt="NIC Front"
                                    style={{ marginTop: '6px', maxWidth: '100%', maxHeight: '80px', borderRadius: '6px' }}
                                />
                            )}
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '11px', color: '#334155' }}>NIC Back</label>
                            <input
                                type="file"
                                name="nic_back"
                                onChange={handleFileChange}
                                accept="image/jpeg,image/jpg,image/png"
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                }}
                            />
                            {previewImages.nic_back && (
                                <img
                                    src={previewImages.nic_back}
                                    alt="NIC Back"
                                    style={{ marginTop: '6px', maxWidth: '100%', maxHeight: '80px', borderRadius: '6px' }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        padding: '12px 20px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        background: '#f8fafc',
                        borderRadius: '0 0 20px 20px',
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '12px',
                        }}
                    >
                        Skip
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #4CAF50, #45a049)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '12px',
                            opacity: loading ? 0.6 : 1,
                        }}
                    >
                        {loading ? 'Saving...' : 'Save & Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==================== BANK ACCOUNT SELECTOR COMPONENT ====================
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
            const response = await api.get(routes.getBanks);
            if (response.data.success) {
                setBanks(response.data.data);
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
        return <div style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>Loading bank accounts...</div>;
    }

    if (error) {
        return <div style={{ padding: '10px', textAlign: 'center', color: '#ef4444', fontSize: '12px' }}>{error}</div>;
    }

    return (
        <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '13px', color: '#334155' }}>
                Select Bank Account <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
                value={selectedAccountId || ''}
                onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    cursor: 'pointer'
                }}
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

// ==================== PAYMENT HISTORY MODAL ====================
const PaymentHistoryModal = ({ isOpen, onClose, payments, totalPaid, totalBill, remaining }) => {
    if (!isOpen) return null;

    const modalStyles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10001,
        },
        modal: {
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '550px',
            maxWidth: '90%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
        },
        title: {
            margin: 0,
            fontSize: '18px',
            fontWeight: '600',
            color: '#0f172a',
        },
        closeBtn: {
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#94a3b8',
        },
        summary: {
            padding: '16px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
        },
        summaryItem: {
            textAlign: 'center',
        },
        summaryLabel: {
            fontSize: '11px',
            color: '#64748b',
            marginBottom: '4px',
        },
        summaryValue: {
            fontSize: '16px',
            fontWeight: 'bold',
        },
        content: {
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
        },
        paymentItem: {
            padding: '12px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        paymentMethod: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '500',
        },
        footer: {
            padding: '16px 20px',
            borderTop: '1px solid #e2e8f0',
            textAlign: 'right',
        },
    };

    const getPaymentMethodStyle = (method) => {
        switch (method) {
            case 'Cash':
                return { backgroundColor: '#10b981', color: 'white' };
            case 'Cheque':
                return { backgroundColor: '#8b5cf6', color: 'white' };
            case 'Bank Transfer':
                return { backgroundColor: '#ec489a', color: 'white' };
            case 'bag_to_box':
                return { backgroundColor: '#f59e0b', color: 'white' };
            case 'bill_to_bill':
                return { backgroundColor: '#3b82f6', color: 'white' };
            case 'bad_debt':
                return { backgroundColor: '#ef4444', color: 'white' };
            default:
                return { backgroundColor: '#6b7280', color: 'white' };
        }
    };

    const formatCurrency = (amount) => {
        return `Rs. ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getPaymentIcon = (method) => {
        switch (method) {
            case 'Cash': return '💰';
            case 'Cheque': return '💳';
            case 'Bank Transfer': return '🏦';
            case 'bag_to_box': return '📦';
            case 'bill_to_bill': return '📄';
            case 'bad_debt': return '⚠️';
            default: return '💵';
        }
    };

    const getMethodDisplayName = (method) => {
        switch (method) {
            case 'bag_to_box': return 'Bag to Box';
            case 'bill_to_bill': return 'Bill to Bill';
            case 'bad_debt': return 'Bad Debt';
            default: return method;
        }
    };

    return (
        <div style={modalStyles.overlay} onClick={onClose}>
            <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={modalStyles.header}>
                    <h3 style={modalStyles.title}>Payment History</h3>
                    <button style={modalStyles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div style={modalStyles.summary}>
                    <div style={modalStyles.summaryItem}>
                        <div style={modalStyles.summaryLabel}>Total Bill</div>
                        <div style={{ ...modalStyles.summaryValue, color: '#ef4444' }}>{formatCurrency(totalBill)}</div>
                    </div>
                    <div style={modalStyles.summaryItem}>
                        <div style={modalStyles.summaryLabel}>Total Paid</div>
                        <div style={{ ...modalStyles.summaryValue, color: '#10b981' }}>{formatCurrency(totalPaid)}</div>
                    </div>
                    <div style={modalStyles.summaryItem}>
                        <div style={modalStyles.summaryLabel}>Remaining</div>
                        <div style={{ ...modalStyles.summaryValue, color: '#f59e0b' }}>{formatCurrency(remaining)}</div>
                    </div>
                </div>

                <div style={modalStyles.content}>
                    {payments && payments.length > 0 ? (
                        payments.map((payment, index) => (
                            <div key={index} style={modalStyles.paymentItem}>
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '14px' }}>
                                        Payment #{index + 1}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {new Date(payment.date).toLocaleString()}
                                    </div>
                                    {payment.reference && (
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                            Ref: {payment.reference}
                                        </div>
                                    )}
                                    {payment.running_balance && (
                                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                            Balance after: {formatCurrency(payment.running_balance)}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{
                                        ...modalStyles.paymentMethod,
                                        ...getPaymentMethodStyle(payment.method)
                                    }}>
                                        {getPaymentIcon(payment.method)} {getMethodDisplayName(payment.method)}
                                    </span>
                                    <div style={{ fontWeight: 'bold', marginTop: '8px', fontSize: '14px' }}>
                                        {formatCurrency(payment.amount)}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                            No payment history available
                        </div>
                    )}
                </div>

                <div style={modalStyles.footer}>
                    <button onClick={onClose} style={{
                        padding: '8px 20px',
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                    }}>Close</button>
                </div>
            </div>
        </div>
    );
};

// ==================== CHEQUE MODAL ====================
const ChequeModal = ({ isOpen, onClose, onConfirm, amount }) => {
    const [chequeDetails, setChequeDetails] = useState({
        cheq_date: '',
        cheq_no: '',
        bank_account_id: null
    });

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setChequeDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleBankSelect = (bankId) => {
        setChequeDetails(prev => ({ ...prev, bank_account_id: bankId }));
    };

    const handleSubmit = () => {
        if (!chequeDetails.cheq_date || !chequeDetails.cheq_no || !chequeDetails.bank_account_id) {
            alert("Please fill all cheque details and select a bank account");
            return;
        }
        onConfirm(chequeDetails);
        setChequeDetails({ cheq_date: '', cheq_no: '', bank_account_id: null });
    };

    const modalStyles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
        },
        modal: {
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '25px',
            width: '450px',
            maxWidth: '90%',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        },
        title: {
            margin: '0 0 20px 0',
            color: '#333',
            fontSize: '20px',
            fontWeight: '600',
        },
        formGroup: {
            marginBottom: '15px',
        },
        label: {
            display: 'block',
            marginBottom: '5px',
            fontWeight: '500',
            fontSize: '13px',
            color: '#334155',
        },
        input: {
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
        },
        footer: {
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            marginTop: '20px',
        },
        cancelBtn: {
            padding: '8px 20px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
        },
        confirmBtn: {
            padding: '8px 20px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
        },
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '20px',
                width: '380px',
                maxWidth: '90%',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #e2e8f0'
                }}>
                    <span style={{ fontSize: '24px' }}>💳</span>
                    <h3 style={{
                        margin: 0,
                        color: '#1e293b',
                        fontSize: '18px',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>Cheque Payment</h3>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #dbeafe, #eff6ff)',
                    padding: '10px',
                    borderRadius: '10px',
                    marginBottom: '16px',
                    textAlign: 'center'
                }}>
                    <label style={{
                        display: 'block',
                        fontWeight: '600',
                        fontSize: '12px',
                        color: '#1e40af',
                        marginBottom: '4px'
                    }}>Payment Amount</label>
                    <div style={{
                        fontSize: '22px',
                        fontWeight: '800',
                        color: '#1e3a8a',
                        fontFamily: 'monospace'
                    }}>Rs. {amount.toFixed(2)}</div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontWeight: '600',
                        fontSize: '12px',
                        color: '#334155'
                    }}>
                        📅 Cheque Date <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="date"
                        name="cheq_date"
                        value={chequeDetails.cheq_date}
                        onChange={handleChange}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '10px',
                            fontSize: '13px',
                            transition: 'all 0.2s',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#8b5cf6';
                            e.target.style.boxShadow = '0 0 0 2px rgba(139,92,246,0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontWeight: '600',
                        fontSize: '12px',
                        color: '#334155'
                    }}>
                        🔢 Cheque Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                        type="text"
                        name="cheq_no"
                        value={chequeDetails.cheq_no}
                        onChange={handleChange}
                        placeholder="Enter cheque number"
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '10px',
                            fontSize: '13px',
                            transition: 'all 0.2s',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#8b5cf6';
                            e.target.style.boxShadow = '0 0 0 2px rgba(139,92,246,0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>

                <div style={{ marginBottom: '18px' }}>
                    <BankAccountSelector
                        selectedAccountId={chequeDetails.bank_account_id}
                        onSelect={handleBankSelect}
                        disabled={false}
                    />
                </div>

                <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    marginTop: '4px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '12px',
                            transition: 'all 0.2s',
                            flex: 1
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#e2e8f0';
                            e.target.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = '#f1f5f9';
                            e.target.style.transform = 'translateY(0)';
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '12px',
                            transition: 'all 0.2s',
                            flex: 1,
                            boxShadow: '0 2px 4px -1px rgba(139,92,246,0.3)'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.transform = 'translateY(-1px)';
                            e.target.style.boxShadow = '0 4px 6px -1px rgba(139,92,246,0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = '0 2px 4px -1px rgba(139,92,246,0.3)';
                        }}
                    >
                        Confirm Payment
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==================== BANK TO BANK MODAL ====================
const BankToBankModal = ({ isOpen, onClose, onConfirm, amount, customerCode, customerName }) => {
    const [transferDetails, setTransferDetails] = useState({
        bank_account_id: null,
        reference_no: '',
        transfer_date: new Date().toISOString().split('T')[0],
        notes: ''
    });
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchBanks();
        }
    }, [isOpen]);

    const fetchBanks = async () => {
        setLoading(true);
        try {
            const response = await api.get(routes.getBanks);
            if (response.data.success) {
                setBanks(response.data.data);
            } else {
                setError('Failed to load bank accounts');
            }
        } catch (error) {
            setError('Unable to load bank accounts');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setTransferDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleBankSelect = (bankId) => {
        setTransferDetails(prev => ({ ...prev, bank_account_id: bankId ? parseInt(bankId) : null }));
    };

    const handleSubmit = () => {
        if (!transferDetails.bank_account_id) {
            alert("Please select a bank account");
            return;
        }
        if (!transferDetails.reference_no) {
            alert("Please enter transaction reference number");
            return;
        }

        onConfirm(transferDetails);
        setTransferDetails({
            bank_account_id: null,
            reference_no: '',
            transfer_date: new Date().toISOString().split('T')[0],
            notes: ''
        });
    };

    const modalStyles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
        },
        modal: {
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '25px',
            width: '500px',
            maxWidth: '90%',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        },
        title: {
            margin: '0 0 20px 0',
            color: '#333',
            fontSize: '20px',
            fontWeight: '600',
        },
        formGroup: {
            marginBottom: '15px',
        },
        label: {
            display: 'block',
            marginBottom: '5px',
            fontWeight: '500',
            fontSize: '13px',
            color: '#334155',
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
        input: {
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
        },
        textarea: {
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
            resize: 'vertical',
            minHeight: '60px',
        },
        infoBox: {
            background: '#fdf2f8',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px',
            border: '1px solid #fbcfe8',
            color: '#be185d',
        },
        footer: {
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            marginTop: '20px',
        },
        cancelBtn: {
            padding: '8px 20px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
        },
        confirmBtn: {
            padding: '8px 20px',
            background: '#ec489a',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
        },
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
            zIndex: 9999,
            animation: 'fadeIn 0.3s ease'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '20px',
                width: '500px',
                maxWidth: '90%',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                animation: 'slideUp 0.3s ease'
            }} onClick={(e) => e.stopPropagation()}>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '20px 24px',
                    background: 'linear-gradient(135deg, #ec489a, #db2777)',
                    borderRadius: '20px 20px 0 0',
                    borderBottom: '1px solid rgba(255,255,255,0.2)'
                }}>
                    <span style={{ fontSize: '28px' }}>🏦</span>
                    <h3 style={{
                        margin: 0,
                        color: 'white',
                        fontSize: '20px',
                        fontWeight: '700'
                    }}>Bank to Bank Transfer</h3>
                </div>

                <div style={{ padding: '24px' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #fdf2f8, #fce7f3)',
                        padding: '16px',
                        borderRadius: '14px',
                        marginBottom: '24px',
                        border: '1px solid #fbcfe8'
                    }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#be185d', marginBottom: '10px' }}>💰 Payment Details</div>
                        <div style={{ fontSize: '13px', color: '#9d174d', lineHeight: '1.6' }}>
                            <strong>Amount:</strong> Rs. {amount.toFixed(2)}<br />
                            <strong>Customer:</strong> {customerName || customerCode}
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: '#334155'
                        }}>
                            🏦 Select Bank Account <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select
                            value={transferDetails.bank_account_id || ''}
                            onChange={(e) => handleBankSelect(e.target.value)}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                background: 'white',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: loading ? 0.6 : 1
                            }}
                            onFocus={(e) => {
                                if (!loading) {
                                    e.target.style.borderColor = '#ec489a';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(236,72,153,0.1)';
                                }
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0';
                                e.target.style.boxShadow = 'none';
                            }}
                        >
                            <option value="">-- Select Bank Account --</option>
                            {banks.map(bank => (
                                <option key={bank.id} value={bank.id}>
                                    {bank.bank_name} - {bank.branch} (Acc: {bank.account_no})
                                </option>
                            ))}
                        </select>
                        {loading && (
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                                ⏳ Loading bank accounts...
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: '#334155'
                        }}>
                            🔢 Transaction Reference Number <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                            type="text"
                            name="reference_no"
                            value={transferDetails.reference_no}
                            onChange={handleChange}
                            placeholder="Enter transaction ID / Reference"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                transition: 'all 0.2s',
                                outline: 'none',
                                fontFamily: 'monospace'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#ec489a';
                                e.target.style.boxShadow = '0 0 0 3px rgba(236,72,153,0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: '#334155'
                        }}>
                            📅 Transfer Date <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                            type="date"
                            name="transfer_date"
                            value={transferDetails.transfer_date}
                            onChange={handleChange}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                transition: 'all 0.2s',
                                outline: 'none',
                                fontFamily: 'monospace'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#ec489a';
                                e.target.style.boxShadow = '0 0 0 3px rgba(236,72,153,0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: '#334155'
                        }}>
                            📝 Notes (Optional)
                        </label>
                        <textarea
                            name="notes"
                            value={transferDetails.notes}
                            onChange={handleChange}
                            placeholder="Additional notes about the transfer..."
                            rows="3"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: '2px solid #e2e8f0',
                                borderRadius: '12px',
                                fontSize: '14px',
                                transition: 'all 0.2s',
                                outline: 'none',
                                resize: 'vertical',
                                fontFamily: 'inherit'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#ec489a';
                                e.target.style.boxShadow = '0 0 0 3px rgba(236,72,153,0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    <div style={{
                        display: 'flex',
                        gap: '12px',
                        justifyContent: 'flex-end',
                        paddingTop: '8px',
                        borderTop: '1px solid #e2e8f0'
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
                                e.currentTarget.style.background = '#e2e8f0';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#f1f5f9';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}>
                            Cancel
                        </button>
                        <button onClick={handleSubmit} style={{
                            padding: '10px 24px',
                            background: 'linear-gradient(135deg, #ec489a, #db2777)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(236,72,153,0.3)'
                        }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 12px rgba(236,72,153,0.4)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(236,72,153,0.3)';
                            }}>
                            Confirm Transfer
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
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

// ==================== PAYMENT ADJUSTMENT MODAL ====================
const PaymentAdjustmentModal = ({ isOpen, onClose, onConfirm, billNo, customerCode, originalBillTotal }) => {
    const [adjustmentType, setAdjustmentType] = useState('bag_to_box');

    const [bagCount, setBagCount] = useState('');
    const [boxCount, setBoxCount] = useState('');
    const [bagValue, setBagValue] = useState('');
    const [boxValue, setBoxValue] = useState('');

    const [customerCodeField, setCustomerCodeField] = useState('');
    const [customerBillNo, setCustomerBillNo] = useState('');
    const [customerBillValue, setCustomerBillValue] = useState('');
    const [farmerCode, setFarmerCode] = useState('');
    const [farmerBillNo, setFarmerBillNo] = useState('');
    const [farmerBillValue, setFarmerBillValue] = useState('');
    const [pendingCustomerBills, setPendingCustomerBills] = useState([]);
    const [pendingFarmerBills, setPendingFarmerBills] = useState([]);
    const [loadingBills, setLoadingBills] = useState(false);
    const [customerSearchTerm, setCustomerSearchTerm] = useState('');
    const [farmerSearchTerm, setFarmerSearchTerm] = useState('');

    const [badDebtName, setBadDebtName] = useState('');
    const [badDebtAmount, setBadDebtAmount] = useState('');

    if (!isOpen) return null;

    const calculateBagToBoxAdjustment = () => {
        const totalBagValue = (parseInt(bagCount) || 0) * (parseFloat(bagValue) || 0);
        const totalBoxValue = (parseInt(boxCount) || 0) * (parseFloat(boxValue) || 0);
        return totalBagValue + totalBoxValue;
    };

    const calculateBillToBillTotal = () => {
        return (parseFloat(customerBillValue) || 0) + (parseFloat(farmerBillValue) || 0);
    };

    const handleSearchCustomerBills = async () => {
        if (!customerCodeField) {
            alert('Please enter customer code');
            return;
        }

        setLoadingBills(true);
        try {
            const response = await api.get(`${routes.pendingCustomerBills}?customer_code=${customerCodeField}`);
            if (response.data.success) {
                setPendingCustomerBills(response.data.data);
            }
        } catch (error) {
            alert('Failed to fetch pending bills');
        } finally {
            setLoadingBills(false);
        }
    };

    const handleSearchFarmerBills = async () => {
        if (!farmerCode) {
            alert('Please enter farmer/supplier code');
            return;
        }

        setLoadingBills(true);
        try {
            const response = await api.get(`${routes.pendingFarmerBills}?supplier_code=${farmerCode}`);
            if (response.data.success) {
                setPendingFarmerBills(response.data.data);
            }
        } catch (error) {
            alert('Failed to fetch farmer bills');
        } finally {
            setLoadingBills(false);
        }
    };

    const handleConfirm = () => {
        const adjustmentData = {
            adjustment_type: adjustmentType,
            original_bill_total: originalBillTotal
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
            adjustmentData.amount = Math.abs(calculateBagToBoxAdjustment());
        }

        if (adjustmentType === 'bill_to_bill') {
            if (!customerCodeField || !customerBillNo || !customerBillValue) {
                alert('Please fill all bill to bill fields (Customer Code, Bill No, and Amount)');
                return;
            }
            adjustmentData.customer_code = customerCodeField;
            adjustmentData.customer_bill_no = customerBillNo;
            adjustmentData.customer_bill_value = parseFloat(customerBillValue);
            adjustmentData.amount = parseFloat(customerBillValue);
        }

        if (adjustmentType === 'bad_debt') {
            if (!badDebtName || !badDebtAmount) {
                alert('Please enter bad debt name and amount');
                return;
            }
            adjustmentData.bad_debt_name = badDebtName;
            adjustmentData.bad_debt_amount = parseFloat(badDebtAmount);
            adjustmentData.amount = parseFloat(badDebtAmount);
        }

        onConfirm(adjustmentData);
        onClose();
    };

    const filteredCustomerBills = pendingCustomerBills.filter(bill =>
        bill.bill_no.toString().includes(customerSearchTerm.toLowerCase())
    );

    const filteredFarmerBills = pendingFarmerBills.filter(bill =>
        bill.supplier_bill_no.toString().includes(farmerSearchTerm.toLowerCase())
    );

    const modalStyles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
        },
        modal: {
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '750px',
            maxWidth: '90%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
        },
        title: {
            margin: 0,
            fontSize: '18px',
            fontWeight: '600',
            color: '#0f172a',
        },
        closeBtn: {
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#94a3b8',
        },
        content: {
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
        },
        formGroup: {
            marginBottom: '16px',
        },
        label: {
            display: 'block',
            marginBottom: '6px',
            fontWeight: '500',
            fontSize: '13px',
            color: '#334155',
        },
        input: {
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
        },
        select: {
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '14px',
            background: 'white',
        },
        row: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '16px',
        },
        infoBox: {
            background: '#f0fdf4',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px',
            border: '1px solid #dcfce7',
            color: '#166534',
        },
        warningBox: {
            background: '#fef3c7',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px',
            border: '1px solid #fde68a',
            color: '#92400e',
        },
        searchRow: {
            display: 'flex',
            gap: '10px',
            marginBottom: '10px',
        },
        searchBtn: {
            padding: '10px 20px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
        },
        billList: {
            maxHeight: '150px',
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '8px',
            marginTop: '8px',
            marginBottom: '16px',
        },
        billItem: {
            padding: '10px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
            border: '1px solid #e2e8f0',
        },
        billSelected: {
            background: '#eff6ff',
            borderColor: '#3b82f6',
        },
        section: {
            marginBottom: '20px',
            padding: '16px',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
        },
        sectionTitle: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#1e293b',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '1px solid #e2e8f0',
        },
        footer: {
            padding: '16px 20px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
        },
        cancelBtn: {
            padding: '8px 20px',
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
        },
        confirmBtn: {
            padding: '8px 20px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
        },
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
            animation: 'fadeIn 0.3s ease'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                width: '750px',
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
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '24px 24px 0 0',
                    borderBottom: '1px solid rgba(255,255,255,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '28px' }}>🔧</span>
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
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                    }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}>
                        ×
                    </button>
                </div>

                <div style={{
                    padding: '24px',
                    overflowY: 'auto',
                    flex: 1,
                }}>
                    <div style={{ marginBottom: '24px' }}>
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
                                e.target.style.borderColor = '#667eea';
                                e.target.style.boxShadow = '0 0 0 3px rgba(102,126,234,0.1)';
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
                                padding: '16px',
                                borderRadius: '12px',
                                marginBottom: '20px',
                                border: '1px solid #fbbf24'
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '10px' }}>📊 Adjustment Summary</div>
                                <div style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.6' }}>
                                    Total Bag Value: <strong>Rs. {(parseInt(state.bagCount) * parseFloat(state.bagValue) || 0).toFixed(2)}</strong><br />
                                    Total Box Value: <strong>Rs. {(parseInt(state.boxCount) * parseFloat(state.boxValue) || 0).toFixed(2)}</strong><br />
                                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#065f46' }}>
                                        Adjustment Amount: Rs. {Math.abs(((parseInt(state.bagCount) || 0) * (parseFloat(state.bagValue) || 0)) + ((parseInt(state.boxCount) || 0) * (parseFloat(state.boxValue) || 0))).toFixed(2)}
                                    </span><br />
                                    <span style={{ fontSize: '11px', color: '#78716c' }}>
                                        This amount will be deducted from the remaining payment
                                    </span>
                                </div>
                            </div>
                        </>
                    )}

                    {adjustmentType === 'bill_to_bill' && (
                        <>
                            <div style={{
                                marginBottom: '24px',
                                padding: '16px',
                                background: '#f8fafc',
                                borderRadius: '16px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: '#1e293b',
                                    marginBottom: '12px',
                                    paddingBottom: '8px',
                                    borderBottom: '2px solid #3b82f6',
                                    display: 'inline-block'
                                }}>🏢 Customer Bill Transfer</div>

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
                                        }}>Customer Code</label>
                                        <input
                                            type="text"
                                            value={customerCodeField}
                                            onChange={(e) => setCustomerCodeField(e.target.value.toUpperCase())}
                                            placeholder="Enter customer code"
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
                                                e.target.style.borderColor = '#3b82f6';
                                                e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
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
                                        }}>Customer Bill No</label>
                                        <input
                                            type="text"
                                            value={customerBillNo}
                                            onChange={(e) => setCustomerBillNo(e.target.value)}
                                            placeholder="Enter customer bill number"
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
                                                e.target.style.borderColor = '#3b82f6';
                                                e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                                            }}
                                            onBlur={(e) => {
                                                e.target.style.borderColor = '#e2e8f0';
                                                e.target.style.boxShadow = 'none';
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '6px',
                                        fontWeight: '600',
                                        fontSize: '12px',
                                        color: '#334155'
                                    }}>Bill Amount (Rs.)</label>
                                    <input
                                        type="number"
                                        value={customerBillValue}
                                        onChange={(e) => setCustomerBillValue(e.target.value)}
                                        placeholder="Enter bill amount"
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
                                            e.target.style.borderColor = '#3b82f6';
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
                                background: 'linear-gradient(135deg, #dbeafe, #eff6ff)',
                                padding: '16px',
                                borderRadius: '12px',
                                marginBottom: '20px',
                                border: '1px solid #bfdbfe'
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e40af', marginBottom: '10px' }}>📊 Transfer Summary</div>
                                <div style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: '1.6' }}>
                                    Customer Bill Amount: <strong>Rs. {(parseFloat(customerBillValue) || 0).toLocaleString()}</strong><br />
                                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#065f46' }}>
                                        Total Transfer Amount: Rs. {(parseFloat(customerBillValue) || 0).toLocaleString()}
                                    </span><br />
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        This amount will be deducted from the remaining payment
                                    </span>
                                </div>
                            </div>
                        </>
                    )}

                    {adjustmentType === 'bad_debt' && (
                        <>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '6px',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    color: '#334155'
                                }}>Bad Debt Name/Reference</label>
                                <input
                                    type="text"
                                    value={badDebtName}
                                    onChange={(e) => setBadDebtName(e.target.value)}
                                    placeholder="Enter customer name or reference"
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '12px',
                                        fontSize: '14px',
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = '#ef4444';
                                        e.target.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#e2e8f0';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '6px',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    color: '#334155'
                                }}>Bad Debt Amount (Rs.)</label>
                                <input
                                    type="number"
                                    value={badDebtAmount}
                                    onChange={(e) => setBadDebtAmount(e.target.value)}
                                    placeholder="Enter amount to write off"
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '12px',
                                        fontSize: '14px',
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = '#ef4444';
                                        e.target.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#e2e8f0';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                />
                            </div>
                            <div style={{
                                background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                                padding: '16px',
                                borderRadius: '12px',
                                marginBottom: '20px',
                                border: '1px solid #f87171'
                            }}>
                                <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', marginBottom: '8px' }}>
                                    ⚠️ Warning: Bad Debt Write-off
                                </div>
                                <div style={{ fontSize: '12px', color: '#7f1d1d' }}>
                                    Bad debt adjustment will write off <strong>Rs. {(parseFloat(badDebtAmount) || 0).toLocaleString()}</strong> from this bill.<br />
                                    This action cannot be undone and will deduct this amount from the remaining payment.
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    background: '#f8fafc',
                    borderRadius: '0 0 24px 24px'
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
                            e.currentTarget.style.background = '#e2e8f0';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f1f5f9';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}>
                        Cancel
                    </button>
                    <button onClick={handleConfirm} style={{
                        padding: '10px 24px',
                        background: 'linear-gradient(135deg, #4CAF50, #45a049)',
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
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                        }}>
                        Apply Adjustment
                    </button>
                </div>
            </div>

            <style>{`
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
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

const buildFullReceiptHTML = (salesData, billNo, customerCode, mobile, globalLoanAmount = 0, givenAmount = 0, paymentMethod = 'cash', paymentDetails = null, billSize = '3inch', cashGivenAmount = 0) => {
    const formatNumber = (num) => {
        if (typeof num !== 'number' && typeof num !== 'string') return '0';
        const number = parseFloat(num);
        if (isNaN(number)) return '0';

        if (Number.isInteger(number)) {
            return number.toLocaleString('en-US');
        } else {
            const parts = number.toFixed(2).split('.');
            const wholePart = parseInt(parts[0]).toLocaleString('en-US');
            return `${wholePart}.${parts[1]}`;
        }
    };

    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();
    let totalAmountSum = 0;
    const consolidatedSummary = {};

    salesData.forEach(s => {
        const itemName = s.item_name || 'Unknown';
        if (!consolidatedSummary[itemName]) consolidatedSummary[itemName] = { totalWeight: 0, totalPacks: 0 };
        consolidatedSummary[itemName].totalWeight += parseFloat(s.weight) || 0;
        consolidatedSummary[itemName].totalPacks += parseInt(s.packs) || 0;
        totalAmountSum += parseFloat(s.total) || 0;
    });

    const totalPacksSum = Object.values(consolidatedSummary).reduce((sum, item) => sum + item.totalPacks, 0);
    const is4Inch = billSize === '4inch';
    const receiptMaxWidth = is4Inch ? '4in' : '350px';

    const fontSizeBody = '25px';
    const fontSizeHeader = '23px';
    const fontSizeTotal = '28px';

    const colGroups = `
    <colgroup>
        <col style="width:32%;"> 
        <col style="width:21%;">
        <col style="width:21%;">
        <col style="width:26%;">
    </colgroup>`;

    const itemsHtml = salesData.map(s => {
        const packs = parseInt(s.packs) || 0;
        const weight = parseFloat(s.weight) || 0;
        const price = parseFloat(s.price_per_kg) || 0;
        const value = (weight * price).toFixed(2);

        return `
    <tr style="font-size:${fontSizeBody}; font-weight:900; vertical-align: bottom;">
        <td style="text-align:left; padding:10px 0; white-space: nowrap;">
            ${s.item_name || ""}<br>${formatNumber(packs)}
        </td>
        <td style="text-align:right; padding:10px 2px; position: relative; left: -70px;">
            ${formatNumber(weight.toFixed(2))}
        </td>
        <td style="text-align:right; padding:10px 2px; position: relative; left: -55px;">${formatNumber(price.toFixed(2))}</td>
        <td style="padding:10px 0; display:flex; flex-direction:column; align-items:flex-end;">
            <div style="font-size:25px; white-space:nowrap;">${s.supplier_code || "ASW"}</div>
            <div style="font-weight:900; white-space:nowrap;">${formatNumber(value)}</div>
        </td>
    </tr>`;
    }).join("");

    const totalSales = salesData.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseFloat(s.price_per_kg) || 0)), 0);
    const totalPackCost = salesData.reduce((sum, s) => sum + ((parseFloat(s.CustomerPackCost) || 0) * (parseFloat(s.packs) || 0)), 0);
    const finalGrandTotal = totalSales + totalPackCost;
    // Use cashGivenAmount for display instead of givenAmount
    const displayGivenAmount = cashGivenAmount > 0 ? cashGivenAmount : givenAmount;
    const remaining = displayGivenAmount > 0 ? Math.abs(displayGivenAmount - finalGrandTotal) : 0;

    const loanRow = globalLoanAmount !== 0 ? `
    <tr>
        <td style="font-size:20px; padding-top:8px;">පෙර ණය:</td>
        <td style="text-align:right; font-size:22px; font-weight:bold; padding-top:8px;">
            Rs. ${formatNumber(Math.abs(globalLoanAmount).toFixed(2))}
        </td>
    </tr>` : '';

    const summaryEntries = Object.entries(consolidatedSummary);
    let summaryHtmlContent = '';
    for (let i = 0; i < summaryEntries.length; i += 2) {
        const [name1, d1] = summaryEntries[i];
        const [name2, d2] = summaryEntries[i + 1] || [null, null];
        const text1 = `${name1}:${formatNumber(d1.totalWeight)}/${formatNumber(d1.totalPacks)}`;
        const text2 = d2 ? `${name2}:${formatNumber(d2.totalWeight)}/${formatNumber(d2.totalPacks)}` : '';
        summaryHtmlContent += `
        <tr>
            <td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap;">${text1}</td>
            <td style="padding:6px; width:50%; font-weight:bold; white-space:nowrap;">${text2}</td>
        </tr>`;
    }

    // In the buildFullReceiptHTML function, update the paymentMethodDisplay section:
    let paymentMethodDisplay = '';
    if (paymentMethod === 'cheque' && paymentDetails) {
        paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">💳 Cheque: ${paymentDetails.bank_name || 'Bank'} | No: ${paymentDetails.cheq_no} | Date: ${paymentDetails.cheq_date}</div>`;
    } else if (paymentMethod === 'bank_to_bank' && paymentDetails) {
        paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">🏦 Bank Transfer: ${paymentDetails.bank_name || 'Bank'} | Ref: ${paymentDetails.reference_no}</div>`;
    } else if (paymentMethod === 'adjustment' && paymentDetails) {
        if (paymentDetails.type === 'bag_to_box') {
            paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">📦 Bag to Box: Rs. ${paymentDetails.amount.toFixed(2)}</div>`;
        } else if (paymentDetails.type === 'bill_to_bill') {
            paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">📄 Bill Transfer: Rs. ${paymentDetails.amount.toFixed(2)}</div>`;
        } else if (paymentDetails.type === 'bad_debt') {
            paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">⚠️ Bad Debt: Rs. ${paymentDetails.amount.toFixed(2)}</div>`;
        }
    } else if (paymentMethod === 'cash') {
        paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">💰 Cash Payment</div>`;
    } else if (paymentMethod === 'credit') {
        const creditAmount = paymentDetails?.amount || 0;
        const remainingDebt = paymentDetails?.remaining_debt || 0;
        const safeCreditAmount = typeof creditAmount === 'number' ? creditAmount : parseFloat(creditAmount || 0);
        const safeRemainingDebt = typeof remainingDebt === 'number' ? remainingDebt : parseFloat(remainingDebt || 0);

        paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center; background-color: #fef3c7; padding: 8px; border-radius: 5px; border: 1px solid #f59e0b;">
        <strong>💳 CREDIT PAYMENT</strong><br>
        Amount: Rs. ${safeCreditAmount.toFixed(2)}<br>
        <span style="color: #dc2626;">Remaining Debt: Rs. ${safeRemainingDebt.toFixed(2)}</span>
    </div>`;
    }

    // Use customerCode directly instead of customer name
    const displayCode = customerCode ? customerCode.toUpperCase() : 'WALKING';

    return `
   <div style="width:${receiptMaxWidth}; margin:0 auto; padding:10px; font-family: 'Courier New', monospace; color:#000; background:#fff;">
        <div style="text-align:center; font-weight:bold;">
            <div style="font-size:24px;">Manju</div>
            <div style="font-size:20px; margin-bottom:5px;font-weight:bold;">colombage lanka (Pvt) Ltd</div>
            
            <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin:12px 0;">
                <span style="border:2.5px solid #000; padding:5px 12px; font-size:22px;">N66</span>
                <span style="border:2.5px solid #000; padding:5px 12px; font-size:38px;">
                    ${displayCode}
                </span>
            </div>
            
            <div style="font-size:16px;">එළවළු,පළතුරු තොග වෙළෙන්දෝ</div>
            <div style="display:flex; justify-content:space-between; font-size:14px; margin-top:6px; padding:0 5px;">
                <span>බණ්ඩාරවෙල</span>
                <span>${time}</span>
            </div>
        </div>

        <div style="font-size:19px; margin-top:10px; padding:0 5px;">
            <div style="font-weight: bold;">දුර: ${mobile || '0777672838 / 071437115'}</div>
            <div style="display:flex; justify-content:space-between; margin-top:3px;">
                <span>බිල් අංකය:<strong style="color: #000; font-weight: bold;">${billNo}</strong></span>
                <span>දිනය:<strong style="color: #000; font-weight: bold;">${date}</strong></span>
            </div>
        </div>

        <hr style="border:none; border-top:2.5px solid #000; margin:10px 0;">

        <!-- ITEMS TABLE WITH PAGE BREAK CONTROL -->
        <div style="page-break-inside: avoid;">
            <table style="width:100%; border-collapse:collapse; font-size:${fontSizeBody}; table-layout: fixed;">
                ${colGroups}
                <thead>
                    <tr style="border-bottom:2.5px solid #000; font-weight:bold;">
                        <th style="text-align:left; padding-bottom:8px; font-size:${fontSizeHeader};">වර්ගය<br>මලු</th>
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -50px; top: 24px;"> කිලෝ </th>
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader}; position: relative; left: -45px;top: 24px;">මිල</th>
                        <th style="text-align:right; padding-bottom:8px; font-size:${fontSizeHeader};">අයිතිය<br>අගය</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
        </div>

        <!-- TOTALS AND SUMMARY TOGETHER - ONLY ONCE -->
        <div style="page-break-before: avoid; page-break-after: avoid;">
            <!-- SUMMARY TABLE -->
            <div style="margin-top:25px; border-top:2.5px solid #000; padding-top:10px;">
                <table style="width:100%; border-collapse:collapse; font-size:14px; text-align:center;">
                    <tbody>
                        ${summaryHtmlContent || '<tr><td colspan="2">No items</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <!-- TOTALS TABLE -->
            <table style="width:100%; margin-top:20px; font-weight:bold; font-size:22px; padding:0 5px; border-collapse:collapse;">
                <tbody>
                    <tr>
                        <td style="width:50%; font-size:20px;">මලු:
                        <td style="width:50%; text-align:right; font-weight:bold;">${formatNumber(totalPackCost.toFixed(2))}
                    </tr>
                    <tr>
                        <td style="font-size:20px; padding-top:8px;">එකතුව:
                        <td style="text-align:right; padding-top:8px;">
                            <span style="border-bottom:5px double #000; border-top:2px solid #000; font-size:${fontSizeTotal}; padding:5px 10px; display:inline-block;">
                                ${Number(finalGrandTotal).toFixed(2)}
                            </span>
                        
                    </tr>
                    ${loanRow}
                    ${displayGivenAmount > 0 ? `
                    <tr>
                        <td style="font-size:18px; padding-top:18px;">දුන් මුදල:
                        <td style="text-align:right; font-size:20px; padding-top:18px; font-weight:bold;">
                            ${formatNumber(parseFloat(displayGivenAmount).toFixed(2))}
                        
                    </tr>
                    <tr>
                        <td style="font-size:22px;">ඉතිරිය:
                        <td style="text-align:right; font-size:26px;">${formatNumber(remaining.toFixed(2))}
                    </table>` : ''}
                </tbody>
            </table>
            ${paymentMethodDisplay}
        </div>

        <div style="text-align:center; margin-top:25px; font-size:13px; border-top:2.5px solid #000; padding-top:10px;">
            <p style="margin:4px 0; font-weight:bold;">භාණ්ඩ පරීක්ෂාකර බලා රැගෙන යන්න</p>
            <p style="margin:4px 0;">නැවත භාර ගනු නොලැබේ</p>
        </div>
    </div>`;
};

// ==================== STYLES ====================
const styles = {
    app: {
        width: '100vw',
        minHeight: '100vh',
        background: '#0dea77',
        margin: 0,
        padding: 0,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    container: {
        width: '100%',
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '24px 32px',
    },
    header: {
        marginBottom: '28px',
    },
    headerTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
    },
    title: {
        fontSize: '28px',
        fontWeight: '700',
        color: '#0f172a',
        margin: 0,
    },
    refreshBtn: {
        background: 'white',
        border: '1px solid #e2e8f0',
        padding: '8px 18px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    },
    subtitle: {
        color: '#64748b',
        fontSize: '14px',
        marginTop: '4px',
    },
    statsRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '20px',
        marginTop: '28px',
        marginBottom: '0',
    },
    statBox: {
        background: 'white',
        borderRadius: '16px',
        padding: '18px 20px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        border: '1px solid #e2e8f0',
    },
    statLabel: {
        fontSize: '13px',
        fontWeight: '500',
        color: '#64748b',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    statNumber: {
        fontSize: '32px',
        fontWeight: '700',
        color: '#0f172a',
    },
    statSub: {
        fontSize: '12px',
        color: '#94a3b8',
        marginTop: '4px',
    },
    searchInput: {
        width: '100%',
        padding: '10px 14px',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        fontSize: '13px',
        background: 'white',
        outline: 'none',
        transition: 'all 0.2s',
    },
    threeColumns: {
        display: 'grid',
        gridTemplateColumns: '0.7fr 2fr 0.7fr',
        gap: '24px',
        alignItems: 'start',
        width: '100%',
    },
    panel: {
        background: '#11ba2d',
        borderRadius: '20px',
        border: '4px solid #000000',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 320px)',
        minHeight: '500px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    },
    panelHeader: {
        padding: '16px 20px',
        background: '#ffffff',
        borderBottom: '1px solid #eef2ff',
    },
    panelTitle: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#1e293b',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    panelContent: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
    },
    billItem: {
        padding: '14px',
        borderRadius: '12px',
        marginBottom: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        border: '1px solid transparent',
    },
    billPending: {
        background: '#ffffff',
        borderColor: '#f1f5f9',
    },
    billSelected: {
        background: '#eff6ff',
        borderColor: '#074ec1',
    },
    billApplied: {
        background: '#f0fdf4',
        borderColor: '#dcfce7',
    },
    billRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    billLeft: {
        flex: 1,
    },
    billNo: {
        fontWeight: '700',
        fontSize: '15px',
        color: '#0f172a',
    },
    billCustomer: {
        fontSize: '12px',
        color: '#000000',
        fontWeight: 'bold',
        marginTop: '2px',
    },
    billRight: {
        textAlign: 'right',
    },
    billTotal: {
        fontWeight: '700',
        fontSize: '15px',
        color: '#0f172a',
    },
    billGiven: {
        fontSize: '11px',
        color: '#64748b',
        marginTop: '2px',
    },
    badge: {
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '500',
        marginTop: '6px',
    },
    badgePending: {
        background: '#fef3c7',
        color: '#d97706',
    },
    badgeApplied: {
        background: '#dcfce7',
        color: '#15803d',
    },
    detailSection: {
        padding: '16px',
        borderBottom: '1px solid #f1f5f9',
    },
    detailLabel: {
        fontSize: '11px',
        fontWeight: '600',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '4px',
    },
    detailValue: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#0f172a',
    },
    itemsTable: {
        width: '100%',
        fontSize: '16px',
        borderCollapse: 'collapse',
        fontWeight: 'bold',
        color: 'black',
    },
    tableHeader: {
        textAlign: 'left',
        padding: '8px 6px',
        color: '#64748b',
        fontWeight: '600',
        borderBottom: '1px solid #e2e8f0',
    },
    tableCell: {
        padding: '8px 6px',
        borderBottom: '1px solid #f1f5f9',
        color: '#334155',
    },
    summaryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        fontSize: '13px',
    },
    totalRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderTop: '2px solid #e2e8f0',
        marginTop: '8px',
        fontWeight: '700',
        fontSize: '15px',
        color: '#0f172a',
    },
    paymentBox: {
        background: '#f8fafc',
        borderRadius: '16px',
        padding: '18px',
        margin: '16px',
    },
    paymentLabel: {
        fontSize: '13px',
        fontWeight: '600',
        color: '#334155',
        marginBottom: '8px',
    },
    paymentInput: {
        width: '100%',
        padding: '14px',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        fontSize: '18px',
        fontWeight: '600',
        textAlign: 'center',
        background: 'white',
        outline: 'none',
    },
    remainingBox: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '12px',
        padding: '10px 0',
        fontSize: '14px',
    },
    hint: {
        fontSize: '11px',
        color: '#94a3b8',
        marginTop: '8px',
        textAlign: 'center',
    },
    printBtn: {
        width: 'calc(100% - 32px)',
        margin: '0 16px 16px 16px',
        padding: '12px',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        fontWeight: '600',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px 20px',
        color: '#94a3b8',
    },
    clearBtn: {
        background: 'transparent',
        border: 'none',
        color: '#64748b',
        cursor: 'pointer',
        fontSize: '12px',
        padding: '4px 8px',
        borderRadius: '6px',
        transition: 'all 0.2s',
    },
    adjustmentBtn: {
        width: 'calc(100% - 32px)',
        margin: '0 16px 8px 16px',
        padding: '12px',
        background: '#f59e0b',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '600',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    },
    cashPaymentBtn: {
        width: 'calc(33.33% - 8px)',
        margin: '0',
        padding: '12px',
        background: '#10b981',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '600',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    },
    chequePaymentBtn: {
        width: 'calc(33.33% - 8px)',
        margin: '0',
        padding: '12px',
        background: '#8b5cf6',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '600',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    },
    bankToBankPaymentBtn: {
        width: 'calc(33.33% - 8px)',
        margin: '0',
        padding: '12px',
        background: '#ec489a',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '600',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    },
    paymentHistoryBtn: {
        width: 'calc(100% - 32px)',
        margin: '0 16px 8px 16px',
        padding: '12px',
        background: '#6366f1',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontWeight: '600',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s',
    },
    paymentButtonsContainer: {
        display: 'flex',
        gap: '12px',
        marginTop: '12px',
        flexWrap: 'wrap',
    },
    paymentTypeBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '10px',
        fontWeight: '500',
        marginTop: '4px',
    }
};

const LoadingSkeleton = () => (
    <div style={styles.app}>
        <div style={styles.container}>
            <div style={{ height: '40px', background: '#e2e8f0', borderRadius: '12px', width: '200px', marginBottom: '24px' }}></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '24px' }}>
                {[1, 2, 3].map(i => <div key={i} style={{ background: 'white', borderRadius: '20px', height: '500px' }}></div>)}
            </div>
        </div>
    </div>
);

const EmptyState = ({ message }) => (
    <div style={styles.emptyState}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
        <p style={{ margin: 0, fontSize: '13px' }}>{message}</p>
    </div>
);

export default function PrintedBills() {
    // Get base path for routing
    const navigate = useNavigate();
    const getBasePath = () => {
        if (window.location.hostname === 'goviraju.lk') {
            return '/sms_new_frontend_50500';
        }
        return '';
    };
    const basePath = getBasePath();

    // Report Modal States
    const [isItemReportModalOpen, setIsItemReportModalOpen] = useState(false);
    const [isWeightReportModalOpen, setIsWeightReportModalOpen] = useState(false);
    const [isGrnSaleReportModalOpen, setIsGrnSaleReportModalOpen] = useState(false);
    const [isSalesAdjustmentReportModalOpen, setIsSalesAdjustmentReportModalOpen] = useState(false);
    const [isGrnSalesOverviewReportOpen, setIsGrnSalesOverviewReportOpen] = useState(false);
    const [isGrnSalesOverviewReport2Open, setIsGrnSalesOverviewReport2Open] = useState(false);
    const [isSalesReportModalOpen, setIsSalesReportModalOpen] = useState(false);
    const [isGrnReportModalOpen, setIsGrnReportModalOpen] = useState(false);
    const [isDayProcessModalOpen, setIsDayProcessModalOpen] = useState(false);

    // User state
    const [user, setUser] = useState(null);
    const [settingValue, setSettingValue] = useState('');

    // Bottom password state
    const [bottomPassword, setBottomPassword] = useState('');
    const [isBottomUnlocked, setIsBottomUnlocked] = useState(true);

    const [state, setState] = useState({
        pendingBills: [],
        appliedBills: [],
        customers: [],
        pendingSearchQuery: "",
        appliedSearchQuery: "",
        selectedBill: null,
        isLoading: true,
        isPrinting: false,
        givenAmountInput: "",
        isUpdatingCompletedBill: false,
        showChequeModal: false,
        pendingChequeAmount: 0,
        showAdjustmentModal: false,
        showBankToBankModal: false,
        pendingBankToBankAmount: 0,
        showPaymentHistoryModal: false,
        currentPayments: [],
        paymentHistoryTotalPaid: 0,
        paymentHistoryTotalBill: 0,
        paymentHistoryRemaining: 0,
        customerType: null,
        showDebtorForm: false,
        pendingDebtorBill: null,
        showReportModal: false,
        showDeleteModal: false,
        deleteBillNo: null,
        deleteCustomerCode: null
    });

    // Fetch user and settings
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }

        const fetchSettings = async () => {
            try {
                const response = await api.get('/settings');
                if (response.data) {
                    setSettingValue(response.data.value || response.data[0]?.value || '');
                }
            } catch (error) {
                console.error("Error fetching settings data:", error);
            }
        };

        fetchSettings();
    }, []);

    // Report Modal Handlers
    const openItemReportModal = () => setIsItemReportModalOpen(true);
    const closeItemReportModal = () => setIsItemReportModalOpen(false);
    const openWeightReportModal = () => setIsWeightReportModalOpen(true);
    const closeWeightReportModal = () => setIsWeightReportModalOpen(false);
    const openGrnSaleReportModal = () => setIsGrnSaleReportModalOpen(true);
    const closeGrnSaleReportModal = () => setIsGrnSaleReportModalOpen(false);
    const openSalesAdjustmentReportModal = () => setIsSalesAdjustmentReportModalOpen(true);
    const closeSalesAdjustmentReportModal = () => setIsSalesAdjustmentReportModalOpen(false);
    const openGrnSalesOverviewReport = () => setIsGrnSalesOverviewReportOpen(true);
    const closeGrnSalesOverviewReport = () => setIsGrnSalesOverviewReportOpen(false);
    const openGrnSalesOverviewReport2 = () => setIsGrnSalesOverviewReport2Open(true);
    const closeGrnSalesOverviewReport2 = () => setIsGrnSalesOverviewReport2Open(false);
    const openSalesReportModal = () => setIsSalesReportModalOpen(true);
    const closeSalesReportModal = () => setIsSalesReportModalOpen(false);
    const openGrnReportModal = () => setIsGrnReportModalOpen(true);
    const closeGrnReportModal = () => setIsGrnReportModalOpen(false);
    const openDayProcessModal = () => setIsDayProcessModalOpen(true);
    const closeDayProcessModal = () => setIsDayProcessModalOpen(false);

    const handleProfitReportClick = () => {
        window.location.href = `${basePath}/supplier-profit`;
    };

    const handleSupplierReportClick = () => {
        window.location.href = `${basePath}/supplierreport`;
    };

    const handleBottomPasswordChange = (e) => {
        setBottomPassword(e.target.value);
    };

    // Bottom nav button style
    const navTextBtn = {
        background: "none",
        border: "none",
        color: "#fff",
        fontWeight: "700",
        fontSize: "14px",
        margin: "0 28px",
        padding: "0",
        cursor: "pointer",
        whiteSpace: "nowrap"
    };

    // ==================== DELETE CONFIRMATION MODAL ====================
    const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, billNo, customerCode }) => {
        const [loading, setLoading] = useState(false);

        if (!isOpen) return null;

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
                zIndex: 20001,
            }} onClick={onClose}>
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '20px',
                    width: '450px',
                    maxWidth: '90%',
                    padding: '24px',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <span style={{ fontSize: '48px' }}>⚠️</span>
                        <h3 style={{ margin: '10px 0 5px 0', fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Delete Payment Record</h3>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                            Are you sure you want to delete all payment records for this bill?
                        </p>
                    </div>

                    <div style={{
                        background: '#fef3c7',
                        padding: '12px',
                        borderRadius: '10px',
                        marginBottom: '20px',
                        fontSize: '13px',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                    }}>
                        <strong>Bill:</strong> {billNo}<br />
                        <strong>Customer:</strong> {customerCode}<br />
                        <strong>Warning:</strong> This will reverse all payments made and cannot be undone!
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '10px 20px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: 'none',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '13px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(billNo)}
                            disabled={loading}
                            style={{
                                padding: '10px 20px',
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '13px',
                                opacity: loading ? 0.6 : 1
                            }}
                        >
                            {loading ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const handleDeleteBillPayments = async (billNo) => {
        setState(prev => ({ ...prev, isPrinting: true }));

        try {
            const response = await api.delete(`/sales/delete-bill-payments/${billNo}`);

            if (response.data.success) {
                alert(`All payments for Bill #${billNo} have been reversed successfully!`);
                await fetchSalesData();

                if (state.selectedBill && state.selectedBill.billNo === billNo) {
                    setState(prev => ({
                        ...prev,
                        selectedBill: null,
                        givenAmountInput: "",
                        isUpdatingCompletedBill: false
                    }));
                }
            } else {
                alert('Failed to delete payments: ' + (response.data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error deleting payments:', error);
            alert('Failed to reverse payments. Please try again.');
        } finally {
            setState(prev => ({
                ...prev,
                isPrinting: false,
                showDeleteModal: false,
                deleteBillNo: null,
                deleteCustomerCode: null
            }));
        }
    };

    const handleContextMenu = (e, bill) => {
        e.preventDefault();
        setState(prev => ({
            ...prev,
            showDeleteModal: true,
            deleteBillNo: bill.billNo,
            deleteCustomerCode: bill.customerCode
        }));
    };

    const formatDecimal = (value) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number(value || 0));
    };

    const fetchSalesData = async () => {
        try {
            const [salesRes, customersRes] = await Promise.all([
                api.get(routes.getAllSales),
                api.get(routes.customers)
            ]);

            const salesData = salesRes.data.sales || salesRes.data || [];
            const customersData = customersRes.data.data || customersRes.data.customers || customersRes.data || [];

            const pendingMap = {};
            const appliedMap = {};

            salesData
                .filter(s => s.bill_printed === 'Y' && s.bill_no)
                .forEach(sale => {
                    const billNo = sale.bill_no;

                    // CRITICAL FIX: Parse payment history correctly
                    let paymentHistory = [];
                    if (sale.payment_history) {
                        try {
                            // Handle both string and array formats
                            paymentHistory = typeof sale.payment_history === 'string'
                                ? JSON.parse(sale.payment_history)
                                : sale.payment_history;

                            // Ensure it's an array
                            if (!Array.isArray(paymentHistory)) {
                                paymentHistory = [];
                            }
                        } catch (e) {
                            console.error('Error parsing payment history for bill:', billNo, e);
                            paymentHistory = [];
                        }
                    }

                    // Calculate amounts from payment history ONLY for this specific bill
                    let creditAmount = 0;
                    let cashPayments = 0;
                    let totalGivenAmount = 0;

                    console.log(`=== Processing Bill ${billNo} ===`);
                    console.log('Payment History Raw:', paymentHistory);
                    console.log('Payment History Length:', paymentHistory.length);

                    paymentHistory.forEach((payment, index) => {
                        const amount = parseFloat(payment.amount) || 0;
                        totalGivenAmount += amount;

                        console.log(`Payment ${index + 1}:`, {
                            method: payment.method,
                            amount: amount,
                            date: payment.date,
                            running_balance: payment.running_balance
                        });

                        if (payment.method === 'Credit') {
                            creditAmount += amount;
                            console.log(`  → Added to CREDIT: +${amount} (Total Credit Now: ${creditAmount})`);
                        } else if (payment.method === 'Cash' || payment.method === 'Cheque' || payment.method === 'Bank Transfer') {
                            cashPayments += amount;
                            console.log(`  → Added to CASH: +${amount} (Total Cash Now: ${cashPayments})`);
                        } else {
                            console.log(`  → Unknown payment method: ${payment.method}, amount: ${amount}`);
                        }
                    });

                    console.log('Final Calculated Values for Bill:', {
                        billNo: billNo,
                        customerCode: sale.customer_code,
                        totalGivenAmount: totalGivenAmount,
                        cashPayments: cashPayments,
                        creditAmount: creditAmount,
                        creditAmountFormatted: `Rs. ${creditAmount.toFixed(2)}`,
                        cashPaymentsFormatted: `Rs. ${cashPayments.toFixed(2)}`,
                        paymentHistoryCount: paymentHistory.length,
                        hasCredit: creditAmount > 0,
                        hasCash: cashPayments > 0
                    });

                    // Also log what's coming from the database as fallback
                    console.log('Database Values (for reference):', {
                        db_given_amount: sale.given_amount,
                        db_given_amount_applied: sale.given_amount_applied,
                        db_credit_transaction: sale.credit_transaction,
                        db_payment_adjustment_type: sale.payment_adjustment_type
                    });

                    // Use calculated amounts, fallback to sale.given_amount if no history
                    const finalGivenAmount = totalGivenAmount > 0 ? totalGivenAmount : (sale.given_amount || 0);
                    const finalCashPayments = cashPayments > 0 ? cashPayments : (sale.given_amount || 0);
                    const finalCreditAmount = creditAmount;

                    console.log(`Bill ${billNo}:`, {
                        given_amount: sale.given_amount,
                        totalGivenAmount,
                        cashPayments: finalCashPayments,
                        creditAmount: finalCreditAmount,
                        paymentHistory: paymentHistory
                    });

                    const isApplied = sale.given_amount_applied === 'Y';
                    const targetMap = isApplied ? appliedMap : pendingMap;

                    if (!targetMap[billNo]) {
                        targetMap[billNo] = {
                            billNo: billNo,
                            customerCode: sale.customer_code,
                            sales: [],
                            totalAmount: 0,
                            givenAmount: finalGivenAmount,
                            cashPayments: finalCashPayments,  // Store cash payments separately
                            creditAmount: finalCreditAmount,   // Store credit separately
                            givenAmountApplied: sale.given_amount_applied || 'N',
                            paymentAdjustmentType: sale.payment_adjustment_type || null,
                            createdAt: sale.created_at,
                            chequeDetails: sale.cheq_no ? { cheq_no: sale.cheq_no, cheq_date: sale.cheq_date, bank_name: sale.bank_name } : null,
                            transferDetails: sale.transfer_reference_no ? { reference_no: sale.transfer_reference_no, transfer_date: sale.transfer_date } : null,
                            paymentHistory: paymentHistory,
                        };
                    }
                    targetMap[billNo].sales.push(sale);
                    targetMap[billNo].totalAmount += (parseFloat(sale.total) || 0) + ((parseFloat(sale.packs) || 0) * (parseFloat(sale.CustomerPackCost) || 0));
                });

            const pendingBillsArray = Object.values(pendingMap).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const appliedBillsArray = Object.values(appliedMap).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            setState(prev => ({
                ...prev,
                pendingBills: pendingBillsArray,
                appliedBills: appliedBillsArray,
                customers: customersData,
                isLoading: false
            }));
        } catch (error) {
            console.error("Error fetching data:", error);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    };

    const fetchPaymentHistory = async (billNo) => {
        try {
            const response = await api.get(`${routes.paymentHistory}/${billNo}`);
            if (response.data.success) {
                // Calculate total paid excluding Credit method payments
                const payments = response.data.payments || [];
                const totalPaidExcludingCredit = payments.reduce((sum, payment) => {
                    // Only add if method is NOT 'Credit'
                    if (payment.method !== 'Credit') {
                        return sum + (parseFloat(payment.amount) || 0);
                    }
                    return sum;
                }, 0);

                setState(prev => ({
                    ...prev,
                    currentPayments: payments,
                    paymentHistoryTotalPaid: totalPaidExcludingCredit, // Use filtered amount
                    paymentHistoryTotalBill: response.data.total_bill || 0,
                    paymentHistoryRemaining: response.data.remaining || 0,
                    showPaymentHistoryModal: true
                }));
            }
        } catch (error) {
            console.error('Error fetching payment history:', error);
            alert('Failed to fetch payment history');
        }
    };

    const checkAndHandleDebtor = async (bill) => {
        console.log('Checking debtor for:', bill.customerCode, 'Customer type:', state.customerType);

        if (state.customerType === 'walking') {
            handleBillClick(bill);
            return;
        }

        try {
            const response = await api.get(`${routes.checkCustomer}/${bill.customerCode}`);
            const data = response.data;
            console.log('Customer check response:', data);

            if (data.exists) {
                if (data.customer && data.customer.Debtor !== 'Y') {
                    await api.put(routes.updateDebtorStatus, {
                        short_name: bill.customerCode,
                        Debtor: 'Y'
                    });
                    console.log('Updated customer as Debtor');
                }
                handleBillClick(bill);
                // ✅ Reset customer type back to walking after handling
                setState(prev => ({ ...prev, customerType: 'walking' }));
            } else {
                console.log('Customer not found, showing debtor form');
                setState(prev => ({
                    ...prev,
                    showDebtorForm: true,
                    pendingDebtorBill: bill
                }));
            }
        } catch (error) {
            console.error('Error checking debtor:', error);
            handleBillClick(bill);
        }
    };

    const handleDebtorSave = async (saved, debtorNo = null) => {
        console.log('Debtor save callback:', saved, 'Debtor No:', debtorNo);
        if (saved && state.pendingDebtorBill) {
            setState(prev => ({
                ...prev,
                customerType: 'walking',  // ✅ Change from 'debtor' to 'walking'
                showDebtorForm: false,
                pendingDebtorBill: null
            }));
            const message = `Customer ${state.pendingDebtorBill.customerCode} has been registered as a Debtor!`;
            const debtorMessage = debtorNo ? `\nDebtor Number: ${debtorNo}` : '';
            const billMessage = state.pendingDebtorBill.billNo ? `\nBill No: ${state.pendingDebtorBill.billNo}` : '';
            alert(message + debtorMessage + billMessage);
        } else {
            setState(prev => ({
                ...prev,
                showDebtorForm: false,
                pendingDebtorBill: null
            }));
        }
    };

    useEffect(() => {
        fetchSalesData();
        const interval = setInterval(fetchSalesData, 30000);
        return () => clearInterval(interval);
    }, []);



    const handleGivenAmountChange = (e) => {
        setState(prev => ({ ...prev, givenAmountInput: e.target.value }));
    };

    const processPayment = async (paymentAmount, isCheque = false, chequeDetails = null, isBankTransfer = false, bankTransferDetails = null, isAdjustment = false, adjustmentDetails = null) => {
        if (!state.selectedBill || state.isPrinting) return;

        setState(prev => ({ ...prev, isPrinting: true }));

        try {
            const currentGiven = state.selectedBill.givenAmount || 0;
            const totalGivenAmount = currentGiven + paymentAmount;
            const isFullySettled = totalGivenAmount >= state.selectedBill.totalAmount;
            const creditTransaction = isFullySettled ? 'N' : 'Y';
            const givenAmountApplied = isFullySettled ? 'Y' : 'N';

            let paymentMethod = 'Cash';
            let paymentMethodForDebtor = 'cash';

            if (isAdjustment && adjustmentDetails) {
                paymentMethod = adjustmentDetails.type;
                if (adjustmentDetails.type === 'bag_to_box') paymentMethodForDebtor = 'bag_to_box';
                else if (adjustmentDetails.type === 'bill_to_bill') paymentMethodForDebtor = 'bill_to_bill';
                else if (adjustmentDetails.type === 'bad_debt') paymentMethodForDebtor = 'bad_debt';
            } else if (isBankTransfer) {
                paymentMethod = 'Bank Transfer';
                paymentMethodForDebtor = 'bank_transfer';
            } else if (isCheque) {
                paymentMethod = 'Cheque';
                paymentMethodForDebtor = 'cheque';
            } else {
                paymentMethodForDebtor = 'cash';
            }

            const payload = {
                bill_no: state.selectedBill.billNo,
                given_amount: totalGivenAmount,
                given_amount_applied: givenAmountApplied,
                credit_transaction: creditTransaction,
                payment_amount: paymentAmount,
                payment_method: paymentMethod,
                is_walking_customer: state.customerType === 'walking'
            };

            let paymentMethodText = 'Cash';
            let paymentDetailsForReceipt = null;

            if (isAdjustment && adjustmentDetails) {
                if (adjustmentDetails.type === 'bag_to_box') {
                    payload.bag_count = adjustmentDetails.bag_count;
                    payload.box_count = adjustmentDetails.box_count;
                    payload.bag_value = adjustmentDetails.bag_value;
                    payload.box_value = adjustmentDetails.box_value;
                    payload.adjustment_amount = adjustmentDetails.amount;
                    paymentMethodText = 'Bag to Box';
                    paymentDetailsForReceipt = {
                        type: 'bag_to_box',
                        amount: adjustmentDetails.amount,
                        bag_count: adjustmentDetails.bag_count,
                        box_count: adjustmentDetails.box_count,
                        bag_value: adjustmentDetails.bag_value,
                        box_value: adjustmentDetails.box_value
                    };
                } else if (adjustmentDetails.type === 'bill_to_bill') {
                    payload.target_customer_code = adjustmentDetails.customer_code;
                    payload.target_bill_no = adjustmentDetails.customer_bill_no;
                    payload.target_bill_value = adjustmentDetails.customer_bill_value;
                    payload.adjustment_amount = adjustmentDetails.amount;
                    paymentMethodText = 'Bill to Bill';
                    paymentDetailsForReceipt = {
                        type: 'bill_to_bill',
                        amount: adjustmentDetails.amount,
                        customer_bill_no: adjustmentDetails.customer_bill_no
                    };
                } else if (adjustmentDetails.type === 'bad_debt') {
                    payload.bad_debt_name = adjustmentDetails.bad_debt_name;
                    payload.bad_debt_amount = adjustmentDetails.bad_debt_amount;
                    payload.adjustment_amount = adjustmentDetails.amount;
                    paymentMethodText = 'Bad Debt';
                    paymentDetailsForReceipt = {
                        type: 'bad_debt',
                        amount: adjustmentDetails.amount,
                        name: adjustmentDetails.bad_debt_name
                    };
                }
            } else if (isBankTransfer && bankTransferDetails) {
                payload.bank_account_id = bankTransferDetails.bank_account_id;
                payload.transfer_reference_no = bankTransferDetails.reference_no;
                payload.transfer_date = bankTransferDetails.transfer_date;
                payload.transfer_notes = bankTransferDetails.notes;
                paymentMethodText = 'Bank Transfer';
                paymentDetailsForReceipt = {
                    reference_no: bankTransferDetails.reference_no,
                    transfer_date: bankTransferDetails.transfer_date
                };
            } else if (isCheque && chequeDetails) {
                payload.cheq_date = chequeDetails.cheq_date;
                payload.cheq_no = chequeDetails.cheq_no;
                payload.bank_account_id = chequeDetails.bank_account_id;
                paymentMethodText = 'Cheque';
                paymentDetailsForReceipt = {
                    cheq_no: chequeDetails.cheq_no,
                    cheq_date: chequeDetails.cheq_date
                };
            }

            // Create payment history entry
            const paymentHistoryEntry = {
                id: Math.random().toString(36).substr(2, 9),
                date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                amount: parseFloat(paymentAmount),
                method: paymentMethod,
                running_balance: parseFloat(totalGivenAmount),
                is_fully_paid: isFullySettled,
                reference: paymentMethod,
                details: {}
            };

            // Add details based on payment method
            if (isCheque && chequeDetails) {
                paymentHistoryEntry.details = {
                    cheq_no: chequeDetails.cheq_no,
                    cheq_date: chequeDetails.cheq_date,
                    bank_account_id: chequeDetails.bank_account_id
                };
            } else if (isBankTransfer && bankTransferDetails) {
                paymentHistoryEntry.details = {
                    transfer_reference_no: bankTransferDetails.reference_no,
                    transfer_date: bankTransferDetails.transfer_date,
                    bank_account_id: bankTransferDetails.bank_account_id
                };
            }

            // Add adjustment details to payment history
            if (isAdjustment && adjustmentDetails) {
                paymentHistoryEntry.details.adjustment = {
                    type: adjustmentDetails.type,
                    amount: adjustmentDetails.amount,
                    ...(adjustmentDetails.type === 'bag_to_box' && {
                        bag_count: adjustmentDetails.bag_count,
                        box_count: adjustmentDetails.box_count,
                        bag_value: adjustmentDetails.bag_value,
                        box_value: adjustmentDetails.box_value
                    }),
                    ...(adjustmentDetails.type === 'bill_to_bill' && {
                        customer_code: adjustmentDetails.customer_code,
                        customer_bill_no: adjustmentDetails.customer_bill_no,
                        customer_bill_value: adjustmentDetails.customer_bill_value
                    }),
                    ...(adjustmentDetails.type === 'bad_debt' && {
                        bad_debt_name: adjustmentDetails.bad_debt_name,
                        bad_debt_amount: adjustmentDetails.bad_debt_amount
                    })
                };
            }

            // CHECK IF THERE'S AN EXISTING DEBTOR RECORD OR CREDIT IN PAYMENT HISTORY
            let existingDebtor = null;
            let totalCreditAmount = state.selectedBill.creditAmount || 0;

            try {
                const debtorCheck = await api.get(`/debtors/${state.selectedBill.billNo}`);
                if (debtorCheck.data.success && debtorCheck.data.data) {
                    existingDebtor = debtorCheck.data.data;
                    console.log('Found existing debtor record:', existingDebtor);
                }
            } catch (e) {
                console.log('No existing debtor record found');
            }

            // If there's credit amount (from payment history) and no debtor record, create one
            if (totalCreditAmount > 0 && !existingDebtor) {
                console.log('Creating debtor record from payment history credit:', totalCreditAmount);
                await api.post('/debtors/create', {
                    bill_no: state.selectedBill.billNo,
                    customer_code: state.selectedBill.customerCode,
                    credit_amount: totalCreditAmount
                });

                // Refetch debtor to get the new record
                const debtorCheck = await api.get(`/debtors/${state.selectedBill.billNo}`);
                if (debtorCheck.data.success && debtorCheck.data.data) {
                    existingDebtor = debtorCheck.data.data;
                }
            }

            // FIX: Update debtor payment for ALL payment types (including adjustments and credit)
            if (existingDebtor && existingDebtor.remaining_amount > 0) {
                let debtorPaymentAmount = 0;

                if (paymentMethod === 'Credit') {
                    debtorPaymentAmount = paymentAmount;
                } else {
                    debtorPaymentAmount = Math.min(paymentAmount, existingDebtor.remaining_amount);
                }

                const isDebtFullyPaid = (existingDebtor.remaining_amount - debtorPaymentAmount) <= 0;

                if (debtorPaymentAmount > 0) {
                    let debtorPaymentMethod = 'cash';
                    if (isAdjustment && adjustmentDetails) {
                        if (adjustmentDetails.type === 'bag_to_box') debtorPaymentMethod = 'bag_to_box';
                        else if (adjustmentDetails.type === 'bill_to_bill') debtorPaymentMethod = 'bill_to_bill';
                        else if (adjustmentDetails.type === 'bad_debt') debtorPaymentMethod = 'bad_debt';
                    } else if (paymentMethod === 'Credit') {
                        debtorPaymentMethod = 'credit';
                    } else if (paymentMethod === 'Cheque') {
                        debtorPaymentMethod = 'cheque';
                    } else if (paymentMethod === 'Bank Transfer') {
                        debtorPaymentMethod = 'bank_transfer';
                    }

                    console.log('Updating debtor payment for:', {
                        type: isAdjustment ? 'adjustment' : paymentMethod,
                        amount: debtorPaymentAmount,
                        method: debtorPaymentMethod
                    });

                    try {
                        const updateResponse = await api.put('/debtors/update-payment', {
                            bill_no: state.selectedBill.billNo,
                            payment_amount: debtorPaymentAmount,
                            payment_method: debtorPaymentMethod
                        });

                        console.log('Debtor update response:', updateResponse.data);

                        // Add debtor payment to history details
                        paymentHistoryEntry.details.debtor_payment = {
                            amount: debtorPaymentAmount,
                            previous_remaining: existingDebtor.remaining_amount,
                            new_remaining: existingDebtor.remaining_amount - debtorPaymentAmount,
                            is_fully_paid: isDebtFullyPaid,
                            settled_way: isDebtFullyPaid ? debtorPaymentMethod : null
                        };

                        // If debt is fully paid, add a special message
                        if (isDebtFullyPaid) {
                            console.log('✅ Debt fully paid! Status updated to "paid" in debtors table');
                        }
                    } catch (debtorError) {
                        console.error('Error updating debtor payment:', debtorError);
                        // Don't stop the main payment process if debtor update fails
                    }
                }
            }

            // Get existing payment history
            let existingHistory = [];
            try {
                const currentHistory = state.selectedBill.payment_history;
                if (currentHistory) {
                    existingHistory = typeof currentHistory === 'string'
                        ? JSON.parse(currentHistory)
                        : currentHistory;
                }
            } catch (e) {
                existingHistory = [];
            }

            existingHistory.push(paymentHistoryEntry);
            payload.payment_history = JSON.stringify(existingHistory);

            const response = await api.put(routes.updateGivenAmountApplied, payload);

            if (response.data.success) {
                await fetchSalesData();

                const event = new CustomEvent('salesDataUpdated', {
                    detail: {
                        billNo: state.selectedBill.billNo,
                        customerCode: state.selectedBill.customerCode,
                        givenAmount: totalGivenAmount,
                        timestamp: Date.now()
                    }
                });
                window.dispatchEvent(event);

                const customer = state.customers.find(c =>
                    String(c.short_name).toUpperCase() === String(state.selectedBill.customerCode).toUpperCase()
                );

                let debtorMessage = '';
                if (existingDebtor && existingDebtor.remaining_amount > 0) {
                    const newRemaining = Math.max(0, existingDebtor.remaining_amount - paymentAmount);
                    const isDebtFullyPaid = newRemaining <= 0;

                    if (isDebtFullyPaid) {
                        debtorMessage = `\n\n✅ DEBT FULLY SETTLED!\n` +
                            `Total Credit: Rs. ${formatDecimal(existingDebtor.credit_amount)}\n` +
                            `Total Paid: Rs. ${formatDecimal(existingDebtor.paid_amount + Math.min(paymentAmount, existingDebtor.remaining_amount))}\n` +
                            `Settled Via: ${paymentMethodForDebtor.toUpperCase()}\n` +
                            `Status: PAID ✓`;
                    } else {
                        debtorMessage = `\n\n💰 DEBTOR UPDATE:\n` +
                            `Paid towards debt: Rs. ${formatDecimal(Math.min(paymentAmount, existingDebtor.remaining_amount))}\n` +
                            `Remaining Debt: Rs. ${formatDecimal(newRemaining)}\n` +
                            `Status: ${newRemaining > 0 ? 'PARTIAL' : 'PAID'}`;
                    }
                } else if (totalCreditAmount > 0 && paymentMethod === 'Cash' && !existingDebtor) {
                    debtorMessage = `\n\n💰 NOTE: This bill has a credit of Rs. ${formatDecimal(totalCreditAmount)}. Your cash payment will be applied to this credit.`;
                }

                // ⭐ ONLY GENERATE RECEIPT IF FULLY SETTLED ⭐
                if (isFullySettled) {
                    if (paymentDetailsForReceipt && response.data.data.bank_name) {
                        paymentDetailsForReceipt.bank_name = response.data.data.bank_name;
                    }

                    // Calculate cash given amount (exclude credit payments)
                    const cashGivenAmount = state.selectedBill.cashPayments || 0;

                    const receiptHtml = buildFullReceiptHTML(
                        state.selectedBill.sales,
                        state.selectedBill.billNo,
                        state.selectedBill.customerCode,
                        customer?.telephone_no || "",
                        0,
                        totalGivenAmount,
                        isAdjustment ? 'adjustment' : (isBankTransfer ? 'bank_to_bank' : (isCheque ? 'cheque' : 'cash')),
                        paymentDetailsForReceipt,
                        '3inch',
                        cashGivenAmount
                    );

                    const printWindow = window.open("", "_blank", "width=800,height=600");
                    if (!printWindow) {
                        alert("Please allow pop-ups for printing");
                        setState(prev => ({ ...prev, isPrinting: false }));
                        return;
                    }

                    printWindow.document.write(`
<html>
    <head><title>Print Bill - ${state.selectedBill.billNo}</title>
    <style>
        body { margin: 0; padding: 20px; font-family: 'Courier New', monospace; } 
        @media print { body { padding: 0; margin: 0; } }
    </style>
</head>
<body>${receiptHtml}
<script>
    window.onload = () => { 
        window.print(); 
    };
    
    window.onafterprint = function() {
        setTimeout(function() {
            window.close();
            window.opener.location.reload();
        }, 500);
    };
    
    setTimeout(function() {
        if (!window.closed) {
            window.close();
            if (window.opener && !window.opener.closed) {
                window.opener.location.reload();
            }
        }
    }, 5000);
<\/script>
</body>
</html>
`);
                    printWindow.document.close();
                }

                // Show appropriate success message
                const statusMessage = givenAmountApplied === 'Y'
                    ? `✅ Payment Complete!\n\nPayment Method: ${paymentMethodText}\nAmount Paid: Rs. ${formatDecimal(paymentAmount)}\nTotal Given: Rs. ${formatDecimal(totalGivenAmount)}\nBill is now FULLY PAID and moved to Completed Payments.${debtorMessage}`
                    : `✓ Payment Added!\n\nPayment Method: ${paymentMethodText}\nAmount Paid: Rs. ${formatDecimal(paymentAmount)}\nTotal Given: Rs. ${formatDecimal(totalGivenAmount)}\nRemaining: Rs. ${formatDecimal(Math.max(0, state.selectedBill.totalAmount - totalGivenAmount))}${debtorMessage}\n\n📝 Receipt will be generated when bill is fully settled.`;

                alert(statusMessage);

                setState(prev => ({
                    ...prev,
                    selectedBill: null,
                    givenAmountInput: "",
                    showChequeModal: false,
                    showBankToBankModal: false,
                    showAdjustmentModal: false,
                    pendingBankToBankAmount: 0
                }));
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Failed to update. Please try again.");
        } finally {
            setState(prev => ({ ...prev, isPrinting: false }));
        }
    };
    // Add this function to check if a bill has pending debt
    const checkBillDebtStatus = async (billNo) => {
        try {
            const response = await api.get(`/debtors/${billNo}`);
            if (response.data.success && response.data.data) {
                return response.data.data;
            }
            return null;
        } catch (error) {
            return null;
        }
    };

    // Add state for debtor info on selected bill
    const [selectedBillDebtor, setSelectedBillDebtor] = useState(null);

    // Update handleBillClick to fetch debtor info
    const handleBillClick = async (bill) => {
        if (state.selectedBill && state.selectedBill.billNo === bill.billNo) {
            setState(prev => ({
                ...prev,
                selectedBill: null,
                givenAmountInput: "",
                isUpdatingCompletedBill: false
            }));
            setSelectedBillDebtor(null);
        } else {
            setState(prev => ({
                ...prev,
                selectedBill: bill,
                givenAmountInput: "",
                isUpdatingCompletedBill: bill.givenAmountApplied === 'Y'
            }));

            // Fetch debtor info for this bill
            const debtorInfo = await checkBillDebtStatus(bill.billNo);
            setSelectedBillDebtor(debtorInfo);
        }
    };

    const handleCashPayment = async () => {
        const paymentAmount = parseFloat(state.givenAmountInput) || 0;
        if (paymentAmount === 0) {
            alert("Please enter an amount");
            return;
        }
        await processPayment(paymentAmount, false, null, false, null, false, null);
    };

    const handleChequePayment = async () => {
        const paymentAmount = parseFloat(state.givenAmountInput) || 0;
        if (paymentAmount === 0) {
            alert("Please enter an amount");
            return;
        }
        setState(prev => ({ ...prev, pendingChequeAmount: paymentAmount, showChequeModal: true }));
    };

    const handleChequeConfirm = async (chequeDetails) => {
        await processPayment(state.pendingChequeAmount, true, chequeDetails, false, null, false, null);
    };

    const handleBankToBankPayment = async () => {
        const paymentAmount = parseFloat(state.givenAmountInput) || 0;
        if (paymentAmount === 0) {
            alert("Please enter an amount");
            return;
        }
        setState(prev => ({ ...prev, pendingBankToBankAmount: paymentAmount, showBankToBankModal: true }));
    };

    const handleBankToBankConfirm = async (transferDetails) => {
        await processPayment(state.pendingBankToBankAmount, false, null, true, transferDetails, false, null);
    };

    const handlePrintWithoutUpdate = async () => {
        if (!state.selectedBill || state.isPrinting) return;

        // CRITICAL: Validate sales data exists
        if (!state.selectedBill.sales || state.selectedBill.sales.length === 0) {
            alert("No sales data found for this bill. Cannot print.");
            return;
        }

        setState(prev => ({ ...prev, isPrinting: true }));

        try {
            const customer = state.customers.find(c =>
                String(c.short_name).toUpperCase() === String(state.selectedBill.customerCode).toUpperCase()
            );

            let paymentMethod = 'cash';
            let paymentDetails = null;

            if (state.selectedBill.paymentAdjustmentType === 'Cheque') {
                paymentMethod = 'cheque';
                paymentDetails = {
                    cheq_no: state.selectedBill.chequeDetails?.cheq_no,
                    cheq_date: state.selectedBill.chequeDetails?.cheq_date,
                    bank_name: state.selectedBill.chequeDetails?.bank_name
                };
            } else if (state.selectedBill.paymentAdjustmentType === 'Bank Transfer') {
                paymentMethod = 'bank_to_bank';
                paymentDetails = {
                    reference_no: state.selectedBill.transferDetails?.reference_no,
                    transfer_date: state.selectedBill.transferDetails?.transfer_date,
                    bank_name: state.selectedBill.bank_name
                };
            }

            // Calculate cash given amount (exclude credit if needed)
            const cashGivenAmount = state.selectedBill.cashPayments || state.selectedBill.givenAmount || 0;

            console.log("Generating receipt with:", {
                salesCount: state.selectedBill.sales.length,
                billNo: state.selectedBill.billNo,
                cashGivenAmount
            });

            const receiptHtml = buildFullReceiptHTML(
                state.selectedBill.sales,
                state.selectedBill.billNo,
                customer?.name || state.selectedBill.customerCode,
                customer?.telephone_no || "",
                0,
                state.selectedBill.givenAmount || 0,
                paymentMethod,
                paymentDetails,
                '3inch',
                cashGivenAmount
            );

            // Validate receipt HTML is not empty
            if (!receiptHtml || receiptHtml.length < 100) {
                throw new Error("Receipt HTML generation failed - content too short");
            }

            const printWindow = window.open("", "_blank", "width=800,height=600");
            if (!printWindow) {
                alert("Please allow pop-ups for printing");
                return;
            }

            // Write with proper error handling
            printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Print Bill - ${state.selectedBill.billNo}</title>
                    <meta charset="UTF-8">
                    <style>
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        body { 
                            margin: 0; 
                            padding: 20px; 
                            font-family: 'Courier New', monospace;
                            background: white;
                        } 
                        @media print { 
                            body { 
                                margin: 0; 
                                padding: 0; 
                                background: white;
                            } 
                        }
                    </style>
                </head>
                <body>
                    ${receiptHtml}
                    <script>
                        (function() {
                            console.log("Print window loaded");
                            window.onload = function() {
                                setTimeout(function() {
                                    window.print();
                                }, 500);
                            };
                            
                            // Listen for print dialog completion
                            window.onafterprint = function() {
                                console.log("Print dialog closed");
                                setTimeout(function() {
                                    window.close();
                                    if (window.opener && !window.opener.closed) {
                                        window.opener.location.reload();
                                    }
                                }, 300);
                            };
                            
                            // Fallback in case onload already fired
                            if (document.readyState === 'complete') {
                                setTimeout(function() {
                                    window.print();
                                }, 500);
                            }
                            
                            // Fallback for browsers that don't support onafterprint
                            setTimeout(function() {
                                if (!window.closed) {
                                    window.close();
                                    if (window.opener && !window.opener.closed) {
                                        window.opener.location.reload();
                                    }
                                }
                            }, 8000);
                        })();
                    <\/script>
                </body>
            </html>
        `);
            printWindow.document.close();

            // Optional: Add error logging for the print window
            printWindow.onerror = function (msg, url, lineNo, columnNo, error) {
                console.error("Print window error:", msg, error);
                alert("Error occurred while printing. Please check console for details.");
                return false;
            };

        } catch (error) {
            console.error("Error in handlePrintWithoutUpdate:", error);
            alert("Error printing bill: " + error.message);
        } finally {
            setState(prev => ({ ...prev, isPrinting: false }));
        }
    };
    const handleApplyAdjustment = async (adjustmentData) => {
        try {
            let adjustmentAmount = 0;

            if (adjustmentData.adjustment_type === 'bag_to_box') {
                adjustmentAmount = Math.abs((adjustmentData.bag_count * adjustmentData.bag_value) + (adjustmentData.box_count * adjustmentData.box_value));
            } else if (adjustmentData.adjustment_type === 'bill_to_bill') {
                adjustmentAmount = adjustmentData.customer_bill_value;
            } else if (adjustmentData.adjustment_type === 'bad_debt') {
                adjustmentAmount = adjustmentData.bad_debt_amount;
            }

            if (adjustmentAmount === 0) {
                alert("Adjustment amount is zero");
                return;
            }

            await processPayment(
                adjustmentAmount,
                false,
                null,
                false,
                null,
                true,
                {
                    type: adjustmentData.adjustment_type,
                    amount: adjustmentAmount,
                    ...adjustmentData
                }
            );

            setState(prev => ({ ...prev, showAdjustmentModal: false }));
        } catch (error) {
            alert('Failed to apply adjustment: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleViewPaymentHistory = () => {
        if (state.selectedBill) {
            fetchPaymentHistory(state.selectedBill.billNo);
        }
    };

    const filterPendingBills = useMemo(() => {
        if (!state.pendingSearchQuery) return state.pendingBills;
        const q = state.pendingSearchQuery.toLowerCase();
        return state.pendingBills.filter(bill =>
            bill.billNo.toString().includes(q) ||
            bill.customerCode.toLowerCase().includes(q)
        );
    }, [state.pendingBills, state.pendingSearchQuery]);
    // Credit payment handler
    const handleCreditPayment = async () => {
        // Get the amount from input field
        let paymentAmount = parseFloat(state.givenAmountInput);

        console.log('=== CREDIT PAYMENT DEBUG ===');
        console.log('Input field raw value:', state.givenAmountInput);
        console.log('Parsed payment amount:', paymentAmount);
        console.log('Selected bill:', state.selectedBill?.billNo);
        console.log('Customer code:', state.selectedBill?.customerCode);
        console.log('Total bill amount:', state.selectedBill?.totalAmount);
        console.log('Already given:', state.selectedBill?.givenAmount);

        // Validate amount
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            alert("Please enter a valid amount greater than 0");
            return;
        }

        if (!state.selectedBill) {
            alert("Please select a bill first");
            return;
        }

        // Check if amount exceeds remaining bill amount
        const remainingBillAmount = state.selectedBill.totalAmount - (state.selectedBill.givenAmount || 0);
        if (paymentAmount > remainingBillAmount) {
            alert(`Amount exceeds remaining bill amount!\n\nRemaining: Rs. ${formatDecimal(remainingBillAmount)}\nEntered: Rs. ${formatDecimal(paymentAmount)}`);
            return;
        }

        // Show confirmation dialog with the exact amount
        const confirmCredit = window.confirm(
            `⚠️ CREDIT PAYMENT CONFIRMATION ⚠️\n\n` +
            `Bill Number: ${state.selectedBill.billNo}\n` +
            `Customer: ${state.selectedBill.customerCode}\n` +
            `Amount: Rs. ${paymentAmount.toFixed(2)}\n` +
            `Remaining Bill Amount: Rs. ${formatDecimal(remainingBillAmount)}\n\n` +
            `This amount will be recorded as DEBT in the debtors table.\n` +
            `Credit Amount: Rs. ${paymentAmount.toFixed(2)}\n` +
            `Remaining Amount: Rs. ${paymentAmount.toFixed(2)}\n\n` +
            `Are you sure you want to proceed?`
        );

        if (!confirmCredit) return;

        await processCreditPayment(paymentAmount);
    };
    // Process credit payment
    // Process credit payment
    // Process credit payment
    const processCreditPayment = async (paymentAmount) => {
        if (!state.selectedBill || state.isPrinting) return;

        console.log('=== PROCESS CREDIT PAYMENT ===');
        console.log('Payment Amount:', paymentAmount);
        console.log('Bill No:', state.selectedBill.billNo);
        console.log('Customer Code:', state.selectedBill.customerCode);
        console.log('Current Given Amount:', state.selectedBill.givenAmount);
        console.log('Total Bill Amount:', state.selectedBill.totalAmount);
        console.log('Sales Data:', state.selectedBill.sales); // Debug log

        setState(prev => ({ ...prev, isPrinting: true }));

        try {
            const currentGiven = state.selectedBill.givenAmount || 0;
            const totalGivenAmount = currentGiven + paymentAmount;
            const isFullySettled = totalGivenAmount >= state.selectedBill.totalAmount;
            const creditTransaction = isFullySettled ? 'N' : 'Y';
            const givenAmountApplied = isFullySettled ? 'Y' : 'N';

            console.log('Calculated Values:', {
                currentGiven,
                totalGivenAmount,
                isFullySettled,
                creditTransaction,
                givenAmountApplied
            });

            // First, create debtor record with the exact payment amount
            const debtorData = {
                bill_no: state.selectedBill.billNo,
                customer_code: state.selectedBill.customerCode,
                credit_amount: parseFloat(paymentAmount)
            };

            console.log('Sending to debtor API:', debtorData);

            const debtorResponse = await api.post('/debtors/create', debtorData);

            console.log('Debtor API Response:', debtorResponse.data);

            if (!debtorResponse.data.success) {
                throw new Error(debtorResponse.data.message || 'Failed to create credit record');
            }

            // Get the remaining debt amount and status from the response
            let remainingDebtAmount = parseFloat(paymentAmount);
            let debtorStatus = 'pending';

            if (debtorResponse.data.data?.remaining_amount !== undefined) {
                remainingDebtAmount = parseFloat(debtorResponse.data.data.remaining_amount);
                debtorStatus = debtorResponse.data.data.status || 'pending';
            } else if (debtorResponse.data.data?.credit_amount !== undefined) {
                remainingDebtAmount = parseFloat(debtorResponse.data.data.credit_amount);
            }

            console.log('Remaining Debt Amount:', remainingDebtAmount);
            console.log('Debtor Status:', debtorStatus);

            // Create payment history entry
            const paymentHistoryEntry = {
                id: Math.random().toString(36).substr(2, 9),
                date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                amount: parseFloat(paymentAmount),
                method: 'Credit',
                running_balance: parseFloat(totalGivenAmount),
                is_fully_paid: isFullySettled,
                reference: 'Credit Payment',
                details: {
                    debtor_id: debtorResponse.data.data?.id,
                    credit_amount: parseFloat(paymentAmount),
                    remaining_debt: remainingDebtAmount,
                    debtor_status: debtorStatus
                }
            };

            // Get existing payment history
            let existingHistory = [];
            try {
                const currentHistory = state.selectedBill.payment_history;
                if (currentHistory) {
                    existingHistory = typeof currentHistory === 'string'
                        ? JSON.parse(currentHistory)
                        : currentHistory;
                }
            } catch (e) {
                console.error('Error parsing existing history:', e);
                existingHistory = [];
            }

            existingHistory.push(paymentHistoryEntry);
            console.log('Updated payment history:', existingHistory);

            // Create the payload object
            const payload = {
                bill_no: state.selectedBill.billNo,
                given_amount: parseFloat(totalGivenAmount),
                given_amount_applied: givenAmountApplied,
                credit_transaction: creditTransaction,
                payment_amount: parseFloat(paymentAmount),
                payment_method: 'Credit',
                payment_history: JSON.stringify(existingHistory),
                is_walking_customer: state.customerType === 'walking'
            };

            console.log('Sending to sales update API:', payload);

            const response = await api.put(routes.updateGivenAmountApplied, payload);

            console.log('Sales update response:', response.data);

            if (response.data.success) {
                // Refresh sales data
                await fetchSalesData();

                // Get customer details
                const customer = state.customers.find(c =>
                    String(c.short_name).toUpperCase() === String(state.selectedBill.customerCode).toUpperCase()
                );

                // ⭐ ONLY GENERATE RECEIPT IF FULLY SETTLED ⭐
                if (isFullySettled) {
                    // Calculate cash given amount (exclude credit payments)
                    const cashGivenAmount = state.selectedBill.cashPayments || 0;

                    console.log('Generating receipt with sales data:', state.selectedBill.sales);

                    // Ensure sales data is valid
                    if (!state.selectedBill.sales || state.selectedBill.sales.length === 0) {
                        console.error('No sales data found for bill:', state.selectedBill.billNo);
                        alert('No sales data found for this bill. Receipt cannot be generated.');
                    } else {
                        // Use the existing buildFullReceiptHTML function which already handles 'credit' payment method
                        const receiptHtml = buildFullReceiptHTML(
                            state.selectedBill.sales,
                            state.selectedBill.billNo,
                            customer?.name || state.selectedBill.customerCode,
                            customer?.telephone_no || "",
                            0,
                            parseFloat(totalGivenAmount),
                            'credit',
                            {
                                amount: parseFloat(paymentAmount),
                                remaining_debt: remainingDebtAmount,
                                debtor_status: debtorStatus
                            },
                            '3inch',
                            cashGivenAmount
                        );

                        console.log('Receipt HTML generated, length:', receiptHtml.length);

                        const printWindow = window.open("", "_blank", "width=800,height=600");
                        if (!printWindow) {
                            alert("Please allow pop-ups for printing");
                            setState(prev => ({ ...prev, isPrinting: false }));
                            return;
                        }

                        // Use a clean HTML structure with the receipt from buildFullReceiptHTML
                        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Credit Bill - ${state.selectedBill.billNo}</title>
                    <meta charset="UTF-8">
                    <style>
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        body { 
                            margin: 0; 
                            padding: 20px; 
                            font-family: 'Courier New', monospace;
                            background: white;
                        } 
                        @media print { 
                            body { 
                                margin: 0; 
                                padding: 0; 
                                background: white;
                            } 
                        }
                    </style>
                </head>
                <body>
                    ${receiptHtml}
                    <script>
                        window.onload = function() { 
                            setTimeout(function() {
                                window.print();
                            }, 500);
                        };
                        
                        // Listen for print dialog completion
                        window.onafterprint = function() {
                            setTimeout(function() {
                                window.close();
                                // Refresh the parent page
                                window.opener.location.reload();
                            }, 500);
                        };
                        
                        // Fallback for browsers that don't support onafterprint
                        setTimeout(function() {
                            if (!window.closed) {
                                window.close();
                                if (window.opener && !window.opener.closed) {
                                    window.opener.location.reload();
                                }
                            }
                        }, 8000);
                    <\/script>
                </body>
            </html>
        `);
                        printWindow.document.close();
                    }
                }

                // Show success message
                const statusMessage = givenAmountApplied === 'Y'
                    ? `✅ Bill Fully Paid!\n\n` +
                    `Payment Method: CREDIT\n` +
                    `Amount Added: Rs. ${formatDecimal(paymentAmount)}\n` +
                    `Total Given: Rs. ${formatDecimal(totalGivenAmount)}\n` +
                    `Remaining Debt: Rs. ${formatDecimal(remainingDebtAmount)}\n` +
                    `Debt Status: ${debtorStatus === 'paid' ? 'FULLY PAID' : 'PENDING'}\n\n` +
                    `Bill is now FULLY PAID.`
                    : `✓ Credit Added Successfully!\n\n` +
                    `Amount: Rs. ${formatDecimal(paymentAmount)}\n` +
                    `Total Given: Rs. ${formatDecimal(totalGivenAmount)}\n` +
                    `Remaining on Bill: Rs. ${formatDecimal(Math.max(0, state.selectedBill.totalAmount - totalGivenAmount))}\n` +
                    `Remaining Debt: Rs. ${formatDecimal(remainingDebtAmount)}\n` +
                    `Debt Status: ${debtorStatus === 'paid' ? 'FULLY PAID' : (debtorStatus === 'partial' ? 'PARTIAL PAYMENT' : 'PENDING')}\n\n` +
                    `⚠️ This amount has been recorded as DEBT and needs to be collected later.\n` +
                    `📝 Receipt will be generated when bill is fully settled.`;

                alert(statusMessage);

                // Reset state
                setState(prev => ({
                    ...prev,
                    selectedBill: null,
                    givenAmountInput: "",
                    showChequeModal: false,
                    showBankToBankModal: false,
                    showAdjustmentModal: false,
                    pendingBankToBankAmount: 0
                }));
            } else {
                throw new Error(response.data.message || 'Failed to update sales record');
            }
        } catch (error) {
            console.error("Error processing credit payment:", error);
            let errorMessage = "Failed to process credit payment. ";

            if (error.response) {
                console.error("Error response:", error.response.data);
                errorMessage += error.response.data?.message || error.message;
            } else if (error.request) {
                console.error("Error request:", error.request);
                errorMessage += "No response from server. Please check your connection.";
            } else {
                errorMessage += error.message;
            }

            alert(errorMessage);
        } finally {
            setState(prev => ({ ...prev, isPrinting: false }));
        }
    };
    // Add this function to check debtor settlement status
    const getDebtorStatusMessage = (debtor) => {
        if (!debtor) return null;

        if (debtor.status === 'paid') {
            return {
                message: '✅ This credit has been FULLY PAID!',
                color: '#10b981',
                bgColor: '#d1fae5'
            };
        } else if (debtor.status === 'partial') {
            return {
                message: `💰 Partial payment made. Remaining: Rs. ${formatDecimal(debtor.remaining_amount)}`,
                color: '#d97706',
                bgColor: '#fef3c7'
            };
        } else if (debtor.status === 'pending') {
            return {
                message: `⚠️ Outstanding credit: Rs. ${formatDecimal(debtor.remaining_amount)}. Please collect payment.`,
                color: '#dc2626',
                bgColor: '#fee2e2'
            };
        }
        return null;
    };
    const filterAppliedBills = useMemo(() => {
        if (!state.appliedSearchQuery) return state.appliedBills;
        const q = state.appliedSearchQuery.toLowerCase();
        return state.appliedBills.filter(bill =>
            bill.billNo.toString().includes(q) ||
            bill.customerCode.toLowerCase().includes(q)
        );
    }, [state.appliedBills, state.appliedSearchQuery]);

    const stats = useMemo(() => {
        const totalPending = filterPendingBills.length;
        const totalApplied = filterAppliedBills.length;
        const pendingAmount = filterPendingBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
        const appliedAmount = filterAppliedBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
        const pendingGiven = filterPendingBills.reduce((sum, bill) => sum + (bill.givenAmount || 0), 0);
        const appliedGiven = filterAppliedBills.reduce((sum, bill) => sum + (bill.givenAmount || 0), 0);

        return {
            totalPending, totalApplied,
            totalAmount: pendingAmount + appliedAmount,
            totalGiven: pendingGiven + appliedGiven,
        };
    }, [filterPendingBills, filterAppliedBills]);

    const getPaymentTypeBadge = (type) => {
        const badges = {
            'Cash': { icon: '💰', text: 'Cash', color: '#10b981' },
            'Cheque': { icon: '💳', text: 'Cheque', color: '#8b5cf6' },
            'Bank Transfer': { icon: '🏦', text: 'Bank Transfer', color: '#ec489a' },
            'bag_to_box': { icon: '📦', text: 'Bag to Box', color: '#f59e0b' },
            'bill_to_bill': { icon: '📄', text: 'Bill to Bill', color: '#3b82f6' },
            'bad_debt': { icon: '⚠️', text: 'Bad Debt', color: '#ef4444' }
        };
        return badges[type] || badges['Cash'];
    };
    // Helper function to calculate total credit amount from payment history
    const calculateCreditAmountFromHistory = (paymentHistory) => {
        if (!paymentHistory || !Array.isArray(paymentHistory)) return 0;

        let totalCredit = 0;
        paymentHistory.forEach(payment => {
            // Only count if method is exactly 'Credit' (case sensitive)
            if (payment.method === 'Credit') {
                const amount = parseFloat(payment.amount) || 0;
                totalCredit += amount;
                console.log(`Credit payment found: Rs. ${amount}`); // Debug log
            }
        });
        console.log(`Total credit from history: Rs. ${totalCredit}`); // Debug log
        return totalCredit;
    };

    // Helper function to calculate total cash/cheque/bank transfer payments from payment history
    const calculateCashPaymentsFromHistory = (paymentHistory) => {
        if (!paymentHistory || !Array.isArray(paymentHistory)) return 0;

        let totalCash = 0;
        paymentHistory.forEach(payment => {
            // Cash, Cheque, Bank Transfer are actual money received
            if (payment.method === 'Cash' || payment.method === 'Cheque' || payment.method === 'Bank Transfer') {
                const amount = parseFloat(payment.amount) || 0;
                totalCash += amount;
                console.log(`Cash payment found (${payment.method}): Rs. ${amount}`); // Debug log
            }
        });
        console.log(`Total cash from history: Rs. ${totalCash}`); // Debug log
        return totalCash;
    };

    const selectedBillTotals = state.selectedBill ? state.selectedBill.sales.reduce((acc, s) => {
        const weight = parseFloat(s.weight) || 0;
        const price = parseFloat(s.price_per_kg) || 0;
        const packs = parseFloat(s.packs) || 0;
        const packCost = parseFloat(s.CustomerPackCost) || 0;
        acc.billTotal += (weight * price);
        acc.totalBagPrice += (packs * packCost);
        return acc;
    }, { billTotal: 0, totalBagPrice: 0 }) : { billTotal: 0, totalBagPrice: 0 };

    const finalPayable = selectedBillTotals.billTotal + selectedBillTotals.totalBagPrice;
    const currentGiven = parseFloat(state.givenAmountInput) || 0;

    useEffect(() => {
        if (state.selectedBill && !state.isUpdatingCompletedBill) {
            const remainingAmount = Math.max(0, finalPayable - (state.selectedBill.givenAmount || 0));
            if (!state.givenAmountInput || parseFloat(state.givenAmountInput) === 0) {
                setState(prev => ({ ...prev, givenAmountInput: remainingAmount.toString() }));
            }
        }
    }, [state.selectedBill, finalPayable, state.selectedBill?.givenAmount]);

    if (state.isLoading) return <LoadingSkeleton />;

    return (
        <div style={styles.app}>
            <div style={styles.container}>
                <div style={styles.threeColumns}>
                    {/* LEFT: Completed Payments */}
                    <div style={styles.panel}>
                        <div style={styles.panelHeader}>
                            <h2 style={styles.panelTitle}>
                                <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '50%', display: 'inline-block' }}></span>
                                Completed Payments
                                <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>(Right-click to delete)</span>
                            </h2>
                        </div>
                        <div style={{ padding: '12px 16px 0 16px' }}>
                            <input
                                type="text"
                                placeholder="🔍 Search completed bills..."
                                value={state.appliedSearchQuery}
                                onChange={(e) =>
                                    setState(prev => ({
                                        ...prev,
                                        appliedSearchQuery: e.target.value.toUpperCase()
                                    }))
                                }
                                style={styles.searchInput}
                            />
                        </div>
                        <div style={styles.panelContent}>
                            {filterAppliedBills.length === 0 ? (
                                <EmptyState message="No completed bills" />
                            ) : (
                                filterAppliedBills.map(bill => {
                                    return (
                                        <div
                                            key={bill.billNo}
                                            style={{
                                                ...styles.billItem,
                                                ...styles.billApplied,
                                                ...(state.selectedBill?.billNo === bill.billNo && state.isUpdatingCompletedBill ? styles.billSelected : {})
                                            }}
                                            onClick={() => handleBillClick(bill)}
                                            onContextMenu={(e) => handleContextMenu(e, bill)}
                                            title="Right-click to delete payments"
                                        >
                                            <div style={styles.billRow}>
                                                <div style={styles.billLeft}>
                                                    <div style={styles.billNo}>{bill.billNo}</div>
                                                    <div style={styles.billCustomer}>{bill.customerCode}</div>
                                                </div>
                                                <div style={styles.billRight}>
                                                    <div style={styles.billTotal}>Rs. {formatDecimal(bill.totalAmount)}</div>
                                                    {/* FIXED: Use cashPayments instead of givenAmount */}
                                                    {bill.cashPayments > 0 && <div style={styles.billGiven}>Given: {formatDecimal(bill.cashPayments)}</div>}
                                                    {bill.creditAmount > 0 && !bill.isCreditFullySettled && (
                                                        <div style={{ fontSize: '10px', color: '#d97706', marginTop: '2px' }}>
                                                            💳 Credit: Rs. {formatDecimal(bill.remainingCredit || bill.creditAmount)} remaining
                                                            {bill.remainingCredit < bill.creditAmount && (
                                                                <span style={{ fontSize: '9px', marginLeft: '4px', color: '#059669' }}>
                                                                    (Paid: Rs. {formatDecimal(bill.creditAmount - bill.remainingCredit)})
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                    {/* CENTER: Bill Details */}
                    <div style={{
                        background: 'white',
                        borderRadius: '20px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        height: 'calc(100vh - 320px)',
                        minHeight: '500px',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.02)'
                    }}>
                        {/* Customer Type Selector */}
                        <div style={{ padding: '16px 20px 0 20px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                            <CustomerTypeSelector
                                selectedType={state.customerType}
                                onSelect={(type) => setState(prev => ({ ...prev, customerType: type }))}
                                disabled={state.isPrinting}
                                onDebtorClick={(customerCode, billNo) => {
                                    setState(prev => ({
                                        ...prev,
                                        showDebtorForm: true,
                                        pendingDebtorBill: { customerCode: customerCode, billNo: billNo }
                                    }));
                                }}
                                billCustomerCode={state.selectedBill?.customerCode || null}
                                billNo={state.selectedBill?.billNo || null}
                            />
                        </div>

                        <div style={{
                            padding: '16px 20px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            borderBottom: '1px solid rgba(255,255,255,0.2)',
                        }}>
                            <h2 style={{
                                fontSize: '16px',
                                fontWeight: '600',
                                color: 'white',
                                margin: 0,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px'
                            }}>
                                <span style={{
                                    width: '10px',
                                    height: '10px',
                                    background: '#fbbf24',
                                    borderRadius: '50%',
                                    display: 'inline-block',
                                    boxShadow: '0 0 8px #fbbf24'
                                }}></span>
                                Bill Details
                                {state.selectedBill && (
                                    <button
                                        style={{
                                            background: 'rgba(255,255,255,0.2)',
                                            border: 'none',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            transition: 'all 0.2s',
                                            marginLeft: 'auto'
                                        }}
                                        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
                                        onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
                                        onClick={() => setState(prev => ({ ...prev, selectedBill: null, givenAmountInput: "", isUpdatingCompletedBill: false }))}
                                    >
                                        ✕ Clear
                                    </button>
                                )}
                            </h2>
                        </div>

                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '20px',
                            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
                        }}>
                            {state.selectedBill ? (
                                <>
                                    {/* Bill Info Section */}
                                    <div style={{
                                        padding: '20px',
                                        background: 'white',
                                        borderRadius: '16px',
                                        marginBottom: '16px',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Bill Number</div>
                                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>#{state.selectedBill.billNo}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Customer</div>
                                                <div style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>{state.selectedBill.customerCode}</div>
                                            </div>
                                            <div>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '4px 14px',
                                                    borderRadius: '20px',
                                                    fontSize: '11px',
                                                    fontWeight: '500',
                                                    background: state.selectedBill.givenAmountApplied === 'Y' ? '#10b981' : '#f59e0b',
                                                    color: 'white',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                }}>
                                                    {state.selectedBill.givenAmountApplied === 'Y' ? '✓ PAID' : '⏳ PENDING'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Already Given Section with Credit Info - FIXED */}
                                        <div style={{
                                            marginTop: '16px',
                                            padding: '12px',
                                            background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                                            borderRadius: '12px',
                                            borderLeft: '4px solid #10b981'
                                        }}>
                                            <div style={{ fontSize: '13px', color: '#065f46', fontWeight: '500' }}>
                                                💰 Cash Given: Rs. {formatDecimal(state.selectedBill.cashPayments || 0)}
                                                {state.selectedBill.paymentAdjustmentType && (
                                                    <div style={{ fontSize: '11px', marginTop: '6px', color: '#047857' }}>
                                                        Payment Type: {
                                                            state.selectedBill.paymentAdjustmentType === 'Cheque' ? '💳 Cheque Payment' :
                                                                state.selectedBill.paymentAdjustmentType === 'Bank Transfer' ? '🏦 Bank Transfer' :
                                                                    state.selectedBill.paymentAdjustmentType === 'bag_to_box' ? '📦 Bag to Box Adjustment' :
                                                                        state.selectedBill.paymentAdjustmentType === 'bill_to_bill' ? '📄 Bill to Bill Transfer' :
                                                                            state.selectedBill.paymentAdjustmentType === 'bad_debt' ? '⚠️ Bad Debt Write-off' : '💰 Cash Payment'
                                                        }
                                                    </div>
                                                )}
                                            </div>

                                            {/* Show Credit Amount if exists */}
                                            {state.selectedBill.creditAmount > 0 && (
                                                <div style={{
                                                    marginTop: '8px',
                                                    padding: '8px',
                                                    background: '#fef3c7',
                                                    borderRadius: '8px',
                                                    borderLeft: '3px solid #f59e0b'
                                                }}>
                                                    <div style={{ fontSize: '12px', color: '#92400e' }}>
                                                        💳 Credit Taken: Rs. {formatDecimal(state.selectedBill.creditAmount)}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px' }}>
                                                        ⚠️ This amount is recorded as CREDIT and needs to be paid in cash
                                                    </div>
                                                </div>
                                            )}

                                            {/* Show Total Cash Given (Without Credit) - UPDATED */}
                                            <div style={{
                                                marginTop: '8px',
                                                padding: '8px',
                                                background: '#e0f2fe',
                                                borderRadius: '8px',
                                                borderLeft: '3px solid #3b82f6'
                                            }}>
                                                <div style={{ fontSize: '12px', color: '#1e40af' }}>
                                                    📊 Total Cash Given: Rs. {formatDecimal(state.selectedBill.cashPayments || 0)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Display Debtor Information if exists */}
                                        {selectedBillDebtor && selectedBillDebtor.remaining_amount > 0 && (
                                            <div style={{
                                                marginTop: '16px',
                                                padding: '12px',
                                                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                                borderRadius: '12px',
                                                borderLeft: '4px solid #f59e0b'
                                            }}>
                                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>
                                                    💰 Outstanding Debt Information
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.6' }}>
                                                    <div>Total Credit Taken: <strong>Rs. {formatDecimal(selectedBillDebtor.credit_amount)}</strong></div>
                                                    <div>Amount Paid: <strong>Rs. {formatDecimal(selectedBillDebtor.paid_amount)}</strong></div>
                                                    <div>Remaining Debt: <strong style={{ color: selectedBillDebtor.remaining_amount > 0 ? '#dc2626' : '#10b981' }}>
                                                        Rs. {formatDecimal(selectedBillDebtor.remaining_amount)}
                                                    </strong></div>
                                                    <div>Settled Via: <strong>{selectedBillDebtor.settled_way || 'Not settled yet'}</strong></div>
                                                    <div>Status: <strong style={{
                                                        color: selectedBillDebtor.status === 'paid' ? '#10b981' :
                                                            selectedBillDebtor.status === 'partial' ? '#d97706' : '#dc2626'
                                                    }}>
                                                        {selectedBillDebtor.status === 'paid' ? '✓ FULLY PAID' :
                                                            selectedBillDebtor.status === 'partial' ? '⏳ PARTIAL PAYMENT' : '⚠️ PENDING'}
                                                    </strong></div>
                                                    <div style={{ fontSize: '11px', marginTop: '6px', color: '#92400e' }}>
                                                        ⚠️ Any payment made will automatically be applied to this debt first!
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Display fully paid debtor message - Only when credit_amount equals paid_amount */}
                                        {selectedBillDebtor && (
                                            (() => {
                                                // Parse values as numbers to ensure proper comparison
                                                const creditAmount = parseFloat(selectedBillDebtor.credit_amount) || 0;
                                                const paidAmount = parseFloat(selectedBillDebtor.paid_amount) || 0;

                                                // Check if credit is fully paid (credit_amount equals paid_amount AND remaining_amount is 0)
                                                const isFullyPaid = creditAmount === paidAmount && creditAmount > 0;

                                                if (isFullyPaid) {
                                                    return (
                                                        <div style={{
                                                            marginTop: '16px',
                                                            padding: '12px',
                                                            background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                                                            borderRadius: '12px',
                                                            borderLeft: '4px solid #10b981'
                                                        }}>
                                                            <div style={{ fontSize: '13px', color: '#065f46', fontWeight: '500' }}>
                                                                ✅ Credit Fully Settled!
                                                                <div style={{ fontSize: '11px', marginTop: '4px', color: '#047857' }}>
                                                                    Credit Amount: Rs. {formatDecimal(creditAmount)} | Paid: Rs. {formatDecimal(paidAmount)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()
                                        )}
                                    </div>

                                    {/* Items Table Section */}
                                    <div style={{
                                        padding: '20px',
                                        background: 'white',
                                        borderRadius: '16px',
                                        marginBottom: '16px',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                                            📋 Items
                                        </div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', fontSize: '16px', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: '#f1f5f9' }}>
                                                        <th style={{ padding: '10px 8px', textAlign: 'left', color: '#475569', fontWeight: '600', borderBottom: '2px solid #e2e8f0' }}>Sup Code</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'left', color: '#475569', fontWeight: '600', borderBottom: '2px solid #e2e8f0' }}>Item</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right', color: '#475569', fontWeight: '600', borderBottom: '2px solid #e2e8f0' }}>Wt (kg)</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right', color: '#475569', fontWeight: '600', borderBottom: '2px solid #e2e8f0' }}>Price/kg</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'center', color: '#475569', fontWeight: '600', borderBottom: '2px solid #e2e8f0' }}>Packs</th>
                                                        <th style={{ padding: '10px 8px', textAlign: 'right', color: '#475569', fontWeight: '600', borderBottom: '2px solid #e2e8f0' }}>Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {state.selectedBill.sales.map((sale, idx) => {
                                                        const total = (parseFloat(sale.weight) || 0) * (parseFloat(sale.price_per_kg) || 0);
                                                        return (
                                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
                                                                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                                                                <td style={{ padding: '10px 8px', color: '#334155' }}>{sale.supplier_code}</td>
                                                                <td style={{ padding: '10px 8px', color: '#334155', fontWeight: '500' }}>{sale.item_name}</td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', color: '#334155' }}>{formatDecimal(sale.weight)}</td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', color: '#334155' }}>{formatDecimal(sale.price_per_kg)}</td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#334155' }}>{sale.packs}</td>
                                                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold', color: '#059669' }}>{formatDecimal(total)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Totals Section */}
                                    <div style={{
                                        padding: '20px',
                                        background: 'white',
                                        borderRadius: '16px',
                                        marginBottom: '16px',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', color: '#475569' }}>
                                            <span>Subtotal:</span>
                                            <span>Rs. {formatDecimal(selectedBillTotals.billTotal)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', color: '#475569' }}>
                                            <span>Bag Charges:</span>
                                            <span>Rs. {formatDecimal(selectedBillTotals.totalBagPrice)}</span>
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            padding: '12px 0',
                                            marginTop: '8px',
                                            fontWeight: '700',
                                            fontSize: '16px',
                                            color: '#0f172a',
                                            borderTop: '2px solid #e2e8f0'
                                        }}>
                                            <span>Total Payable:</span>
                                            <span>Rs. {formatDecimal(finalPayable)}</span>
                                        </div>

                                        {/* Cash Given Section - FIXED to use cashPayments */}
                                        {(state.selectedBill.cashPayments > 0 || state.selectedBill.givenAmount > 0) && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', color: '#059669', fontWeight: 'bold', marginTop: '8px' }}>
                                                <span>Cash Given:</span>
                                                <span>Rs. {formatDecimal(state.selectedBill.cashPayments || state.selectedBill.givenAmount)}</span>
                                            </div>
                                        )}

                                        {/* Credit Taken Section */}
                                        {state.selectedBill.creditAmount > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', color: '#d97706', fontWeight: 'bold' }}>
                                                <span>Credit Taken:</span>
                                                <span>Rs. {formatDecimal(state.selectedBill.creditAmount)}</span>
                                            </div>
                                        )}

                                        {/* Remaining to Pay - Includes Credit */}
                                        {/* Remaining to Pay - Correct calculation without adding credit twice */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            padding: '12px 0',
                                            fontSize: '16px',
                                            color: '#dc2626',
                                            fontWeight: 'bold',
                                            borderTop: '2px solid #fee2e2',
                                            marginTop: '8px',
                                            backgroundColor: '#fef2f2',
                                            borderRadius: '8px'
                                        }}>
                                            <span>💰 Remaining to Pay (Cash):</span>
                                            <span>Rs. {formatDecimal(Math.max(0, finalPayable - (state.selectedBill.cashPayments || state.selectedBill.givenAmount || 0)))}</span>
                                        </div>

                                        {state.selectedBill.creditAmount > 0 && (
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', textAlign: 'center' }}>
                                                * Credit amount needs to be paid in cash. Total remaining includes credit amount.
                                            </div>
                                        )}
                                    </div>

                                    {/* Payment Section */}
                                    <div style={{
                                        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                        borderRadius: '16px',
                                        padding: '20px',
                                        marginBottom: '12px',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', marginBottom: '12px' }}>
                                            💰 Enter Payment Amount
                                        </div>

                                        <input
                                            type="number"
                                            value={state.givenAmountInput}
                                            onChange={handleGivenAmountChange}
                                            placeholder="0.00"
                                            disabled={state.isPrinting}
                                            style={{
                                                width: '100%',
                                                padding: '14px',
                                                border: '2px solid #fbbf24',
                                                borderRadius: '12px',
                                                fontSize: '18px',
                                                fontWeight: '600',
                                                textAlign: 'center',
                                                background: 'white',
                                                outline: 'none',
                                                transition: 'all 0.2s'
                                            }}
                                        />

                                        {/* Show payment breakdown if there's credit */}
                                        {state.selectedBill && state.selectedBill.creditAmount > 0 && currentGiven > 0 && (
                                            <div style={{
                                                marginTop: '12px',
                                                padding: '10px',
                                                background: '#fef3c7',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                border: '1px solid #fde68a'
                                            }}>
                                                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#92400e' }}>💰 Payment Breakdown:</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', color: '#dc2626' }}>
                                                    <span>First goes to Credit:</span>
                                                    <strong>Rs. {formatDecimal(Math.min(currentGiven, state.selectedBill.creditAmount))}</strong>
                                                </div>
                                                {currentGiven > state.selectedBill.creditAmount && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                                                        <span>Then to Current Bill:</span>
                                                        <strong>Rs. {formatDecimal(currentGiven - state.selectedBill.creditAmount)}</strong>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', padding: '10px 0', fontSize: '14px' }}>
                                            <span>After Payment:</span>
                                            <span style={{ fontWeight: 'bold', color: '#065f46', fontSize: '16px' }}>
                                                Rs. {formatDecimal(((state.selectedBill.cashPayments || state.selectedBill.givenAmount || 0) + currentGiven))}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                                            <button onClick={handleCashPayment} disabled={state.isPrinting || currentGiven === 0} style={{ flex: 1, padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: currentGiven === 0 ? 'not-allowed' : 'pointer', opacity: currentGiven === 0 ? 0.5 : 1 }}>💵 Cash</button>
                                            <button onClick={handleChequePayment} disabled={state.isPrinting || currentGiven === 0} style={{ flex: 1, padding: '12px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: currentGiven === 0 ? 'not-allowed' : 'pointer', opacity: currentGiven === 0 ? 0.5 : 1 }}>💳 Cheque</button>
                                            <button onClick={handleBankToBankPayment} disabled={state.isPrinting || currentGiven === 0} style={{ flex: 1, padding: '12px', background: '#ec489a', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: currentGiven === 0 ? 'not-allowed' : 'pointer', opacity: currentGiven === 0 ? 0.5 : 1 }}>🏦 Bank Transfer</button>
                                            <button onClick={handleCreditPayment} disabled={state.isPrinting || currentGiven === 0} style={{ flex: 1, padding: '12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: currentGiven === 0 ? 'not-allowed' : 'pointer', opacity: currentGiven === 0 ? 0.5 : 1 }}>💳 Credit</button>
                                        </div>
                                    </div>

                                    <button onClick={handlePrintWithoutUpdate} disabled={state.isPrinting} style={{ width: '100%', marginBottom: '12px', padding: '12px', background: '#64748b', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>🖨️ Re-print Bill</button>
                                    <button onClick={() => setState(prev => ({ ...prev, showAdjustmentModal: true }))} style={{ width: '100%', marginBottom: '12px', padding: '12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>🔧 Payment Adjustment</button>
                                    <button onClick={handleViewPaymentHistory} style={{ width: '100%', padding: '12px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>📜 View Payment History</button>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                                    <p>Click on any bill to view details and process payment</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: Pending Payment */}
                    <div style={styles.panel}>
                        <div style={styles.panelHeader}>
                            <h2 style={styles.panelTitle}>
                                <span style={{ width: '10px', height: '10px', background: '#f59e0b', borderRadius: '50%', display: 'inline-block' }}></span>
                                Pending Payment
                            </h2>
                        </div>
                        <div style={{ padding: '12px 16px 0 16px' }}>
                            <input
                                type="text"
                                placeholder="🔍 Search pending bills..."
                                value={state.pendingSearchQuery}
                                onChange={(e) =>
                                    setState(prev => ({
                                        ...prev,
                                        pendingSearchQuery: e.target.value.toUpperCase()
                                    }))
                                }
                                style={styles.searchInput}
                            />
                        </div>
                        <div style={styles.panelContent}>
                            {filterPendingBills.length === 0 ? (
                                <EmptyState message="No pending bills" />
                            ) : (
                                filterPendingBills.map(bill => {
                                    return (
                                        <div
                                            key={bill.billNo}
                                            style={{
                                                ...styles.billItem,
                                                ...styles.billPending,
                                                ...(state.selectedBill?.billNo === bill.billNo && !state.isUpdatingCompletedBill ? styles.billSelected : {})
                                            }}
                                            onClick={() => checkAndHandleDebtor(bill)}
                                        >
                                            <div style={styles.billRow}>
                                                <div style={styles.billLeft}>
                                                    <div style={styles.billNo}>{bill.billNo}</div>
                                                    <div style={styles.billCustomer}>{bill.customerCode}</div>
                                                </div>
                                                <div style={styles.billRight}>
                                                    <div style={styles.billTotal}>Rs. {formatDecimal(bill.totalAmount)}</div>
                                                    {bill.givenAmount > 0 && <div style={styles.billGiven}>Given: {formatDecimal(bill.givenAmount)}</div>}
                                                    {bill.creditAmount > 0 && !bill.isCreditFullySettled && (
                                                        <div style={{ fontSize: '10px', color: '#d97706', marginTop: '2px' }}>
                                                            💳 Credit: Rs. {formatDecimal(bill.remainingCredit || bill.creditAmount)} remaining
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div style={styles.statsRow}>
                    <div style={styles.statBox}>
                        <div style={styles.statLabel}>Pending</div>
                        <div style={styles.statNumber}>{stats.totalPending}</div>
                        <div style={styles.statSub}>bills awaiting payment</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statLabel}>Completed</div>
                        <div style={styles.statNumber}>{stats.totalApplied}</div>
                        <div style={styles.statSub}>bills paid</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statLabel}>Total Amount</div>
                        <div style={styles.statNumber}>Rs. {formatDecimal(stats.totalAmount)}</div>
                        <div style={styles.statSub}>all bills total</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statLabel}>Total Given</div>
                        <div style={styles.statNumber}>Rs. {formatDecimal(stats.totalGiven)}</div>
                        <div style={styles.statSub}>amount received</div>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-dark fixed-bottom" style={{ backgroundColor: '#004d00', width: '100%', zIndex: 1000 }}>
                <div className="container-fluid d-flex justify-content-start align-items-center">
                    <button
                        style={{
                            padding: '8px 15px',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            backgroundColor: '#e83e8c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                        }}
                        onClick={() => navigate('/debtor-creditor-report')}
                    >
                        CD Report
                    </button>
                    {[
                        { label: 'එළවළු', onClick: openItemReportModal },
                        { label: 'බර මත', onClick: openWeightReportModal },
                        { label: 'වෙනස් කිරීම', onClick: openSalesAdjustmentReportModal },
                        { label: 'ආදායම් / වියදම්', onClick: () => window.location.href = `${basePath}/financial-report` },
                        { label: 'විකුණුම් වාර්තාව', onClick: openSalesReportModal },
                        { label: 'සැපයුම් ලාභ ', onClick: handleProfitReportClick },
                        { label: 'සැපයුම් වාර්තාව', onClick: handleSupplierReportClick }
                    ].map((btn, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={btn.onClick}
                            style={{
                                ...navTextBtn,
                                fontSize: '16px',
                                fontWeight: '700',
                                letterSpacing: '0.5px',
                                opacity: 1,
                                pointerEvents: 'auto',
                                marginRight: '15px'
                            }}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </nav>

            {/* ALL MODALS GO HERE */}
            <ChequeModal
                isOpen={state.showChequeModal}
                onClose={() => setState(prev => ({ ...prev, showChequeModal: false, pendingChequeAmount: 0 }))}
                onConfirm={handleChequeConfirm}
                amount={state.pendingChequeAmount}
            />

            <BankToBankModal
                isOpen={state.showBankToBankModal}
                onClose={() => setState(prev => ({ ...prev, showBankToBankModal: false, pendingBankToBankAmount: 0 }))}
                onConfirm={handleBankToBankConfirm}
                amount={state.pendingBankToBankAmount}
                customerCode={state.selectedBill?.customerCode}
                customerName={state.selectedBill ? state.customers.find(c =>
                    String(c.short_name).toUpperCase() === String(state.selectedBill.customerCode).toUpperCase()
                )?.name : ''}
            />

            <PaymentAdjustmentModal
                isOpen={state.showAdjustmentModal}
                onClose={() => setState(prev => ({ ...prev, showAdjustmentModal: false }))}
                onConfirm={handleApplyAdjustment}
                billNo={state.selectedBill?.billNo}
                customerCode={state.selectedBill?.customerCode}
                originalBillTotal={state.selectedBill?.totalAmount || 0}
            />

            <PaymentHistoryModal
                isOpen={state.showPaymentHistoryModal}
                onClose={() => setState(prev => ({ ...prev, showPaymentHistoryModal: false }))}
                payments={state.currentPayments}
                totalPaid={state.paymentHistoryTotalPaid}
                totalBill={state.paymentHistoryTotalBill}
                remaining={state.paymentHistoryRemaining}
            />

            <DebtorFormModal
                isOpen={state.showDebtorForm}
                onClose={() => setState(prev => ({ ...prev, showDebtorForm: false, pendingDebtorBill: null }))}
                onSave={handleDebtorSave}
                customerCode={state.pendingDebtorBill?.customerCode || ''}
                billNo={state.pendingDebtorBill?.billNo || null}
            />

            <DeleteConfirmationModal
                isOpen={state.showDeleteModal}
                onClose={() => setState(prev => ({ ...prev, showDeleteModal: false, deleteBillNo: null, deleteCustomerCode: null }))}
                onConfirm={handleDeleteBillPayments}
                billNo={state.deleteBillNo}
                customerCode={state.deleteCustomerCode}
            />

            {/* Report Modals */}
            <ItemReportModal isOpen={isItemReportModalOpen} onClose={closeItemReportModal} onGenerateReport={() => { }} loading={false} />
            <WeightReportModal isOpen={isWeightReportModalOpen} onClose={closeWeightReportModal} />
            <GrnSaleReportModal isOpen={isGrnSaleReportModalOpen} onClose={closeGrnSaleReportModal} />
            <SalesAdjustmentReportModal isOpen={isSalesAdjustmentReportModalOpen} onClose={closeSalesAdjustmentReportModal} />
            <GrnSalesOverviewReport isOpen={isGrnSalesOverviewReportOpen} onClose={closeGrnSalesOverviewReport} />
            <GrnSalesOverviewReport2 isOpen={isGrnSalesOverviewReport2Open} onClose={closeGrnSalesOverviewReport2} />
            <SalesReportModal isOpen={isSalesReportModalOpen} onClose={closeSalesReportModal} />
            <GrnReportModal isOpen={isGrnReportModalOpen} onClose={closeGrnReportModal} />
            <DayProcessModal isOpen={isDayProcessModalOpen} onClose={closeDayProcessModal} />
        </div>
    );
}