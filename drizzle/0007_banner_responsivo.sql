-- expand-contract: revisada em 11/10/2026. Só EXPANDE: coluna nova `events.banner_widths` com valor padrão (lista vazia). O código
-- anterior não a conhece e segue funcionando; banner sem larguras registradas continua sendo exibido só pela `banner_url`. Sem
-- migração de dados: as versões menores dos banners já enviados são geradas depois, pelo script `npm run banners:versoes`
-- (fora da migração, porque depende do armazenamento de arquivos). Reversão em drizzle/rollback/0007_banner_responsivo.down.sql.
ALTER TABLE "events" ADD COLUMN "banner_widths" smallint[] DEFAULT '{}'::smallint[] NOT NULL;
