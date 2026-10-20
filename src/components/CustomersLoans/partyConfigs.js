// Labels and endpoints for the opening balance section, balance report and loan
// statement, which are shared between customers and suppliers.
//   customers: paid back ('old') and sales bills add, loans taken ('today') deducts.
//   suppliers: same — added to loan and supplier bills add, loan paid deducts.
// In the API rows, 'loans_taken' is always the amount that ADDS and 'paid_back' the
// amount that DEDUCTS; addLabel / deductLabel say what they mean for each party.

export const CUSTOMER_PARTY = {
    key: 'customer',
    api: '/customer-balances',
    listApi: '/customers',
    listCode: (c) => c.short_name,
    label: 'Customer',
    labelSi: 'පාරිභෝගික',
    plural: 'customers',
    addLabel: 'Paid back',
    deductLabel: 'Loans taken',
    addPill: 'Paid back',
    deductPill: 'Loan taken',
    hasBills: true,
    positiveIsCredit: true,
    formula: 'opening balance + paid back − loans taken + bills',
    homePath: '/customers-loans/list',
    homeLabel: 'Customer Loans Management',
    balancesPath: '/customers-loans/balances',
    statementPath: '/customers-loans/statement',
    titles: {
        opening: 'පාරිභෝගික ආරම්භක ශේෂය · Customer Opening Balances',
        report: 'සියලු පාරිභෝගික ශේෂ වාර්තාව · All Customers Balance',
        statement: 'පාරිභෝගික ණය විස්තර වාර්තාව · Customer Loan Statement',
    },
};

export const SUPPLIER_PARTY = {
    key: 'supplier',
    api: '/supplier-balances',
    listApi: '/suppliers',
    listCode: (s) => s.code,
    label: 'Supplier',
    labelSi: 'සැපයුම්කරු',
    plural: 'suppliers',
    addLabel: 'Added to loan',
    deductLabel: 'Loan paid',
    addPill: 'Added',
    deductPill: 'Paid',
    hasBills: true,
    positiveIsCredit: true,
    formula: 'opening balance + added to loan − loan paid + bills',
    homePath: '/farmer-loans',
    homeLabel: 'Farmer Loans Management',
    balancesPath: '/farmer-loans/balances',
    statementPath: '/farmer-loans/statement',
    titles: {
        opening: 'සැපයුම්කරු ආරම්භක ශේෂය · Supplier Opening Balances',
        report: 'සියලු සැපයුම්කරු ශේෂ වාර්තාව · All Suppliers Balance',
        statement: 'සැපයුම්කරු ණය විස්තර වාර්තාව · Supplier Loan Statement',
    },
};
