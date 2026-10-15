-- expand-contract: revisada em 15/10/2026. Só EXPANDE. Coluna nova e anulável `events.accent_color` (nula = o roxo da PartyX, como
-- hoje; o código anterior não a lê nem grava) e uma CHECK que olha só essa coluna (`#RRGGBB` em maiúsculas), nula em todas as linhas
-- existentes: não recusa nada do código anterior. Nenhum dado muda. Reversão em drizzle/rollback/0014_cor_de_destaque.down.sql.
ALTER TABLE "events" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_accent_color_format" CHECK ("events"."accent_color" is null or "events"."accent_color" ~ '^#[0-9A-F]{6}$');