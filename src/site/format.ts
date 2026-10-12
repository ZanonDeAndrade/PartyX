/** Formatação de datas e valores da vitrine. Datas chegam em UTC; a exibição é sempre no fuso do evento. */
const ZONE = 'America/Sao_Paulo';

const part = (d: Date, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, ...o }).format(d);

export const brl = (cents: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/** sáb., 12 de dezembro de 2026 */
export const dateLong = (iso: string): string =>
  part(new Date(iso), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** sáb, 12 dez (sem o "de" que o Intl põe entre dia e mês) */
export const dateShort = (iso: string): string =>
  part(new Date(iso), { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '').replace(/ de /g, ' ');

export const timeOf = (iso: string): string =>
  part(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Partes da data para o bloco de data dos cartões e do evento: dia ("07"), mês curto ("dez") e dia da semana por extenso
 * ("sábado"), no fuso do evento.
 */
export const dateParts = (iso: string): { day: string; month: string; weekday: string; year: string } => {
  const d = new Date(iso);
  return {
    day: part(d, { day: '2-digit' }),
    month: part(d, { month: 'short' }).replace(/\./g, ''),
    weekday: part(d, { weekday: 'long' }),
    year: part(d, { year: 'numeric' }),
  };
};

/** Início de uma query string da busca, sempre com os valores codificados. */
export function searchPath(q: string, date: string): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (date) params.set('date', date);
  const s = params.toString();
  return s ? `/eventos?${s}` : '/eventos';
}

export const eventPath = (slug: string): string => `/eventos/${slug}`;

/** Links de compartilhamento. O endereço do evento vai sempre codificado. */
export function shareLinks(url: string, title: string) {
  const u = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${encodeURIComponent(title)}`,
  };
}

/** (11) 98765-4321 para exibir. Valor que não tem 10 ou 11 dígitos volta como veio (o servidor é quem valida). */
export function phoneBr(phone: string | null | undefined): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

/**
 * Máscaras de digitação (só aparência): o servidor guarda e valida só os dígitos, então o que se envia formatado é igual
 * ao que se enviaria sem pontuação.
 */
export function cpfInput(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
export function phoneInput(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** j***@gmail.com: confirma o destino sem expor o endereço inteiro na tela. */
export function maskEmail(email: string) {
  const [user = '', domain = ''] = email.trim().split('@');
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}

// ---------- formulários do painel (ADM03, ADM06) ----------

/** Deslocamento do fuso do evento, em minutos, no instante `utcMs` (-180 para UTC-3). Calculado pelo Intl, sem tabela fixa. */
function zoneOffsetMinutes(utcMs: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map(x => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - utcMs) / 60000);
}

/**
 * Data (AAAA-MM-DD) e horário (HH:MM) digitados, entendidos no fuso do evento, para o ISO com deslocamento que a API recebe
 * (ex.: 2026-12-12T22:00:00-03:00). Nulo se algum dos dois estiver vazio ou inválido.
 */
export function zonedInputsToIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [+d[1]!, +d[2]!, +d[3]!, +t[1]!, +t[2]!];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null; // 31/02 e afins
  // Duas passadas: o deslocamento depende do instante (horário de verão, se voltar a existir).
  let offset = zoneOffsetMinutes(wall);
  offset = zoneOffsetMinutes(wall - offset * 60000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}

/** Instante da API para os campos de data e horário no fuso do evento. */
export function isoToZonedInputs(iso: string): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map(x => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Máscara de valor: o que foi digitado vira centavos (só os dígitos contam). "8000" → 8000 centavos (R$ 80,00). */
export function centsFromMasked(text: string): number {
  const digits = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
  return digits ? Number(digits) : 0;
}

/** Centavos para o texto do campo com máscara, sem o símbolo: 8000 → "80,00"; 123456 → "1.234,56". */
export function maskedFromCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** Atrações digitadas uma por linha: sem linhas vazias nem espaços sobrando. */
export const attractionsFromText = (text: string): string[] =>
  text
    .split('\n')
    .map(a => a.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

// ---------- correção de dados pelo administrador (ADM13) e promoters (ADM08) ----------

const cpfCheck = (digits: number[], weightStart: number) => {
  const rest = (digits.reduce((t, d, i) => t + d * (weightStart - i), 0) * 10) % 11;
  return rest === 10 ? 0 : rest;
};
/** Mesmo critério do servidor (`domain/cpf.ts`): 11 dígitos, não repetidos, dígitos verificadores corretos. Só orienta. */
export function isCpfValid(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const n = [...d].map(Number);
  return cpfCheck(n.slice(0, 9), 10) === n[9] && cpfCheck(n.slice(0, 10), 11) === n[10];
}
/** 000.000.000-00 enquanto digita. */
export function maskCpfInput(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
export const isEmailLike = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
/** Código de promoter como o servidor guarda: maiúsculas, sem espaços. Válido com 3 a 20 letras ou números sem acento. */
export const normalizeCoupon = (v: string) => v.trim().toUpperCase();
export const isCouponValid = (v: string) => /^[A-Z0-9]{3,20}$/.test(v);

/** Data de calendário AAAA-MM-DD (vigência de um texto legal) em DD/MM/AAAA, sem fuso: é um dia, não um instante. */
export function calendarDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
