-- Reverte 0006_encerramento_do_evento. A data de encerramento continua na trilha (`audit_log`, ação `evento.encerrar`) e pode ser
-- reconstruída aplicando a 0006 de novo; apagar a coluna não perde a informação original.
ALTER TABLE "events" DROP COLUMN "closed_at";
