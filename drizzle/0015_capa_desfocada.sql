-- expand-contract: revisada em 15/10/2026. Só EXPANDE. Coluna nova e anulável `events.banner_placeholder` (a miniatura da capa em
-- `data:image/webp;base64`, para o efeito de capa desfocada que fica nítida; o código anterior não a lê nem grava) e uma CHECK que olha
-- só essa coluna e a `banner_url` (miniatura só com capa, até 1.500 caracteres, só base64), nula em todas as linhas existentes: não recusa
-- nada do código anterior. Nenhum dado muda. Reversão em drizzle/rollback/0015_capa_desfocada.down.sql.
ALTER TABLE "events" ADD COLUMN "banner_placeholder" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_banner_placeholder_format" CHECK ("events"."banner_placeholder" is null or ("events"."banner_url" is not null and char_length("events"."banner_placeholder") <= 1500 and starts_with("events"."banner_placeholder", 'data:image/webp' || chr(59) || 'base64,') and substr("events"."banner_placeholder", 24) ~ '^[A-Za-z0-9+/]+={0,2}$'));