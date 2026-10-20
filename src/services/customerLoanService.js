// Shared client: adds the login token and the configured API base URL.
import api from '../api';

export const customerLoanService = {
    // Today's loans + GRN codes come from /customers-loans/data; the form also needs the customer list.
    getAll: async () => {
        const [loans, customers] = await Promise.all([api.get('/customers-loans/data'), api.get('/customers')]);
        const customerList = Array.isArray(customers.data) ? customers.data : (customers.data?.data || []);
        return { data: { ...loans.data, customers: customerList } };
    },
    getCustomerLoanTotal: (customerId) => api.get(`/customers-loans/${customerId}/total`),
    create: (data) => api.post('/customers-loans', data),
    update: (id, data) => api.put(`/customers-loans/${id}`, data),
    delete: (id) => api.delete(`/customers-loans/${id}`),
};