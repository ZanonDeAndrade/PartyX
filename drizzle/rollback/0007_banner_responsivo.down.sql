-- Reverte 0007_banner_responsivo. Os arquivos das versões menores (`<hash>-w640.webp`, `<hash>-w1080.webp`) continuam no
-- armazenamento e não atrapalham: sem a coluna, o site volta a usar só a `banner_url`. Aplicar a 0007 de novo e rodar o script
-- `npm run banners:versoes` restaura as larguras.
ALTER TABLE "events" DROP COLUMN "banner_widths";
