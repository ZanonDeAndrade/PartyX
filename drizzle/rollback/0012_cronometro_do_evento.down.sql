-- Reverte 0012_cronometro_do_evento. Perde só a configuração do cronômetro (ligado ou não e a frase personalizada de cada evento),
-- que o código anterior não usa. Nenhum pedido, ingresso ou prova depende dela.
ALTER TABLE "events" DROP CONSTRAINT "events_countdown_phrase_format";
ALTER TABLE "events" DROP COLUMN "countdown_phrase";
ALTER TABLE "events" DROP COLUMN "countdown_enabled";
