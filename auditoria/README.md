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
node auditoria/ferramentas/cobertura-rotas.mjs --md       # matriz de cobertura por rota (Markdown)
```

As demais ferramentas documentam o uso no cabeçalho de cada arquivo.
