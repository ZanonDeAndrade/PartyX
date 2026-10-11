import { T } from './format';

export const LS = 'partyx-proto-nav-v1';
export const NOW0 = T(2026, 10, 17, 23, 40),
  MIN = 60000,
  DAY = 86400000,
  RES_MIN = 10;
export const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PERIODS = [
  { v: 'hoje', l: 'Hoje (17/10)' },
  { v: '7d', l: 'Últimos 7 dias' },
  { v: '30d', l: 'Últimos 30 dias' },
  { v: 'mes', l: 'Outubro de 2026' },
  { v: 'set', l: 'Setembro de 2026' },
  { v: 'tudo', l: 'Todo o período' },
];
