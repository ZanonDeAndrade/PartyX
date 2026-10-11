import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../domain/errors';

export const BANNER_MAX_BYTES = 5 * 1024 * 1024;
export const BANNER_MIN_WIDTH = 600;
export const BANNER_MAX_WIDTH = 1600;
/** Contra "bombas de descompressão": imagem pequena em bytes e gigante em pixels. */
const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED = new Set(['jpeg', 'png', 'webp']);

export interface ShareImage {
  data: Buffer;
  contentType: 'image/jpeg';
  width: 1200;
  height: 630;
}

/**
 * Larguras menores geradas junto com o banner, para o navegador escolher pelo tamanho da tela (`srcset`). A maior versão é o
 * próprio banner (até `BANNER_MAX_WIDTH`). Só entram as menores que a imagem: nada é ampliado.
 */
export const BANNER_VARIANT_WIDTHS = [640, 1080] as const;

export interface BannerVariant {
  width: number;
  data: Buffer;
}

export interface ProcessedBanner {
  /** Versões menores em WebP, da menor para a maior. */
  variants: BannerVariant[];
  data: Buffer;
  /** Versão 1200x630 em JPEG para pré-visualização em WhatsApp e redes sociais. */
  share: ShareImage;
  contentType: 'image/webp';
  width: number;
  height: number;
  /** Primeiros 32 caracteres hexadecimais do SHA-256 do arquivo final. */
  hash: string;
}

const reject = (code: string, message: string, status: 400 | 413 | 422 = 422) => new AppError(status, code, message);

/**
 * Valida pelo conteúdo (não pelo nome nem pelo Content-Type enviado), redimensiona e reencoda.
 * Reencodar descarta metadados (EXIF, GPS) e qualquer carga escondida no arquivo original.
 * Aceita JPEG, PNG e WebP. SVG e GIF são recusados.
 */
export async function processBanner(input: Buffer): Promise<ProcessedBanner> {
  if (input.length === 0) throw reject('arquivo_vazio', 'O arquivo está vazio.');
  if (input.length > BANNER_MAX_BYTES) {
    throw reject('arquivo_grande', 'A imagem passa de 5 MB. Escolha um arquivo menor.', 413);
  }
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !ACCEPTED.has(meta.format)) {
      throw reject('formato_invalido', 'Use uma imagem JPG, PNG ou WebP.');
    }
    // Largura e altura de exibição, já considerando a rotação da câmera (EXIF).
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? 0;
    if (width < BANNER_MIN_WIDTH) {
      throw reject('imagem_pequena', `A imagem precisa ter pelo menos ${BANNER_MIN_WIDTH} px de largura.`);
    }
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: BANNER_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const variants: BannerVariant[] = [];
    for (const w of BANNER_VARIANT_WIDTHS) {
      if (w >= info.width) continue;
      variants.push({ width: w, data: await resizeWebp(data, w) });
    }
    return {
      variants,
      data,
      share: await shareImage(input),
      contentType: 'image/webp',
      width: info.width,
      height: info.height,
      hash: createHash('sha256').update(data).digest('hex').slice(0, 32),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Arquivo corrompido, truncado ou grande demais em pixels.
    throw reject('imagem_invalida', 'Não foi possível ler a imagem. Escolha outro arquivo JPG, PNG ou WebP.');
  }
}

/** O WhatsApp ignora pré-visualização com imagem grande; a meta é ficar abaixo de ~300 KB. Reduz a qualidade até caber. */
const SHARE_TARGET_BYTES = 280 * 1024;

async function shareImage(input: Buffer): Promise<ShareImage> {
  let data = Buffer.alloc(0);
  for (const quality of [82, 72, 62, 52, 42]) {
    data = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: 1200, height: 630, fit: 'cover' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (data.length <= SHARE_TARGET_BYTES) break;
  }
  return { data, contentType: 'image/jpeg', width: 1200, height: 630 };
}

/** Endereço da imagem de pré-visualização, derivado do banner: `<hash>.webp` → `<hash>-og.jpg`. Gravada junto com o banner. */
export const shareObjectName = (bannerObjectName: string): string => bannerObjectName.replace(/\.webp$/, '-og.jpg');
export const shareImageUrl = (bannerUrl: string): string => bannerUrl.replace(/\.webp$/, '-og.jpg');

/** Reduz um banner já processado (WebP limpo) para a largura pedida, também em WebP. Usado no envio e no script de versões. */
export function resizeWebp(webp: Buffer, width: number): Promise<Buffer> {
  return sharp(webp, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

/** Nome do objeto de uma versão menor: `<hash>.webp` → `<hash>-w640.webp`. Gravada ao lado do banner. */
export const variantObjectName = (bannerObjectName: string, width: number): string =>
  bannerObjectName.replace(/\.webp$/, `-w${width}.webp`);
export const variantUrl = (bannerUrl: string, width: number): string => bannerUrl.replace(/\.webp$/, `-w${width}.webp`);

/**
 * `srcset` do banner a partir das larguras registradas (a maior é a própria `bannerUrl`). Nulo sem larguras: banner anterior
 * às versões menores, ou só uma largura (o `src` basta).
 */
export function bannerSrcSet(bannerUrl: string | null, widths: readonly number[]): string | null {
  if (!bannerUrl || widths.length < 2 || !bannerUrl.endsWith('.webp')) return null;
  const sorted = [...widths].sort((a, b) => a - b);
  const largest = sorted[sorted.length - 1]!;
  return sorted.map(w => `${w === largest ? bannerUrl : variantUrl(bannerUrl, w)} ${w}w`).join(', ');
}
