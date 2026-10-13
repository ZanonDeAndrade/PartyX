# Roteiros de teste integrado, carga e segurança (Prompt 24)

Scripts usados em 05/10/2026 contra o servidor **local** com o gateway **fictício**. Servem para repetir a rodada em **homologação** quando houver gateway sandbox. **Nunca apontar para produção.** Nada aqui move dinheiro real; a carga cria usuários fictícios (`@partyx.test`), então só deve rodar em banco descartável ou de homologação.

| Arquivo | O que faz |
|---|---|
| `round.mjs` | Rodada integrada: cadastro, cotação, total adulterado, Pix, cartão com dados no corpo, aprovação, 3 ingressos, PDF, isolamento entre compradores, portaria, cancelamento, recusa, expiração, taxa mensal, exportações e acesso indevido entre perfis (28 verificações) |
| `load.mjs` | Carga: `VUS` visitantes simultâneos na vitrine e `RPM` compras por minuto durante `DURATION` s; imprime p50/p95/p99 e erros por etapa |
| `stock.mjs` | 80 compradores disputando 20 unidades |
| `sec.mjs` | Verificações de segurança em caixa-preta (cabeçalhos, arquivos sensíveis, injeção, CSRF, CORS, cookies, enumeração, força bruta, IDOR) |
| `compat.py` | Playwright: Chromium, Firefox e WebKit, em desktop, tablet, 360 px e dispositivos emulados; confere rolagem horizontal, `h1`, tela de erro e erros de console |
| `hml-e2e.mjs` | **Ponta a ponta na homologação atrás do Firebase Hosting**, com tempo de cada etapa (cadastro com Turnstile, pedido, Pix, webhook público, webhook perdido recuperado pelo Cloud Tasks, PDF, portaria). Precisa de `hml-creds.json` e do deploy com `HML_GATEWAY_FICTICIO=true` (gateway fictício, **não** o sandbox real) |
| `fixture.mjs` | Cria o comprador e o pedido pago usados por `compat.py` |

## Pré-requisitos

- Servidor no ar, com `TRUSTED_PROXY_HOPS=1` (os scripts enviam um `X-Forwarded-For` diferente por usuário para não esbarrar nos limites por IP).
- Um evento publicado com tipos `Pista` e `VIP` e contas `admin@partyx.test` e `validador@partyx.test` (senha `festa2026`) e um arquivo `seed24.json` em `$SP` com `{ url, eventId, slug, pista, vip }`. O gerador local ficou fora do repositório (usa o banco de testes); em homologação, crie os dados fictícios equivalentes.
- `BASE_URL` (padrão `http://localhost:8099`) e `SP` (pasta do `seed24.json` e das saídas).
- Atenção: `sec.mjs` bloqueia por força bruta o e-mail `validador@partyx.test` (é o objetivo); limpe `login_attempts` antes de usar essa conta de novo.

## Limites

Local, um processo, banco na mesma máquina, sem latência de rede e sem gateway real: os tempos **não** representam Cloud Run + Neon + gateway. Ver `docs/carga-compatibilidade-seguranca.md`.
