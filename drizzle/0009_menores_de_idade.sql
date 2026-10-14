-- expand-contract: revisada em 14/10/2026. Só EXPANDE. Colunas novas anuláveis ou com valor padrão: `events.allows_minors` nasce
-- false, que é a regra de hoje (o código anterior não vende nada diferente por causa dela); `orders.buyer_minor` nasce false. Uma
-- tabela nova (`minor_term_acceptances`) e quatro CHECKs que só olham colunas novas, que o código anterior nunca preenche, então
-- nunca viola. Nenhum UPDATE de dados. A tabela nova recebe as permissões do partyx_app pelas permissões padrão da 0002 e não
-- aceita DELETE (forbid_delete da 0001). Reversão em drizzle/rollback/0009_menores_de_idade.down.sql (recusa se já houver prova).
CREATE TABLE "minor_term_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"term_version" text NOT NULL,
	"age_at_event" smallint NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"user_agent" text,
	CONSTRAINT "minor_term_acceptances_age" CHECK ("minor_term_acceptances"."age_at_event" in (16, 17))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "allows_minors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "judicial_authorization" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_minor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "minor_authorization_received" boolean;--> statement-breakpoint
ALTER TABLE "minor_term_acceptances" ADD CONSTRAINT "minor_term_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minor_term_acceptances" ADD CONSTRAINT "minor_term_acceptances_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "minor_term_acceptances_order_key" ON "minor_term_acceptances" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "minor_term_acceptances_user_idx" ON "minor_term_acceptances" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ends_after_start" CHECK ("events"."ends_at" is null or "events"."ends_at" > "events"."starts_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_minors_need_authorization" CHECK (not "events"."allows_minors" or ("events"."ends_at" is not null and length(btrim(coalesce("events"."judicial_authorization", ''))) > 0));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_birth_date_range" CHECK ("users"."birth_date" is null or "users"."birth_date" >= date '1900-01-01');--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_minor_authorization_on_entry" CHECK ("checkins"."minor_authorization_received" is null or "checkins"."result" = 'valido');--> statement-breakpoint
CREATE TRIGGER "minor_term_acceptances_forbid_delete" BEFORE DELETE ON "minor_term_acceptances" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();