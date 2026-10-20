import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook to manage PrintedBills component state
 * Consolidates complex state logic into a single place
 */
export const usePrintedBillsState = () => {
  const [viewOldBills, setViewOldBills] = useState(() => {
    const saved = localStorage.getItem('printedBills_viewOldBills');
    return saved === 'true';
  });

  const [startDate, setStartDate] = useState(() => {
    return localStorage.getItem('printedBills_startDate') || '';
  });

  const [endDate, setEndDate] = useState(() => {
    return localStorage.getItem('printedBills_endDate') || '';
  });

  const [selectedUniqueCode, setSelectedUniqueCode] = useState(() => {
    return localStorage.getItem('printedBills_selectedUniqueCode') || 'all';
  });

  const [billCustomerTypes, setBillCustomerTypes] = useState(() => {
    try {
      const saved = localStorage.getItem('billCustomerTypes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [state, setState] = useState({
    pendingBills: [],
    appliedBills: [],
    customers: [],
    pendingSearchQuery: '',
    appliedSearchQuery: '',
    selectedBill: null,
    isLoading: true,
    isPrinting: false,
    givenAmountInput: '',
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
    showDeleteModal: false,
    deleteBillNo: null,
    deleteCustomerCode: null,
    adjustmentType: 'bag_to_box',
    bagCount: '',
    boxCount: '',
    bagValue: '',
    boxValue: '',
    customerCodeField: '',
    customerBillNo: '',
    customerBillValue: '',
    badDebtName: '',
    badDebtAmount: ''
  });

  const [archivedData, setArchivedData] = useState({
    pendingBills: [],
    appliedBills: [],
    isLoading: false
  });

  const [dataSource, setDataSource] = useState(() => {
    return localStorage.getItem('printedBills_dataSource') || 'sales';
  });

  // Refs for tracking state
  const viewOldBillsRef = useRef(viewOldBills);
  const startDateRef = useRef(startDate);
  const endDateRef = useRef(endDate);
  const selectedUniqueCodeRef = useRef(selectedUniqueCode);
  const isMountedRef = useRef(true);
  const modalOpenRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const isChangingFilterRef = useRef(false);
  const lastRequestAbortRef = useRef(null);

  // Update refs when state changes
  const updateRefs = useCallback(() => {
    viewOldBillsRef.current = viewOldBills;
    startDateRef.current = startDate;
    endDateRef.current = endDate;
    selectedUniqueCodeRef.current = selectedUniqueCode;
  }, [viewOldBills, startDate, endDate, selectedUniqueCode]);

  // Persist view settings to localStorage
  const persistSettings = useCallback(() => {
    localStorage.setItem('printedBills_viewOldBills', viewOldBills);
    localStorage.setItem('printedBills_startDate', startDate);
    localStorage.setItem('printedBills_endDate', endDate);
    localStorage.setItem('printedBills_dataSource', dataSource);
    localStorage.setItem('printedBills_selectedUniqueCode', selectedUniqueCode);
    localStorage.setItem('billCustomerTypes', JSON.stringify(billCustomerTypes));
  }, [viewOldBills, startDate, endDate, dataSource, selectedUniqueCode, billCustomerTypes]);

  // Save bill customer type
  const saveBillCustomerType = useCallback((billNo, type) => {
    console.log(`Saving customer type "${type}" for bill #${billNo}`);
    setBillCustomerTypes(prev => ({
      ...prev,
      [billNo]: type
    }));
  }, []);

  // Cancel pending requests
  const cancelPendingRequest = useCallback(() => {
    if (lastRequestAbortRef.current) {
      lastRequestAbortRef.current.abort();
      lastRequestAbortRef.current = null;
    }
  }, []);

  // Create new abort controller for request
  const getAbortSignal = useCallback(() => {
    cancelPendingRequest();
    lastRequestAbortRef.current = new AbortController();
    return lastRequestAbortRef.current.signal;
  }, [cancelPendingRequest]);

  return {
    // State
    viewOldBills,
    setViewOldBills,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectedUniqueCode,
    setSelectedUniqueCode,
    billCustomerTypes,
    setBillCustomerTypes,
    state,
    setState,
    archivedData,
    setArchivedData,
    dataSource,
    setDataSource,
    
    // Refs
    viewOldBillsRef,
    startDateRef,
    endDateRef,
    selectedUniqueCodeRef,
    isMountedRef,
    modalOpenRef,
    isRefreshingRef,
    isChangingFilterRef,
    
    // Methods
    updateRefs,
    persistSettings,
    saveBillCustomerType,
    cancelPendingRequest,
    getAbortSignal
  };
};
