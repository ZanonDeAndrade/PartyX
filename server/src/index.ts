import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { logger } from './logger';
import { systemClock } from './providers/clock';
import { createGateway } from './payments';
import { cloudTasksQueue } from './payments/taskQueue';
import { turnstileVerifier } from './security/humanCheck';
import { assertDatabaseEnvironment } from './db/environment';
import { createTicketIssuer } from './tickets/issuer';
import { googleJobAuthenticator } from './payments/jobsAuth';
import { bannerStorageFor } from './providers/bannerStorage';
import { LocalCaptureEmailSender, smtpEmailSender, unconfiguredEmailSender, type EmailSender } from './providers/email';
import { argon2Hasher } from './providers/passwordHasher';

const config = loadConfig();

/** Provedor de e-mail pela configuração. Nunca finge entrega: sem provedor, só o ambiente local captura (em disco, fictício). */
function mailerFor(): EmailSender {
  if (config.SMTP_URL && config.EMAIL_FROM)
    return smtpEmailSender({ url: config.SMTP_URL, from: config.EMAIL_FROM, replyTo: config.EMAIL_REPLY_TO });
  if (config.APP_ENV === 'local') return new LocalCaptureEmailSender('.data/emails');
  return unconfiguredEmailSender;
}
const mailer = mailerFor();
const database = config.DATABASE_URL ? createDatabase(config) : undefined;
// Proteção contra banco de outro ambiente (produção apontada para a homologação, ou o inverso): o banco declara a que ambiente pertence.
// Recusa subir, antes de atender qualquer requisição. Não consulta nada em ambiente local.
if (database && config.APP_ENV !== 'local') {
  try {
    await assertDatabaseEnvironment(database, config.APP_ENV);
  } catch (error) {
    logger.error('banco de outro ambiente: o servidor não vai subir', {
      appEnv: config.APP_ENV,
      error: error instanceof Error ? error.message : 'desconhecido',
      alert: 'banco_de_outro_ambiente',
    });
    process.exit(1);
  }
}
// Conciliação sob demanda: só liga com a fila, o endereço run.app e a conta de serviço configurados (docs/producao.md).
const taskQueue =
  config.TASKS_QUEUE && config.JOBS_AUDIENCE && config.TASKS_INVOKER_EMAIL
    ? cloudTasksQueue({
        queuePath: config.TASKS_QUEUE,
        targetUrl: config.JOBS_AUDIENCE,
        publicHost: new URL(config.PUBLIC_BASE_URL!).host,
        invokerEmail: config.TASKS_INVOKER_EMAIL,
      })
    : undefined;

const gateway = createGateway(config, systemClock);
// Mercado Pago: confere, sem bloquear a partida, que as credenciais são da conta configurada (MP_COLLECTOR_ID). Conta diferente
// nunca aprova nada (a conferência de cada pagamento recusa), mas o alerta avisa logo na publicação.
if (gateway && 'checkAccount' in gateway && typeof gateway.checkAccount === 'function') {
  void (gateway.checkAccount as () => Promise<string>)().then(result => {
    if (result === 'ok') logger.info('gateway de pagamento: conta conferida', { provider: gateway.capabilities.providerId });
    else
      logger.error('gateway de pagamento: conta não conferida', {
        provider: gateway.capabilities.providerId,
        result,
        alert: 'gateway_conta',
      });
  });
}

const app = createApp({
  config,
  clock: systemClock,
  pingDatabase: database?.ping,
  jobAuth: googleJobAuthenticator(config),
  issueTickets: createTicketIssuer(config.qr),
  // Sem banco (desenvolvimento só do front-end) não há autenticação. O e-mail real é o Prompt 14.
  auth: database
    ? {
        db: database.db,
        hasher: argon2Hasher,
        mailer,
        banners: bannerStorageFor(config),
        gateway,
        taskQueue,
        human: config.TURNSTILE_SECRET ? turnstileVerifier(config.TURNSTILE_SECRET) : undefined,
      }
    : undefined,
});
const server = serve({ fetch: app.fetch, port: config.PORT }, info => {
  logger.info('servidor iniciado', {
    port: info.port,
    appEnv: config.APP_ENV,
    banco: database ? 'configurado' : 'não configurado',
  });
});

// O Cloud Run envia SIGTERM antes de encerrar a instância: termina as requisições e fecha o pool.
function shutdown(signal: string) {
  logger.info('encerrando', { signal });
  server.close(() => {
    void (database?.close() ?? Promise.resolve()).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
