-- Regras de integridade que o esquema declarativo não expressa.
-- expand-contract: revisada em 05/10/2026. Cria funções e gatilhos que RECUSAM exclusão e alteração (paid_at, auditoria). Aplicada antes de
-- qualquer release e o código nunca exclui nem reescreve esses dados (exclusão lógica), então o código anterior segue funcionando.
-- Cada bloco é uma instrução (separada por breakpoint, porque o corpo das funções contém ponto e vírgula).

-- 1. updated_at sempre atualizado pelo banco, mesmo em alterações fora da aplicação.
CREATE FUNCTION "set_updated_at"() RETURNS trigger AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "events_set_updated_at" BEFORE UPDATE ON "events" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "ticket_types_set_updated_at" BEFORE UPDATE ON "ticket_types" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "orders_set_updated_at" BEFORE UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint

-- 2. paid_at guarda a aprovação original e não muda mais. Base do relatório mensal da taxa (Cl. 6.3):
--    cancelamento, reembolso e estorno não podem reescrever essa data.
CREATE FUNCTION "orders_paid_at_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."paid_at" IS NOT NULL AND NEW."paid_at" IS DISTINCT FROM OLD."paid_at" THEN
    RAISE EXCEPTION 'orders.paid_at não pode ser alterado depois de definido (pedido %)', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "orders_paid_at_immutable" BEFORE UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION "orders_paid_at_immutable"();--> statement-breakpoint

-- 3. Exclusão lógica: registros com histórico de vendas, entradas e auditoria nunca são apagados.
CREATE FUNCTION "forbid_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'exclusão física não permitida em %: use o status', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "orders_forbid_delete" BEFORE DELETE ON "orders" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "order_items_forbid_delete" BEFORE DELETE ON "order_items" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "tickets_forbid_delete" BEFORE DELETE ON "tickets" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "checkins_forbid_delete" BEFORE DELETE ON "checkins" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "payment_events_forbid_delete" BEFORE DELETE ON "payment_events" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "events_forbid_delete" BEFORE DELETE ON "events" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "ticket_types_forbid_delete" BEFORE DELETE ON "ticket_types" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "users_forbid_delete" BEFORE DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint
CREATE TRIGGER "promoters_forbid_delete" BEFORE DELETE ON "promoters" FOR EACH ROW EXECUTE FUNCTION "forbid_delete"();--> statement-breakpoint

-- 4. A trilha de auditoria só recebe inclusões.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log aceita apenas inclusão'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_log_no_delete" BEFORE DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();
