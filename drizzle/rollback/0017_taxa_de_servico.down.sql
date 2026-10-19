-- Reverte 0017_taxa_de_servico. Recusa se algum pedido já tiver taxa de serviço: apagar as colunas perderia quanto foi taxa em cada
-- pedido (o total continua, mas o valor dos ingressos deixaria de ser conhecido pelo pedido). Sem pedido com taxa, perde só a
-- configuração da taxa e as tarifas do Mercado Pago já consultadas, que voltam a ser consultadas no painel do Mercado Pago.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "orders" WHERE "service_fee_cents" > 0) THEN
    RAISE EXCEPTION 'há pedidos com taxa de serviço gravada: a reversão da 0017 apagaria a taxa de cada um';
  END IF;
END $$;
ALTER TABLE "orders" DROP CONSTRAINT "orders_gateway_fee_valid";
ALTER TABLE "orders" DROP CONSTRAINT "orders_service_fee_valid";
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_service_fee_nonnegative";
ALTER TABLE "order_item_lots" DROP CONSTRAINT "order_item_lots_service_fee_nonnegative";
ALTER TABLE "orders" DROP COLUMN "gateway_fee_checked_at";
ALTER TABLE "orders" DROP COLUMN "gateway_fee_cents";
ALTER TABLE "orders" DROP COLUMN "gateway_net_cents";
ALTER TABLE "orders" DROP COLUMN "service_fee_min_cents";
ALTER TABLE "orders" DROP COLUMN "service_fee_rate_bps";
ALTER TABLE "orders" DROP COLUMN "service_fee_cents";
ALTER TABLE "order_items" DROP COLUMN "service_fee_cents";
ALTER TABLE "order_item_lots" DROP COLUMN "unit_service_fee_cents";
DROP TABLE "service_fee_settings";
