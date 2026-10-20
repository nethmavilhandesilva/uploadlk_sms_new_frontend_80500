import axios from 'axios';
import { API_BASE_URL, BASE_PATH } from './config';

const api = axios.create({
  baseURL:API_BASE_URL, // ✅ Laravel API URL: ${API_BASE_URL}
  headers: {
    'Accept': 'application/json'
  },
  withCredentials: false 
});

// 🔐 Add token and handle Content-Type dynamically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  // Add Auth Token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  } else {
    // For regular objects, default back to JSON
    config.headers['Content-Type'] = 'application/json';
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// ❗ Handle 401 (Unauthorized) globally
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error.response && error.response.status === 401) {
    console.log("⚠️ Token expired or invalid. Redirecting to login...");
    localStorage.removeItem("token");
    window.location.href = `${BASE_PATH}/login`; 
  }
  return Promise.reject(error);
});

export default api;