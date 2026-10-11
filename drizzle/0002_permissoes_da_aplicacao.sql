-- Papel da aplicação com o mínimo de privilégios. As migrações rodam com o dono do banco;
-- o servidor roda como `partyx_app`, que não é dono e não apaga registros de histórico.
-- O papel é criado ANTES da migração, por SQL, sem privilégios de dono (`npm run db:create-app-role`, README-DEPLOY.md).
-- Sem ele a migração ABORTA com erro claro (antes era ignorada em silêncio e o banco ficava sem as permissões da aplicação).
-- Só ambiente local e testes dispensam o papel, de forma explícita: `partyx.allow_missing_app_role = on` (ver server/src/db/migrate.ts).
--
-- expand-contract: revisada em 05/10/2026. Só concede privilégios e revoga UPDATE na auditoria para o papel da aplicação: não altera tabelas nem
-- dados, e o código nunca atualiza a auditoria (ela é só de inclusão), então o código anterior segue funcionando.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app')
     AND COALESCE(current_setting('partyx.allow_missing_app_role', true), '') <> 'on' THEN
    RAISE EXCEPTION 'O papel "partyx_app" não existe neste banco. Crie-o antes de migrar (npm run db:create-app-role, ver README-DEPLOY.md). Só o ambiente local pode dispensar o papel.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partyx_app') THEN
    GRANT USAGE ON SCHEMA public TO partyx_app;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO partyx_app;
    -- Só estas três recebem DELETE: dados temporários que a rotina de limpeza remove.
    -- A trilha de auditoria só recebe inclusões: sem UPDATE para a aplicação (o trigger também recusa).
    REVOKE UPDATE ON "audit_log" FROM partyx_app;
    GRANT DELETE ON "sessions", "login_attempts", "password_resets" TO partyx_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO partyx_app;
    -- Tabelas e sequências criadas por migrações futuras já nascem com esses privilégios.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO partyx_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO partyx_app;
  END IF;
END
$$;
