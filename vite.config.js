import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Add this line
    allowedHosts: ['medications-winner-southwest-accidents.trycloudflare.com'],
    // ... other server configurations if any
  },
});