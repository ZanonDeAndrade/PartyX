-- Reverte 0018_desconto_por_promoter. Recusa se algum pedido já tiver desconto: apagar as colunas perderia o desconto de cada pedido
-- (o total continua, mas o valor dos ingressos e a conciliação deixariam de fechar). Sem pedido com desconto, perde só a configuração de
-- desconto dos promoters, que volta a ser só atribuição de venda.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "orders" WHERE "discount_cents" > 0) THEN
    RAISE EXCEPTION 'há pedidos com desconto de promoter gravado: a reversão da 0018 apagaria o desconto de cada um';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    REVOKE DELETE ON "promoter_discount_events" FROM partyx_app;
  END IF;
END $$;
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_discount_valid";
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_discount_nonnegative";
ALTER TABLE "order_item_lots" DROP CONSTRAINT IF EXISTS "order_item_lots_discount_valid";
ALTER TABLE "orders" DROP COLUMN "coupon_code";
ALTER TABLE "orders" DROP COLUMN "discount_kind";
ALTER TABLE "orders" DROP COLUMN "discount_value";
ALTER TABLE "orders" DROP COLUMN "discount_cents";
ALTER TABLE "order_items" DROP COLUMN "discount_cents";
ALTER TABLE "order_item_lots" DROP COLUMN "unit_discount_cents";
DROP TABLE "promoter_discount_events";
ALTER TABLE "promoters" DROP CONSTRAINT IF EXISTS "promoters_discount_value_valid";
ALTER TABLE "promoters" DROP CONSTRAINT IF EXISTS "promoters_discount_dates_valid";
ALTER TABLE "promoters" DROP CONSTRAINT IF EXISTS "promoters_discount_max_uses_valid";
ALTER TABLE "promoters" DROP COLUMN "discount_kind";
ALTER TABLE "promoters" DROP COLUMN "discount_value";
ALTER TABLE "promoters" DROP COLUMN "discount_scope";
ALTER TABLE "promoters" DROP COLUMN "discount_starts_on";
ALTER TABLE "promoters" DROP COLUMN "discount_ends_on";
ALTER TABLE "promoters" DROP COLUMN "discount_max_uses";
DROP TYPE "promoter_discount_kind";
DROP TYPE "promoter_discount_scope";
