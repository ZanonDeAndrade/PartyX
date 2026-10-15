import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { MemoryBannerStorage } from '../providers/bannerStorage';
import { backfillBannerPlaceholders, backfillBannerVariants } from './bannerVariants';

const ADMIN_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!ADMIN_URL)('versões menores dos banners antigos (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  let image: Buffer;
  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    image = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#7c3aed' } })
      .webp()
      .toBuffer();
  });
  afterAll(async () => {
    await testDb?.drop();
  });

  async function event(slug: string, bannerUrl: string | null) {
    return (
      await sql(
        `insert into events (slug, name, starts_at, venue, address, description, age_rating, status, banner_url)
         values ($1, $1, now() + interval '10 day', 'Local', 'Rua', 'Descrição', '18 anos', 'publicado', $2) returning id`,
        [slug, bannerUrl],
      )
    ).rows[0].id as string;
  }

  it('sem --executar só confere; executando grava 640 e 1080 px, registra as larguras e não repete', async () => {
    const id = await event('com-banner', null);
    const url = `https://banners.exemplo.test/events/${id}/${'d'.repeat(32)}.webp`;
    await sql('update events set banner_url = $1 where id = $2', [url, id]);
    const fora = await event('fora-do-padrao', 'https://outro.exemplo.test/qualquer.png');
    await event('sem-banner', null);

    const storage = new MemoryBannerStorage();
    const fetched: string[] = [];
    const deps = {
      db: createDrizzle(testDb.pool),
      storage,
      fetchImage: async (u: string) => {
        fetched.push(u);
        return image;
      },
    };

    const dry = await backfillBannerVariants(deps, { execute: false });
    expect(dry).toMatchObject({ pending: 2, updated: 0 });
    expect(dry.skipped).toEqual([{ eventId: fora, reason: 'URL fora do padrão events/<id>/<hash>.webp' }]);
    expect(storage.objects.size).toBe(0);
    expect((await sql('select banner_widths from events where id = $1', [id])).rows[0].banner_widths).toEqual([]);

    const run = await backfillBannerVariants(deps, { execute: true });
    expect(run.updated).toBe(1);
    expect([...storage.objects.keys()].sort()).toEqual([
      `events/${id}/${'d'.repeat(32)}-w1080.webp`,
      `events/${id}/${'d'.repeat(32)}-w640.webp`,
    ]);
    for (const [name, obj] of storage.objects)
      expect((await sharp(obj.data).metadata()).width).toBe(name.endsWith('-w640.webp') ? 640 : 1080);
    expect((await sql('select banner_widths from events where id = $1', [id])).rows[0].banner_widths).toEqual([
      640, 1080, 1600,
    ]);

    // Já registrado: na próxima rodada só o fora do padrão continua pendente, e nada é gravado de novo.
    const again = await backfillBannerVariants(deps, { execute: true });
    expect(again).toMatchObject({ pending: 1, updated: 0 });
    expect(storage.objects.size).toBe(2);
    expect(fetched.filter(u => u === url)).toHaveLength(2);
  });

  it('miniaturas das capas antigas (0015): confere sem gravar, grava pela versão de 640 px, não repete e só no banco', async () => {
    const id = await event('capa-antiga', null);
    const url = `https://banners.exemplo.test/events/${id}/${'e'.repeat(32)}.webp`;
    await sql("update events set banner_url = $1, banner_widths = '{640,1080,1600}' where id = $2", [url, id]);
    const storage = new MemoryBannerStorage();
    const fetched: string[] = [];
    const deps = {
      db: createDrizzle(testDb.pool),
      storage,
      fetchImage: async (u: string) => {
        fetched.push(u);
        return image;
      },
    };
    const placeholderOf = async () => (await sql('select banner_placeholder from events where id = $1', [id])).rows[0].banner_placeholder;

    const dry = await backfillBannerPlaceholders(deps, { execute: false });
    expect(dry.updated).toBe(0);
    expect(await placeholderOf()).toBeNull();

    const run = await backfillBannerPlaceholders(deps, { execute: true });
    expect(run.updated).toBeGreaterThanOrEqual(1);
    const placeholder = await placeholderOf();
    expect(placeholder).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/);
    expect(placeholder.length).toBeLessThanOrEqual(1500);
    expect(fetched).toContain(url.replace(/\.webp$/, '-w640.webp'));
    expect(storage.objects.size).toBe(0);

    const again = await backfillBannerPlaceholders(deps, { execute: true });
    expect(again.updated).toBe(0);
    expect(await placeholderOf()).toBe(placeholder);
  });
});
