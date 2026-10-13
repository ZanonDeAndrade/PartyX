# Runbook: restauração do banco

> **Situação em 13/10/2026:** o procedimento foi **ensaiado duas vezes na homologação**. Em 06/10, num PostgreSQL 18 isolado (3 s). Em 13/10, num banco `restore_ensaio` de uma **branch temporária do Neon** criada por PITR: SHA-256 conferido, 23 s, 20 verificações OK, contagens idênticas à origem em 18 tabelas, esquema idêntico ao dos arquivos de migração; ponto recuperado 13/10 22:54:11 UTC. **Falta o ensaio em produção, com dados reais e volume real**, que é pré-requisito do go-live. Detalhes, travas, RPO (até 24 h pelo backup diário; segundos pelo PITR, dentro da janela do Neon: 1 dia em homologação, 7 em produção) e limites em `docs/backup.md`.

**Regra de ouro:** restaurar **sempre em um banco isolado**, nunca por cima da produção. Só se promove depois de conferir. **Não há garantia de recuperar o que aconteceu depois da última cópia** (Anexo II): informe a PartyX da janela perdida.

## Roteiro

```bash
export TARGET_URL='postgres://usuario:senha@host/restore_ensaio'   # banco NOVO, vazio, com nome restore_* ou teste_*
PROJECT=<projeto> PROTECTED_HOSTS=<host do banco de produção> infra/backup/restore.sh latest     # ou gs://.../partyx-AAAAMMDDTHHMMSSZ.dump
```
O script baixa a cópia, confere o SHA-256, restaura, e roda as 20 verificações (migrações, linhas contra o manifesto, códigos únicos, vendidos = emitidos, pedido pago com um ingresso por unidade, `paid_at`, estoque, entradas, gatilhos). Sem o cliente do PostgreSQL 18: `PG_DOCKER=1`. Ele **recusa** destino que não seja `restore_*`/`teste_*`, destino em `PROTECTED_HOSTS`, destino não vazio e cópia corrompida.

1. Escolher a cópia: `PROJECT=<projeto> infra/operacao/check-backup.sh` mostra a última e a idade.
2. Rodar o roteiro acima. Anotar o **ponto recuperado** (`AAAAMMDDTHHMMSSZ`) e a perda desde a cópia.
3. Banners: versionamento do bucket (`gcloud storage ls --all-versions gs://<projeto>-banners`).
4. Para recuperar produção: decisão da PartyX e da CONTRATADA, janela combinada, nova revisão apontando para o banco restaurado (ou cópia dos dados), aviso da perda desde a última cópia.
5. Registrar: cópia usada, ponto recuperado, perda potencial, quem decidiu.

## Ensaio trimestral
Repetir os passos 1 a 5 em ambiente separado, cronometrar, registrar em `../registro-rotinas.md` e corrigir este roteiro com o que o ensaio mostrar.

## Restaurar numa branch temporária do Neon (ensaiado em 13/10/2026)

Serve para o ensaio e para recuperar um instante recente (PITR), sem tocar no banco em uso.

```bash
neonctl branches create --project-id <projeto> --name restore-ensaio-AAAAMMDD --parent '<instante ISO, ex.: 2026-10-13T22:30:00Z>'
neonctl databases create --project-id <projeto> --branch <id da branch> --name restore_ensaio --owner-name neondb_owner
export TARGET_URL="$(neonctl connection-string <id da branch> --project-id <projeto> --database-name restore_ensaio --role-name neondb_owner | sed 's/sslmode=require/sslmode=verify-full/')"
PG_DOCKER=1 PGSSLROOTCERT=system PROJECT=<projeto> PROTECTED_HOSTS=<hosts do banco em uso> infra/backup/restore.sh <gs://.../partyx-....dump>
neonctl branches delete <id da branch> --project-id <projeto>     # depois de conferir
```

A branch já nasce com o banco `neondb` no estado do instante pedido: é a recuperação por PITR, pronta para conferir. O banco `restore_ensaio` dentro dela é o destino vazio do dump. O formato `main@<instante>` não foi aceito pelo `neonctl` 8.0.10; use só o instante. Apagar a branch encerra o custo dela.
