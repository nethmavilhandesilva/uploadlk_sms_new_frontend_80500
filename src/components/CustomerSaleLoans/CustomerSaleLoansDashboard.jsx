import React from 'react';
import LoansDashboard from '../Loans/LoansDashboard';

// Loans created automatically from every sales entry line; settled by cash,
// bank transfer or cheque.
const CUSTOMER_LOANS_CONFIG = {
    title: 'පාරිභෝගික ණය · Customer Loans',
    subtitle: 'Every sales line is a loan. Settle with cash, bank transfer or cheque.',
    summaryUrl: '/customer-sale-loans',
    detailUrl: (code) => `/customer-sale-loans/${encodeURIComponent(code)}`,
    paymentUrl: (code) => `/customer-sale-loans/${encodeURIComponent(code)}/payments`,
    deletePaymentUrl: (id) => `/customer-sale-loan-payments/${id}`,
    listKey: 'customers',
    codeField: 'customer_code',
    nameField: 'customer_name',
    partyLabel: 'Customer',
    partyPlural: 'Customers',
    partyIcon: 'groups',
    paidLabel: 'Collected',
    outstandingSub: 'Still owed by customers',
    methods: ['cash', 'cheque', 'bank_transfer'],
    cheques: true,
};

const CustomerSaleLoansDashboard = () => <LoansDashboard config={CUSTOMER_LOANS_CONFIG} />;

export default CustomerSaleLoansDashboard;
