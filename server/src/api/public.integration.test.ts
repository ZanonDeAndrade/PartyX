import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDrizzle } from '../db/client';
import { createTestDatabase } from '../db/testing';
import { createFakeClock } from '../providers/clock';
import { MemoryBannerStorage } from '../providers/bannerStorage';
import { MemoryEmailSender } from '../providers/email';
import { argon2Hasher } from '../providers/passwordHasher';
import { escapeHtml } from '../vitrine/og';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const BASE = 'https://homolog.exemplo.test';

describe.skipIf(!ADMIN_URL)('vitrine pública (integração)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: ReturnType<typeof createApp>;
  const clock = createFakeClock('2026-10-10T15:00:00Z');
  const storage = new MemoryBannerStorage();
  const sql = (text: string, params: unknown[] = []) => testDb.pool.query(text, params);
  const dist = mkdtempSync(path.join(tmpdir(), 'partyx-vitrine-'));
  writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><html><head><!--og:start--><title>PartyX · Ingressos</title><meta property="og:title" content="padrao" /><!--og:end--></head><body><div id="root"></div></body></html>',
  );

  const get = (p: string, headers: Record<string, string> = {}) => app.request(p, { headers });
  const json = async <T = any>(res: Response) => (await res.json()) as T;

  let n = 0;
  /** Insere evento e tipos direto no banco, sem passar pelo painel. */
  async function event(
    o: {
      name?: string;
      status?: 'rascunho' | 'publicado' | 'encerrado';
      startsAt?: string;
      featured?: boolean;
      banner?: string | null;
      description?: string;
      types?: {
        name?: string;
        price?: number;
        start?: string;
        end?: string;
        total?: number;
        sold?: number;
        active?: boolean;
      }[];
    } = {},
  ) {
    const name = o.name ?? `Evento Teste ${++n}`;
    const slug = name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = (
      await sql(
        `insert into events (slug, name, starts_at, venue, address, description, attractions, age_rating, banner_url, status, is_featured)
         values ($1,$2,$3,'Arena Central','Av. Brasil, 1000',$4,$5,'18 anos',$6,$7,$8) returning id`,
        [
          slug,
          name,
          o.startsAt ?? '2026-12-12T22:00:00-03:00',
          o.description ?? 'Uma noite de música eletrônica.',
          ['DJ Exemplo'],
          o.banner ?? null,
          o.status ?? 'publicado',
          o.featured ?? false,
        ],
      )
    ).rows[0].id as string;
    for (const t of o.types ?? [{}]) {
      await sql(
        `insert into ticket_types (event_id, name, price_cents, quantity_total, quantity_sold, sales_start_at, sales_end_at, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          t.name ?? 'Pista',
          t.price ?? 8000,
          t.total ?? 100,
          t.sold ?? 0,
          t.start ?? '2026-10-01T00:00:00-03:00',
          t.end ?? '2026-12-12T20:00:00-03:00',
          t.active ?? true,
        ],
      );
    }
    return { id, slug, name };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase(ADMIN_URL!);
    app = createApp({
      config: loadConfig({ APP_ENV: 'local', WEB_DIST_DIR: dist, PUBLIC_BASE_URL: BASE }),
      clock,
      auth: { db: createDrizzle(testDb.pool), hasher: argon2Hasher, mailer: new MemoryEmailSender(), banners: storage },
    });
  });
  afterAll(async () => {
    await testDb?.drop();
  });
  beforeEach(async () => {
    await sql('truncate reservations, order_items, orders, ticket_types, events cascade');
    clock.set('2026-10-10T15:00:00Z');
  });

  describe('rascunho, publicado e encerrado (CA-07, CA-11)', () => {
    it('rascunho não aparece em lugar nenhum e a página dele não existe; ao publicar, aparece', async () => {
      const e = await event({ name: 'Festa Secreta', status: 'rascunho' });
      expect((await json(await get('/api/public/home'))).upcoming).toEqual([]);
      expect((await json(await get('/api/public/events'))).events).toEqual([]);
      expect((await json(await get('/api/public/events?q=secreta'))).events).toEqual([]);
      expect((await get(`/api/public/events/${e.slug}`)).status).toBe(404);

      await sql("update events set status = 'publicado' where id = $1", [e.id]);
      expect((await json(await get('/api/public/home'))).upcoming.map((x: any) => x.name)).toEqual(['Festa Secreta']);
      expect((await get(`/api/public/events/${e.slug}`)).status).toBe(200);
    });

    it('encerrado sai da listagem e da página inicial, mas a página continua acessível, sem venda', async () => {
      const e = await event({ name: 'Festa Antiga', types: [{}] });
      await sql("update events set status = 'encerrado' where id = $1", [e.id]);
      expect((await json(await get('/api/public/home'))).upcoming).toEqual([]);
      expect((await json(await get('/api/public/events'))).events).toEqual([]);
      expect((await json(await get('/api/public/events?q=antiga'))).events).toEqual([]);
      const page = (await json(await get(`/api/public/events/${e.slug}`))).event;
      expect(page.sale).toMatchObject({ kind: 'ended', label: 'Evento encerrado' });
      expect(page.ticketTypes[0]).toMatchObject({ state: 'encerrada', canBuy: false });
    });

    it('evento publicado sai da vitrine 8 horas depois do início', async () => {
      await event({ name: 'Festa de Hoje', startsAt: '2026-10-10T12:00:00Z' }); // começou há 3 h
      await event({ name: 'Festa de Ontem', startsAt: '2026-10-10T05:00:00Z' }); // começou há 10 h
      expect((await json(await get('/api/public/events'))).events.map((x: any) => x.name)).toEqual(['Festa de Hoje']);
    });
  });

  describe('página inicial (RF-20)', () => {
    it('separa destaques à venda dos próximos eventos, em ordem de data', async () => {
      await event({ name: 'Terceira Festa', startsAt: '2026-12-30T22:00:00-03:00' });
      await event({ name: 'Primeira Festa', startsAt: '2026-11-01T22:00:00-03:00', featured: true });
      await event({ name: 'Segunda Festa', startsAt: '2026-11-15T22:00:00-03:00' });
      await event({
        name: 'Destaque Esgotado',
        startsAt: '2026-11-20T22:00:00-03:00',
        featured: true,
        types: [{ sold: 100 }],
      });
      const body = await json(await get('/api/public/home'));
      expect(body.featured.map((x: any) => x.name)).toEqual(['Primeira Festa']); // destaque esgotado não vai para o topo
      expect(body.upcoming.map((x: any) => x.name)).toEqual([
        'Primeira Festa',
        'Segunda Festa',
        'Destaque Esgotado',
        'Terceira Festa',
      ]);
    });

    it('evento com vendas encerradas não entra na inicial', async () => {
      await event({ name: 'Vendas Fechadas', types: [{ end: '2026-10-05T00:00:00-03:00' }] });
      expect((await json(await get('/api/public/home'))).upcoming).toEqual([]);
    });

    it('o cartão traz preço inicial, data em UTC e não vaza id interno nem estoque', async () => {
      await event({
        types: [
          { name: 'VIP', price: 15000 },
          { name: 'Pista', price: 8000 },
          { name: 'Camarote', price: 30000, active: false },
        ],
      });
      const card = (await json(await get('/api/public/home'))).upcoming[0];
      expect(card.sale).toMatchObject({ kind: 'open', minPriceCents: 8000 });
      expect(card.startsAt).toBe('2026-12-13T01:00:00.000Z');
      expect(Object.keys(card).sort()).toEqual([
        'accentColor',
        'ageRating',
        'bannerPlaceholder',
        'bannerSrcSet',
        'bannerUrl',
        'isFeatured',
        'name',
        'privado',
        'sale',
        'slug',
        'startsAt',
        'venue',
      ]);
    });
  });

  describe('busca (RF-21, RF-22, CA-12)', () => {
    beforeEach(async () => {
      await event({ name: 'Festa Neon Verão', startsAt: '2026-12-12T22:00:00-03:00' });
      await event({ name: 'Baile do Zé Pelintra', startsAt: '2026-12-12T23:30:00-03:00' });
      await event({ name: 'Show Acústico', startsAt: '2026-12-20T20:00:00-03:00' });
    });
    const names = async (qs: string) =>
      (await json(await get(`/api/public/events${qs}`))).events.map((x: any) => x.name);

    it('acha por parte do nome, sem diferenciar acento nem maiúsculas', async () => {
      expect(await names('?q=neon')).toEqual(['Festa Neon Verão']);
      expect(await names('?q=VERAO')).toEqual(['Festa Neon Verão']);
      expect(await names('?q=ze%20pel')).toEqual(['Baile do Zé Pelintra']);
      expect(await names('?q=acustic')).toEqual(['Show Acústico']);
      expect(await names('?q=nada')).toEqual([]);
    });
    it('a data de links antigos é ignorada (16/10/2026, só a busca por nome do cabeçalho): o nome continua filtrando', async () => {
      const all = (await names('')).sort();
      expect((await names('?date=2026-12-12')).sort()).toEqual(all);
      expect((await names('?date=12/12/2026')).sort()).toEqual(all); // nem formato inválido dá erro
      expect(await names('?q=baile&date=2026-12-20')).toEqual(['Baile do Zé Pelintra']);
    });
    it('sem filtro lista tudo; com filtro mostra também esgotado e vendas encerradas', async () => {
      await event({ name: 'Festa Esgotada', types: [{ sold: 100 }] });
      await event({ name: 'Festa Encerrada', types: [{ end: '2026-10-05T00:00:00-03:00' }] });
      expect((await names('')).sort()).toEqual([
        'Baile do Zé Pelintra',
        'Festa Esgotada',
        'Festa Neon Verão',
        'Show Acústico',
      ]);
      expect(await names('?q=encerrada')).toEqual(['Festa Encerrada']);
      expect((await json(await get('/api/public/events?q=esgotada'))).events[0].sale.kind).toBe('out');
    });
    it('recusa busca longa; trata % e _ como texto comum', async () => {
      expect((await get(`/api/public/events?q=${'a'.repeat(120)}`)).status).toBe(422);
      expect(await names('?q=%25')).toEqual([]);
      expect(await names("?q='%3B%20drop%20table%20events%3B--")).toEqual([]);
      expect((await sql('select count(*)::int as n from events')).rows[0].n).toBe(3);
    });
  });

  describe('página do evento (RF-23, RF-24, RF-25, RF-27)', () => {
    it('traz os dados do evento e os tipos com preço, estado e texto', async () => {
      const e = await event({
        name: 'Noite Neon',
        types: [
          { name: 'Lote 1', price: 6000, start: '2026-09-01T00:00:00-03:00', end: '2026-09-30T00:00:00-03:00' },
          { name: 'Lote 2', price: 8000 },
          { name: 'Lote 3', price: 10000, start: '2026-11-01T00:00:00-03:00', end: '2026-11-30T00:00:00-03:00' },
          { name: 'VIP', price: 25000, total: 10, sold: 10 },
          { name: 'Camarote', price: 40000, active: false },
        ],
      });
      const page = (await json(await get(`/api/public/events/${e.slug}`))).event;
      expect(page).toMatchObject({
        name: 'Noite Neon',
        venue: 'Arena Central',
        address: 'Av. Brasil, 1000',
        ageRating: '18 anos',
        attractions: ['DJ Exemplo'],
      });
      const t = Object.fromEntries(page.ticketTypes.map((x: any) => [x.name, x]));
      expect(t['Lote 1']).toMatchObject({
        state: 'encerrada',
        label: 'Vendas encerradas',
        canBuy: false,
        priceCents: 6000,
      });
      expect(t['Lote 2']).toMatchObject({ state: 'a_venda', label: 'À venda', canBuy: true });
      expect(t['Lote 2'].note).toBe('Vendas até 12/12/2026 20:00.');
      expect(t['Lote 3']).toMatchObject({ state: 'em_breve', canBuy: false });
      expect(t['Lote 3'].note).toBe('Vendas a partir de 01/11/2026 00:00.');
      expect(t.VIP).toMatchObject({ state: 'esgotado', label: 'Esgotado', canBuy: false }); // CA-09
      expect(t.Camarote).toMatchObject({ state: 'indisponivel', canBuy: false });
      expect(JSON.stringify(page)).not.toMatch(/quantity|total|sold/i); // estoque exato não é público
    });

    it('unidades só reservadas aparecem como "indisponível no momento", não "esgotado"', async () => {
      const e = await event({ types: [{ total: 10, sold: 6 }] });
      const user = (
        await sql(
          "insert into users (name,email,cpf,password_hash,role) values ('Ana Teste','a@x.com','12345678909','x','cliente') returning id",
        )
      ).rows[0].id;
      const typeId = (await sql('select id from ticket_types where event_id = $1', [e.id])).rows[0].id;
      const order = (
        await sql('insert into orders (user_id,event_id,total_cents) values ($1,$2,32000) returning id', [user, e.id])
      ).rows[0].id;
      await sql(
        'insert into order_items (order_id,event_id,ticket_type_id,quantity,unit_price_cents) values ($1,$2,$3,4,8000)',
        [order, e.id, typeId],
      );
      await sql(
        "insert into reservations (order_id,ticket_type_id,quantity,expires_at) values ($1,$2,4,'2026-10-10T15:10:00Z')",
        [order, typeId],
      );
      const page = (await json(await get(`/api/public/events/${e.slug}`))).event;
      expect(page.ticketTypes[0]).toMatchObject({
        state: 'reservado',
        label: 'Indisponível no momento',
        canBuy: false,
      });
      expect(page.sale.kind).toBe('held');
      // A reserva vence: volta a ficar à venda.
      clock.set('2026-10-10T15:11:00Z');
      expect((await json(await get(`/api/public/events/${e.slug}`))).event.ticketTypes[0].state).toBe('a_venda');
    });

    it('slug inexistente ou inválido: 404, sem erro interno', async () => {
      expect((await get('/api/public/events/nao-existe')).status).toBe(404);
      expect((await get('/api/public/events/Com%20Espaco')).status).toBe(404);
      expect((await get("/api/public/events/a'%3Bdrop")).status).toBe(404);
    });

    it('nada da API vai para cache compartilhado, nem a vitrine (decisão de produção atrás do Firebase Hosting)', async () => {
      await event({ name: 'Festa Cache' });
      for (const path of [
        '/api/public/events',
        '/api/public/events/nao-existe',
        '/api/public/home',
        '/api/public/site',
      ])
        expect((await get(path)).headers.get('cache-control'), path).toBe('private, no-store');
    });

    it('é pública: responde sem sessão e informa o tema provisório', async () => {
      const site = await json(await get('/api/public/site'));
      expect(site).toEqual({
        environment: 'local',
        provisionalTheme: true,
        maxTicketsPerOrder: 6,
        salesOpen: true,
        turnstileSiteKey: null,
        partyx: {
          legalName: null,
          cnpj: null,
          address: null,
          supportEmail: null,
          supportWhatsapp: null,
          supportHours: null,
        },
        // Sem gateway neste teste: nada a mostrar no bloco "Formas de pagamento" (D-90).
        payment: { pix: false, card: false, maxInstallments: 1 },
      });
    });
  });

  describe('página inicial com a vitrine no HTML (LCP)', () => {
    // Cada teste 10 minutos depois do anterior (e à frente dos outros testes): o cache de 60 s da página inicial nunca
    // reaproveita a vitrine de outro teste.
    let slot = 0;
    const at = (offsetSeconds = 0) =>
      new Date(Date.parse('2026-10-10T18:00:00Z') + slot * 600_000 + offsetSeconds * 1000).toISOString();
    beforeEach(() => {
      slot++;
      clock.set(at());
    });
    const embedded = (html: string) =>
      JSON.parse(/<script id="px-home-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]!);

    it('embute os mesmos dados da API e pré-carrega o banner do destaque nas larguras registradas', async () => {
      const e = await event({ name: 'Noite Destaque', featured: true });
      const banner = `https://banners.exemplo.test/events/${e.id}/${'b'.repeat(32)}.webp`;
      await sql("update events set banner_url = $1, banner_widths = '{640,1080,1600}' where id = $2", [banner, e.id]);
      const res = await get('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-cache');
      const html = await res.text();
      expect(embedded(html)).toEqual(await json(await get('/api/public/home')));
      const srcset = `${banner.replace('.webp', '-w640.webp')} 640w, ${banner.replace('.webp', '-w1080.webp')} 1080w, ${banner} 1600w`;
      expect(html).toContain(
        `<link rel="preload" as="image" href="${banner}" imagesrcset="${srcset}" imagesizes="100vw" fetchpriority="high" />`,
      );
      expect(embedded(html).featured[0].bannerSrcSet).toBe(srcset);
    });

    it('banner antigo (sem larguras) pré-carrega só o arquivo principal; sem destaque, não há preload', async () => {
      const e = await event({ name: 'Antigo', featured: true });
      const banner = `https://banners.exemplo.test/events/${e.id}/${'c'.repeat(32)}.webp`;
      await sql('update events set banner_url = $1 where id = $2', [banner, e.id]);
      const html = await (await get('/')).text();
      expect(html).toContain(`<link rel="preload" as="image" href="${banner}" fetchpriority="high" />`);
      expect(embedded(html).featured[0].bannerSrcSet).toBeNull();

      clock.set(at(120));
      await sql('update events set is_featured = false');
      const plain = await (await get('/')).text();
      expect(plain).not.toContain('rel="preload" as="image"');
      expect(embedded(plain).featured).toEqual([]);
    });

    it('nome de evento com </script> não fecha o bloco de dados', async () => {
      await event({ name: 'Festa </script><script>alert(1)</script>' });
      const html = await (await get('/')).text();
      expect(html).not.toContain('</script><script>alert(1)');
      expect(embedded(html).upcoming[0].name).toBe('Festa </script><script>alert(1)</script>');
    });

    it('a consulta fica 60 s em cache; depois, a página traz os dados novos', async () => {
      await event({ name: 'Primeiro Nome' });
      expect(embedded(await (await get('/')).text()).upcoming[0].name).toBe('Primeiro Nome');
      await sql("update events set name = 'Nome Novo'");
      clock.set(at(59));
      expect(embedded(await (await get('/')).text()).upcoming[0].name).toBe('Primeiro Nome');
      clock.set(at(60));
      expect(embedded(await (await get('/')).text()).upcoming[0].name).toBe('Nome Novo');
    });
  });

  describe('Open Graph para o WhatsApp (RF-26, CA-13)', () => {
    async function withBanner(name: string, extra: Record<string, unknown> = {}) {
      const img = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#ff3366' } })
        .webp()
        .toBuffer();
      const e = await event({ name, ...extra });
      const bannerUrl = await storage.put(`events/${e.id}/${'a'.repeat(32)}.webp`, img, 'image/webp');
      await sql('update events set banner_url = $1 where id = $2', [bannerUrl, e.id]);
      return { ...e, bannerUrl };
    }

    it('injeta título, descrição, URL e imagem 1200x630 no HTML da página', async () => {
      const e = await withBanner('Noite Neon', { description: 'Uma noite de música eletrônica com DJs convidados.' });
      const res = await get(`/eventos/${e.slug}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<title>Noite Neon · PartyX</title>');
      expect(html).toContain('<meta property="og:title" content="Noite Neon · PartyX" />');
      expect(html).toContain(`<meta property="og:url" content="${BASE}/eventos/noite-neon" />`);
      expect(html).toContain(
        `<meta property="og:image" content="https://banners.exemplo.test/events/${e.id}/${'a'.repeat(32)}-og.jpg" />`,
      );
      expect(html).toContain('og:image:width" content="1200"');
      expect(html).toContain('twitter:card" content="summary_large_image"');
      expect(html).toMatch(/og:description" content="12\/12\/2026 às 22:00 · Arena Central\. Uma noite/);
      expect(html).not.toContain('content="padrao"'); // as tags padrão foram trocadas, sem duplicar
      expect(html.match(/<title>/g)).toHaveLength(1);
      expect(html).toContain('<div id="root">');
      // A capa começa a baixar junto com o HTML (15/10/2026), na largura da página.
      expect(html).toContain(
        `<link rel="preload" as="image" href="https://banners.exemplo.test/events/${e.id}/${'a'.repeat(32)}.webp" />`,
      );
    });

    it('sem banner: cartão simples, sem og:image', async () => {
      const e = await event({ name: 'Sem Banner' });
      const html = await (await get(`/eventos/${e.slug}`)).text();
      expect(html).toContain('og:title');
      expect(html).not.toContain('og:image');
      expect(html).not.toContain('rel="preload" as="image"');
      expect(html).toContain('twitter:card" content="summary"');
    });

    it('nome e descrição com HTML não escapam do atributo (XSS)', async () => {
      const evil = await event({
        name: 'Festa "><script>alert(1)</script>',
        description: '</title><img src=x onerror=alert(2)> $& $1',
      });
      const html = await (await get(`/eventos/${evil.slug}`)).text();
      expect(html).not.toContain('<script>alert(1)');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('$&amp; $1'); // `$` e `&` do texto não viram padrão de substituição
    });

    it('rascunho, inexistente e slug inválido: 404 com tags genéricas, sem vazar nada do evento', async () => {
      const d = await event({ name: 'Rascunho Sigiloso', status: 'rascunho', description: 'segredo-do-rascunho' });
      for (const p of [`/eventos/${d.slug}`, '/eventos/nao-existe', '/eventos/Com%20Espaco']) {
        const res = await get(p);
        expect(res.status, p).toBe(404);
        const html = await res.text();
        expect(html, p).toContain('PartyX · Ingressos');
        expect(html, p).not.toMatch(/Sigiloso|segredo-do-rascunho/);
      }
    });

    it('evento encerrado ainda tem pré-visualização', async () => {
      const e = await event({ name: 'Festa Passada', status: 'encerrado' });
      const res = await get(`/eventos/${e.slug}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Festa Passada · PartyX');
    });

    it('as outras páginas (/ e /eventos) usam o HTML padrão', async () => {
      for (const p of ['/', '/eventos']) {
        const res = await get(p);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('content="padrao"');
      }
    });
  });

  it('escapeHtml cobre os cinco caracteres perigosos', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
