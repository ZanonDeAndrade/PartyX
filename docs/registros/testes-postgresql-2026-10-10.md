# Execução dos testes com PostgreSQL local — 10/10/2026

## Ambiente e resultados

- PostgreSQL 16 Alpine, serviço `postgres-test` em `docker-compose.test.yml`, dados em `tmpfs`. A porta local padrão é **55432**, configurável por `PARTYX_TEST_DB_PORT`. A porta 5433 pertence ao contêiner `luma-postgres-1`, de outro projeto, que permaneceu ativo. `db:test:down` e `db:test:up` foram exercitados, e o contêiner terminou saudável.
- Os scripts usam explicitamente `docker compose -p partyx-test`, isolando os recursos Compose deste projeto. `.env.test` local contém `PARTYX_TEST_DB_PORT` e `TEST_DATABASE_URL` derivada dessa porta; é ignorado pela regra `.env.*` do `.gitignore` (`git check-ignore -v .env.test`).
- `npm run check:migrations` com `TEST_DATABASE_URL`: migrações 0000–0004 aplicadas, revertidas em ordem inversa e reaplicadas; gatilhos `orders_paid_at_immutable`, `audit_log_no_update` e `audit_log_no_delete` ativos. Os testes de integração também verificaram que `paid_at` não muda depois de definido e que `audit_log` recusa `UPDATE` e `DELETE`.

| Execução | Aprovados | Pulados | Falhos |
|---|---:|---:|---:|
| Antes, `npm test` sem banco: suíte principal | 204 | 536 | 0 |
| Antes, `npm test` sem banco: papéis PostgreSQL | 0 | 4 | 0 |
| Depois, `npm test` com banco: suíte principal | 740 | 0 | 0 |
| Depois, `npm test` com banco: papéis PostgreSQL | 4 | 0 | 0 |

O atalho `npm run test:db` foi executado diretamente, carregando `.env.test`, e repetiu o resultado: 740/740 na suíte principal e 4/4 nos testes de papéis.

Todos os 536 testes antes pulados na suíte principal foram executados e passaram. Os quatro testes de papéis também passaram. Nenhuma falha exigiu correção de código ou alteração de teste.

## Alterações feitas

| Arquivo e linha | Alteração |
|---|---|
| `docker-compose.test.yml:4` | Serviço `postgres-test`, PostgreSQL 16 em `tmpfs`, porta padrão 55432 com override por `PARTYX_TEST_DB_PORT`. |
| `package.json:25` | `db:test:up/down` usam o projeto exclusivo `partyx-test`; `test:db` e `check:migrations` carregam `.env.test` para usar a mesma porta local. |
| `server/scripts/check-migrations.ts:25` | Com `TEST_DATABASE_URL`, faz o ciclo real 0000–0004 de aplicação, reversão e reaplicação, conferindo os gatilhos. |
| `.github/workflows/ci.yml:12` | Serviço PostgreSQL 16 próprio do GitHub Actions na porta 5433; `check:migrations` e `npm test` executados com `TEST_DATABASE_URL` definido pelo workflow, sem usar Compose nem `.env.test`. |
| `docs/rastreabilidade/matriz-requisitos.md:15` | Evidência de PostgreSQL e repetição dos CA afetados. |

Nenhum teste foi alterado. `npm run lint`, `npm run typecheck` e `npm run build` terminaram com exit 0 após as alterações; o lint e o build emitiram apenas avisos preexistentes.

## Repetições de concorrência e idempotência

Foram executados três ciclos consecutivos dos seis arquivos `checkout`, `stock`, `gate`, `reconcile`, `tickets` e `reports` de integração. Cada ciclo teve **205 aprovados, 0 pulados, 0 falhos**. Não houve intermitência observada nesses três ciclos.

| Critério/cenário | Arquivos de teste executados |
|---|---|
| CA-16, disputa da última unidade | `server/src/api/checkout.integration.test.ts`, `server/src/api/stock.integration.test.ts` |
| CA-25, validadores simultâneos no mesmo QR | `server/src/api/gate.integration.test.ts` |
| CA-P3, webhook repetido e simultâneo | `server/src/api/reconcile.integration.test.ts` |
| CA-17, reserva vencida e expiração idempotente | `server/src/api/checkout.integration.test.ts`, `server/src/api/stock.integration.test.ts` |
| Aprovação após expiração, com e sem estoque | `server/src/api/stock.integration.test.ts`, `server/src/api/reconcile.integration.test.ts` |
| Emissão repetida | `server/src/api/tickets.integration.test.ts`, `server/src/api/reconcile.integration.test.ts` |
| CA-29, taxa com cancelados, estornados e contestados | `server/src/api/reports.integration.test.ts`, `server/src/api/reconcile.integration.test.ts` |

O CI usa o mesmo `npm test` com PostgreSQL 16 e `TEST_DATABASE_URL`, além de `check:migrations` com a rodada real de reversão/reaplicação. O serviço PostgreSQL do GitHub Actions é independente da porta local `PARTYX_TEST_DB_PORT`.

## Uso local

Crie `.env.test` na raiz (o arquivo fica fora do Git):

```sh
PARTYX_TEST_DB_PORT=${PARTYX_TEST_DB_PORT:-55432}
TEST_DATABASE_URL=${TEST_DATABASE_URL:-postgres://partyx:partyx_test_only@127.0.0.1:${PARTYX_TEST_DB_PORT}/postgres}
```

Depois execute `npm run db:test:up`, `npm run check:migrations`, `npm run test:db` e `npm run db:test:down`. Para outra porta, passe `PARTYX_TEST_DB_PORT=55433` ao comando desejado; use o mesmo valor ao subir o banco e ao rodar os testes. Os dados ficam em `tmpfs` e são descartados ao desligar o serviço.
