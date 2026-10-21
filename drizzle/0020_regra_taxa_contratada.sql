-- expand-contract: revisada em 21/10/2026. Só EXPANDE. Taxa da contratada por forma de pagamento (D-93, aditivo ao contrato de
-- 21/10/2026): tabela nova `contract_fee_rules`, que o código anterior não lê (ele continua contando todo ingresso a R$ 1,00, a regra
-- original). Nasce com duas linhas: a regra original (R$ 1,00 por ingresso, qualquer forma, desde sempre) e a da D-93 (R$ 1,00 por
-- ingresso só de pedido pago por Pix, para pedidos pagos a partir de 21/10/2026 00:00 em Brasília). Gatilhos novos só na tabela nova:
-- só inclusão (alterar, apagar e truncar recusados) e nenhuma regra nova com início num mês já fechado, no fuso de Brasília. O
-- partyx_app só lê (as permissões padrão da 0002 dariam INSERT e UPDATE; aqui são retiradas). Nenhuma tabela ou dado existente muda.
-- Atenção ao retorno do código: a versão anterior ignora a tabela e o relatório volta a contar os ingressos pagos por cartão.
-- Reversão em drizzle/rollback/0020_regra_taxa_contratada.down.sql (recusa se houver regra além das duas desta migração).
CREATE TABLE "contract_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"per_ticket_cents" integer NOT NULL,
	"methods" "payment_method"[],
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_fee_rules_per_ticket_range" CHECK ("contract_fee_rules"."per_ticket_cents" between 0 and 10000),
	CONSTRAINT "contract_fee_rules_methods_not_empty" CHECK ("contract_fee_rules"."methods" is null or cardinality("contract_fee_rules"."methods") >= 1),
	CONSTRAINT "contract_fee_rules_reference_length" CHECK (char_length("contract_fee_rules"."reference") between 1 and 160)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_fee_rules_effective_from_key" ON "contract_fee_rules" USING btree ("effective_from");--> statement-breakpoint
INSERT INTO "contract_fee_rules" ("effective_from", "per_ticket_cents", "methods", "reference") VALUES
  ('1970-01-01 00:00:00+00', 100, NULL, 'Contrato, Cláusula 6ª, regra original'),
  ('2026-10-21 00:00:00 America/Sao_Paulo', 100, ARRAY['pix']::"payment_method"[], 'Aditivo ao contrato de 21/10/2026, D-93');--> statement-breakpoint
CREATE FUNCTION "contract_fee_rules_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contract_fee_rules aceita apenas inclusão: uma mudança de contrato é uma regra nova'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "contract_fee_rules_open_month"() RETURNS trigger AS $$
BEGIN
  IF NEW."effective_from" < (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') THEN
    RAISE EXCEPTION 'regra da taxa com início em mês já fechado (%): meses fechados não mudam', NEW."effective_from"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "contract_fee_rules_no_update" BEFORE UPDATE ON "contract_fee_rules" FOR EACH ROW EXECUTE FUNCTION "contract_fee_rules_append_only"();--> statement-breakpoint
CREATE TRIGGER "contract_fee_rules_no_delete" BEFORE DELETE ON "contract_fee_rules" FOR EACH ROW EXECUTE FUNCTION "contract_fee_rules_append_only"();--> statement-breakpoint
CREATE TRIGGER "contract_fee_rules_no_truncate" BEFORE TRUNCATE ON "contract_fee_rules" FOR EACH STATEMENT EXECUTE FUNCTION "contract_fee_rules_append_only"();--> statement-breakpoint
CREATE TRIGGER "contract_fee_rules_open_month_only" BEFORE INSERT ON "contract_fee_rules" FOR EACH ROW EXECUTE FUNCTION "contract_fee_rules_open_month"();--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    REVOKE INSERT, UPDATE, DELETE ON "contract_fee_rules" FROM partyx_app;
  END IF;
END
$$;
