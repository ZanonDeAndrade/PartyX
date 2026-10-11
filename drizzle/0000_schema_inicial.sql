-- expand-contract: revisada em 05/10/2026. Migração inicial: cria o esquema do zero, então não existe código anterior que ela possa quebrar.
CREATE TYPE "public"."checkin_method" AS ENUM('camera', 'manual');--> statement-breakpoint
CREATE TYPE "public"."checkin_result" AS ENUM('valido', 'ja_utilizado', 'invalido', 'cancelado', 'outro_evento');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pendente', 'enviado', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."email_template" AS ENUM('cadastro', 'recuperacao_senha', 'compra_confirmada');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('rascunho', 'publicado', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pendente', 'pago', 'expirado', 'nao_concluido', 'cancelado', 'estornado', 'contestado', 'pago_sem_estoque');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'cartao');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('ativa', 'convertida', 'expirada', 'liberada');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('valido', 'utilizado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('cliente', 'validador', 'administrador');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue" text NOT NULL,
	"address" text NOT NULL,
	"description" text NOT NULL,
	"attractions" text[] DEFAULT '{}'::text[] NOT NULL,
	"age_rating" text NOT NULL,
	"banner_url" text,
	"status" "event_status" DEFAULT 'rascunho' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_format" CHECK ("events"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "events_name_not_blank" CHECK (length(btrim("events"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "promoters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"coupon_code" text NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promoters_coupon_code_format" CHECK ("promoters"."coupon_code" ~ '^[A-Z0-9]{3,20}$')
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"quantity_total" integer NOT NULL,
	"quantity_sold" integer DEFAULT 0 NOT NULL,
	"sales_start_at" timestamp with time zone NOT NULL,
	"sales_end_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_id_event_key" UNIQUE("id","event_id"),
	CONSTRAINT "ticket_types_price_positive" CHECK ("ticket_types"."price_cents" > 0),
	CONSTRAINT "ticket_types_total_positive" CHECK ("ticket_types"."quantity_total" > 0),
	CONSTRAINT "ticket_types_sold_in_range" CHECK ("ticket_types"."quantity_sold" >= 0 and "ticket_types"."quantity_sold" <= "ticket_types"."quantity_total"),
	CONSTRAINT "ticket_types_sales_window" CHECK ("ticket_types"."sales_end_at" > "ticket_types"."sales_start_at"),
	CONSTRAINT "ticket_types_name_not_blank" CHECK (length(btrim("ticket_types"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" text NOT NULL,
	"ip" "inet",
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"cpf" varchar(11),
	"phone" text,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_email_format" CHECK ("users"."email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
	CONSTRAINT "users_cpf_format" CHECK ("users"."cpf" is null or "users"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "users_cliente_has_cpf" CHECK ("users"."role" <> 'cliente' or "users"."cpf" is not null)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "order_items_order_type_key" UNIQUE("order_id","ticket_type_id"),
	CONSTRAINT "order_items_ref_key" UNIQUE("id","order_id","ticket_type_id","event_id"),
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_positive" CHECK ("order_items"."unit_price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('order_number_seq') NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"promoter_id" uuid,
	"total_cents" integer NOT NULL,
	"status" "order_status" DEFAULT 'pendente' NOT NULL,
	"payment_method" "payment_method",
	"gateway_payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_id_event_key" UNIQUE("id","event_id"),
	CONSTRAINT "orders_total_positive" CHECK ("orders"."total_cents" > 0),
	CONSTRAINT "orders_paid_has_paid_at" CHECK ("orders"."status" not in ('pago', 'estornado', 'contestado', 'pago_sem_estoque') or "orders"."paid_at" is not null),
	CONSTRAINT "orders_pending_not_paid" CHECK ("orders"."status" <> 'pendente' or "orders"."paid_at" is null)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'ativa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "reservations_quantity_positive" CHECK ("reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"unit_index" smallint NOT NULL,
	"holder_name" text NOT NULL,
	"code" text NOT NULL,
	"short_code" varchar(12) NOT NULL,
	"qr_payload" text NOT NULL,
	"qr_key_version" smallint DEFAULT 1 NOT NULL,
	"status" "ticket_status" DEFAULT 'valido' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"validated_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "tickets_code_strength" CHECK (length("tickets"."code") >= 22 and "tickets"."code" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "tickets_short_code_format" CHECK ("tickets"."short_code" ~ '^PX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
	CONSTRAINT "tickets_unit_index_positive" CHECK ("tickets"."unit_index" > 0),
	CONSTRAINT "tickets_holder_not_blank" CHECK (length(btrim("tickets"."holder_name")) > 0),
	CONSTRAINT "tickets_used_has_usage" CHECK ("tickets"."status" <> 'utilizado' or ("tickets"."used_at" is not null and "tickets"."validated_by" is not null)),
	CONSTRAINT "tickets_cancelled_has_time" CHECK ("tickets"."status" <> 'cancelado' or "tickets"."cancelled_at" is not null),
	CONSTRAINT "tickets_valid_is_clean" CHECK ("tickets"."status" <> 'valido' or ("tickets"."used_at" is null and "tickets"."cancelled_at" is null))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before_json" jsonb,
	"after_json" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"event_id" uuid NOT NULL,
	"validator_id" uuid NOT NULL,
	"result" "checkin_result" NOT NULL,
	"method" "checkin_method" NOT NULL,
	"code_presented" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_ticket_required" CHECK ("checkins"."result" not in ('valido', 'ja_utilizado') or "checkins"."ticket_id" is not null),
	CONSTRAINT "checkins_code_presented_length" CHECK ("checkins"."code_presented" is null or length("checkins"."code_presented") <= 64)
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"order_id" uuid,
	"template" "email_template" NOT NULL,
	"status" "email_status" DEFAULT 'pendente' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_sent_has_time" CHECK ("email_log"."status" <> 'enviado' or "email_log"."sent_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gateway_event_id" text,
	"signature_valid" boolean NOT NULL,
	"order_id" uuid,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processing_error" text,
	CONSTRAINT "payment_events_invalid_never_processed" CHECK ("payment_events"."signature_valid" or "payment_events"."processed_at" is null)
);
--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("order_id","event_id") REFERENCES "public"."orders"("id","event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_type_fk" FOREIGN KEY ("ticket_type_id","event_id") REFERENCES "public"."ticket_types"("id","event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promoter_id_promoters_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_order_item_fk" FOREIGN KEY ("order_id","ticket_type_id") REFERENCES "public"."order_items"("order_id","ticket_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_item_fk" FOREIGN KEY ("order_item_id","order_id","ticket_type_id","event_id") REFERENCES "public"."order_items"("id","order_id","ticket_type_id","event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_validator_id_users_id_fk" FOREIGN KEY ("validator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_status_starts_idx" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promoters_coupon_code_key" ON "promoters" USING btree ("coupon_code");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_types_event_name_key" ON "ticket_types" USING btree ("event_id","name");--> statement-breakpoint
CREATE INDEX "ticket_types_event_active_idx" ON "ticket_types" USING btree ("event_id","is_active");--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email_normalized","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_cpf_key" ON "users" USING btree ("cpf") WHERE "users"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_key" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_gateway_payment_id_key" ON "orders" USING btree ("gateway_payment_id") WHERE "orders"."gateway_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_event_status_idx" ON "orders" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "orders_paid_at_idx" ON "orders" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "orders_promoter_idx" ON "orders" USING btree ("promoter_id");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_order_type_key" ON "reservations" USING btree ("order_id","ticket_type_id");--> statement-breakpoint
CREATE INDEX "reservations_active_idx" ON "reservations" USING btree ("ticket_type_id","expires_at") WHERE "reservations"."status" = 'ativa';--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_code_key" ON "tickets" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_short_code_key" ON "tickets" USING btree ("short_code");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_item_unit_key" ON "tickets" USING btree ("order_item_id","unit_index");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tickets_event_status_idx" ON "tickets" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "tickets_type_idx" ON "tickets" USING btree ("ticket_type_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_one_valid_per_ticket_key" ON "checkins" USING btree ("ticket_id") WHERE "checkins"."result" = 'valido';--> statement-breakpoint
CREATE INDEX "checkins_event_created_idx" ON "checkins" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "checkins_ticket_idx" ON "checkins" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "checkins_validator_idx" ON "checkins" USING btree ("validator_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_log_idempotency_key" ON "email_log" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_log_due_idx" ON "email_log" USING btree ("next_attempt_at") WHERE "email_log"."status" = 'pendente';--> statement-breakpoint
CREATE INDEX "email_log_user_idx" ON "email_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_log_order_idx" ON "email_log" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_gateway_event_key" ON "payment_events" USING btree ("gateway_event_id") WHERE "payment_events"."signature_valid" and "payment_events"."gateway_event_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_events_order_idx" ON "payment_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_events_pending_idx" ON "payment_events" USING btree ("received_at") WHERE "payment_events"."signature_valid" and "payment_events"."processed_at" is null;