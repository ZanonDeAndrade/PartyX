import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __ENABLE_PROTOTYPE__: JSON.stringify(
      process.env.APP_ENV === 'homologacao' && process.env.ENABLE_PROTOTYPE === 'true',
    ),
  },
  server: {
    // Em desenvolvimento, a API (`npm run dev:server`) roda na 8080.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
