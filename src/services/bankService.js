import api from '../api';

const bankService = {
    // Get all banks with balances from all four tables
    async getAllBanksWithBalances() {
        try {
            const response = await api.get('/banks/all-with-balances');
            return response.data;
        } catch (error) {
            console.error('Error fetching banks with balances:', error);
            throw error;
        }
    },

    // Get all banks
    async getAllBanks() {
        try {
            const response = await api.get('/banks');
            return response.data;
        } catch (error) {
            console.error('Error fetching banks:', error);
            throw error;
        }
    },

    // Get banks list for dropdown
    async getBanksList() {
        try {
            const response = await api.get('/banks/list');
            return response.data;
        } catch (error) {
            console.error('Error fetching banks list:', error);
            throw error;
        }
    },

    // Create a new bank
    async createBank(data) {
        try {
            const response = await api.post('/banks', data);
            return response.data;
        } catch (error) {
            console.error('Error creating bank:', error);
            throw error;
        }
    },

    // Update a bank
    async updateBank(id, data) {
        try {
            const response = await api.put(`/banks/${id}`, data);
            return response.data;
        } catch (error) {
            console.error('Error updating bank:', error);
            throw error;
        }
    },

    // Delete a bank
    async deleteBank(id) {
        try {
            const response = await api.delete(`/banks/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error deleting bank:', error);
            throw error;
        }
    },

    // Get bank balance details for a specific bank
    async getBankBalanceDetails(id) {
        try {
            const response = await api.get(`/banks/${id}/balance-details`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank balance details:', error);
            throw error;
        }
    },

    // Get bank dashboard with summary
    async getBankDashboard(startDate, endDate) {
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            
            const response = await api.get(`/bank-accounts/dashboard?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank dashboard:', error);
            throw error;
        }
    },

    // Get bank transactions
    async getBankTransactions(bankAccountId, params = {}) {
        try {
            const queryParams = new URLSearchParams(params);
            const url = bankAccountId 
                ? `/bank-accounts/transactions/${bankAccountId}?${queryParams.toString()}`
                : `/bank-accounts/transactions?${queryParams.toString()}`;
            const response = await api.get(url);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank transactions:', error);
            throw error;
        }
    },

    // Get bank statement with filters (date range and include unrealized)
    async getBankStatement(bankId, params = '') {
        try {
            const response = await api.get(`/banks/${bankId}/statement?${params}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank statement:', error);
            throw error;
        }
    },

    // Get all accounts statement
    async getAllAccountsStatement(startDate, endDate) {
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            
            const response = await api.get(`/bank-accounts/statement/all?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching all accounts statement:', error);
            throw error;
        }
    },

    // Get statement for a specific bank account
    async getStatement(bankAccountId, startDate, endDate) {
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            
            const response = await api.get(`/bank-accounts/statement/${bankAccountId}?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank statement:', error);
            throw error;
        }
    },

    // Get unrealized cheques for a specific bank with date filters
    async getUnrealizedCheques(bankId, params = '') {
        try {
            const response = await api.get(`/banks/${bankId}/unrealized-cheques?${params}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching unrealized cheques:', error);
            throw error;
        }
    },

    // NEW: Get bank cheques from Sales and SalesHistory tables
    async getBankCheques(bankAccountId) {
        try {
            const response = await api.get(`/cheque-report/bank-cheques/${bankAccountId}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank cheques:', error);
            throw error;
        }
    },

    // Get cheque report
    async getChequeReport(params = {}) {
        try {
            const queryParams = new URLSearchParams(params);
            const response = await api.get(`/bank-accounts/cheques-report?${queryParams.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching cheque report:', error);
            throw error;
        }
    },

    // Get cheque payments report (from bank-accounts/cheques)
    async getChequePaymentsReport(params = {}) {
        try {
            const queryParams = new URLSearchParams(params);
            const response = await api.get(`/bank-accounts/cheques?${queryParams.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching cheque payments report:', error);
            throw error;
        }
    },

    // Get bank transfer report
    async getBankTransferReport(params = {}) {
        try {
            const queryParams = new URLSearchParams(params);
            const response = await api.get(`/bank-accounts/bank-transfers?${queryParams.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank transfer report:', error);
            throw error;
        }
    },

    // Get monthly summary for charts
    async getMonthlySummary(year) {
        try {
            const params = new URLSearchParams();
            if (year) params.append('year', year);
            const response = await api.get(`/bank-accounts/monthly-summary?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching monthly summary:', error);
            throw error;
        }
    },

    // Export transactions
    async exportTransactions(params = {}) {
        try {
            const queryParams = new URLSearchParams(params);
            const response = await api.get(`/bank-accounts/export?${queryParams.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error exporting transactions:', error);
            throw error;
        }
    },

    // Get single transaction
    async getTransaction(id) {
        try {
            const response = await api.get(`/bank-accounts/transactions/${id}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching transaction:', error);
            throw error;
        }
    },

    // Get bank balance
    async getBankBalance(bankAccountId) {
        try {
            const response = await api.get(`/bank-accounts/balance/${bankAccountId}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bank balance:', error);
            throw error;
        }
    }
    
};

export default bankService;