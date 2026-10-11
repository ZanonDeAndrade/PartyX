-- expand-contract: revisada em 10/10/2026. Só EXPANDE: acrescenta um valor ao tipo email_template (o código anterior nunca grava esse valor;
-- se ler uma linha com ele, cai no ramo de compra, não acha pedido pago e marca o item como não aplicável) e cria a tabela nova job_leases,
-- que o código anterior não conhece (com DELETE para a aplicação, só nela). Reversão em drizzle/rollback/0005_excecoes_pagamento.down.sql.
ALTER TYPE "public"."email_template" ADD VALUE 'pagamento_sem_estoque';--> statement-breakpoint
CREATE TABLE "job_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- A rotina diária apaga as travas vencidas há mais de 2 dias (uma por pedido conferido): o papel da aplicação recebe DELETE só nesta tabela.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    GRANT DELETE ON "job_leases" TO partyx_app;
  END IF;
END
$$;
