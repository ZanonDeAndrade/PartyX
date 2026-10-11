-- expand-contract: revisada em 10/10/2026. EXPANDE: coluna nova e NULA `events.closed_at` (o código anterior não a conhece e segue
-- funcionando; se ele encerrar um evento, a coluna fica nula e o código novo usa `updated_at`, que não muda mais depois do encerramento).
-- Migração de dados só PREENCHE a coluna nova dos eventos já encerrados, a partir da trilha (`audit_log`, ação `evento.encerrar`), ou de
-- `updated_at` se não houver registro na trilha. O gatilho de `updated_at` fica desligado só durante esse preenchimento, para não
-- reescrever a data de alteração dos eventos encerrados. Reversão em drizzle/rollback/0006_encerramento_do_evento.down.sql.
ALTER TABLE "events" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" DISABLE TRIGGER "events_set_updated_at";--> statement-breakpoint
UPDATE "events" e
   SET "closed_at" = COALESCE(
     (SELECT min(a."created_at") FROM "audit_log" a
       WHERE a."action" = 'evento.encerrar' AND a."entity" = 'event' AND a."entity_id" = e."id"),
     e."updated_at")
 WHERE e."status" = 'encerrado' AND e."closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ENABLE TRIGGER "events_set_updated_at";
