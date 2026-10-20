import React from 'react';
import CustomerOpeningBalances from '../CustomersLoans/CustomerOpeningBalances';
import CustomerBalanceReport from '../CustomersLoans/CustomerBalanceReport';
import CustomerLoanStatement from '../CustomersLoans/CustomerLoanStatement';
import { SUPPLIER_PARTY } from '../CustomersLoans/partyConfigs';

// Supplier versions of the customer opening balance section, balance report and
// loan statement (built on the farmer loans page entries + supplier opening balance).
export const SupplierOpeningBalances = () => <CustomerOpeningBalances party={SUPPLIER_PARTY} />;
export const SupplierBalanceReport = () => <CustomerBalanceReport party={SUPPLIER_PARTY} />;
export const SupplierLoanStatement = () => <CustomerLoanStatement party={SUPPLIER_PARTY} />;
