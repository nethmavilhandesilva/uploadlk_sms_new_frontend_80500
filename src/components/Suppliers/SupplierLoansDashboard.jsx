import React from 'react';
import LoansDashboard from '../Loans/LoansDashboard';

// Loans created from every supplier transaction entry line; settled by cash
// or bank transfer (no cheques).
const SUPPLIER_LOANS_CONFIG = {
    title: 'සැපයුම්කරු ණය · Supplier Loans',
    subtitle: 'Every supplier transaction line is a loan. Settle with cash or bank transfer.',
    summaryUrl: '/supplier-transaction-loans',
    detailUrl: (code) => `/supplier-transaction-loans/${encodeURIComponent(code)}`,
    paymentUrl: (code) => `/supplier-transaction-loans/${encodeURIComponent(code)}/payments`,
    deletePaymentUrl: (id) => `/supplier-transaction-payments/${id}`,
    listKey: 'suppliers',
    codeField: 'supplier_code',
    nameField: 'supplier_name',
    partyLabel: 'Supplier',
    partyPlural: 'Suppliers',
    partyIcon: 'local_shipping',
    paidLabel: 'Paid',
    outstandingSub: 'Still outstanding with suppliers',
    methods: ['cash', 'bank_transfer'],
    cheques: false,
};

const SupplierLoansDashboard = () => <LoansDashboard config={SUPPLIER_LOANS_CONFIG} />;

export default SupplierLoansDashboard;
