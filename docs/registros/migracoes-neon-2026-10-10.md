# Estado das migrações no Neon: homologação e produção (10/10/2026)

Conferência **só de leitura**, feita antes de decidir se a migração `0005_excecoes_pagamento` (ainda local, commits `8c4d633` e `7808059`) podia ser editada em vez de ganhar uma `0006`. Nada foi aplicado, alterado ou gravado em nenhum dos bancos.

## Como foi feito

- Usuário `partyx_backup` (papel só de leitura, membro de `pg_read_all_data`), com a URL lida do segredo `database-url-backup` de cada projeto Google Cloud direto para uma variável de ambiente do processo, **sem imprimir** a URL nem a senha.
- Sessão com `default_transaction_read_only=on` e a consulta dentro de `begin read only` / `rollback`.
- Consultas: marca de ambiente do banco (comentário `partyx-env:`), linhas de `drizzle.__drizzle_migrations` e existência dos dois objetos que a 0005 cria (tabela `job_leases` e valor `pagamento_sem_estoque` no tipo `email_template`).
- As datas da tabela de migrações foram comparadas com o campo `when` de `drizzle/meta/_journal.json`.

## Resultado

| | Homologação | Produção |
|---|---|---|
| Projeto Google Cloud (segredo) | `partyx-hml` | `partyx-producao` |
| Marca do banco | `partyx-env:homologacao` | `partyx-env:producao` |
| Transação somente leitura | sim | sim (`transaction_read_only = on`) |
| Hora do banco na consulta | 10/10/2026, noite (horário de Brasília) | 2026-10-11T02:26:26Z (10/10/2026, 23h26 em Brasília) |
| Linhas em `__drizzle_migrations` | 5 | 5 |
| Última migração aplicada | `0004_limites_globais` (`created_at` 1791295263116) | `0004_limites_globais` (`created_at` 1791295263116) |
| `0005_excecoes_pagamento` (`when` 1791683749248) | **não aplicada** | **não aplicada** |
| Tabela `job_leases` | não existe | não existe |
| Valor `pagamento_sem_estoque` em `email_template` | não existe | não existe |

As 5 linhas de cada banco têm `created_at` iguais aos `when` de `0000_schema_inicial` a `0004_limites_globais`, nessa ordem.

## Conclusão

A 0005 não foi aplicada em nenhum banco real (só nos bancos descartáveis de teste). Por isso a edição feita nela no commit `7808059` (permissão de `DELETE` em `job_leases` para `partyx_app`) foi mantida e **não** foi criada uma `0006`. A 0005 entra no Neon de cada ambiente pelo próximo deploy (job de migração), que depende de autorização expressa.

Observação: o driver `pg` emitiu um aviso sobre `sslmode=require` passar a ter a semântica do libpq na próxima versão principal. Não afeta a conexão atual, que continua sendo `verify-full`. Por decisão do responsável, as URLs **não** foram alteradas agora: o `pg` está travado na major 8 (`"pg": "^8.23.1"`, que aceita 8.x e recusa 9.0.0; instalado 8.23.1, com `pg-connection-string` 2.14.1), e o teste de `sslmode=verify-full` entrou nas pendências da infraestrutura de homologação (`../infraestrutura.md`), antes de qualquer upgrade major do `pg`, a replicar em produção no próximo deploy.

## Atualização em 11/10/2026: migração 0007

`0007_banner_responsivo` (coluna `events.banner_widths`, só expande, com reversão em `drizzle/rollback/`) foi criada e testada
**só em bancos descartáveis de teste** (aplicada, revertida e reaplicada por `npm run check:migrations`). **Não foi aplicada
no Neon** de homologação nem de produção; entra pelo próximo deploy, que depende de autorização expressa. Depois dela, os
banners já enviados ganham as versões menores com `npm run banners:versoes` (primeiro sem `--executar`, para conferir).
