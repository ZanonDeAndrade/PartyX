import { redact } from './security/redact';

/** Log em JSON, uma linha por evento, no formato que o Cloud Logging entende (campo `severity`). */
type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

function write(severity: Severity, message: string, fields: Record<string, unknown> = {}) {
  // Rede de segurança: mesmo que alguém passe dado sensível por engano, ele sai mascarado (security/redact.ts).
  const safe = redact({ message, ...fields }) as Record<string, unknown>;
  const line = JSON.stringify({ severity, time: new Date().toISOString(), ...safe });
  (severity === 'ERROR' ? process.stderr : process.stdout).write(line + '\n');
}

/**
 * Nunca passe CPF, senha, token, PAN/CVV ou segredo em `fields`.
 * Registre identificadores (id do pedido, id do evento) e códigos de erro. O mascaramento automático é a última barreira, não o plano.
 */
export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('DEBUG', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('INFO', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('WARNING', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('ERROR', message, fields),
};

export type Logger = typeof logger;
