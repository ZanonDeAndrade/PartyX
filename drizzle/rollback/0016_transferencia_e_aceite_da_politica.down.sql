-- Reverte 0016_transferencia_e_aceite_da_politica. RECUSA se já houver transferência ou aceite gravado (prova), como a 0009: reverter
-- apagaria o histórico de quem tem cada ingresso e os aceites da Política e do Termo de Ciência. Sem prova, perde só o titular dos
-- ingressos, que até então é sempre o comprador (`orders.user_id`). Os três valores do tipo de e-mail ficam: o PostgreSQL não remove
-- valor de enum e o código anterior não os usa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ticket_transfers") THEN
    RAISE EXCEPTION 'Há transferências de ingresso gravadas. Reverter apagaria quem é o titular de cada ingresso; desfaça-as antes.';
  END IF;
  IF EXISTS (SELECT 1 FROM "cancellation_acceptances") OR EXISTS (SELECT 1 FROM "ticket_minor_acceptances") THEN
    RAISE EXCEPTION 'Há aceites gravados (prova). Reverter apagaria a prova; resolva antes com a PartyX.';
  END IF;
END $$;
DROP TRIGGER IF EXISTS "cancellation_acceptances_forbid_delete" ON "cancellation_acceptances";
DROP TRIGGER IF EXISTS "ticket_minor_acceptances_forbid_delete" ON "ticket_minor_acceptances";
DROP TRIGGER IF EXISTS "ticket_transfers_forbid_delete" ON "ticket_transfers";
DROP TRIGGER IF EXISTS "ticket_transfers_no_update" ON "ticket_transfers";
DROP FUNCTION IF EXISTS "ticket_transfers_append_only"();
DROP TABLE "cancellation_acceptances";
DROP TABLE "ticket_minor_acceptances";
DROP TABLE "ticket_transfers";
DROP TRIGGER IF EXISTS "tickets_holder_default" ON "tickets";
DROP FUNCTION IF EXISTS "tickets_holder_default"();
DROP INDEX IF EXISTS "tickets_holder_idx";
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_holder_user_id_users_id_fk";
ALTER TABLE "tickets" DROP COLUMN "holder_minor";
ALTER TABLE "tickets" DROP COLUMN "holder_user_id";
