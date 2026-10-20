import api from '../api';

const cashierBalanceService = {
    // Get remaining balances for all banks (optionally filtered by cashier)
    getRemainingBalances: async (cashierName = 'all') => {
        try {
            const response = await api.get('/cashier-balance/remaining-balances', {
                params: { cashier_name: cashierName }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching remaining balances:', error);
            throw error;
        }
    },

    // Get allocated funds breakdown
    getAllocatedFunds: async () => {
        try {
            const response = await api.get('/cashier-balance/allocated-funds');
            return response.data;
        } catch (error) {
            console.error('Error fetching allocated funds:', error);
            throw error;
        }
    },

    // Get allocated breakdown
    getAllocatedBreakdown: async () => {
        try {
            const response = await api.get('/cashier-balance/allocated-breakdown');
            return response.data;
        } catch (error) {
            console.error('Error fetching allocated breakdown:', error);
            throw error;
        }
    },

    // Get net available amount
    getNetAvailableAmount: async () => {
        try {
            const response = await api.get('/cashier-balance/net-available');
            return response.data;
        } catch (error) {
            console.error('Error fetching net available amount:', error);
            throw error;
        }
    },

    // Get detailed balance
    getDetailedBalance: async () => {
        try {
            const response = await api.get('/cashier-balance/detailed-balance');
            return response.data;
        } catch (error) {
            console.error('Error fetching detailed balance:', error);
            throw error;
        }
    },

    // Allocate funds
    allocateFunds: async (fundsData) => {
        try {
            const response = await api.post('/cashier-balance/allocate-funds', fundsData);
            return response.data;
        } catch (error) {
            console.error('Error allocating funds:', error);
            throw error;
        }
    }
};

export default cashierBalanceService;