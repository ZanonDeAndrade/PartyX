-- expand-contract: revisada em 18/10/2026. Só EXPANDE. Taxa de serviço da PartyX (D-90): tabela nova `service_fee_settings`, de uma
-- linha, que nasce com 0% e mínimo 0 (sem taxa até o administrador salvar a porcentagem no painel, depois da confirmação da
-- PartyX, 19/10/2026); colunas novas com valor padrão 0 em `orders`,
-- `order_items` e `order_item_lots` (0 = sem taxa, que é o que todo pedido existente teve e o que o código anterior grava) e as
-- colunas anuláveis da tarifa e do líquido recebido do Mercado Pago em `orders`. As CHECK novas olham só as colunas novas e o `total_cents`, que já é
-- maior que zero: `0 <= taxa < total` vale em todas as linhas existentes e em toda gravação do código anterior (taxa 0). O gatilho
-- novo só põe `updated_at` na tabela nova, sem recusar nada. Nenhum dado existente muda. A tabela nova recebe SELECT, INSERT e
-- UPDATE do partyx_app pelas permissões padrão da 0002 (sem DELETE). Atenção ao retorno do código: a versão anterior cria pedidos
-- sem taxa, e os pedidos com taxa aparecem nela com o total maior que a soma dos itens (o pagamento continua conferido pelo total).
-- Reversão em drizzle/rollback/0017_taxa_de_servico.down.sql (recusa se já houver pedido com taxa).
CREATE TABLE "service_fee_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"rate_bps" integer DEFAULT 0 NOT NULL,
	"min_cents" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_fee_settings_single_row" CHECK ("service_fee_settings"."id" = 1),
	CONSTRAINT "service_fee_settings_rate_range" CHECK ("service_fee_settings"."rate_bps" between 0 and 2000),
	CONSTRAINT "service_fee_settings_min_range" CHECK ("service_fee_settings"."min_cents" between 0 and 5000)
);
--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD COLUMN "unit_service_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "service_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_fee_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_fee_min_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gateway_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gateway_net_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gateway_fee_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_fee_settings" ADD CONSTRAINT "service_fee_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_service_fee_nonnegative" CHECK ("order_item_lots"."unit_service_fee_cents" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_fee_nonnegative" CHECK ("order_items"."service_fee_cents" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_fee_valid" CHECK ("orders"."service_fee_cents" >= 0 and "orders"."service_fee_cents" < "orders"."total_cents" and "orders"."service_fee_rate_bps" >= 0 and "orders"."service_fee_min_cents" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_gateway_fee_valid" CHECK (("orders"."gateway_fee_cents" is null or "orders"."gateway_fee_cents" >= 0) and ("orders"."gateway_net_cents" is null or "orders"."gateway_net_cents" >= 0));--> statement-breakpoint
CREATE TRIGGER "service_fee_settings_set_updated_at" BEFORE UPDATE ON "service_fee_settings" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
INSERT INTO "service_fee_settings" ("id", "rate_bps", "min_cents") VALUES (1, 0, 0);
