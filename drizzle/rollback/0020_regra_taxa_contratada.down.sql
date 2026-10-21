-- Reverte 0020_regra_taxa_contratada. Recusa se houver regra além das duas que esta migração grava: apagar a tabela perderia uma
-- mudança de contrato registrada depois (reverta antes a migração que a gravou). Sem isso, a tabela some e o código anterior volta a
-- contar todo ingresso a R$ 1,00, a regra original.
DO $$
BEGIN
  IF (SELECT count(*) FROM "contract_fee_rules") <> 2 THEN
    RAISE EXCEPTION 'há regra da taxa além das duas da 0020: a reversão apagaria uma mudança de contrato registrada';
  END IF;
END $$;
DROP TABLE "contract_fee_rules";
DROP FUNCTION "contract_fee_rules_open_month"();
DROP FUNCTION "contract_fee_rules_append_only"();
