import { readFile } from 'node:fs/promises';
import { getCookie } from 'hono/cookie';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { bodyLimit } from 'hono/body-limit';
import { securityHeaders } from './security/headers';
import { authRoutes } from './api/auth';
import { healthRoutes } from './api/health';
import { localMediaRoutes } from './api/media';
import { LocalCaptureEmailSender } from './providers/email';
import { webhookRoutes } from './api/webhooks';
import type { AuthDeps } from './auth/types';
import { loadSession, SESSION_COOKIE } from './auth/sessions';
import type { Config } from './config';
import { AppError } from './domain/errors';
import { logger } from './logger';
import { publicRoutes } from './api/public';
import { eventMeta, injectMeta, SITE_DESCRIPTION, SITE_TITLE } from './vitrine/og';
import { bySlug } from './vitrine/service';
import type { Clock } from './providers/clock';
import type { JobAuthenticator } from './payments/jobsAuth';
import type { TicketIssuer } from './payments/reconcile';

export interface AppDeps {
  config: Config;
  clock: Clock;
  pingDatabase?: () => Promise<void>;
  /** Rotas de API adicionais, montadas em `/api` antes do 404 padrão. Usado por módulos novos e por testes. */
  extraApiRoutes?: Hono;
  /** Dependências de autenticação. Ausentes em testes que só exercitam saúde e arquivos estáticos. */
  auth?: Omit<AuthDeps, 'config' | 'clock'>;
  /** Autenticação das rotinas internas (Cloud Scheduler). Ausente: as rotinas respondem 503. */
  jobAuth?: JobAuthenticator;
  /** Emissão de ingressos dentro da confirmação do pagamento (Prompt 13). */
  issueTickets?: TicketIssuer;
}

function requestAuthority(value: string | undefined): { host: string; hostname: string } | null {
  if (!value || value !== value.trim() || /[,/@\\\s]/.test(value)) return null;
  try {
    const parsed = new URL(`https://${value}`);
    return { host: parsed.host.toLowerCase(), hostname: parsed.hostname.toLowerCase().replace(/\.$/, '') };
  } catch {
    return null;
  }
}

/**
 * Monta a aplicação HTTP. Recebe as dependências por parâmetro para os testes
 * trocarem relógio, banco e configuração sem tocar em variáveis globais.
 *
 * Camadas: `api/` (HTTP e validação), `domain/` (regras, sem I/O), `db/` (persistência),
 * `providers/` (relógio e, depois, gateway, e-mail e storage).
 */
export function createApp({ config, clock, pingDatabase, extraApiRoutes, auth, jobAuth, issueTickets }: AppDeps) {
  const app = new Hono();

  app.use(requestId());
  // O Hosting foi medido enviando Host=*.run.app e X-Forwarded-Host=<domínio público>. O segundo cabeçalho pode ser
  // forjado por quem chama o run.app direto; esta barreira reduz acesso casual, enquanto limites globais protegem o banco.
  app.use('*', async (c, next) => {
    if (config.APP_ENV === 'producao' && !['/api/health', '/api/health/ready'].includes(c.req.path)) {
      const expected = new URL(config.PUBLIC_BASE_URL!).host.toLowerCase();
      const host = requestAuthority(c.req.header('host'));
      const forwardedHost = requestAuthority(c.req.header('x-forwarded-host'));
      const directDomain = host?.host === expected;
      const viaHosting = host?.hostname.endsWith('.run.app') && forwardedHost?.host === expected;
      if (!directDomain && !viaHosting) return c.text('Host não autorizado.', 403);
    }
    await next();
  });
  // Logo da marca (`/brand/*`): pública, igual para todos e feita para aparecer fora do site (nos e-mails). Só ela pode ser
  // carregada por outra origem; o resto segue `same-origin`. Registrado antes dos cabeçalhos de segurança porque eles são
  // gravados na volta da requisição: assim este é o último a escrever.
  app.use('/brand/*', async (c, next) => {
    await next();
    c.header('Cross-Origin-Resource-Policy', 'cross-origin');
  });
  app.use(securityHeaders(config));
  // **Política de cache da API:** nenhuma resposta de `/api/*` é guardada por navegador intermediário, proxy ou CDN. Atrás do
  // Firebase Hosting isso garante que resposta de usuário logado nunca seja servida a outro. Vale para sucesso, erro e 404,
  // e sobrepõe qualquer cabeçalho que uma rota tenha definido (ver também o `onError`).
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  });
  // Corpo JSON acima de 1 MB nunca é legítimo nesta API (uploads são multipart e têm limite próprio).
  app.use('/api/*', async (c, next) => {
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) return next();
    return bodyLimit({
      maxSize: 1024 * 1024,
      onError: () => {
        throw new AppError(413, 'corpo_grande', 'Corpo grande demais.');
      },
    })(c, next);
  });

  app.route('/api', healthRoutes({ config, clock, pingDatabase }));
  if (config.APP_ENV === 'local' && !config.BANNER_BUCKET) app.route('/api', localMediaRoutes());
  // Só no ambiente local, com a captura fictícia: mostra o último e-mail capturado (para seguir o link de recuperação de senha).
  if (config.APP_ENV === 'local' && auth?.mailer instanceof LocalCaptureEmailSender) {
    const capture = auth.mailer;
    app.get('/api/dev/emails', c => {
      const to = c.req.query('to');
      return c.json({
        emails: capture.captured
          .filter(m => !to || m.to === to)
          .slice(-20)
          .map(m => ({ template: m.template, to: m.to, subject: m.subject, link: m.data.link ?? null })),
      });
    });
  }
  if (auth) app.route('/api', publicRoutes({ db: auth.db, clock, config }));
  // Webhook do gateway e rotinas do Scheduler: sem sessão, sem CSRF. Registradas ANTES do contexto de autenticação.
  if (auth)
    app.route(
      '/api',
      webhookRoutes({
        db: auth.db,
        clock,
        config,
        gateway: auth.gateway,
        jobAuth,
        issueTickets,
        mailer: auth.mailer,
        taskQueue: auth.taskQueue,
      }),
    );
  if (auth) app.route('/api', authRoutes({ ...auth, config, clock }));
  if (extraApiRoutes) app.route('/api', extraApiRoutes);
  app.all('/api/*', c => c.json({ erro: { codigo: 'nao_encontrado', mensagem: 'Recurso não encontrado.' } }, 404));

  // RF-09/CA-05: negar a navegação HTML antes de servir qualquer shell ou arquivo estático.
  app.use('*', async (c, next) => {
    const p = c.req.path;
    if (!['GET', 'HEAD'].includes(c.req.method) || c.req.path.startsWith('/api/')) return next();
    if (
      (p === '/prototipo' || p.startsWith('/prototipo/') || p.startsWith('/docs')) &&
      !(config.APP_ENV === 'homologacao' && config.ENABLE_PROTOTYPE === 'true')
    )
      return c.notFound();
    const admin = p === '/admin' || p.startsWith('/admin/');
    const gate = p === '/portaria' || p.startsWith('/portaria/');
    const first = p === '/primeiro-acesso';
    if (!admin && !gate && !first) return next();
    c.header('Cache-Control', 'private, no-store');
    const token = getCookie(c, SESSION_COOKIE);
    const session = token && auth ? await loadSession({ ...auth, config, clock }, token) : null;
    if (!session) return c.redirect(`/entrar?voltar=${encodeURIComponent(p + new URL(c.req.url).search)}`, 302);
    const role = session.user.role;
    const permitted = admin ? role === 'administrador' : role === 'administrador' || role === 'validador';
    if (!permitted) {
      const destination = role === 'cliente' ? '/minha-conta' : '/portaria';
      return c.html(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso negado · PartyX</title><link rel="stylesheet" href="/access-denied.css"></head><body><main data-screen="G04"><img src="/brand/partyx-logo.png" width="65" height="36" alt="PartyX"><h1>Acesso negado</h1><p>Sua conta não tem acesso a esta área. Volte para a área do seu perfil.</p><a href="${destination}">Ir para minha área</a></main></body></html>`,
        403,
      );
    }
    if (session.user.mustChangePassword && !first) return c.redirect('/primeiro-acesso', 302);
    await next();
  });

  // Front-end (build do Vite). Em desenvolvimento o Vite serve as páginas e faz proxy de /api para cá.
  const dist = path.resolve(config.WEB_DIST_DIR);
  // Cache dos estáticos. Arquivos com hash no nome (Vite, pasta /assets) nunca mudam: 1 ano e imutável. O `index.html` (e o
  // HTML das rotas do app) é sempre revalidado, para um deploy novo valer na hora. O resto (ícones, logo, vídeo da abertura)
  // tem prazo curto. O vídeo chega em pedaços (206, Range: o Safari do iPhone só toca assim) e recebe a mesma regra.
  // É um middleware que roda depois da resposta pronta: o `onFound` do serveStatic roda tarde demais para mudar cabeçalho.
  app.use('*', async (c, next) => {
    await next();
    const ok = c.res.status === 200 || c.res.status === 206;
    if (c.req.path.startsWith('/api/') || !ok || c.res.headers.has('Cache-Control')) return;
    if (c.req.path.startsWith('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
    else if (c.req.path === '/' || c.req.path.endsWith('.html')) c.header('Cache-Control', 'no-cache');
    else c.header('Cache-Control', 'public, max-age=3600');
  });
  app.use('*', serveStatic({ root: path.relative(process.cwd(), dist) || '.' }));

  const baseUrl = (requestUrl: string) => config.PUBLIC_BASE_URL ?? new URL(requestUrl).origin;
  const readIndex = () => readFile(path.join(dist, 'index.html'), 'utf8');

  // Open Graph (RF-26, CA-13): o WhatsApp não executa JavaScript, então o servidor injeta título, descrição e imagem no HTML.
  app.get('/eventos/:slug', async c => {
    let html: string;
    try {
      html = await readIndex();
    } catch {
      return c.text('Front-end não compilado. Rode `npm run build` ou use `npm run dev`.', 404);
    }
    // Sem banco (desenvolvimento só do front-end) não há evento para consultar: segue como página comum.
    if (!auth) return c.html(html);
    const url = `${baseUrl(c.req.url).replace(/\/$/, '')}/eventos/${c.req.param('slug')}`;
    try {
      const event = await bySlug({ db: auth.db, clock }, c.req.param('slug'));
      c.header('Cache-Control', 'public, max-age=60');
      return c.html(injectMeta(html, eventMeta(event, baseUrl(c.req.url))));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
    // Rascunho ou inexistente: tags genéricas (nada do evento vaza) e 404 para os buscadores não indexarem.
    return c.html(injectMeta(html, { title: SITE_TITLE, description: SITE_DESCRIPTION, url }), 404);
  });

  app.get('*', async c => {
    try {
      c.header('Cache-Control', 'no-cache'); // o HTML do app não é cacheado sem revalidar: assets novos valem no deploy
      return c.html(await readIndex());
    } catch {
      return c.text('Front-end não compilado. Rode `npm run build` ou use `npm run dev`.', 404);
    }
  });

  app.onError((error, c) => {
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'private, no-store');
    if (error instanceof AppError) {
      return c.json({ erro: { codigo: error.code, mensagem: error.message, detalhes: error.details } }, error.status);
    }
    // Detalhes técnicos só no log. O usuário recebe uma mensagem genérica, sem stack nem nomes internos.
    logger.error('erro não tratado', {
      requestId: c.get('requestId'),
      error: error instanceof Error ? error.name : 'desconhecido',
    });
    return c.json(
      { erro: { codigo: 'erro_interno', mensagem: 'Não foi possível concluir a ação. Tente novamente em instantes.' } },
      500,
    );
  });

  return app;
}
