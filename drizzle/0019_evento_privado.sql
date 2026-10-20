-- expand-contract: revisada em 20/10/2026. Só EXPANDE. Evento privado com lista de autorizados (D-92, mudança de escopo aprovada pela
-- PartyX): dois tipos novos, a tabela nova `event_access`, a coluna `events.is_private` com padrão falso (todo evento existente continua
-- aberto a todos e o código anterior, que não conhece a coluna, grava o padrão) e dois valores novos no tipo de e-mail, que o código
-- anterior nunca usa. As CHECK novas olham só a tabela nova. Nenhuma regra existente muda; nenhum dado existente muda. A tabela nova
-- recebe SELECT, INSERT e UPDATE do partyx_app pelas permissões padrão da 0002 e, aqui, DELETE (o painel remove pessoas da lista e a
-- limpeza diária apaga a lista 6 meses depois do evento). Atenção ao retorno do código: a versão anterior ignora `is_private` e vende o
-- evento privado para todos; antes de voltar, desligar a chave dos eventos privados ou parar as vendas deles.
-- Reversão em drizzle/rollback/0019_evento_privado.down.sql (recusa se houver evento privado ou alguém na lista).
CREATE TYPE "public"."event_access_origin" AS ENUM('painel', 'solicitacao');--> statement-breakpoint
CREATE TYPE "public"."event_access_status" AS ENUM('autorizada', 'pendente', 'recusada');--> statement-breakpoint
ALTER TYPE "public"."email_template" ADD VALUE IF NOT EXISTS 'acesso_solicitado';--> statement-breakpoint
ALTER TYPE "public"."email_template" ADD VALUE IF NOT EXISTS 'acesso_liberado';--> statement-breakpoint
CREATE TABLE "event_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"email_normalized" text,
	"cpf" varchar(11),
	"name" text,
	"status" "event_access_status" NOT NULL,
	"origin" "event_access_origin" NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_access_identifies" CHECK (num_nonnulls("event_access"."user_id", "event_access"."email_normalized", "event_access"."cpf") >= 1),
	CONSTRAINT "event_access_request_has_user" CHECK ("event_access"."origin" <> 'solicitacao' or "event_access"."user_id" is not null),
	CONSTRAINT "event_access_email_format" CHECK ("event_access"."email_normalized" is null or ("event_access"."email_normalized" = lower(btrim("event_access"."email_normalized")) and position('@' in "event_access"."email_normalized") > 1 and char_length("event_access"."email_normalized") <= 254)),
	CONSTRAINT "event_access_cpf_format" CHECK ("event_access"."cpf" is null or "event_access"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "event_access_name_length" CHECK ("event_access"."name" is null or char_length("event_access"."name") between 1 and 120),
	CONSTRAINT "event_access_note_length" CHECK ("event_access"."note" is null or char_length("event_access"."note") between 1 and 500),
	CONSTRAINT "event_access_decided_has_time" CHECK ("event_access"."status" = 'pendente' or "event_access"."decided_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_access_email_key" ON "event_access" USING btree ("event_id","email_normalized") WHERE "event_access"."email_normalized" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_access_cpf_key" ON "event_access" USING btree ("event_id","cpf") WHERE "event_access"."cpf" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_access_user_key" ON "event_access" USING btree ("event_id","user_id") WHERE "event_access"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "event_access_user_idx" ON "event_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_access_pending_idx" ON "event_access" USING btree ("created_at") WHERE "event_access"."status" = 'pendente';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    GRANT DELETE ON "event_access" TO partyx_app;
  END IF;
END
$$;
