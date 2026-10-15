-- Reverte 0015_capa_desfocada. Perde só as miniaturas das capas (a página volta a mostrar a capa direto, como o código anterior faz).
-- As capas, as versões menores e os eventos ficam como estão.
ALTER TABLE "events" DROP CONSTRAINT "events_banner_placeholder_format";
ALTER TABLE "events" DROP COLUMN "banner_placeholder";
