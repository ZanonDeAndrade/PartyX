-- expand-contract: revisada em 15/10/2026. Só EXPANDE. Duas colunas novas em `events`: `countdown_enabled` com valor padrão true
-- (o código anterior não a lê; com true, o cronômetro aparece quando a versão nova entrar, como pedido) e `countdown_phrase`, anulável.
-- A CHECK nova olha só `countdown_phrase`, que nasce nula em todas as linhas e que o código anterior nunca grava: não recusa nada dele.
-- Nenhum dado muda. Reversão em drizzle/rollback/0012_cronometro_do_evento.down.sql (perde só as frases personalizadas).
ALTER TABLE "events" ADD COLUMN "countdown_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "countdown_phrase" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_countdown_phrase_format" CHECK ("events"."countdown_phrase" is null or (char_length("events"."countdown_phrase") between 1 and 40 and "events"."countdown_phrase" !~ '[<>]'));