-- expand-contract: revisada em 15/10/2026. Só EXPANDE, com uma coluna obrigatória preenchida antes de virar NOT NULL.
-- `tickets.holder_user_id` (titular atual, D-87) nasce anulável, recebe o comprador (`orders.user_id`) em todos os ingressos
-- existentes e só então vira NOT NULL; o gatilho `tickets_holder_default` põe o comprador quando quem emite não informa o titular,
-- como o código anterior (o NOT NULL é conferido depois do gatilho), então a emissão da versão anterior continua funcionando.
-- `tickets.holder_minor` é anulável (nulo = vale `orders.buyer_minor`, a regra de hoje). Três tabelas novas (transferências, Termo
-- de Ciência de quem recebe e aceite da Política de Cancelamento), só inclusão: sem DELETE (forbid_delete) e, nas transferências,
-- sem UPDATE; recebem as permissões do partyx_app pelas permissões padrão da 0002. Três valores novos no tipo de e-mail, que o
-- código anterior nunca usa. Atenção ao retorno: depois da primeira transferência, a versão anterior mostra o ingresso pelo pedido
-- (ao comprador), não ao titular; ver docs/registros/transferencia-e-cancelamento-2026-10-15.md. Reversão em
-- drizzle/rollback/0016_transferencia_e_aceite_da_politica.down.sql (recusa se já houver transferência ou aceite gravado).
ALTER TYPE "public"."email_template" ADD VALUE IF NOT EXISTS 'transferencia_enviada';--> statement-breakpoint
ALTER TYPE "public"."email_template" ADD VALUE IF NOT EXISTS 'transferencia_recebida';--> statement-breakpoint
ALTER TYPE "public"."email_template" ADD VALUE IF NOT EXISTS 'transferencia_desfeita';--> statement-breakpoint
CREATE TABLE "cancellation_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "ticket_minor_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ticket_transfer_id" uuid NOT NULL,
	"term_version" text NOT NULL,
	"age_at_event" smallint NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"user_agent" text,
	CONSTRAINT "ticket_minor_acceptances_age" CHECK ("ticket_minor_acceptances"."age_at_event" in (16, 17))
);
--> statement-breakpoint
CREATE TABLE "ticket_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"reverts_id" uuid,
	"reason" text,
	"old_short_code" varchar(12) NOT NULL,
	"new_short_code" varchar(12) NOT NULL,
	"old_code_sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_transfers_other_account" CHECK ("ticket_transfers"."from_user_id" <> "ticket_transfers"."to_user_id"),
	CONSTRAINT "ticket_transfers_reason_on_revert" CHECK (("ticket_transfers"."reverts_id" is null) = ("ticket_transfers"."reason" is null)),
	CONSTRAINT "ticket_transfers_reason_length" CHECK ("ticket_transfers"."reason" is null or char_length(btrim("ticket_transfers"."reason")) between 5 and 500),
	CONSTRAINT "ticket_transfers_sha256" CHECK ("ticket_transfers"."old_code_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "holder_user_id" uuid;--> statement-breakpoint
UPDATE "tickets" SET "holder_user_id" = "orders"."user_id" FROM "orders" WHERE "orders"."id" = "tickets"."order_id";--> statement-breakpoint
CREATE FUNCTION "tickets_holder_default"() RETURNS trigger AS $$
BEGIN
  IF NEW."holder_user_id" IS NULL THEN
    SELECT "user_id" INTO NEW."holder_user_id" FROM "orders" WHERE "id" = NEW."order_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "tickets_holder_default" BEFORE INSERT ON "tickets" FOR EACH ROW EXECUTE FUNCTION "tickets_holder_default"();--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "holder_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "holder_minor" boolean;--> statement-breakpoint
ALTER TABLE "cancellation_acceptances" ADD CONSTRAINT "cancellation_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_acceptances" ADD CONSTRAINT "cancellation_acceptances_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_minor_acceptances" ADD CONSTRAINT "ticket_minor_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_minor_acceptances" ADD CONSTRAINT "ticket_minor_acceptances_ticket_transfer_id_ticket_transfers_id_fk" FOREIGN KEY ("ticket_transfer_id") REFERENCES "public"."ticket_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_reverts_id_ticket_transfers_id_fk" FOREIGN KEY ("reverts_id") REFERENCES "public"."ticket_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_acceptances_order_key" ON "cancellation_acceptances" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cancellation_acceptances_user_idx" ON "cancellation_acceptances" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_minor_acceptances_transfer_key" ON "ticket_minor_acceptances" USING btree ("ticket_transfer_id");--> statement-breakpoint
CREATE INDEX "ticket_minor_acceptances_user_idx" ON "ticket_minor_acceptances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ticket_transfers_ticket_idx" ON "ticket_transfers" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_transfers_to_idx" ON "ticket_transfers" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "ticket_transfers_from_idx" ON "ticket_transfers" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "ticket_transfers_old_code_idx" ON "ticket_transfers" USING btree ("old_code_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_transfers_reverts_key" ON "ticket_transfers" USING btree ("reverts_id") WHERE "ticket_transfers"."reverts_id" is not null;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_holder_idx" ON "tickets" USING btree ("holder_user_id","event_id");;--> statement-breakpoint
CREATE FUNCTION "ticket_transfers_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ticket_transfers aceita apenas inclusão'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "ticket_transfers_no_update" BEFORE UPDATE ON "ticket_transfers" FOR EACH ROW EXECUTE FUNCTION "ticket_transfers_append_only"();--> statement-breakpoint
CREATE TRIGGER "ticket_transfers_forbid_delete" BEFORE DELETE ON "ticket_transfers" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "ticket_minor_acceptances_forbid_delete" BEFORE DELETE ON "ticket_minor_acceptances" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "cancellation_acceptances_forbid_delete" BEFORE DELETE ON "cancellation_acceptances" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();
