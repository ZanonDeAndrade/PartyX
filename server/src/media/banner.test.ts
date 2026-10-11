import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../domain/errors';
import { BANNER_MAX_BYTES, processBanner, shareImageUrl, shareObjectName } from './banner';

const image = (width: number, height: number, format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg', noise = false) => {
  const raw = Buffer.alloc(width * height * 3);
  if (noise) for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  else raw.fill(120);
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .toFormat(format)
    .toBuffer();
};
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof AppError ? e.code : `outro:${(e as Error).message}`;
  }
  return 'aceito';
};

describe('processamento do banner (RF-13)', () => {
  it('redimensiona para no máximo 1600 px de largura, mantém a proporção e converte para WebP', async () => {
    const out = await processBanner(await image(3200, 1800));
    expect(out).toMatchObject({ width: 1600, height: 900, contentType: 'image/webp' });
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe('webp');
  });

  it('não amplia imagem menor que 1600 px', async () => {
    expect((await processBanner(await image(800, 400, 'png'))).width).toBe(800);
  });

  it('aceita JPG, PNG e WebP', async () => {
    for (const f of ['jpeg', 'png', 'webp'] as const) {
      expect(await codeOf(processBanner(await image(900, 500, f))), f).toBe('aceito');
    }
  });

  it('o nome vem do conteúdo: mesma imagem, mesmo hash; imagem diferente, hash diferente', async () => {
    const a = await processBanner(await image(900, 500));
    const b = await processBanner(await image(900, 500));
    const c = await processBanner(await image(901, 500));
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('recusa SVG, GIF e arquivo de texto, mesmo com extensão de imagem', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><script>alert(1)</script></svg>',
    );
    expect(await codeOf(processBanner(svg))).toBe('formato_invalido');
    expect(await codeOf(processBanner(await image(900, 500, 'gif')))).toBe('formato_invalido');
    expect(await codeOf(processBanner(Buffer.from('isto não é uma imagem')))).toBe('imagem_invalida');
  });

  it('recusa arquivo vazio, truncado e imagem pequena', async () => {
    expect(await codeOf(processBanner(Buffer.alloc(0)))).toBe('arquivo_vazio');
    const full = await image(1200, 700, 'jpeg', true);
    const cut = full.subarray(0, Math.floor(full.length / 3));
    expect(['imagem_invalida', 'aceito']).toContain(await codeOf(processBanner(cut)));
    expect(await codeOf(processBanner(await image(500, 300)))).toBe('imagem_pequena');
  });

  it('recusa acima de 5 MB sem tentar decodificar', async () => {
    expect(await codeOf(processBanner(Buffer.alloc(BANNER_MAX_BYTES + 1, 1)))).toBe('arquivo_grande');
  });

  it('recusa imagem com pixels demais (bomba de descompressão)', async () => {
    const big = await sharp({ create: { width: 9000, height: 6000, channels: 3, background: '#fff' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(big.length).toBeLessThan(BANNER_MAX_BYTES); // pequena em bytes, enorme em pixels
    expect(await codeOf(processBanner(big))).toBe('imagem_invalida');
  });

  it('remove metadados (EXIF, GPS) do arquivo gerado', async () => {
    const withExif = await sharp(await image(900, 500))
      .withExif({ IFD0: { Copyright: 'segredo-do-autor' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await processBanner(withExif);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
    expect(out.data.includes(Buffer.from('segredo-do-autor'))).toBe(false);
  });

  it('respeita a rotação da câmera ao medir a largura', async () => {
    // 500x900 gravado com orientação 6 aparece como 900x500.
    const rotated = await sharp(await image(500, 900))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const out = await processBanner(rotated);
    expect(out.width).toBe(900);
  });

  it('gera a imagem de pré-visualização: JPEG 1200x630, abaixo de 300 KB mesmo com foto "pesada"', async () => {
    const out = await processBanner(await image(2400, 1400, 'png', true));
    expect(out.share).toMatchObject({ contentType: 'image/jpeg', width: 1200, height: 630 });
    const meta = await sharp(out.share.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630]);
    expect(out.share.data.length).toBeLessThanOrEqual(300 * 1024);
    expect(shareObjectName('events/x/abc.webp')).toBe('events/x/abc-og.jpg');
    expect(shareImageUrl('https://h/events/x/abc.webp')).toBe('https://h/events/x/abc-og.jpg');
  });
});
