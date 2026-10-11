import { Hono } from 'hono';
import { LOCAL_BANNER_DIR, localBannerStorage } from '../providers/bannerStorage';

/** Serve os banners gravados em disco. Só é montada com APP_ENV=local e sem bucket; em nuvem os banners saem do Cloud Storage. */
export function localMediaRoutes() {
  const app = new Hono();
  const storage = localBannerStorage(LOCAL_BANNER_DIR, '');
  app.get('/media/*', async c => {
    const name = c.req.path.replace(/^\/api\/media\//, '');
    try {
      const data = await storage.read(name);
      return c.body(new Uint8Array(data), 200, {
        'content-type': 'image/webp',
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=31536000, immutable',
      });
    } catch {
      return c.json({ erro: { codigo: 'nao_encontrado', mensagem: 'Recurso não encontrado.' } }, 404);
    }
  });
  return app;
}
