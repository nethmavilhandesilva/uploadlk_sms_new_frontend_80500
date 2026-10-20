import axios from 'axios';
import { API_BASE_URL, BASE_PATH } from '../config';


// Create axios instance with base config
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Accept': 'application/json',
    },
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('auth_token') || 
                      localStorage.getItem('token') || 
                      sessionStorage.getItem('token');
        
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }
        
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('auth_token');
            window.location.href = `${BASE_PATH}/login`;
        }
        return Promise.reject(error);
    }
);

export const supplierService = {
    // Get all suppliers
    getAll: () => api.get('/suppliers'),
    
    // Get single supplier
    get: (id) => api.get(`/suppliers/${id}`),
    
    // Create new supplier
    create: (data) => {
        if (data instanceof FormData) {
            return api.post('/suppliers', data);
        }
        return api.post('/suppliers', data, { headers: { 'Content-Type': 'application/json' } });
    },
    
    // Update supplier
    update: (id, data) => {
        if (data instanceof FormData) {
            data.append('_method', 'PUT');
            return api.post(`/suppliers/${id}`, data);
        }
        return api.put(`/suppliers/${id}`, data);
    },
    
    // Delete supplier
    delete: (id) => api.delete(`/suppliers/${id}`),
    
    // Search suppliers
    search: (query) => api.get(`/suppliers/search/${query}`),

    // ✅ Check if supplier code exists
    checkCode: (code) => api.get(`/suppliers/check-code/${code}`), // Should return { exists: true/false }
};