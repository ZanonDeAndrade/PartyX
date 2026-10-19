import { NONCE, secureHeaders } from 'hono/secure-headers';
import type { Context } from 'hono';
import type { Config } from '../config';

/**
 * Cabeçalhos de segurança (seção 10): HSTS, CSP restritiva, sem enquadramento em outros sites e sem permissões de
 * aparelho além da câmera (leitura do QR na portaria). Fontes externas: só as do Google Fonts, já usadas pelo site.
 */
/**
 * Mercado Pago (Card Payment Brick, só quando o gateway é o Mercado Pago). A documentação oficial manda carregar
 * `https://sdk.mercadopago.com/js/v2`; ela não publica a lista de domínios para CSP. Os demais foram medidos no navegador,
 * com o Brick em teste, registrando cada bloqueio da CSP (docs/pagamento-mercadopago.md, medição de 18/10/2026).
 * `www.mercadolibre.com`, `www.mercadolivre.com` e `www.mercadopago.com.br`: o perfil do aparelho do antifraude, que o SDK junta
 * ao token do cartão.
 * Fica de fora a telemetria do SDK (`api.mercadolibre.com/tracks`), sem efeito no pagamento.
 */
export const MERCADO_PAGO_CSP = {
  script: ['https://sdk.mercadopago.com', 'https://http2.mlstatic.com'],
  connect: [
    'https://api.mercadopago.com',
    'https://http2.mlstatic.com',
    'https://api-static.mercadopago.com',
    'https://secure-fields.mercadopago.com',
    'https://www.mercadolibre.com',
  ],
  frame: ['https://secure-fields.mercadopago.com'],
  img: ['https://www.mercadopago.com.br', 'https://www.mercadolibre.com', 'https://www.mercadolivre.com'],
};

/**
 * O SDK do Mercado Pago põe na página um script em linha, o perfil do aparelho do antifraude, com o conteúdo que o Mercado Pago
 * devolve na hora (hash não serve). A CSP libera esse script por um nonce novo a cada resposta, que a página entrega ao SDK
 * (`deviceProfileCspNonce`). O nonce vai num `<meta>` com o atributo `nonce`, que o navegador esconde do HTML depois de ler.
 */
export function injectCspNonce(html: string, c: Context): string {
  const nonce = c.get('secureHeadersNonce');
  if (!nonce) return html;
  return html.replace(/<\/head>/i, end => `<meta property="csp-nonce" nonce="${nonce}">${end}`);
}

export function securityHeaders(
  config: Pick<
    Config,
    'APP_ENV' | 'BANNER_BUCKET' | 'BANNER_PUBLIC_BASE_URL' | 'TURNSTILE_SITE_KEY' | 'PAYMENT_GATEWAY'
  >,
) {
  const bannerOrigin = config.BANNER_PUBLIC_BASE_URL
    ? new URL(config.BANNER_PUBLIC_BASE_URL).origin
    : config.BANNER_BUCKET
      ? 'https://storage.googleapis.com'
      : null;
  const self = ["'self'"];
  const prod = config.APP_ENV !== 'local';
  // Turnstile (cadastro e recuperação): script, quadro e chamadas da Cloudflare só quando o desafio está ligado.
  const turnstile = config.TURNSTILE_SITE_KEY ? ['https://challenges.cloudflare.com'] : [];
  const mp = config.PAYMENT_GATEWAY === 'mercadopago' ? MERCADO_PAGO_CSP : { script: [], connect: [], frame: [], img: [] };
  const frames = [...turnstile, ...mp.frame];
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: self,
      scriptSrc: [...self, ...(config.PAYMENT_GATEWAY === 'mercadopago' ? [NONCE] : []), ...turnstile, ...mp.script],
      // Estilos em linha: o React usa o atributo `style` em alguns elementos.
      // Fontes servidas pelo próprio site (@fontsource): sem Google Fonts.
      styleSrc: [...self, "'unsafe-inline'"],
      fontSrc: [...self],
      imgSrc: [...self, 'data:', 'blob:', ...(bannerOrigin ? [bannerOrigin] : []), ...mp.img],
      mediaSrc: [...self, 'blob:'],
      connectSrc: [...self, ...turnstile, ...mp.connect],
      ...(frames.length ? { frameSrc: frames } : {}),
      objectSrc: ["'none'"],
      baseUri: self,
      formAction: self,
      frameAncestors: ["'none'"],
      ...(prod ? { upgradeInsecureRequests: [] } : {}),
    },
    strictTransportSecurity: prod ? 'max-age=31536000; includeSubDomains' : false,
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: { camera: ['self'], microphone: [], geolocation: [], payment: [], usb: [] },
    crossOriginEmbedderPolicy: false,
  });
}
