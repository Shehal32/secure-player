import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: [
      'unlikeable-unhectically-jasiah.ngrok-free.dev',
      '.ngrok-free.dev',
      '.ngrok-free.app',
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      '/playlist': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        xfwd: true,
      },
      '/keys': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        xfwd: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        xfwd: true,
      },
      '/upload': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        xfwd: true,
      },
      '/watermark': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        xfwd: true,
      },
      '/account': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
});
