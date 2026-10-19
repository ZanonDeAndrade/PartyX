import { CARD_BRANDS, PIX_LOGO, type PaymentLogo } from './paymentBrands';

/**
 * Logos das formas de pagamento, do próprio domínio (src/site/paymentBrands.ts), sempre sobre fundo branco para manter as cores
 * oficiais. Altura pelo CSS: 24 px no computador e 20 px no celular para as bandeiras; o símbolo Pix fica em 24 px sempre (redução
 * máxima do Manual de Uso da Marca Pix 1.6). Cada logo tem o nome no `alt`.
 */
function Logo({ logo, pix }: { logo: PaymentLogo; pix?: boolean }) {
  return (
    <img
      className={`px-paylogo${pix ? ' px-paylogo-pix' : ''}`}
      src={logo.src}
      alt={logo.name}
      width={logo.width}
      height={logo.height}
      loading="lazy"
      decoding="async"
    />
  );
}

export function CardBrandLogos() {
  return (
    <span className="px-paylogos">
      {CARD_BRANDS.map(b => (
        <Logo key={b.id} logo={b} />
      ))}
    </span>
  );
}

export function PixLogo() {
  return (
    <span className="px-paylogos">
      <Logo logo={PIX_LOGO} pix />
    </span>
  );
}
