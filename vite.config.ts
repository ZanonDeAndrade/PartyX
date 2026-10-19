import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

/**
 * Abertura (index.html, src/intro): o script e o vídeo saem em /assets com hash do conteúdo no nome. O servidor dá a /assets cache
 * de 1 ano, imutável, e a Vercel guarda esses arquivos (`infra/vercel/vercel.json`): quem volta ao site já tem o vídeo no
 * aparelho, e um deploy novo troca o nome. O script não é módulo (precisa rodar antes da primeira pintura, sem esperar o resto),
 * então o Vite não o processa: aqui ele é copiado com o endereço do vídeo trocado, e o `index.html` passa a apontar para ele.
 * No desenvolvimento, o Vite serve os dois direto de src/intro.
 */
const INTRO_SCRIPT = '/src/intro/abertura.js';
const INTRO_VIDEO = '/src/intro/partyx-intro.mp4';
const introAssets: Plugin = {
  name: 'px-intro-assets',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const hashOf = (data: string | Buffer) => createHash('sha256').update(data).digest('base64url').replace(/[-_]/g, '').slice(0, 8);
    const video = readFileSync(`.${INTRO_VIDEO}`);
    const videoFile = `assets/partyx-intro-${hashOf(video)}.mp4`;
    const source = readFileSync(`.${INTRO_SCRIPT}`, 'utf8');
    if (source.split(`'${INTRO_VIDEO}'`).length !== 2) this.error(`${INTRO_SCRIPT} precisa citar '${INTRO_VIDEO}' uma vez`);
    // Sem as linhas só de comentário: o script segura a página no <head> e vai inteiro na primeira visita.
    const script = source
      .replace(`'${INTRO_VIDEO}'`, `'/${videoFile}'`)
      .split('\n')
      .filter(line => line.trim() !== '' && !line.trim().startsWith('//'))
      .join('\n');
    const scriptFile = `assets/abertura-${hashOf(script)}.js`;
    this.emitFile({ type: 'asset', fileName: videoFile, source: video });
    this.emitFile({ type: 'asset', fileName: scriptFile, source: script });
    const html = bundle['index.html'];
    if (html?.type !== 'asset') return this.error('index.html não encontrado no build');
    const page = String(html.source);
    const tag = `<script src="${INTRO_SCRIPT}"></script>`;
    if (page.split(tag).length !== 2) this.error(`index.html precisa ter ${tag} uma vez`);
    html.source = page.replace(tag, `<script src="/${scriptFile}"></script>`);
  },
};

export default defineConfig({
  plugins: [react(), preloadFonts, introAssets],
  define: {
    __ENABLE_PROTOTYPE__: JSON.stringify(
      process.env.APP_ENV === 'homologacao' && process.env.ENABLE_PROTOTYPE === 'true',
    ),
  },
  build: {
    // Logos das formas de pagamento (src/assets/pagamento): sempre arquivo próprio em /assets, com hash no nome e cache longo, nunca
    // embutidas como data: (o padrão do Vite embute arquivos menores que 4 KB). Os demais seguem o padrão.
    assetsInlineLimit: (file: string) => (file.includes('/assets/pagamento/') ? false : undefined),
  },
  server: {
    // Em desenvolvimento, a API (`npm run dev:server`) roda na 8080.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
