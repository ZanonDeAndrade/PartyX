# Auditoria de entrega (19/10/2026)

Ferramentas de verificação criadas para a auditoria completa antes da entrega ao cliente. Nada aqui altera código de produto nem
a nuvem: são scripts de leitura, cenários de teste e consultas de conferência. Relatórios em `docs/relatorios/`.

| Pasta | Conteúdo |
|---|---|
| `ferramentas/` | Scripts de inventário e verificação (cobertura por rota, varreduras de código, geração de e-mails e PDFs de exemplo) |
| `consultas/` | Consultas SQL **só leitura** das invariantes do negócio (capacidade, pedido pago com ingresso, QR único, entrada única) |
| `carga/` | Cenários k6 do evento de 500 ingressos (abertura, pico de pedidos, webhooks, portaria) e o executor local |
| `e2e/` | Cenários Playwright da auditoria (o que o `e2e/` do projeto ainda não cobria), em Chromium, WebKit e Firefox a 360, 390 e 1280 px |

## Regras

- Produção é só leitura. Os executores recusam qualquer endereço que não seja `localhost`; as consultas SQL não têm `UPDATE`, `DELETE` nem `INSERT`.
- Nunca imprimir segredo, token nem CPF. Os relatórios mascaram identificadores.
- Banco: só o PostgreSQL de teste do `docker-compose.test.yml` (`npm run db:test:up`).

## Como rodar

```bash
node auditoria/ferramentas/cobertura-rotas.mjs --md                      # matriz de cobertura por rota (Markdown)
npx vite build && npx playwright test -c auditoria/e2e/auditoria.config.ts   # 66 cenários, 9 projetos (AUDIT_WORKERS=1 em máquina com pouca memória)
node auditoria/ferramentas/resumo-e2e.mjs auditoria/e2e/.run/resultado.json  # matriz dos resultados
auditoria/carga/run-carga-auditoria.sh 1                                 # carga do evento de 500 ingressos (3 = o triplo)
node auditoria/ferramentas/invariantes.mjs "<url só leitura>"            # 14 invariantes, transação read only (serve para a produção)
auditoria/ferramentas/ensaio-restauracao.sh latest                       # restaura o backup mais recente num PostgreSQL 18 local
auditoria/ferramentas/ensaio-rollback.sh                                 # rollback de código e de migração, cronometrado
npx tsx auditoria/ferramentas/subir-suite.mts                            # servidor da suíte no ar para as ferramentas abaixo
node auditoria/ferramentas/axe-local.mjs auditoria/.run/state.json <pasta>      # acessibilidade (exige npm i --no-save @axe-core/playwright)
node auditoria/ferramentas/toque-local.mjs auditoria/.run/state.json <saida.md> # heurísticas de celular
auditoria/ferramentas/lighthouse-local.sh <base> <slug> <pedido> <cookie> <pasta> # Lighthouse móvel 4G
node auditoria/ferramentas/webkit-repro.mjs auditoria/.run/state.json    # diagnóstico do WebKit na página do evento
npx tsx auditoria/ferramentas/parar-suite.mts
```

Cada ferramenta documenta o uso no cabeçalho do arquivo. Nenhuma delas escreve na produção.
