export const T = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
export const BRLF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = c => BRLF.format((c || 0) / 100);
export const pad = n => String(n).padStart(2, '0');
export const fD = ts => {
  const d = new Date(ts);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
};
export const fT = ts => {
  const d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
};
export const fTs = ts => {
  const d = new Date(ts);
  return fT(ts) + ':' + pad(d.getSeconds());
};
export const fDT = ts => fD(ts) + ' às ' + fT(ts);
export const fDTs = ts => fD(ts) + ' ' + fT(ts);
export const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  WDL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  MOL = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
export const fShort = ts => {
  const d = new Date(ts);
  return (WD[d.getDay()] + ', ' + pad(d.getDate()) + ' ' + MO[d.getMonth()]).toUpperCase() + ' · ' + fT(ts);
};
export const fLong = ts => {
  const d = new Date(ts);
  return WDL[d.getDay()] + ', ' + d.getDate() + ' de ' + MOL[d.getMonth()] + ' de ' + d.getFullYear();
};
export const norm = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export function cpfFull(n9) {
  const d = n9.split('').map(Number);
  let s = 0;
  for (let i = 0; i < 9; i++) s += d[i] * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  d.push(r);
  s = 0;
  for (let i = 0; i < 10; i++) s += d[i] * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  d.push(r);
  return d.join('');
}
export function cpfOk(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  return cpfFull(s.slice(0, 9)) === s;
}
export const fmtCPF = s => {
  s = String(s || '');
  return s.slice(0, 3) + '.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-' + s.slice(9);
};
export const maskCPF = s => {
  s = String(s || '');
  return s ? '***.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-**' : '';
};
export const maskEmail = e => {
  const [a, b] = String(e).split('@');
  return a[0] + '***@' + b;
};
export const mCPF = v => {
  const s = v.replace(/\D/g, '').slice(0, 11);
  let o = s.slice(0, 3);
  if (s.length > 3) o += '.' + s.slice(3, 6);
  if (s.length > 6) o += '.' + s.slice(6, 9);
  if (s.length > 9) o += '-' + s.slice(9);
  return o;
};
export const mPhone = v => {
  const s = v.replace(/\D/g, '').slice(0, 11);
  if (!s) return '';
  let o = '(' + s.slice(0, 2);
  if (s.length > 2) {
    o += ') ';
    if (s.length <= 10) o += s.slice(2, 6) + (s.length > 6 ? '-' + s.slice(6) : '');
    else o += s.slice(2, 7) + '-' + s.slice(7);
  }
  return o;
};
