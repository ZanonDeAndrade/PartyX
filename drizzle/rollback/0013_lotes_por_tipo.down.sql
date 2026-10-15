-- Reverte 0013_lotes_por_tipo. RECUSA se algum tipo tiver mais de um lote: reverter apagaria preços e quantidades de lotes e a
-- divisão de pedidos entre lotes. Com só o "Lote único" em cada tipo, nada se perde (o preço do tipo já espelha o do lote).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ticket_lots" GROUP BY "ticket_type_id" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Há tipos de ingresso com mais de um lote. Reverter apagaria os lotes e a divisão dos pedidos; resolva antes.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    REVOKE DELETE ON "ticket_lots" FROM partyx_app;
  END IF;
END $$;
DROP TRIGGER IF EXISTS "order_item_lots_forbid_delete" ON "order_item_lots";
DROP TRIGGER IF EXISTS "ticket_lots_set_updated_at" ON "ticket_lots";
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_lot_fk";
ALTER TABLE "tickets" DROP COLUMN "lot_id";
DROP TABLE "order_item_lots";
DROP TABLE "ticket_lots";
ALTER TABLE "ticket_types" DROP COLUMN "last_units_notice";
DROP TYPE "lot_status";
DROP TYPE "lot_close_reason";
DROP TYPE "lot_leftover";
