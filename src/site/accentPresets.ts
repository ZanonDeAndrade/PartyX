/**
 * Só do painel (campo "Cor de destaque"): fica fora de `accent.ts`, que a página pública também usa, para não ir no JavaScript do
 * site.
 */
import { ACCENT_DEFAULT } from './accent';

export const ACCENT_FORMAT_ERROR = 'Use uma cor no formato #RRGGBB (por exemplo, #7C3AED).';

/**
 * Cores prontas: o roxo da PartyX (o padrão: escolher grava o campo vazio) e sete cores de festa. Todas com texto legível sobre a
 * própria cor, sem ajuste de tom (`accent.test.ts`).
 */
export const ACCENT_PRESETS: readonly { name: string; hex: string }[] = [
  { name: 'Roxo da PartyX (padrão)', hex: ACCENT_DEFAULT },
  { name: 'Verde neon', hex: '#39FF14' },
  { name: 'Vermelho', hex: '#E4002B' },
  { name: 'Laranja', hex: '#FF6B00' },
  { name: 'Rosa', hex: '#FF2E93' },
  { name: 'Azul', hex: '#3B5BFF' },
  { name: 'Amarelo', hex: '#FFD60A' },
  { name: 'Ciano', hex: '#00E5FF' },
];
