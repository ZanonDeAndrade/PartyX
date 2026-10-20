import { isValidCpf, onlyDigits } from './cpf';
import { isEmailFormat, normalizeEmail, normalizeName } from './identity';

/**
 * Evento privado (D-92, 20/10/2026): regras puras da lista de autorizados. Quem grava e confere no banco é `events/access.ts`; aqui
 * ficam a leitura do que o painel digita ou cola, a precedência entre linhas da mesma pessoa e as máscaras da trilha.
 */
export type AccessStatus = 'autorizada' | 'pendente' | 'recusada';
export type AccessOrigin = 'painel' | 'solicitacao';

export const ACCESS_LIMITS = {
  nameMax: 120,
  noteMax: 500,
  /** Linhas de uma importação colada. */
  importMax: 1000,
  /** Solicitações por conta e por hora, somando todos os eventos. */
  requestsPerAccountPerHour: 10,
  /** Solicitações por IP e por hora (camada rápida, por instância). */
  requestsPerIpPerHour: 30,
  /** A lista é apagada 6 meses depois do evento (fim, ou início sem fim). */
  retentionMonths: 6,
} as const;

/** Uma pessoa como o painel informa: e-mail, CPF ou os dois, e um nome opcional. */
export interface AccessPerson {
  email: string | null;
  cpf: string | null;
  name: string | null;
}

export type PersonCheck = { ok: true; person: AccessPerson } | { ok: false; message: string };

/** Confere e normaliza: e-mail em minúsculas, CPF só por dígitos e válido, nome sem espaços sobrando. Um dos dois basta. */
export function checkPerson(input: { email?: string | null; cpf?: string | null; name?: string | null }): PersonCheck {
  const rawEmail = (input.email ?? '').trim();
  const rawCpf = (input.cpf ?? '').trim();
  const name = normalizeName(input.name ?? '');
  if (!rawEmail && !rawCpf) return { ok: false, message: 'Informe o e-mail ou o CPF da pessoa.' };
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (email && !isEmailFormat(email)) return { ok: false, message: 'E-mail inválido. Confira o endereço digitado.' };
  const cpf = rawCpf ? onlyDigits(rawCpf) : null;
  if (cpf !== null && (cpf.length !== 11 || !isValidCpf(cpf)))
    return { ok: false, message: 'CPF inválido. Confira os números digitados.' };
  if (name.length > ACCESS_LIMITS.nameMax)
    return { ok: false, message: `Use no máximo ${ACCESS_LIMITS.nameMax} caracteres no nome.` };
  return { ok: true, person: { email, cpf, name: name || null } };
}

export interface ParsedLine {
  line: number;
  person: AccessPerson;
}
export interface ParseResult {
  people: ParsedLine[];
  /** Linhas recusadas, pela posição na lista colada (1, 2, ...). */
  errors: { line: number; message: string }[];
  /** Linhas repetidas dentro da própria lista (mesmo e-mail ou CPF de uma linha anterior). */
  repeated: number[];
}

/**
 * Lista colada no painel: uma pessoa por linha, com e-mail, CPF (com ou sem pontuação) e nome em qualquer ordem, separados por vírgula,
 * ponto e vírgula ou tabulação (o que sai de uma planilha). Linhas vazias são ignoradas. Um pedaço com "@" é o e-mail; um pedaço que só
 * tem dígitos, pontos, traços e espaços é o CPF; o resto vira o nome.
 */
export function parseAccessList(text: string): ParseResult | { tooMany: true } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const filled = lines.filter(l => l.trim() !== '').length;
  if (filled > ACCESS_LIMITS.importMax) return { tooMany: true };
  const out: ParseResult = { people: [], errors: [], repeated: [] };
  const seenEmail = new Set<string>();
  const seenCpf = new Set<string>();
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === '') return;
    const parts = raw
      .split(/[;,\t]/)
      .map(p => p.trim())
      .filter(Boolean);
    let email: string | null = null;
    let cpf: string | null = null;
    const names: string[] = [];
    for (const part of parts) {
      if (part.includes('@')) {
        if (email !== null) return void out.errors.push({ line, message: 'Mais de um e-mail na mesma linha.' });
        email = part;
      } else if (/^[\d.\-\s]+$/.test(part)) {
        if (cpf !== null) return void out.errors.push({ line, message: 'Mais de um CPF na mesma linha.' });
        cpf = part;
      } else names.push(part);
    }
    const checked = checkPerson({ email, cpf, name: names.join(' ') });
    if (!checked.ok) return void out.errors.push({ line, message: checked.message });
    const { person } = checked;
    if ((person.email && seenEmail.has(person.email)) || (person.cpf && seenCpf.has(person.cpf))) {
      out.repeated.push(line);
      return;
    }
    if (person.email) seenEmail.add(person.email);
    if (person.cpf) seenCpf.add(person.cpf);
    out.people.push({ line, person });
  });
  return out;
}

const RANK: Record<AccessStatus, number> = { autorizada: 3, pendente: 2, recusada: 1 };

/**
 * Situação de uma conta no evento, a partir das linhas que batem com ela (pela conta, pelo e-mail ou pelo CPF). Autorizada vale antes
 * de pendente, e pendente antes de recusada: o painel pode cadastrar pelo CPF quem teve a solicitação recusada pelo e-mail.
 */
export function effectiveStatus(statuses: readonly AccessStatus[]): AccessStatus | null {
  let best: AccessStatus | null = null;
  for (const s of statuses) if (!best || RANK[s] > RANK[best]) best = s;
  return best;
}

/** E-mail mascarado para a trilha (que não se apaga): as duas primeiras letras e o domínio ("ma***@gmail.com"). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** Observação da decisão: opcional, até 500 caracteres; vazia vira nula. */
export function checkNote(
  raw: string | null | undefined,
): { ok: true; note: string | null } | { ok: false; message: string } {
  const note = (raw ?? '').trim();
  if (note.length > ACCESS_LIMITS.noteMax)
    return { ok: false, message: `Use no máximo ${ACCESS_LIMITS.noteMax} caracteres na observação.` };
  return { ok: true, note: note || null };
}

/**
 * Instante a partir do qual a lista do evento é apagada: 6 meses depois do fim (ou do início, sem fim), no calendário, como o
 * `+ interval '6 months'` do PostgreSQL que a limpeza usa (31 de agosto vira 28 ou 29 de fevereiro).
 */
export function accessPurgeAfter(event: { startsAt: Date; endsAt: Date | null }): Date {
  const base = event.endsAt ?? event.startsAt;
  const month = base.getUTCMonth() + ACCESS_LIMITS.retentionMonths;
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const d = new Date(base.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(month);
  d.setUTCDate(Math.min(base.getUTCDate(), lastDay));
  return d;
}
