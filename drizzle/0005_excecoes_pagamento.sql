-- expand-contract: revisada em 10/10/2026. Só EXPANDE: acrescenta um valor ao tipo email_template (o código anterior nunca grava esse valor;
-- se ler uma linha com ele, cai no ramo de compra, não acha pedido pago e marca o item como não aplicável) e cria a tabela nova job_leases,
-- que o código anterior não conhece. Reversão em drizzle/rollback/0005_excecoes_pagamento.down.sql.
ALTER TYPE "public"."email_template" ADD VALUE 'pagamento_sem_estoque';--> statement-breakpoint
CREATE TABLE "job_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
