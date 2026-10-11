-- Reverte 0003_anonimizacao_lgpd.
-- Recusa se já houver usuário anonimizado: desfazer apagaria a prova de que os dados foram removidos
-- e a regra antiga exige CPF para todo cliente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "anonymized_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'Existem usuários anonimizados; a reversão perderia essa informação.';
  END IF;
END
$$;
ALTER TABLE "users" DROP CONSTRAINT "users_cliente_has_cpf";
ALTER TABLE "users" DROP COLUMN "anonymized_at";
ALTER TABLE "users" ADD CONSTRAINT "users_cliente_has_cpf" CHECK ("users"."role" <> 'cliente' or "users"."cpf" is not null);
