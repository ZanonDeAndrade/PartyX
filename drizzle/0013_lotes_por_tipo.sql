-- expand-contract: revisada em 15/10/2026. Só EXPANDE (mudança de escopo pedida pelo responsável, registrada em
-- docs/registros/lotes-por-tipo-2026-10-15.md). Tabelas novas (`ticket_lots`, `order_item_lots`), tipos novos, uma coluna nova com
-- padrão em `ticket_types` (`last_units_notice`) e uma anulável em `tickets` (`lot_id`, com chave estrangeira composta que só olha a
-- coluna nova: nula em todas as linhas antigas e nunca preenchida pelo código anterior). Dados: cada tipo existente ganha um
-- "Lote único" com o preço, a capacidade e os vendidos atuais; cada item de pedido existente ganha a linha desse lote com a mesma
-- quantidade e o mesmo preço; cada ingresso existente aponta para ele. Nada que já existia muda de valor: preço, total, ingresso e QR
-- ficam iguais. O código anterior não lê nada disto e segue funcionando (o preço do tipo continua espelhando o do lote à venda).
-- Gatilhos: `updated_at` em `ticket_lots` e `forbid_delete` em `order_item_lots` (histórico). O partyx_app ganha DELETE só em
-- `ticket_lots` (lote que nunca vendeu; a chave estrangeira recusa o resto). Reversão em drizzle/rollback/0013_lotes_por_tipo.down.sql.
CREATE TYPE "public"."lot_close_reason" AS ENUM('esgotado', 'data', 'manual');--> statement-breakpoint
CREATE TYPE "public"."lot_leftover" AS ENUM('passar', 'descartar');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('aguardando', 'a_venda', 'encerrado');--> statement-breakpoint
CREATE TABLE "ticket_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"carried_in" integer DEFAULT 0 NOT NULL,
	"passed_out" integer DEFAULT 0 NOT NULL,
	"discarded" integer DEFAULT 0 NOT NULL,
	"quantity_sold" integer DEFAULT 0 NOT NULL,
	"sales_start_at" timestamp with time zone,
	"sales_end_at" timestamp with time zone,
	"leftover_policy" "lot_leftover" DEFAULT 'passar' NOT NULL,
	"status" "lot_status" DEFAULT 'aguardando' NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" "lot_close_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_lots_id_type_key" UNIQUE("id","ticket_type_id"),
	CONSTRAINT "ticket_lots_position_positive" CHECK ("ticket_lots"."position" > 0),
	CONSTRAINT "ticket_lots_name_not_blank" CHECK (length(btrim("ticket_lots"."name")) > 0),
	CONSTRAINT "ticket_lots_price_positive" CHECK ("ticket_lots"."price_cents" > 0),
	CONSTRAINT "ticket_lots_quantity_positive" CHECK ("ticket_lots"."quantity" > 0),
	CONSTRAINT "ticket_lots_counters" CHECK ("ticket_lots"."carried_in" >= 0 and "ticket_lots"."passed_out" >= 0 and "ticket_lots"."discarded" >= 0 and "ticket_lots"."quantity_sold" >= 0),
	CONSTRAINT "ticket_lots_sales_window" CHECK ("ticket_lots"."sales_end_at" is null or "ticket_lots"."sales_start_at" is null or "ticket_lots"."sales_end_at" > "ticket_lots"."sales_start_at"),
	CONSTRAINT "ticket_lots_closed_has_time" CHECK (("ticket_lots"."status" = 'encerrado') = ("ticket_lots"."closed_at" is not null and "ticket_lots"."close_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_item_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "order_item_lots_quantity_positive" CHECK ("order_item_lots"."quantity" > 0),
	CONSTRAINT "order_item_lots_price_positive" CHECK ("order_item_lots"."unit_price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "last_units_notice" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "lot_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket_lots" ADD CONSTRAINT "ticket_lots_type_fk" FOREIGN KEY ("ticket_type_id","event_id") REFERENCES "public"."ticket_types"("id","event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_item_fk" FOREIGN KEY ("order_item_id","order_id","ticket_type_id","event_id") REFERENCES "public"."order_items"("id","order_id","ticket_type_id","event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_lot_fk" FOREIGN KEY ("lot_id","ticket_type_id") REFERENCES "public"."ticket_lots"("id","ticket_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_lots_type_position_key" ON "ticket_lots" USING btree ("ticket_type_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_lots_one_on_sale" ON "ticket_lots" USING btree ("ticket_type_id") WHERE "ticket_lots"."status" = 'a_venda';--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_lots_item_lot_key" ON "order_item_lots" USING btree ("order_item_id","lot_id");--> statement-breakpoint
CREATE INDEX "order_item_lots_lot_idx" ON "order_item_lots" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "order_item_lots_order_idx" ON "order_item_lots" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_lot_fk" FOREIGN KEY ("lot_id","ticket_type_id") REFERENCES "public"."ticket_lots"("id","ticket_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "ticket_lots_set_updated_at" BEFORE UPDATE ON "ticket_lots" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "order_item_lots_forbid_delete" BEFORE DELETE ON "order_item_lots" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    GRANT DELETE ON "ticket_lots" TO partyx_app;
  END IF;
END
$$;--> statement-breakpoint
INSERT INTO "ticket_lots" ("ticket_type_id", "event_id", "position", "name", "price_cents", "quantity", "quantity_sold", "status")
  SELECT "id", "event_id", 1, 'Lote único', "price_cents", "quantity_total", "quantity_sold", 'a_venda' FROM "ticket_types";--> statement-breakpoint
INSERT INTO "order_item_lots" ("order_item_id", "order_id", "ticket_type_id", "event_id", "lot_id", "quantity", "unit_price_cents")
  SELECT oi."id", oi."order_id", oi."ticket_type_id", oi."event_id", l."id", oi."quantity", oi."unit_price_cents"
    FROM "order_items" oi JOIN "ticket_lots" l ON l."ticket_type_id" = oi."ticket_type_id" AND l."position" = 1;--> statement-breakpoint
UPDATE "tickets" t SET "lot_id" = l."id"
  FROM "ticket_lots" l WHERE l."ticket_type_id" = t."ticket_type_id" AND l."position" = 1 AND t."lot_id" IS NULL;
