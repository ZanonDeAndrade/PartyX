-- Reverte 0014_cor_de_destaque. Perde só as cores de destaque escolhidas (os eventos voltam ao roxo da PartyX, que é o que o código
-- anterior mostra). Nenhum pedido, ingresso ou prova depende delas.
ALTER TABLE "events" DROP CONSTRAINT "events_accent_color_format";
ALTER TABLE "events" DROP COLUMN "accent_color";
