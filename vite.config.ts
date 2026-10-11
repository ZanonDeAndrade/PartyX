import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// https://vite.dev/config/
/**
 * Pré-carrega as duas fontes que aparecem na primeira tela (Big Shoulders e Archivo, subconjunto latino): chegam junto com
 * o JavaScript e o texto não muda de largura depois de desenhado (sem deslocamento de layout).
 */
const preloadFonts: Plugin = {
  name: 'px-preload-fonts',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(_html, ctx) {
      return Object.keys(ctx.bundle ?? {})
        .filter(f => /(big-shoulders-display|archivo)-latin-wght-normal-[\w-]+\.woff2$/.test(f))
        .map(f => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' },
          injectTo: 'head' as const,
        }));
    },
  },
};

export default defineConfig({
  plugins: [react(), preloadFonts],
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
