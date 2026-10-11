-- Reverte 0005_excecoes_pagamento.
-- O PostgreSQL não remove um valor de enum: o tipo é recriado sem 'pagamento_sem_estoque'.
-- Recusa se já houver aviso desse modelo na fila de e-mails: desfazer apagaria o registro de que os administradores foram avisados.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "email_log" WHERE "template"::text = 'pagamento_sem_estoque') THEN
    RAISE EXCEPTION 'Existem avisos de pagamento sem estoque em email_log; a reversão perderia esse registro.';
  END IF;
END
$$;
DROP TABLE "job_leases";
ALTER TYPE "public"."email_template" RENAME TO "email_template_0005";
CREATE TYPE "public"."email_template" AS ENUM('cadastro', 'recuperacao_senha', 'compra_confirmada');
ALTER TABLE "email_log" ALTER COLUMN "template" TYPE "public"."email_template" USING "template"::text::"public"."email_template";
DROP TYPE "public"."email_template_0005";
