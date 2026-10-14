import { isIP } from 'node:net';

/**
 * IP mascarado para diagnóstico e log: IPv4 mantém os dois primeiros octetos (`177.86.x.x`); IPv6, os dois primeiros
 * grupos (`2804:14c::x`). Identifica a rede de origem sem guardar o endereço completo do visitante (dado pessoal).
 */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const value = ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const kind = isIP(value);
  if (kind === 4) {
    const [a, b] = value.split('.');
    return `${a}.${b}.x.x`;
  }
  if (kind === 6) {
    const groups = value.split('::')[0]!.split(':').filter(Boolean);
    return `${groups.slice(0, 2).join(':') || '0'}::x`;
  }
  return 'invalido';
}
