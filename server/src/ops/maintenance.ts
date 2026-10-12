import type { MiddlewareHandler } from 'hono';
import type { Config, PartyxPublicInfo } from '../config';
import { escapeHtml } from '../vitrine/og';

/**
 * Manutenção e indisponibilidade (G06), ligada por `MAINTENANCE_MODE=true`. O site inteiro responde 503 com uma página simples, sem
 * JavaScript e sem depender do banco, com o contato DA PARTYX vindo da configuração. Não promete prazo de retorno nem atendimento
 * 24 horas: o atendimento ao comprador é da PartyX, no horário que ela informar.
 *
 * Continuam no ar só os caminhos técnicos, para nenhum pagamento se perder durante a manutenção: saúde (Cloud Run), webhook do gateway
 * e rotinas internas (Cloud Scheduler e Cloud Tasks, autenticadas por OIDC). A logo e o ícone ficam liberados para a própria página.
 */
const OPEN_EXACT = new Set(['/api/health', '/api/health/ready', '/favicon.svg', '/favicon-32.png']);
const OPEN_PREFIXES = ['/api/webhooks/', '/api/internal/', '/brand/'];

export const openDuringMaintenance = (path: string): boolean =>
  OPEN_EXACT.has(path) || OPEN_PREFIXES.some(prefix => path.startsWith(prefix));

export const MAINTENANCE_MESSAGE =
  'O site da PartyX está em manutenção e volta assim que possível. Nenhuma compra pode ser feita agora; tente novamente mais tarde.';

/** Contato mostrado na manutenção: só o que a PartyX informou. Fora de produção, o que faltar é sinalizado como "a fornecer". */
export function maintenanceContact(info: PartyxPublicInfo): {
  email: string | null;
  whatsapp: string | null;
  hours: string | null;
} {
  return { email: info.supportEmail, whatsapp: info.supportWhatsapp, hours: info.supportHours };
}

const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

export function maintenancePage(config: Pick<Config, 'APP_ENV' | 'partyx'>): string {
  const { email, whatsapp, hours } = maintenanceContact(config.partyx);
  const testing = config.APP_ENV !== 'producao';
  const channels = [
    email ? `<li>E-mail: <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></li>` : '',
    whatsapp
      ? `<li>WhatsApp: <a href="${escapeHtml(waLink(whatsapp))}" rel="noopener">${escapeHtml(whatsapp)}</a></li>`
      : '',
  ].join('');
  const contact = channels
    ? `<h2>Atendimento da PartyX</h2><ul>${channels}</ul>${hours ? `<p class="dim">Horário de atendimento: ${escapeHtml(hours)}.</p>` : ''}`
    : testing
      ? '<p class="dim">Canais de atendimento da PartyX: a fornecer (ambiente de teste).</p>'
      : '';
  const identity = [config.partyx.legalName, config.partyx.cnpj ? `CNPJ ${config.partyx.cnpj}` : null]
    .filter(Boolean)
    .map(v => escapeHtml(v!))
    .join(' · ');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Em manutenção · PartyX</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>
body{margin:0;background:#0B0B10;color:#F4F4F8;font:16px/1.55 Arial,Helvetica,sans-serif}
main{max-width:34rem;margin:0 auto;padding:56px 16px}
h1{font-size:1.9rem;line-height:1.15;margin:28px 0 12px}h2{font-size:1.05rem;margin:28px 0 8px}
ul{margin:0;padding-left:1.2rem}li{margin:4px 0}a{color:#C4B5FD}.dim{color:#B4B4C6;font-size:.92rem}
footer{margin-top:40px;border-top:1px solid #2A2A36;padding-top:16px}
</style></head><body><main data-screen="G06"><img src="/brand/partyx-logo.png" width="65" height="36" alt="PartyX"><h1>Site em manutenção</h1><p>${escapeHtml(MAINTENANCE_MESSAGE)}</p>${contact}${identity ? `<footer class="dim">${identity}</footer>` : ''}</main></body></html>`;
}

/**
 * Registrar antes de qualquer rota. Navegação (GET/HEAD fora de `/api`): a página acima. API: JSON `manutencao`, com o contato, para a
 * tela já aberta mostrar o mesmo aviso. Sem cache: desligar a flag vale na hora.
 */
export function maintenanceGuard(config: Pick<Config, 'APP_ENV' | 'partyx' | 'maintenance'>): MiddlewareHandler {
  return async (c, next) => {
    if (!config.maintenance || openDuringMaintenance(c.req.path)) return next();
    c.header('Cache-Control', 'no-store');
    if (c.req.path.startsWith('/api/'))
      return c.json(
        {
          erro: {
            codigo: 'manutencao',
            mensagem: MAINTENANCE_MESSAGE,
            detalhes: { contato: maintenanceContact(config.partyx) },
          },
        },
        503,
      );
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.html(maintenancePage(config), 503);
    return c.text('Site em manutenção.', 503);
  };
}
