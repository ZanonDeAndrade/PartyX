# Mercado Pago (gateway escolhido, D-01)

Etapa 06 da sequência de fechamento, 11/10/2026. Checkout Transparente pela **API de Orders** (`/v1/orders`), com o cartão no
**Card Payment Brick** (MercadoPago.js v2). Tudo do Mercado Pago fica em `server/src/payments/mercadopago/` (servidor) e
`src/site/cardBrick.tsx` (navegador); o resto do sistema só conhece o contrato de `server/src/payments/gateway.ts`.

## Documentação oficial consultada (versão de 11/10/2026)

| Assunto | URL |
| --- | --- |
| Pix (Orders): criação, QR, copia e cola, vencimento de 30 min a 30 dias | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix |
| Cartão (Orders) com Card Payment Brick | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards |
| Estados da order e da transação | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status e .../transaction-status |
| Webhooks (tópico order), `x-signature`, `x-request-id`, manifesto, HMAC-SHA256, 22 s para responder | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications |
| Contestações pelo tópico order (`order.charged_back`) | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/chargebacks/notifications |
| Consultar order (`GET /v1/orders/{id}`) e erros (402, 409, 423, 429) | https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/get-order/get e .../create-order/post |
| Reembolsos e cancelamentos | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/refunds-cancellations |
| 3DS 2.0 (opcional, `config.online.transaction_security`) | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/integrate-3ds |
| Credenciais (teste e produção) | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/credentials |
| Cartões de teste e nomes de titular (APRO, OTHE, FUND...) e e-mail de teste `test@testuser.com` | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/cards |
| Pix de teste (pagador `APRO` aprova sozinho) | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix |
| Card Payment Brick: parcelas, dados iniciais | https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/advanced-features/configure-installments |
| API de pagamentos (`/v1/payments`, legado), lida antes da troca | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix |

**Por que Orders e não `/v1/payments`:** com as credenciais de teste do painel (Testes > Credenciais de teste, prefixo `APP_USR-`,
usuário de teste), a API de pagamentos recusou toda criação com `401 Unauthorized use of live credentials`; a de Orders aceitou. A
documentação atual marca `/v1/payments` como legado e recomenda Orders para integração nova. Decisão do responsável em 11/10/2026.

## Credenciais (nunca no Git, nunca no chat)

- **Teste (local):** `bash scripts/setup-mp-credentials.sh` grava `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` e `MP_WEBHOOK_SECRET` no
  `.env.local` (ignorado pelo Git, permissão 600), com digitação oculta. Recusa credencial de produção: a de teste da conta real e a
  de produção têm o mesmo prefixo `APP_USR-`, então o script consulta `GET /users/me` (etiqueta `test_user`) e compara com a de
  produção guardada no Secret Manager. `--so-webhook` troca só a assinatura.
- **Produção:** `bash scripts/setup-mp-credentials-producao.sh` grava os segredos `mp-access-token`, `mp-public-key` e
  `mp-webhook-secret` no Secret Manager do `partyx-producao` (só a conta `partyx-app` lê). Confere a conta pela API (recusa usuário de
  teste e conta fora do Brasil) e pede confirmação. Nunca grava em arquivo. `--so-webhook` troca só a assinatura.
- **`MP_COLLECTOR_ID`:** id da conta que recebe (não é segredo). Toda order reconsultada precisa ter este `user_id`.
- Na partida o servidor confere `GET /users/me` contra `MP_COLLECTOR_ID` (log `gateway de pagamento: conta conferida`; senão alerta
  `gateway_conta`). Credencial de produção no ambiente local é recusada pela configuração.

## Fluxo

1. **Opções** (`GET /api/payments/options`): `cardMode: token`, a chave PÚBLICA e `pixAvailable` (o Pix só aparece se a reserva for
   pelo menos o mínimo do Pix no gateway, D-03).
2. **Cartão:** o Brick tokeniza no navegador; o servidor recebe só `cardToken`, `paymentMethodId` (bandeira), `paymentTypeId`
   (crédito ou débito) e `installments=1` (D-02 em aberto, Brick com `minInstallments = maxInstallments = 1`). Número, validade e
   CVV ficam nos campos do Mercado Pago; o corpo com dado de cartão continua recusado com 422 antes de tudo.
3. **Pix:** `payment_method {id: pix, type: bank_transfer}` e `expiration_time` (duração ISO 8601). Vence com a reserva; se faltar
   menos que o mínimo do gateway (30 min), vence no mínimo + 1 min de folga (o pagamento nesse intervalo segue a aprovação tardia).
4. **Criação:** `POST /v1/orders` com `total_amount` do pedido no servidor (centavos → "240.00", texto, sem ponto flutuante),
   `external_reference` = id do pedido, uma transação, pagador com e-mail, nome e CPF (CPF só neste corpo, nunca em log). No teste o
   e-mail do pagador é `test@testuser.com` (exigência da documentação). O 402 "order criada, transação falhou" é tratado como recusa.
5. **Resultado imediato:** cartão já aprovado ou recusado na criação é conciliado na hora, **reconsultando** `GET /v1/orders/{id}`
   (mesmo caminho do webhook): aprova e emite os ingressos, ou recusa e libera a reserva.
6. **Webhook** (`POST /api/webhooks/payments`, tópico order): valida `x-signature` (manifesto `id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;`,
   HMAC-SHA256 com `MP_WEBHOOK_SECRET`, comparação em tempo constante, tolerância de 5 min no `ts`). Inválida: 401 e só metadados
   gravados (CA-P4). Válida: grava o evento, reconsulta a order, confere e aplica; responde em poucos segundos (limite do Mercado
   Pago: 22 s; cada consulta tem 7 s de tempo limite e no máximo uma repetição). Falha de processamento: o evento fica pendente,
   503 para o Mercado Pago repetir, e as verificações do pedido no Cloud Tasks e a rotina diária retomam. Tópico desconhecido ou id
   fora do formato (ex.: "Simular notificação" do painel, id `123456`): 200 e ignorado.

## Estados (`mercadopago/mapping.ts`, teste em `mercadopago.test.ts`)

| Order no Mercado Pago | PartyX | O que acontece |
| --- | --- | --- |
| `processed` | aprovado | confere e emite os ingressos |
| `failed` | recusado | pedido "não concluído", reserva liberada, motivo guardado |
| `canceled`, `expired` (inclusive Pix vencido) | expirado | pedido expirado, reserva encerrada |
| `refunded` | estornado | ingressos válidos cancelados |
| `charged_back` | contestado | ingressos válidos cancelados |
| `created`, `processing`, `action_required`, `in_review` | aguardando | nada; a tela diz "em análise" ou mostra o Pix |
| outro | aguardando, marcado `estado_desconhecido` | nunca aprova |

Erro de rede, tempo esgotado, 429, 423 ou 5xx: "não confirmado" (erro que pode repetir), nunca aprovado.

**Motivo da recusa:** o `status_detail` da transação fica no pedido (`orders.gateway_status_detail`, para o atendimento) e a
categoria (`orders.decline_reason`) vira um texto amigável na tela, sem o código técnico: dados do cartão, saldo, banco não
autorizou, cartão desabilitado, segurança, limite de tentativas, autenticação ou genérico.

## Idempotência, valores e conta

- `X-Idempotency-Key` = `order:<pedido>:<forma>` (primeira tentativa) ou `order:<pedido>:<forma>:<n>`. Reenvio da mesma tentativa
  (clique duplo, falha de rede) repete a chave e o Mercado Pago devolve a mesma order (provado no teste: 201 com a mesma order).
  A tentativa (`orders.payment_attempt`) sobe só quando o gateway **recusa criar** a cobrança (ex.: token inválido); recusa do
  cartão encerra o pedido, e a nova tentativa é um pedido novo, com chave nova. Mesma chave com corpo diferente: 409.
- Antes de aprovar, a order reconsultada precisa conferir: `external_reference`, `total_amount`, `currency` BRL, `user_id` (conta da
  PartyX) e forma (uma transação Pix ou cartão). Divergência: não aprova, trilha `pagamento.divergente` e alerta.
- O dinheiro vai para a conta da PartyX (a das credenciais). A contratada não recebe nem repassa nada.

## CSP (`server/src/security/headers.ts`, só com `PAYMENT_GATEWAY=mercadopago`)

A documentação manda carregar `https://sdk.mercadopago.com/js/v2` e **não publica lista de domínios para CSP**. Os demais foram
medidos no navegador, com o Brick em teste, liberando um bloqueio por vez:

| Diretiva | Domínios | Por quê (medido) |
| --- | --- | --- |
| `script-src` | `https://sdk.mercadopago.com`, `https://http2.mlstatic.com` | SDK e o código do Brick (`op-cho-bricks/.../cardPayment.js`) |
| `connect-src` | `https://api.mercadopago.com`, `https://http2.mlstatic.com`, `https://api-static.mercadopago.com`, `https://secure-fields.mercadopago.com` | bandeiras, parcelas, tokenização, textos do Brick e campos seguros |
| `frame-src` | `https://secure-fields.mercadopago.com` | número, validade e CVV em quadros do Mercado Pago |

Continuam **bloqueados** sem efeito no pagamento (cartão aprovado e recusado com eles bloqueados): um script em linha do SDK e a
telemetria `https://api.mercadolibre.com/tracks`. `img-src` não precisou de nada além de `data:` (QR do Pix vem em base64).

## Provas no ambiente de teste (11/10/2026, servidor local + túnel temporário autorizado)

Evidências só com ids e estados (ids de order de teste começam com `ORDTST`).

| Caso | Resultado |
| --- | --- |
| Cartão APRO, 3 unidades (CA-P1, CA-20) | pedido 10009 pago, 3 ingressos, 3 QR distintos, reserva convertida; 2,8 s do clique em "Pagar" aos ingressos na tela (CA-18) |
| Cartão OTHE (CA-P2) | pedido 10010 não concluído, `rejected_by_issuer` → "banco não autorizou", reserva liberada |
| Cartão FUND (CA-P2) | pedido 10011 não concluído, `insufficient_amount` → "saldo", reserva liberada |
| Pix com pagador APRO (CA-P1, Pix) | order aprovada sozinha pelo Mercado Pago; webhook assinado → reconsulta → pedido 10015 pago com ingresso em 1,9 s pelo túnel |
| Pix vencido (CA-17) | pedido 10012 (2 unidades, sem pagar): no fim da reserva (30 min) o pedido virou "expirado", a reserva foi liberada e a tela mostrou "O prazo para pagamento terminou". O Pix venceu 1 min depois (02:18:34 UTC); às 02:20 o ambiente de teste do Mercado Pago ainda mostrava a order como `action_required`, então o estado `expired` do gateway não chegou a ser observado ali. O cancelamento no gateway (`canceled`, mesmo efeito) foi observado, e o caminho `expired` → pedido expirado está nos testes de integração |
| Assinatura forjada (CA-P4) | 401, metadados gravados, pedido intocado |
| "Simular notificação" do painel | assinatura real do Mercado Pago **confere** com a assinatura gravada (aplicação da PartyX no painel) |
| Idempotência | mesma chave e mesmo corpo: mesma order; corpo diferente: 409 `idempotency_key_already_used` |

**Limitação encontrada:** as notificações das compras de teste chegam assinadas pela aplicação do **usuário de teste**
(outra aplicação, criada pelo Mercado Pago para o usuário de teste), cuja assinatura o painel da conta real não mostra; por isso foram recusadas (401) no túnel. A assinatura da
aplicação da PartyX foi provada com a notificação simulada do painel. O caminho "Pix aprovado → webhook → reconsulta → ingresso" foi
provado com a order real do teste e uma notificação assinada com a mesma regra. A primeira notificação real de produção deve ser
acompanhada na compra de baixo valor do checklist 13.1.

**3DS:** não ligado (o padrão da API é `never`). Ligar exige `config.online.transaction_security`, um quadro para o desafio do banco
e a CSP do endereço dele; testar com os cartões de 3DS da documentação. Status `action_required/pending_challenge` já é tratado
como "aguardando".

## Testes automatizados

- `server/src/payments/mercadopago/mercadopago.test.ts` (55): estados, motivos de recusa, valores, divergência de valor, moeda,
  referência e conta, assinatura (válida, inválida, `ts` fora da tolerância, em segundos e milissegundos), idempotência (rede repete
  a mesma chave, 409), 5xx e tempo esgotado como "não confirmado", 401 sem repetir, Pix com duração ISO, notificações.
- `server/src/api/mercadopago.integration.test.ts` (10, PostgreSQL real e Mercado Pago falso no formato da API): cartão aprovado com
  3 QR distintos, recusa com estoque liberado, tentativa e chave de idempotência, Pix aprovado por webhook sem duplicar, Pix vencido,
  CA-P4, simulação do painel, divergência, contestação, dado de cartão recusado, Pix fora com reserva curta.
- Fixtures em `server/src/payments/mercadopago/fixtures/`: formato da documentação, ids fictícios, nenhum dado real.
