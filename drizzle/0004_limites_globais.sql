-- expand-contract: revisada em 06/10/2026. Só CRIA uma tabela nova (contadores dos limites globais): o código anterior não a conhece e segue funcionando.
-- Reversão em drizzle/rollback/0004_limites_globais.down.sql (descartar a tabela só apaga contadores, sem dado pessoal).
CREATE TABLE "global_limit_counters" (
	"kind" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"alerted_at" timestamp with time zone,
	CONSTRAINT "global_limit_counters_kind_bucket_pk" PRIMARY KEY("kind","bucket"),
	CONSTRAINT "global_limit_counters_count_nonneg" CHECK ("global_limit_counters"."count" >= 0)
);
