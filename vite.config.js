import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // 🔥 Ensure assets load correctly under subfolder in production
  base: mode === 'production' ? '/sms_new_frontend_80500/' : '/',

  server: {
    // Local development proxy to Laravel backend
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // safer to use 127.0.0.1
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: 'dist',        // default, but explicit is safer
    assetsDir: 'assets',   // folder for JS/CSS inside dist
  },

  resolve: {
    alias: {
      '@': '/src',          // optional: makes imports easier
    },
  },
}));
