# Auditoria: cobrança "Cloud Load Balancer Forwarding Rule Minimum Global" (13/10/2026)

Conferência **somente de leitura** nos 21 projetos que a conta do responsável acessa. Só foram usados comandos de listagem e descrição, leitura de logs de auditoria e de métricas. Nenhum recurso foi criado, alterado ou apagado, e a API do Compute Engine **não** foi ativada em nenhum projeto.

## Resposta curta

- **Não existe load balancer em nenhum projeto hoje.** O custo atual desse item é **US$ 0 por mês**.
- **A cobrança veio do projeto `qc-offroad-prod` (QC Off-Road), não da PartyX.** Ele teve um load balancer HTTPS global de **26/08/2026 a 30/09/2026**, criado e removido pela conta do próprio responsável.
- `qc-offroad-prod` fica na conta de faturamento "Pagamento do Firebase" (`0158D3-9C1431-A0ABCF`), **a mesma do `partyx-hml`**. Por isso o item aparece na fatura onde está a homologação da PartyX.
- Nos projetos `partyx-hml`, `partyx-producao` e `luma-23ffa` a API do Compute Engine nunca esteve ativa nos últimos 90 dias: nunca houve load balancer neles.

O que este levantamento **não** viu: a fatura em si (não há exportação de faturamento consultável por aqui). Se o item aparecer com data de **outubro em diante**, ele não se explica pelo que está abaixo; nesse caso, filtre o relatório de faturamento por projeto e SKU e avise.

## Como foi conferido

1. `gcloud projects list` (21 projetos) e, por projeto, conta de faturamento e APIs ativas (`gcloud services list --enabled`).
2. Só `qc-offroad-prod` tem a API do Compute ativa. Nele: forwarding rules globais e regionais, proxies HTTP e HTTPS, url-maps, backend services e buckets, NEGs, endereços globais e regionais, certificados, políticas de segurança e mapeamentos de domínio do Cloud Run. **Tudo vazio.**
3. Logs de auditoria (atividade de administrador) dos últimos 90 a 120 dias nos 12 projetos com faturamento: qualquer chamada ao Compute, ativação da API ou mapeamento de domínio. Só `qc-offroad-prod` tem registros.
4. Projetos por conta de faturamento (`gcloud billing projects list`): todos estão na lista do item 1; nenhum projeto em exclusão.
5. DNS dos domínios (`dig`) e métricas `loadbalancing.googleapis.com/https/request_count` dos últimos 7 dias.

## Tabela por projeto

| Projeto | Faturamento | Compute | Existe LB? | Recursos | Em uso? | Custo mensal hoje | Conclusão |
|---|---|---|---|---|---|---|---|
| `partyx-hml` | Pagamento do Firebase | desativada | não | nenhum; sem atividade do Compute em 90 dias | não se aplica | US$ 0 | nada a remover: Compute desativada, sem load balancer |
| `partyx-producao` | PartyX | desativada | não | nenhum; sem atividade em 90 dias | não se aplica | US$ 0 | nada a remover |
| `luma-23ffa` | Minha conta de faturamento | desativada | não | nenhum; sem atividade em 90 dias | não se aplica | US$ 0 | nada a remover |
| `luma-hml-20260929` | sem faturamento | desativada | não | nenhum | não se aplica | US$ 0 | nada a remover |
| `qc-offroad-prod` | Pagamento do Firebase | **ativa** | **não (existiu de 26/08 a 30/09)** | nenhum hoje; ver linha do tempo | não: domínios no Firebase Hosting | US$ 0 | já removido; verificar com Arthur só se a API do Compute pode ser desativada |
| `faroledu-740ef`, `quartacolonia-f49a8`, `kart-499101` | Pagamento do Firebase | desativada | não | nenhum | não se aplica | US$ 0 | nada a remover |
| `barbeariaresenha-ee17b` | PartyX | desativada | não | nenhum | não se aplica | US$ 0 | nada a remover |
| `faroledu`, `lojaaasiam-12ec3`, `quartacolonia`, `camisetas-si-amf` | Minha conta de faturamento | desativada | não | nenhum | não se aplica | US$ 0 | nada a remover |
| `certificados-prod-2ea4fc`, `gen-lang-client-0375495951`, `institutoforup`, `institutoforup-479402`, `fiori-467803`, `controle-kart`, os dois "My First Project" | sem faturamento | desativada | não | nenhum | não se aplica | US$ 0 | nada a remover |

Observação fora do pedido: `barbeariaresenha-ee17b` está na conta de faturamento "PartyX" (`01B4CE-D0C9DA-391606`), a da produção da PartyX. Verificar com Arthur se é intencional.

## O load balancer que existiu em `qc-offroad-prod`

Cadeia, pelos logs de criação (horários em UTC, todos pela conta do responsável):

| Recurso | Nome | Criado | Removido |
|---|---|---|---|
| API do Compute ativada | | 26/08/2026 14:53 | continua ativa |
| IP global reservado | `qc-offroad-web-ip` | 26/08 14:54 | 30/09 22:21 |
| NEG serverless (Cloud Run `qc-offroad-web`) | `qc-offroad-web-neg` | 26/08 14:54 | 30/09 22:20 |
| Backend service | `qc-offroad-web-backend` | 26/08 14:54 | 30/09 22:20 |
| URL map HTTPS | `qc-offroad-web-https-map` | 26/08 14:57 | 30/09 22:19 |
| URL map de redirecionamento HTTP | `qc-offroad-web-http-redirect` | 26/08 14:57 | 30/09 22:19 |
| Certificados gerenciados | `qc-offroad-domain-cert`, `-cert-dns`, `qc-offroad-canonical-domains` | 26 e 27/08 | 26/08 e 30/09 22:20 |
| Proxy HTTPS | `qc-offroad-web-https-proxy` | 26/08 14:57 | 30/09 22:19 |
| Proxy HTTP | `qc-offroad-web-http-proxy` | 26/08 14:58 | 30/09 22:19 |
| **Forwarding rule global 443** | `qc-offroad-web-https-rule` | 26/08 14:57 | 30/09 22:18 |
| **Forwarding rule global 80** | `qc-offroad-web-http-rule` | 26/08 14:58 | 30/09 22:19 |

Cadeia: forwarding rules (443 e 80) → proxies → url-maps → `qc-offroad-web-backend` → `qc-offroad-web-neg` → Cloud Run `qc-offroad-web`. Domínios dos certificados: `utvquartacolonia.com.br`, `quartacoloniaoffroad.com.br`, `aventuri.com.br`, `offroadquartacolonia.com.br`, `quartacoloniautv.com.br` (com e sem `www`).

## Está em uso?

- **DNS:** os cinco domínios (e os `www`) resolvem hoje para `199.36.158.100`, o endereço do **Firebase Hosting**, e os dez nomes estão ativos como domínios personalizados do site `qc-offroad-prod`. Nenhum aponta para IP de load balancer; o IP reservado foi liberado em 30/09.
- **Métricas:** existem séries de `https/request_count` nos últimos 7 dias (9.125 requisições em `qc-offroad-prod`), mas **sem** forwarding rule, proxy, url-map nem backend (`NO_BACKEND_SELECTED`). A mesma consulta devolve séries iguais em `partyx-hml` (1.603), `partyx-producao` (24) e `luma-23ffa` (11.017), que nunca tiveram load balancer. É o tráfego Firebase Hosting → Cloud Run visto pela borda do Google, não um load balancer cobrado. Nenhuma série tem nome de forwarding rule.

## Preço e custo

Página oficial: https://cloud.google.com/load-balancing/pricing (consultada em 13/10/2026 pelo resumo da busca; a tabela completa não carregou na ferramenta, confira o valor na página). Forwarding rules globais: **US$ 0,025 por hora pelas 5 primeiras** (valor fixo de 1 a 5 regras, daí o "Minimum" no nome do item) e US$ 0,01 por hora por regra adicional. O processamento de dados é cobrado à parte, por GB.

| Período | Horas com o LB | Estimativa do item "Forwarding Rule Minimum Global" |
|---|---|---|
| Agosto (26/08 14:58 a 31/08) | cerca de 129 | US$ 3,23 |
| Setembro (01/09 a 30/09 22:18) | cerca de 718 | US$ 17,96 |
| Outubro em diante | 0 | **US$ 0** |

Mês cheio com esse load balancer custaria cerca de US$ 18,25 (730 h), fora dados. O IP estático não gerou custo ocioso: ficou em uso até ser apagado junto.

## Remoção

**Não há nada a remover.** A remoção de 30/09 já seguiu a ordem certa (forwarding rules → proxies → url-maps → backend → NEG → certificados → IP). Nenhum comando de remoção é proposto.

Opcional, para decidir com Arthur e **não executado**: desativar a API do Compute em `qc-offroad-prod`, já que não sobrou recurso, para impedir que um load balancer volte a ser criado sem querer:

```bash
gcloud services disable compute.googleapis.com --project=qc-offroad-prod
```

Antes, confirmar que nada no projeto depende dela (o Cloud Run e o Firebase Hosting não dependem).

## PartyX

A decisão de não usar load balancer está respeitada: o tráfego passa do Firebase Hosting direto para o Cloud Run, e a API do Compute está desativada em `partyx-hml` e `partyx-producao`.
