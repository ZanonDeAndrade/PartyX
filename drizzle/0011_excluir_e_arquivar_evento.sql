-- expand-contract: revisada em 15/10/2026. Só EXPANDE e afrouxa regras que o código anterior nunca exercita. Coluna nova anulável
-- `events.archived_at` (nula = como hoje; o código anterior não a lê nem grava). Os gatilhos que recusavam QUALQUER exclusão em
-- `events` e `ticket_types` dão lugar a gatilhos que recusam a exclusão de evento com uso (pedido em qualquer situação ou leitura de
-- portaria) e de tipo de evento com uso; as chaves estrangeiras de pedidos, itens, ingressos e leituras continuam impedindo apagar o
-- que é referenciado. O partyx_app ganha DELETE só nessas duas tabelas. O código anterior nunca apaga evento nem tipo, então segue
-- funcionando. Nenhum dado muda. Reversão em drizzle/rollback/0011_excluir_e_arquivar_evento.down.sql (recusa se houver arquivado).
ALTER TABLE "events" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
DROP TRIGGER "events_forbid_delete" ON "events";--> statement-breakpoint
DROP TRIGGER "ticket_types_forbid_delete" ON "ticket_types";--> statement-breakpoint
CREATE FUNCTION "event_in_use"(target uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM "orders" WHERE "event_id" = target)
      OR EXISTS (SELECT 1 FROM "checkins" WHERE "event_id" = target)
$$ LANGUAGE sql STABLE;--> statement-breakpoint
CREATE FUNCTION "events_delete_only_unused"() RETURNS trigger AS $$
BEGIN
  IF "event_in_use"(OLD."id") THEN
    RAISE EXCEPTION 'evento com pedidos ou leituras de portaria não pode ser apagado (arquive)' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "ticket_types_delete_only_unused"() RETURNS trigger AS $$
BEGIN
  IF "event_in_use"(OLD."event_id") THEN
    RAISE EXCEPTION 'tipo de ingresso de evento com pedidos ou leituras de portaria não pode ser apagado' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "events_delete_only_unused" BEFORE DELETE ON "events" FOR EACH ROW EXECUTE FUNCTION "events_delete_only_unused"();--> statement-breakpoint
CREATE TRIGGER "ticket_types_delete_only_unused" BEFORE DELETE ON "ticket_types" FOR EACH ROW EXECUTE FUNCTION "ticket_types_delete_only_unused"();--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    GRANT DELETE ON "events", "ticket_types" TO partyx_app;
  END IF;
END
$$;
