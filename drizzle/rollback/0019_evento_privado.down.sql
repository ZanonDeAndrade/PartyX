-- Reverte 0019_evento_privado. Recusa se algum evento estiver privado ou houver alguém na lista: apagar a coluna abriria o evento
-- privado para todos e apagar a tabela perderia a lista e as solicitações. Sem isso, perde só a coluna (toda falsa) e a tabela vazia.
-- Os dois valores do tipo de e-mail ficam: o PostgreSQL não remove valor de enum e o código anterior não os usa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "events" WHERE "is_private") THEN
    RAISE EXCEPTION 'há evento privado: a reversão da 0019 abriria a compra para todos; desligue a chave antes';
  END IF;
  IF EXISTS (SELECT 1 FROM "event_access") THEN
    RAISE EXCEPTION 'há pessoas na lista de autorizados: a reversão da 0019 apagaria a lista e as solicitações';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    REVOKE DELETE ON "event_access" FROM partyx_app;
  END IF;
END $$;
DROP TABLE "event_access";
ALTER TABLE "events" DROP COLUMN "is_private";
DROP TYPE "event_access_status";
DROP TYPE "event_access_origin";
