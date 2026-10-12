-- expand-contract: revisada em 11/10/2026. Só EXPANDE: três colunas novas em `orders`. `gateway_status_detail` (código de
-- detalhe do gateway numa recusa) e `decline_reason` (categoria mostrada ao comprador) são anuláveis e sem valor padrão;
-- `payment_attempt` (tentativa de cobrança, parte da chave de idempotência) tem padrão 0, que reproduz a chave usada até aqui.
-- O código anterior não as conhece e segue funcionando. Reversão em drizzle/rollback/0008_recusa_do_pagamento.down.sql.
ALTER TABLE "orders" ADD COLUMN "gateway_status_detail" varchar(80);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "decline_reason" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_attempt" smallint DEFAULT 0 NOT NULL;