import { OAuth2Client } from 'google-auth-library';
import type { Config } from '../config';

/**
 * Autenticação das rotinas internas chamadas pelo Cloud Scheduler. O serviço é público (comprador acessa sem login),
 * então quem protege a rotina é este código: o Scheduler envia um **token OIDC** assinado pelo Google, para a conta de
 * serviço dele e com o endereço do serviço como `audience`. Aqui se confere assinatura, `audience` e e-mail.
 */
export interface JobAuthenticator {
  verify(authorization: string | undefined): Promise<boolean>;
}

export function googleJobAuthenticator(
  config: Pick<Config, 'JOBS_AUDIENCE' | 'JOBS_CALLER_EMAIL'>,
): JobAuthenticator | undefined {
  const { JOBS_AUDIENCE: audience, JOBS_CALLER_EMAIL: raw } = config;
  // Mais de uma conta pode chamar (Scheduler e Cloud Tasks), separadas por vírgula.
  const callers = new Set((raw ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  if (!audience || callers.size === 0) return undefined; // sem configuração, as rotinas respondem 503
  const client = new OAuth2Client();
  return {
    async verify(authorization) {
      const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization ?? '');
      if (!m) return false;
      try {
        const ticket = await client.verifyIdToken({ idToken: m[1]!, audience });
        const payload = ticket.getPayload();
        return Boolean(payload?.email_verified && payload.email && callers.has(payload.email.toLowerCase()));
      } catch {
        return false; // assinatura inválida, vencido, outra audiência: tudo igual para quem chama
      }
    },
  };
}
