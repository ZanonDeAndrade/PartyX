# Runbook: restauração do banco

> **Situação em 06/10/2026:** o procedimento foi **ensaiado na homologação** (cópia real do Neon restaurada em um PostgreSQL 18 isolado: 3 s, SHA-256 conferido, 20 verificações OK). **Falta o ensaio em produção, com dados reais e volume real**, que é pré-requisito do go-live. Detalhes, travas, RPO (até 24 h) e limites em `docs/backup.md`.

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
