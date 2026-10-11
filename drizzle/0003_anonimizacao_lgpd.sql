-- expand-contract: revisada em 05/10/2026. Coluna nova NULA (o código anterior não a conhece e segue funcionando) e a regra do CPF fica MAIS
-- PERMISSIVA: remove e recria a restrição na mesma transação. Reversão em drizzle/rollback/ (recusa se já houver usuário anonimizado).
ALTER TABLE "users" DROP CONSTRAINT "users_cliente_has_cpf";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_cliente_has_cpf" CHECK ("users"."role" <> 'cliente' or "users"."cpf" is not null or "users"."anonymized_at" is not null);