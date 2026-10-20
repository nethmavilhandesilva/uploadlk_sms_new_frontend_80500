const API_BASE = API_BASE_URL;
import axios from 'axios';
import { API_BASE_URL } from '../config';

export const fetchNotChangingGRNs = async () => {
  const response = await fetch(`${API_BASE}/not-changing-grns`);
  if (!response.ok) throw new Error('Failed to fetch GRNs');
  return response.json();
};

export const fetchGrnBalances = async (code) => {
  const response = await fetch(`${API_BASE}/grn/balance/${code}`);
  if (!response.ok) throw new Error('Failed to fetch balances');
  return response.json();
};

export const submitGrnEntry = async (formData) => {
  const response = await fetch(`${API_BASE}/grn/store2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
      'Accept': 'application/json'
    },
    body: JSON.stringify(formData)
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to submit entry');
  }
  
  return response.json();
};
export const getGrnEntriesByCode = async (code) => {
  return await axios.get(`${API_BASE}/grn-entries/code/${code}`);
};
export const deleteGrnEntry = async (id) => {
  const response = await fetch(`${API_BASE}/grn/delete/update/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ id })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to delete entry');
  }
  
  
  return response.json();
};