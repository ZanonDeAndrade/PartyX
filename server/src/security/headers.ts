import { secureHeaders } from 'hono/secure-headers';
import type { Config } from '../config';

/**
 * Cabeçalhos de segurança (seção 10): HSTS, CSP restritiva, sem enquadramento em outros sites e sem permissões de
 * aparelho além da câmera (leitura do QR na portaria). Fontes externas: só as do Google Fonts, já usadas pelo site.
 */
/**
 * Mercado Pago (Card Payment Brick, só quando o gateway é o Mercado Pago). A documentação oficial manda carregar
 * `https://sdk.mercadopago.com/js/v2`; ela não publica a lista de domínios para CSP. Os demais foram medidos no navegador,
 * com o Brick em teste, registrando cada bloqueio da CSP (docs/pagamentos/mercadopago.md).
 */
export const MERCADO_PAGO_CSP = {
  script: ['https://sdk.mercadopago.com', 'https://http2.mlstatic.com'],
  connect: [
    'https://api.mercadopago.com',
    'https://http2.mlstatic.com',
    'https://api-static.mercadopago.com',
    'https://secure-fields.mercadopago.com',
  ],
  frame: ['https://secure-fields.mercadopago.com'],
  img: [] as string[],
};

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
      scriptSrc: [...self, ...turnstile, ...mp.script],
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
