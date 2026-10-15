import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { Db } from '../db/client';
import { events } from '../db/schema';
import type { BannerStorage } from '../providers/bannerStorage';
import { BANNER_VARIANT_WIDTHS, bannerPlaceholder, resizeWebp, variantObjectName } from './banner';

/** Nome do objeto a partir da URL pública: sempre `events/<id do evento>/<hash>.webp`, gerado pelo servidor no envio. */
const OBJECT = /(events\/[0-9a-f-]{36}\/[0-9a-f]{32}\.webp)$/;

export interface BannerVariantsDeps {
  db: Db;
  storage: BannerStorage;
  /** Lê o banner atual (normalmente pela URL pública). */
  fetchImage: (url: string) => Promise<Buffer>;
}

export interface BannerVariantsReport {
  /** Eventos com banner e sem larguras registradas. */
  pending: number;
  /** Atualizados (só com `execute`). */
  updated: number;
  /** URL fora do padrão ou imagem ilegível: ficam como estão (o site usa só a `banner_url`). */
  skipped: { eventId: string; reason: string }[];
}

/**
 * Gera as versões menores (640 e 1080 px) dos banners enviados antes da migração 0007 e registra as larguras do evento.
 * Idempotente: só pega eventos com `banner_widths` vazio, e a atualização só vale se o banner não mudou no meio do caminho.
 * Sem `execute`, só conta e confere (nada é gravado no armazenamento nem no banco).
 */
export async function backfillBannerVariants(
  deps: BannerVariantsDeps,
  options: { execute: boolean },
): Promise<BannerVariantsReport> {
  const rows = await deps.db
    .select({ id: events.id, bannerUrl: events.bannerUrl })
    .from(events)
    .where(and(isNotNull(events.bannerUrl), sql`cardinality(${events.bannerWidths}) = 0`));
  const report: BannerVariantsReport = { pending: rows.length, updated: 0, skipped: [] };
  for (const row of rows) {
    const url = row.bannerUrl!;
    const name = OBJECT.exec(url)?.[1];
    if (!name) {
      report.skipped.push({ eventId: row.id, reason: 'URL fora do padrão events/<id>/<hash>.webp' });
      continue;
    }
    let width: number;
    let data: Buffer;
    try {
      data = await deps.fetchImage(url);
      width = (await sharp(data).metadata()).width ?? 0;
      if (!width) throw new Error('sem largura');
    } catch {
      report.skipped.push({ eventId: row.id, reason: 'não foi possível ler a imagem' });
      continue;
    }
    if (!options.execute) continue;
    const widths: number[] = [];
    for (const w of BANNER_VARIANT_WIDTHS) {
      if (w >= width) continue;
      await deps.storage.put(variantObjectName(name, w), await resizeWebp(data, w), 'image/webp');
      widths.push(w);
    }
    widths.push(width);
    const updated = await deps.db
      .update(events)
      .set({ bannerWidths: widths })
      .where(and(eq(events.id, row.id), eq(events.bannerUrl, url), sql`cardinality(${events.bannerWidths}) = 0`))
      .returning({ id: events.id });
    report.updated += updated.length;
  }
  return report;
}

/**
 * Miniatura das capas enviadas antes da migração 0015 (efeito de capa desfocada que fica nítida). Mesmas regras do preenchimento
 * acima: só eventos com capa e sem miniatura, a gravação só vale se a capa não mudou no meio do caminho e, sem `execute`, só conta.
 * Lê a versão de 640 px quando existe (menos bytes). Nada é gravado no armazenamento: a miniatura vai só para o banco.
 */
export async function backfillBannerPlaceholders(
  deps: BannerVariantsDeps,
  options: { execute: boolean },
): Promise<BannerVariantsReport> {
  const rows = await deps.db
    .select({ id: events.id, bannerUrl: events.bannerUrl, bannerWidths: events.bannerWidths })
    .from(events)
    .where(and(isNotNull(events.bannerUrl), isNull(events.bannerPlaceholder)));
  const report: BannerVariantsReport = { pending: rows.length, updated: 0, skipped: [] };
  for (const row of rows) {
    const url = row.bannerUrl!;
    if (!OBJECT.test(url)) {
      report.skipped.push({ eventId: row.id, reason: 'URL fora do padrão events/<id>/<hash>.webp' });
      continue;
    }
    let placeholder: string;
    try {
      const source = row.bannerWidths.includes(640) ? url.replace(/\.webp$/, '-w640.webp') : url;
      placeholder = await bannerPlaceholder(await deps.fetchImage(source));
    } catch {
      report.skipped.push({ eventId: row.id, reason: 'não foi possível ler a imagem' });
      continue;
    }
    if (!options.execute) continue;
    const updated = await deps.db
      .update(events)
      .set({ bannerPlaceholder: placeholder })
      .where(and(eq(events.id, row.id), eq(events.bannerUrl, url), isNull(events.bannerPlaceholder)))
      .returning({ id: events.id });
    report.updated += updated.length;
  }
  return report;
}

