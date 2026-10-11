import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, a API (`npm run dev:server`) roda na 8080.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
