-- expand-contract: revisada em 19/10/2026. Só EXPANDE. Desconto por promoter (D-91, mudança de escopo aprovada pela PartyX): dois tipos
-- novos, a tabela nova `promoter_discount_events` e colunas novas com padrão "sem desconto" em `promoters` (`discount_kind` 'nenhum',
-- alcance 'todos', o resto nulo), em `orders` (`discount_cents` 0 e o retrato do código e do desconto, nulos), em `order_items`
-- (`discount_cents` 0) e em `order_item_lots` (`unit_discount_cents` 0). As CHECK novas olham só as colunas novas (e o preço do lote, que
-- já é maior que zero): valem em todas as linhas existentes e em toda gravação do código anterior, que não conhece as colunas e grava os
-- padrões. Nenhuma regra existente muda: o total do pedido continua maior que zero (D-91, opção B: o desconto nunca zera o pedido).
-- Nenhum dado existente muda. A tabela nova recebe SELECT, INSERT e UPDATE do partyx_app pelas permissões padrão da 0002 e, aqui,
-- DELETE (o painel troca a lista de eventos do desconto). Atenção ao retorno do código: a versão anterior ignora o desconto; um pedido
-- com desconto aparece nela com o total menor que a soma dos itens (o pagamento continua conferido pelo total).
-- Reversão em drizzle/rollback/0018_desconto_por_promoter.down.sql (recusa se já houver pedido com desconto).
CREATE TYPE "public"."promoter_discount_kind" AS ENUM('nenhum', 'percentual', 'fixo');--> statement-breakpoint
CREATE TYPE "public"."promoter_discount_scope" AS ENUM('todos', 'eventos');--> statement-breakpoint
CREATE TABLE "promoter_discount_events" (
	"promoter_id" uuid NOT NULL,
	"event_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN "discount_kind" "promoter_discount_kind" DEFAULT 'nenhum' NOT NULL;--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN "discount_scope" "promoter_discount_scope" DEFAULT 'todos' NOT NULL;--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN "discount_starts_on" date;--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN "discount_ends_on" date;--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN "discount_max_uses" integer;--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD COLUMN "unit_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_kind" "promoter_discount_kind";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promoter_discount_events" ADD CONSTRAINT "promoter_discount_events_promoter_id_promoters_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promoter_discount_events" ADD CONSTRAINT "promoter_discount_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promoter_discount_events_key" ON "promoter_discount_events" USING btree ("promoter_id","event_id");--> statement-breakpoint
CREATE INDEX "promoter_discount_events_event_idx" ON "promoter_discount_events" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "promoters" ADD CONSTRAINT "promoters_discount_value_valid" CHECK (("promoters"."discount_kind" = 'nenhum' and "promoters"."discount_value" is null) or ("promoters"."discount_kind" = 'percentual' and "promoters"."discount_value" between 100 and 10000) or ("promoters"."discount_kind" = 'fixo' and "promoters"."discount_value" between 1 and 10000000));--> statement-breakpoint
ALTER TABLE "promoters" ADD CONSTRAINT "promoters_discount_dates_valid" CHECK ("promoters"."discount_starts_on" is null or "promoters"."discount_ends_on" is null or "promoters"."discount_ends_on" >= "promoters"."discount_starts_on");--> statement-breakpoint
ALTER TABLE "promoters" ADD CONSTRAINT "promoters_discount_max_uses_valid" CHECK ("promoters"."discount_max_uses" is null or "promoters"."discount_max_uses" >= 1);--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_discount_valid" CHECK ("order_item_lots"."unit_discount_cents" >= 0 and "order_item_lots"."unit_discount_cents" <= "order_item_lots"."unit_price_cents");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_discount_nonnegative" CHECK ("order_items"."discount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_valid" CHECK ("orders"."discount_cents" >= 0 and ("orders"."discount_cents" = 0 or ("orders"."discount_kind" in ('percentual', 'fixo') and "orders"."discount_value" is not null and "orders"."coupon_code" is not null)));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    GRANT DELETE ON "promoter_discount_events" TO partyx_app;
  END IF;
END
$$;
