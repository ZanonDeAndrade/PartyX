-- Reverte 0011_excluir_e_arquivar_evento. RECUSA se houver evento arquivado: sem a coluna, ele voltaria para a vitrine e para a venda.
-- Desarquive pelo painel (ou decida com a PartyX) antes. Eventos já apagados não voltam: a exclusão só alcançou evento sem pedido, sem
-- ingresso e sem leitura de portaria, e ficou na trilha (`evento.excluir`). Depois desta reversão, evento e tipo voltam a não aceitar
-- exclusão nenhuma (gatilhos `forbid_delete` da 0001) e o partyx_app perde o DELETE nas duas tabelas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "events" WHERE "archived_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'Há eventos arquivados. Reverter os traria de volta para a vitrine; desarquive antes.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    REVOKE DELETE ON "events", "ticket_types" FROM partyx_app;
  END IF;
END $$;
DROP TRIGGER IF EXISTS "ticket_types_delete_only_unused" ON "ticket_types";
DROP TRIGGER IF EXISTS "events_delete_only_unused" ON "events";
DROP FUNCTION IF EXISTS "ticket_types_delete_only_unused"();
DROP FUNCTION IF EXISTS "events_delete_only_unused"();
DROP FUNCTION IF EXISTS "event_in_use"(uuid);
CREATE TRIGGER "events_forbid_delete" BEFORE DELETE ON "events" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();
CREATE TRIGGER "ticket_types_forbid_delete" BEFORE DELETE ON "ticket_types" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();
ALTER TABLE "events" DROP COLUMN "archived_at";
