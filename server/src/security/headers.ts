import { secureHeaders } from 'hono/secure-headers';
import type { Config } from '../config';

/**
 * Cabeçalhos de segurança (seção 10): HSTS, CSP restritiva, sem enquadramento em outros sites e sem permissões de
 * aparelho além da câmera (leitura do QR na portaria). Fontes externas: só as do Google Fonts, já usadas pelo site.
 */
export function securityHeaders(
  config: Pick<Config, 'APP_ENV' | 'BANNER_BUCKET' | 'BANNER_PUBLIC_BASE_URL' | 'TURNSTILE_SITE_KEY'>,
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
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: self,
      scriptSrc: [...self, ...turnstile],
      // Estilos em linha: o React usa o atributo `style` em alguns elementos.
      // Fontes servidas pelo próprio site (@fontsource): sem Google Fonts.
      styleSrc: [...self, "'unsafe-inline'"],
      fontSrc: [...self],
      imgSrc: [...self, 'data:', 'blob:', ...(bannerOrigin ? [bannerOrigin] : [])],
      mediaSrc: [...self, 'blob:'],
      connectSrc: [...self, ...turnstile],
      ...(turnstile.length ? { frameSrc: turnstile } : {}),
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
