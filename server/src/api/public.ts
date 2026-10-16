import { Hono } from 'hono';
import { z } from 'zod';
import type { Config } from '../config';
import { bySlug, home, search, type VitrineDeps } from '../vitrine/service';
import { AppError } from '../domain/errors';
import { isLegalKind, legalDocument } from '../legal/documents';
import { createMemoryLimiter } from '../auth/limits';
import { blankAuthorizationPdf } from '../minors/authorization';

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
  /** Textos legais (RF-68). Texto simples em blocos; o front nunca o trata como HTML. */
  app.get('/public/legal/:kind', c => {
    const kind = c.req.param('kind');
    if (!isLegalKind(kind)) throw new AppError(404, 'nao_encontrado', 'Documento não encontrado.');
    return c.json({ document: legalDocument(deps.config, kind) });
  });
  app.get('/public/home', async c => c.json(await home(deps)));

  // Só o nome (a busca do cabeçalho). Outros parâmetros, como o `date` de links antigos, são descartados.
  const searchQuery = z.object({ q: z.string().max(400).optional() });
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

  /**
   * Termo de Autorização e Responsabilidade EM BRANCO do evento (regras de menores), para acompanhantes de 16 ou 17 anos. Só os dados
   * do evento; nenhum dado pessoal. Limite por IP (o PDF custa mais que uma leitura).
   */
  const pdfLimiter = createMemoryLimiter({ max: 30, windowMs: 60_000, now: () => deps.clock.now().getTime() });
  app.get('/public/events/:slug/autorizacao-menor.pdf', async c => {
    const slug = c.req.param('slug');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
      throw new AppError(404, 'nao_encontrado', 'Evento não encontrado.');
    }
    const ip = c.req.header('x-forwarded-for') ?? 'sem-ip';
    if (pdfLimiter.hit(ip))
      throw new AppError(429, 'muitas_requisicoes', 'Muitas tentativas. Aguarde um pouco e tente de novo.');
    const { bytes } = await blankAuthorizationPdf(deps, slug);
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', `attachment; filename="autorizacao-menor-${slug}.pdf"`);
    return c.body(new Uint8Array(bytes));
  });

  return app;
}
