-- expand-contract: revisada em 14/10/2026. Só AFROUXA uma regra: a CHECK que exigia autorização judicial em evento com menores
-- vira uma que exige só o horário de fim. Tudo que o código anterior grava (sempre com fim e com o número) continua aceito, então
-- ele segue funcionando durante a troca. Nenhuma coluna apagada: `events.judicial_authorization` fica, sem uso, e nenhum dado muda.
-- Reversão em drizzle/rollback/0010_sem_autorizacao_judicial.down.sql (recusa se já houver evento com menores sem o número).
ALTER TABLE "events" DROP CONSTRAINT "events_minors_need_authorization";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_minors_need_end" CHECK (not "events"."allows_minors" or "events"."ends_at" is not null);