import { Hono } from 'hono';
import { z } from 'zod';
import type { Config } from '../config';
import { bySlug, home, search, type VitrineDeps } from '../vitrine/service';
import { AppError } from '../domain/errors';
import { isLegalKind, legalDocument } from '../legal/documents';

/**
 * Vitrine pública: leitura sem login. A disponibilidade em cache é só para exibir; quem decide
 * é o checkout, que confere de novo dentro da transação de reserva (RF-33).
 */
export function publicRoutes(deps: VitrineDeps & { config: Config }) {
  const app = new Hono();
  // Sem cache compartilhado: a política da API inteira é `private, no-store` (definida em `app.ts`). Decisão de produção: atrás do
  // Firebase Hosting, nenhuma resposta de `/api/*` pode ficar na CDN, nem a vitrine. O volume esperado cabe no Cloud Run sem isso.

  /** Informações do site. `provisionalTheme` vale até a aprovação visual do cliente (Prompt 19). */
  app.get('/public/site', c =>
    c.json({
      environment: deps.config.APP_ENV,
      provisionalTheme: !deps.config.visualApproved,
      // A tela de seleção mostra o limite sem adivinhar; quem impõe é o servidor (CA-15).
      maxTicketsPerOrder: deps.config.MAX_TICKETS_PER_ORDER,
      salesOpen: deps.config.salesOpen,
      // Chave PÚBLICA do Turnstile (a secreta nunca sai do servidor). Nula: a tela não mostra o desafio.
      turnstileSiteKey: deps.config.TURNSTILE_SITE_KEY ?? null,
      // Dados e contatos públicos DA PARTYX para o rodapé e os textos de atendimento (D-16). Só o que vier da configuração.
      partyx: deps.config.partyx,
    }),
  );
  /** Textos legais e regras de meia-entrada (RF-68). Texto simples em blocos; o front nunca o trata como HTML. */
  app.get('/public/legal/:kind', c => {
    const kind = c.req.param('kind');
    if (!isLegalKind(kind)) throw new AppError(404, 'nao_encontrado', 'Documento não encontrado.');
    return c.json({ document: legalDocument(deps.config, kind) });
  });
  app.get('/public/home', async c => c.json(await home(deps)));

  const searchQuery = z.object({ q: z.string().max(400).optional(), date: z.string().max(20).optional() });
  app.get('/public/events', async c => {
    const parsed = searchQuery.safeParse(c.req.query());
    if (!parsed.success) throw new AppError(422, 'dados_invalidos', 'Busca inválida.');
    return c.json(await search(deps, parsed.data));
  });

  app.get('/public/events/:slug', async c => {
    const slug = c.req.param('slug');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
      throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
    }
    return c.json({ event: await bySlug(deps, slug) });
  });

  return app;
}
