import api from '../../../api';

/**
 * API Service Layer with error handling and request cancellation
 * Centralizes all API calls for the PrintedBills component
 */

class BillsAPIService {
  constructor() {
    this.activeRequests = new Map();
    this.requestTimeout = 30000; // 30 second timeout
  }

  /**
   * Create abort signal with timeout
   */
  createAbortSignal(timeoutMs = this.requestTimeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timeoutId),
      abort: () => controller.abort()
    };
  }

  /**
   * Cancel specific request by key
   */
  cancelRequest(key) {
    if (this.activeRequests.has(key)) {
      const { abort, cleanup } = this.activeRequests.get(key);
      abort();
      cleanup();
      this.activeRequests.delete(key);
    }
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests() {
    this.activeRequests.forEach(({ abort, cleanup }) => {
      try {
        abort();
        cleanup();
      } catch (e) {
        console.warn('Error cancelling request:', e);
      }
    });
    this.activeRequests.clear();
  }

  /**
   * Wrap API call with error handling
   */
  async handleRequest(key, apiCall, options = {}) {
    try {
      // Cancel previous request with same key
      this.cancelRequest(key);

      const abortSignal = this.createAbortSignal(options.timeout || this.requestTimeout);
      this.activeRequests.set(key, abortSignal);

      const response = await apiCall(abortSignal.signal);
      abortSignal.cleanup();
      this.activeRequests.delete(key);

      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      if (this.activeRequests.has(key)) {
        const abortSignal = this.activeRequests.get(key);
        abortSignal.cleanup();
        this.activeRequests.delete(key);
      }

      // Handle abort errors
      if (error.name === 'AbortError') {
        console.warn(`Request ${key} was cancelled or timed out`);
        return {
          success: false,
          error: 'Request timeout or was cancelled',
          isTimeout: true
        };
      }

      // Handle network errors
      if (error.message === 'Network Error') {
        return {
          success: false,
          error: 'Network connection failed',
          isNetworkError: true
        };
      }

      // Handle API errors
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
      const status = error.response?.status || 500;

      console.error(`API Error [${key}]:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        status,
        raw: error
      };
    }
  }

  // ==================== SALES DATA ====================

  async fetchAllSales(params = {}, options = {}) {
    return this.handleRequest('fetchAllSales', (signal) =>
      api.get('/sales/all-with-filter', { params, signal }),
      options
    );
  }

  async fetchArchivedSales(params = {}, options = {}) {
    return this.handleRequest('fetchArchivedSales', (signal) =>
      api.get('/sales/archived', { params, signal }),
      options
    );
  }

  async updateSalesPayment(payload, options = {}) {
    return this.handleRequest('updateSalesPayment', (signal) =>
      api.put('/sales/update-given-amount-applied', payload, { signal }),
      options
    );
  }

  async deleteBillPayments(billNo, options = {}) {
    return this.handleRequest('deleteBillPayments', (signal) =>
      api.delete(`/sales/delete-bill-payments/${billNo}`, { signal }),
      options
    );
  }

  async getPaymentHistory(billNo, options = {}) {
    return this.handleRequest('getPaymentHistory', (signal) =>
      api.get(`/sales/payment-history/${billNo}`, { signal }),
      options
    );
  }

  // ==================== CUSTOMERS ====================

  async fetchCustomers(options = {}) {
    return this.handleRequest('fetchCustomers', (signal) =>
      api.get('/customers', { signal }),
      options
    );
  }

  async checkCustomer(code, options = {}) {
    return this.handleRequest('checkCustomer', (signal) =>
      api.get(`/customers/check-short-name/${code}`, { signal }),
      options
    );
  }

  async updateDebtorStatus(payload, options = {}) {
    return this.handleRequest('updateDebtorStatus', (signal) =>
      api.put('/customers/update-debtor-status', payload, { signal }),
      options
    );
  }

  async updateCustomerAndDebtor(payload, options = {}) {
    return this.handleRequest('updateCustomerAndDebtor', (signal) =>
      api.put('/sales/update-customer-and-debtor', payload, { signal }),
      options
    );
  }

  async registerCustomer(formData, options = {}) {
    return this.handleRequest('registerCustomer', (signal) =>
      api.post('/customers', formData, { signal, headers: { 'Content-Type': 'multipart/form-data' } }),
      options
    );
  }

  // ==================== DEBTORS ====================

  async fetchDebtorData(billNo, options = {}) {
    return this.handleRequest('fetchDebtorData', (signal) =>
      api.get(`/debtors/${billNo}`, { signal }),
      options
    );
  }

  async createDebtor(payload, options = {}) {
    return this.handleRequest('createDebtor', (signal) =>
      api.post('/debtors/create', payload, { signal }),
      options
    );
  }

  async updateDebtorPayment(payload, options = {}) {
    return this.handleRequest('updateDebtorPayment', (signal) =>
      api.put('/debtors/update-payment', payload, { signal }),
      options
    );
  }

  // ==================== BANKS ====================

  async fetchBanks(options = {}) {
    return this.handleRequest('fetchBanks', (signal) =>
      api.get('/banks', { signal }),
      options
    );
  }

  // ==================== CASHIER ====================

  async recordCashierTransaction(payload, options = {}) {
    return this.handleRequest('recordCashierTransaction', (signal) =>
      api.post('/cashier-balance/record-payment', payload, { signal }),
      options
    );
  }

  async fetchRemainingBalances(params = {}, options = {}) {
    return this.handleRequest('fetchRemainingBalances', (signal) =>
      api.get('/cashier-balance/remaining-balances', { params, signal }),
      options
    );
  }

  async fetchUniqueCodes(options = {}) {
    return this.handleRequest('fetchUniqueCodes', (signal) =>
      api.get('/sales/unique-codes', { signal }),
      options
    );
  }

  // ==================== SUPPLIER LOANS ====================

  async fetchAdjustedSupplierLoan(totalFunds, options = {}) {
    return this.handleRequest('fetchAdjustedSupplierLoan', (signal) =>
      api.get('/supplier-loans/adjusted-total', { 
        params: { total_funds: totalFunds },
        signal 
      }),
      options
    );
  }

  // ==================== CLEANUP ====================

  /**
   * Cleanup method to call on component unmount
   */
  cleanup() {
    this.cancelAllRequests();
  }
}

// Export singleton instance
export const billsAPI = new BillsAPIService();

export default billsAPI;
