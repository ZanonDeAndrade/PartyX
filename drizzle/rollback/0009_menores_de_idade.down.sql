-- Reverte 0009_menores_de_idade. RECUSA se já existir prova ligada a menores: aceite do termo de menor ou entrada com a confirmação da
-- autorização na portaria (mesmo padrão da 0003). Sem prova, perde só dados que o código anterior não usa: a data de nascimento, os
-- campos de menores do evento e o retrato "comprador menor" dos pedidos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "minor_term_acceptances") THEN
    RAISE EXCEPTION 'Há aceites do termo de menor gravados (prova). Reverter apagaria a prova; resolva antes com a PartyX.';
  END IF;
  IF EXISTS (SELECT 1 FROM "checkins" WHERE "minor_authorization_received" IS NOT NULL) THEN
    RAISE EXCEPTION 'Há entradas com a confirmação da autorização de menor (prova). Reverter apagaria a prova.';
  END IF;
END $$;
DROP TRIGGER IF EXISTS "minor_term_acceptances_forbid_delete" ON "minor_term_acceptances";
DROP TABLE "minor_term_acceptances";
ALTER TABLE "checkins" DROP CONSTRAINT "checkins_minor_authorization_on_entry";
ALTER TABLE "checkins" DROP COLUMN "minor_authorization_received";
ALTER TABLE "orders" DROP COLUMN "buyer_minor";
ALTER TABLE "events" DROP CONSTRAINT "events_minors_need_authorization";
ALTER TABLE "events" DROP CONSTRAINT "events_ends_after_start";
ALTER TABLE "events" DROP COLUMN "judicial_authorization";
ALTER TABLE "events" DROP COLUMN "allows_minors";
ALTER TABLE "events" DROP COLUMN "ends_at";
ALTER TABLE "users" DROP CONSTRAINT "users_birth_date_range";
ALTER TABLE "users" DROP COLUMN "birth_date";
