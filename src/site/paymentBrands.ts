import amex from '../assets/pagamento/amex.svg';
import elo from '../assets/pagamento/elo.svg';
import mastercard from '../assets/pagamento/mastercard.svg';
import pixSymbol from '../assets/pagamento/pix-simbolo.png';
import visa from '../assets/pagamento/visa.svg';

/**
 * Bandeiras e Pix mostrados nas formas de pagamento (página do evento e checkout), como configuração do site: nada é consultado no
 * Mercado Pago em tempo de página. As imagens são servidas do próprio domínio, em /assets com hash e cache longo (vite.config.ts).
 *
 * Fonte das bandeiras: `GET /v1/payment_methods` da conta de produção da PartyX (só leitura), consultado em 19/10/2026 14:09 UTC. Ativas
 * no crédito: Visa, Mastercard, Elo, American Express (e MP Card, fora por decisão do responsável); no débito, só Elo Débito; Hipercard
 * não aparece na conta. Escolha do responsável: Visa, Mastercard, Elo e American Express. Arquivos: os SVG oficiais indicados pela API
 * (`secure_thumbnail`, variante xl), com só a margem vazia cortada (viewBox na área desenhada; desenho e cores intactos).
 *
 * Pix: símbolo sozinho, recortado do arquivo oficial do Banco Central (`/content/estabilidadefinanceira/piximg/logo_pix.png`), sem
 * redesenho nem mudança de cor, a 24 px (redução máxima do símbolo no Manual de Uso da Marca Pix 1.6, de 14/05/2025). A imagem da API
 * era um PNG de 40 × 18 px. O manual proíbe a palavra "Pix" escrita ao lado do símbolo em outra tipografia: o nome fica no `alt`.
 * Detalhes: docs/registros/logos-formas-de-pagamento-2026-10-19.md.
 */
export interface PaymentLogo {
  id: string;
  /** Nome da bandeira, usado no `alt` e no texto alternativo do bloco. */
  name: string;
  src: string;
  /** Largura e altura intrínsecas (proporção do arquivo), para o navegador reservar o espaço antes de carregar. A altura vem do CSS. */
  width: number;
  height: number;
}

export const PAYMENT_LOGOS_CHECKED_AT = '2026-10-19T14:09:00Z';

export const CARD_BRANDS: readonly PaymentLogo[] = [
  { id: 'visa', name: 'Visa', src: visa, width: 301, height: 100 },
  { id: 'master', name: 'Mastercard', src: mastercard, width: 129, height: 100 },
  { id: 'elo', name: 'Elo', src: elo, width: 201, height: 100 },
  { id: 'amex', name: 'American Express', src: amex, width: 100, height: 100 },
];

export const PIX_LOGO: PaymentLogo = { id: 'pix', name: 'Pix', src: pixSymbol, width: 175, height: 176 };

/** Texto ao lado do símbolo Pix: sem a palavra "Pix" (Manual de Uso da Marca Pix 1.6); o nome está no `alt` do símbolo. */
export const PIX_TEXT = 'Pagamento instantâneo';

/** "Aceitamos Visa, Mastercard, Elo, American Express e Pix", montado a partir do que está à venda. */
export function acceptedText(card: boolean, pix: boolean): string {
  const names = [...(card ? CARD_BRANDS.map(b => b.name) : []), ...(pix ? [PIX_LOGO.name] : [])];
  if (names.length === 0) return '';
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `Aceitamos ${list}`;
}
