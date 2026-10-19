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
| `processed` com detalhe `partially_refunded` | aprovado | estorno parcial: nada cancelado; trilha e alerta (D-82) |
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
  cartão encerra o pedido, e a nova tentativa é um pedido novo, com chave nova. Mesma chave com corpo diferente: 409, que **não** é
  recusa (a primeira order pode existir): o servidor procura a order pela referência e a vincula (etapa 07).
- Antes de aprovar, a order reconsultada precisa conferir: `external_reference`, `total_amount`, `currency` BRL, `user_id` (conta da
  PartyX) e forma (uma transação Pix ou cartão). Divergência: não aprova, trilha `pagamento.divergente` e alerta.
- O dinheiro vai para a conta da PartyX (a das credenciais). A contratada não recebe nem repassa nada.

## CSP (`server/src/security/headers.ts`, só com `PAYMENT_GATEWAY=mercadopago`)

A documentação manda carregar `https://sdk.mercadopago.com/js/v2` e **não publica lista de domínios para CSP** (conferido de novo em
18/10/2026: as páginas de segurança do Checkout Transparente e do Checkout Bricks tratam de OAuth, OWASP e PCI, nada de CSP). Os
domínios foram medidos no navegador, liberando um bloqueio por vez (11/10/2026 e 18/10/2026, Chromium, WebKit e Firefox):

| Diretiva | Domínios | Por quê (medido) |
| --- | --- | --- |
| `script-src` | `https://sdk.mercadopago.com`, `https://http2.mlstatic.com`, `'nonce-…'` (novo a cada resposta) | SDK, código do Brick (`op-cho-bricks/.../cardPayment.js`) e o script em linha do perfil do aparelho |
| `connect-src` | `https://api.mercadopago.com`, `https://http2.mlstatic.com`, `https://api-static.mercadopago.com`, `https://secure-fields.mercadopago.com`, `https://www.mercadolibre.com` | bandeiras, parcelas, tokenização, textos do Brick, campos seguros e impressão do aparelho |
| `img-src` | `https://www.mercadopago.com.br`, `https://www.mercadolibre.com`, `https://www.mercadolivre.com` | impressão do aparelho (antifraude) |
| `frame-src` | `https://secure-fields.mercadopago.com` | número, validade e CVV em quadros do Mercado Pago |

`style-src` e `font-src` não precisaram de nada: os campos e as fontes do Brick ficam dentro dos quadros do Mercado Pago.

**Script em linha (perfil do aparelho):** o SDK busca em `/devices/widgets` um script do antifraude e o põe na página como script em
linha. O conteúdo muda a cada vez (hash não serve). O SDK aceita `deviceProfileCspNonce` e põe o nonce nesse script; o servidor gera
um nonce por resposta (o `NONCE` do `hono/secure-headers`), põe no `script-src` e num `<meta property="csp-nonce" nonce="…">` do HTML
(`injectCspNonce`), e a tela de cartão entrega ao SDK (`src/site/cardBrickMount.ts`). Sem `unsafe-inline`. O SDK junta esse perfil
ao token do cartão (`createCardToken`), então ele conta no antifraude. Até 18/10/2026 o script ficava bloqueado.

Continua **bloqueada**, sem efeito no pagamento: a telemetria do SDK `https://api.mercadolibre.com/tracks` (avisos "Could not send
event" no console). A documentação não pede esse domínio.

**Bloqueio do próprio navegador:** a proteção contra rastreamento do Firefox (e bloqueadores de anúncio) pode cortar arquivos do Brick,
como `http2.mlstatic.com/.../i18n/pt/cardPayment/index.json`. Nesse caso o `create` do Brick resolve **sem controlador** e não chama
`onError` nem `onReady`. A tela mostra "Não foi possível carregar o pagamento com cartão. Desative o bloqueio de rastreamento para
este site ou pague por Pix." e o botão "Pagar com Pix", que gera o Pix na hora. O mesmo aviso aparece se o SDK der erro, se `onError`
vier antes de `onReady` ou se nada ficar pronto em 10 s. Se o Brick ficar pronto depois, o formulário volta. Sem Pix (reserva curta,
D-03), o aviso pede para desativar o bloqueio e recarregar. Registro: `docs/registros/cartao-csp-e-bloqueio-2026-10-18.md`.

## Taxa de serviço e tarifa do Mercado Pago (D-90, 18/10/2026)

- O valor enviado ao Mercado Pago (`total_amount` e `transactions.payments[].amount`) é o **total do pedido**: ingressos mais a taxa de
  serviço da PartyX, o mesmo no Pix e no cartão. A conferência na reconsulta continua pelo total. Regra e números em
  `docs/registros/taxa-de-servico.md`.
- **Tarifa real:** a Orders API (`GET /v1/orders/{id}`) não traz `fee_details` (só `total_amount`, `total_paid_amount` e os valores do
  pagamento). Conferido no ambiente de teste em 18/10/2026 (`server/src/payments/mercadopago/fee.sandbox.test.ts`, `npm run
  test:sandbox`): `GET /v1/payments/search?external_reference=<id do pedido>` devolve o pagamento com `fee_details` (`mercadopago_fee`,
  `fee_payer: collector`) e `transaction_details.net_received_amount`; `GET /v1/payments/{id}` com o id do pagamento da order responde 404
  (com o `id` numérico que a busca devolve, responde 200 com os mesmos campos). Confirmado em produção em 19/10/2026, só com GET e com a
  credencial de produção, no PX-10001 (Pix de R$ 1,00): a Orders API devolveu `total_amount` e `total_paid_amount` 1.00 sem tarifa; a
  Payments API devolveu `fee_details` com `mercadopago_fee` 0.01 e `net_received_amount` 0.99.
  O adaptador (`paymentFees`) soma as tarifas pagas pela PartyX do único pagamento aprovado; com mais de um (cobrança em dobro), não grava.
  A rotina diária grava em `orders.gateway_fee_cents` e `orders.gateway_net_cents`.

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

## Etapa 07: webhook, estorno e contestação no ambiente de teste (12/10/2026)

Suíte `server/src/api/mercadopago.sandbox.test.ts`, rodada com `npm run test:sandbox` (lê as credenciais de teste do `.env.local` e o
banco do `.env.test`; fica fora do `npm test` porque cria orders de verdade). Recusa rodar se a conta das credenciais não for usuário
de teste (`GET /users/me`, etiqueta `test_user`). **13 casos aprovados em duas rodadas seguidas** (06:13 e 06:15 UTC, cerca de 66 s
cada), com PostgreSQL real e o servidor inteiro em processo (`createApp`).

### O que é real e o que é simulado

| Parte | Real ou simulado | Por quê |
| --- | --- | --- |
| Criação das orders, aprovação do cartão APRO, recusa, busca de orders, chaves de idempotência (409) | **Real** (`api.mercadopago.com`, credenciais de teste) | |
| Reconsulta `GET /v1/orders/{id}` antes de qualquer decisão | **Real** | |
| Estorno total | **Real**, pela API de reembolsos (`POST /v1/orders/{id}/refund`), a mesma operação do botão do painel | As compras feitas com as credenciais de teste não aparecem no painel da conta real; o botão em si não foi clicado |
| Entrega do webhook | **Montada** no formato do Mercado Pago e assinada com a assinatura secreta da aplicação da PartyX | As notificações das compras de teste vêm assinadas pela aplicação do usuário de teste, cuja assinatura o painel não mostra (limitação da etapa 06) |
| Tempo esgotado na reconsulta | **Real**: a chamada ao Mercado Pago é abortada em 1 ms | |
| Resposta da criação perdida | **Simulada**: a chamada chega ao Mercado Pago e é processada; a resposta é descartada | Não há como provocar a perda de verdade |
| Queda no meio da emissão | **Simulada**: o emissor de ingressos falha uma vez | |
| Contestação (chargeback) | **Simulada**: a order real aprovada é lida e só o estado volta trocado para `charged_back` | O ambiente de teste não gera contestação |

**Pix no ambiente de teste:** às 02:24 UTC o Pix com pagador APRO aprovou sozinho em menos de 10 s; a partir de 06:02 UTC todas as orders
Pix (inclusive uma mínima criada direto na API) ficaram presas em `processing/in_process` por mais de 10 min. A plataforma tratou como
"aguardando" (correto: não aprova nem libera). Por isso os casos usam o cartão Visa de teste com titular APRO (aprovado na criação) e
a conciliação imediata adiada por tempo esgotado real: o pedido fica "pendente" com a order já aprovada no Mercado Pago, o mesmo
estado de um Pix pago à espera do webhook. Observado também: CPF inválido no pagador faz a order falhar com `processing_error`;
o antifraude do ambiente de teste recusa rajadas (`high_risk`), então a suíte espaça as criações em 6 s.

### Casos (ids de order de teste; nenhum dado pessoal)

| # | Caso | Resultado no banco |
| --- | --- | --- |
| 1 | Aprovação + a mesma notificação 2 vezes + 6 notificações diferentes ao mesmo tempo (CA-P3) | `ORDTST01M4QC06HRSHQNJV5TJK8AKQP1`: 1 pedido `pago`, 2 ingressos, 2 QR distintos, vendidos 2, reserva convertida; 2ª entrega `duplicada` |
| 2 | Fora de ordem: notificação antiga (`order.action_required`) depois da aprovação | `ignorado`; `paid_at` igual |
| 3 | Assinatura falsa, `ts` vencido, assinatura ausente (CA-P4) | 401 nas três; 3 linhas só com metadados (sem id da order nem vínculo com pedido); pedido e ingressos intocados |
| 4 | Webhook perdido; a verificação do Cloud Tasks reconsulta | `ORDTST01M4QC0CAYACRNYEKJ1AZWM768`: tarefa `conciliado`, pedido pago, 1 ingresso |
| 5 | Tempo esgotado nas duas tentativas da reconsulta | 503, evento pendente (`gateway_indisponivel`, 1 tentativa), pedido pendente com reserva ativa e nenhum ingresso; a repetição da mesma notificação conclui (`ORDTST01M4QC0JAMW8V257PXTS4GJFWK`, 2 ingressos) |
| 6 | Resposta da criação perdida nas duas tentativas e nova tentativa com token novo | 2 respostas 409 reais (`idempotency_key_already_used`); 1ª nova tentativa responde `pagamento_em_verificacao`, a seguinte acha a order pela busca e conclui; **uma** order no Mercado Pago para o pedido (`ORDTST01M4QC0RQJHJY8PVQ73YV24ZAD`) |
| 7 | Queda no meio da emissão | 503; transação inteira desfeita (pendente, `paid_at` nulo, 0 ingresso, vendidos 0); a rotina diária retomou (1 evento, 1 concluído): 3 ingressos |
| 8 | Valor divergente (order de R$ 1,00 para pedido de R$ 40,00), segunda cobrança aprovada para pedido já pago, referência inexistente, órfã correta | `divergente` sem vincular (trilha `valor`); `cobranca_duplicada` sem emitir; `sem_pedido`; órfã vinculada e emitida |
| 9 | Estorno total (CA-P5, CA-29), com um ingresso já usado | `estornado`; ingressos `utilizado` e `cancelado` (estorno); portaria `cancelado` (vermelho); `paid_at` igual; vendidos 2 (D-14); aprovação antiga e estorno repetido chegando depois: `ignorado`; taxa do mês conta as 10 unidades emitidas |
| 10 | Estorno com o webhook perdido | rotina diária: 5 pagos reconsultados, 1 `estornado`, 4 `ignorado`; ingresso cancelado, `paid_at` igual |
| 11 | Contestação **simulada** sobre a order real do caso 5 | `contestado`; 2 ingressos cancelados (chargeback); portaria `cancelado`; taxa: 2 "Cancelado (contestação)" |
| 12 | Estorno antes de a plataforma ver a aprovação (notificações invertidas) | nada emitido, `paid_at` nulo, 1 trilha `estorno_fora_de_fluxo` (não repete); vencida a reserva, `expirado` e as 2 unidades voltam à venda |
| Banco | Ao fim | 0 `gateway_payment_id` repetido, 0 QR repetido, 0 item com mais ingressos que a quantidade, `quantity_sold` = ingressos emitidos em todos os tipos, `paid_at` só em pedido aprovado, nenhum tipo acima da capacidade; 16 notificações válidas, 16 processadas; 3 inválidas, 0 processadas |

### Defeitos achados e corrigidos

1. **Segunda cobrança depois de resposta perdida.** O token de cartão vale uma vez: se a criação dava tempo esgotado depois de o Mercado
   Pago criar a order, a nova tentativa ia com token novo, a mesma chave e corpo diferente, e o Mercado Pago responde **409**. O
   adaptador tratava 409 como recusa, a tentativa subia, a chave mudava e a terceira tentativa criava **outra** order (duas cobranças,
   a primeira sem vínculo). Agora o 409 vira `GatewayKeyReusedError` (não é recusa): o servidor procura a order pela referência
   (`GET /v1/orders` com `begin_date`, `end_date` e `external_reference`; a busca indexa com alguns segundos de atraso) e a vincula;
   se ainda não aparecer, responde 503 `pagamento_em_verificacao` sem mudar a tentativa.
2. **Cobrança órfã.** Notificação de uma order que nenhum pedido conhece era só `sem_pedido`. Agora a reconsulta diz a referência; se
   o pedido estiver aberto e sem cobrança **e** valor, moeda, conta e forma conferirem, a order é vinculada (trilha
   `pagamento.vinculado_pela_reconsulta`) e segue o caminho normal. Valor errado: `divergente`, sem vincular. Pedido que já tem outra
   cobrança: `cobranca_duplicada`, nada emitido, trilha e alerta (D-83); o caso aparece na aba Exceções do painel até ser marcado
   como tratado, com motivo, depois de a PartyX estornar no gateway.
3. **Estorno ou contestação com o webhook perdido.** A rotina diária só reconsultava pedidos em aberto; um estorno sem webhook deixava o
   ingresso valendo na portaria. Agora ela também reconsulta pedidos `pago`, `contestado` e `pago_sem_estoque` de eventos que ainda
   não passaram (até 1 dia depois do início), cada um no máximo a cada 20 h, até 200 por execução, em rodízio pelo carimbo
   `updated_at`. Limite conhecido: com mais de 200 pedidos pagos por dia em eventos futuros, a volta completa leva mais de um dia;
   o Mercado Pago também reenvia as notificações que não receberam resposta.
4. **Estorno parcial.** No Mercado Pago a order continua `processed` com detalhe `partially_refunded` (observado: estorno de R$ 30,00
   numa order de R$ 80,00; depois do resto, `refunded`). Antes nada acontecia. Agora: trilha `pagamento.estorno_parcial` e alerta,
   uma vez por pedido; nenhum ingresso cancelado sozinho. O alerta orienta o administrador a cancelar manualmente, pelo ADM15, o
   ingresso correspondente (D-82, proposta a confirmar com a PartyX).
5. A trilha `pagamento.estorno_fora_de_fluxo` não se repete mais a cada reconsulta do mesmo pedido.

Testes de integração com o Mercado Pago falso cobrem as correções 1 a 4 (`mercadopago.integration.test.ts`, 5 testes novos);
mutações conferidas: desfazendo a correção do 409, falham 2; desligando a passagem pelos pagos, falha 1.

### Não verificado nesta etapa

- O botão de estorno do painel e a notificação real do estorno (só a operação equivalente pela API e uma notificação montada).
- Contestação real (o ambiente de teste não gera) e contestação resolvida a favor da PartyX (D-40).
- Pix aprovado nesta rodada (o ambiente de teste deixou o Pix em `processing`); o Pix aprovado foi provado na etapa 06.
- Retentativas reais do Mercado Pago (intervalos e quantidade) e o comportamento com o Cloud Tasks e o Scheduler reais.
