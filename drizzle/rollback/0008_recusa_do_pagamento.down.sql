-- Reverte 0008_recusa_do_pagamento. Perde só o motivo das recusas já registradas (o pedido continua "não concluído" e a tela
-- volta à mensagem genérica) e o contador de tentativas (o código anterior usa a chave sem tentativa). Nada mais depende delas.
ALTER TABLE "orders" DROP COLUMN "payment_attempt";
ALTER TABLE "orders" DROP COLUMN "decline_reason";
ALTER TABLE "orders" DROP COLUMN "gateway_status_detail";
