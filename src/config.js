// Server addresses for the whole app, set per build:
//   npm run dev   → local Laravel backend (defaults below)
//   npm run build → values from .env.production (the cPanel deployment)

// Laravel API, e.g. https://upload.lk/sms_new_backend_80500/api
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

// Laravel public folder (images live under its /storage), e.g.
// https://upload.lk/sms_new_backend_80500/application/public
export const PUBLIC_URL = (import.meta.env.VITE_BACKEND_PUBLIC_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

// Uploaded files (profile pictures, NIC images) — with and without the trailing slash.
export const STORAGE_URL = `${PUBLIC_URL}/storage/`;
export const STORAGE_BASE = `${PUBLIC_URL}/storage`;

// Sub-folder the frontend is served from ('' locally, '/sms_new_frontend_80500' on cPanel).
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');
