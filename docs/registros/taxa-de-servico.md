# Taxa de serviço (D-90)

**Aprovação:** em 18/10/2026 o responsável (Arthur) informou a aprovação de 5%, única para Pix e cartão, com mínimo de R$ 0,00. Em
19/10/2026 o responsável decidiu **publicar com a taxa em 0%** até a PartyX confirmar a porcentagem e o mínimo a partir da página de
opções `taxa-de-servico-opcoes-2026-10-19.md` (exemplo de R$ 30,00 a 4,98%, 2,99% e 0,99%, com o que chega no Pix e no cartão).
Depois da confirmação, o administrador grava a porcentagem no painel (Configurações) e ela vale só para os pedidos novos. A confirmação
escrita da PartyX fica com o responsável, fora do repositório.

**Porcentagem aprovada (19/10/2026):** o responsável informou que o Bernardo aprovou **7,5%**, com **mínimo de R$ 0,00**, em todos os
ingressos, independentemente do valor, para cobrir também um eventual parcelamento no cartão (hoje o pagamento é à vista, D-02). A conta
é a mesma da página de opções, sobre o total pago: R$ 30,00 → taxa R$ 2,44, total R$ 32,44 (cerca de 8,1% sobre o valor do ingresso).
Os **Termos de Uso 1.4** escrevem a porcentagem, a conta e esse exemplo, e dizem que uma mudança na porcentagem só vale depois de
publicada nos Termos. Por isso a porcentagem do painel precisa ser sempre a dos Termos: mudar uma exige mudar a outra.

**Pedido do responsável (18/10/2026):** taxa de serviço somada ao valor do ingresso, para cobrir a tarifa do Mercado Pago, com o valor
do ingresso chegando inteiro ao organizador; configurável no painel; mostrada separada em todo o site e nos comprovantes; guardada no
pedido; reembolso devolvendo o total pago, com a taxa; relatório com a tarifa real do Mercado Pago; Termos de Uso e Política de
Cancelamento novos na mesma release, com vigência na data da virada.

## Fórmula

O Mercado Pago cobra a tarifa sobre o **total** pago (ingresso mais taxa). Para o valor do ingresso chegar inteiro quando a porcentagem
é igual à tarifa, a taxa é calculada sobre o total:

**taxa por ingresso = valor × r ÷ (1 − r)**, arredondada **para cima** ao centavo, e nunca menor que o mínimo.

Em centavos e centésimos de ponto percentual (5% = 500), sem ponto flutuante: `taxa = max(⌈valor × 500 ÷ 9500⌉, mínimo)`. A taxa é por
ingresso: num pedido com ingressos de lotes diferentes, cada um paga a taxa do preço do lote dele.

## Exemplo da conta: ingresso de R$ 30,00 a 5% (as três opções enviadas à PartyX estão em `taxa-de-servico-opcoes-2026-10-19.md`)

- 30,00 × 0,05 ÷ 0,95 = 1,5789…, para cima: **taxa R$ 1,58**.
- **Total pago pelo comprador: R$ 31,58.** O site mostra "R$ 30,00 + R$ 1,58 taxa".

O que chega ao Bernardo, pelas tarifas públicas do Checkout do Mercado Pago consultadas em 18/10/2026 (sem tarifa fixa em Pix e cartão),
com a tarifa sobre R$ 31,58 arredondada ao centavo:

| Meio | Tarifa | Tarifa sobre R$ 31,58 | Chega ao Bernardo | Diferença para o valor do ingresso |
|---|---|---|---|---|
| Pix (na hora) | 0,99% | R$ 0,31 | **R$ 31,27** | R$ 1,27 a mais |
| Cartão de crédito à vista, liberação na hora | 4,98% | R$ 1,57 | **R$ 30,01** | R$ 0,01 a mais |
| Cartão de crédito à vista, liberação em 14 dias | 4,49% | R$ 1,42 | R$ 30,16 | R$ 0,16 a mais |
| Cartão de crédito à vista, liberação em 30 dias | 3,98% | R$ 1,26 | R$ 30,32 | R$ 0,32 a mais |

Com 5%, a taxa cobre a tarifa nos dois meios (no cartão com liberação na hora, por um centavo). O prazo de liberação do cartão é o
configurado na conta (app do Mercado Pago, Seu negócio > Custos > Checkouts). A tarifa real de cada pedido pago aparece no relatório de
vendas (abaixo), para o Bernardo confirmar.

Fonte das tarifas: [Checkout do Mercado Pago](https://www.mercadopago.com.br/ferramentas-para-vender/check-out) (crédito na hora 4,98%, 14
dias 4,49%, 30 dias 3,98%; Pix na hora 0,99%).

## Onde está no sistema

| Parte | O que faz |
|---|---|
| Banco, migração `0017_taxa_de_servico` (só expande) | Tabela `service_fee_settings` (uma linha; nasce com 0% e mínimo 0: sem taxa até o painel gravar). Em `orders`: `service_fee_cents`, `service_fee_rate_bps`, `service_fee_min_cents` (padrão 0, o que todo pedido anterior teve), `gateway_fee_cents`, `gateway_net_cents` e `gateway_fee_checked_at` (vazios até a consulta). `order_items.service_fee_cents` e `order_item_lots.unit_service_fee_cents`. Reversão recusa se houver pedido com taxa |
| Conta | `server/src/domain/serviceFee.ts`; a mesma em `src/site/serviceFee.ts` (prévia do painel), com a mesma tabela de casos nos testes dos dois lados (`serviceFee.cases.ts`) |
| Pedido | O resumo e a criação do pedido calculam a taxa por lote; `createOrder` lê a taxa na mesma transação e grava valor, taxa, porcentagem e mínimo. Se a taxa mudou entre a tela e o pedido, o total muda e o pedido é recusado (`preco_alterado`), como numa virada de lote |
| Pagamento | O valor enviado ao Mercado Pago é o total (ingressos mais taxa), o mesmo no Pix e no cartão; a conferência de valor na reconsulta continua pelo total |
| Painel, Configurações | Porcentagem (0% a 20%) e mínimo (até R$ 50,00), com a conta de exemplo e confirmação; cada mudança vai para a trilha (`taxa_servico.alterar`) e vale só para pedidos novos. Ao salvar com algum evento à venda, a confirmação e o aviso depois de salvar dizem que a taxa vale só para os pedidos feitos a partir daquele momento, e a trilha guarda quantos eventos estavam à venda (`after_json.eventsOnSale`) e o motivo. Com 0% e mínimo 0, o site não mostra taxa: sem "+ R$ 0,00 taxa" na página do evento e sem a linha "Taxa de serviço" no checkout, no pedido, nos e-mails e no PDF |
| Painel, tipo e lote | O administrador informa só o valor; ao lado, enquanto digita: "Taxa de serviço R$ 1,58 (5%): o comprador paga R$ 31,58" |
| Site | Cada tipo: "R$ 30,00 + R$ 1,58 taxa" (valor em destaque, taxa menor). Seleção, resumo do checkout e pedido: linhas de ingressos, taxa de serviço e total. Bloco "Formas de pagamento": Pix (quando cabe na reserva) e cartão de crédito ou débito, sem parcelamento (hoje à vista, D-02) |
| Comprovantes | E-mail de compra (valor dos ingressos, taxa de serviço, total pago), tela do pedido, Meus ingressos, detalhe do ingresso e PDF (valor do ingresso mais a taxa dele) |
| Estornos | A plataforma não estorna pela API (o estorno é feito no painel do Mercado Pago). O detalhe do pedido mostra o valor a devolver num reembolso total (o total pago, com a taxa) e o de cada ingresso (valor mais a taxa dele); a orientação do cancelamento diz isso. Os relatórios contam o estorno pelo total |
| Relatórios | Vendas: valor dos ingressos, taxa de serviço, total cobrado, tarifa do Mercado Pago e líquido recebido, e o quadro "Taxa de serviço x tarifa do Mercado Pago". Conciliação: itens mais taxa igual à soma dos pedidos pagos. Promoters: valor dos ingressos, sem a taxa. Taxa mensal da contratada: contagem por ingresso, sem mudança. CSV de pedidos e de vendas e exportação de encerramento com as colunas novas |
| Tarifa real | A Orders API não traz `fee_details`. Conferido no ambiente de teste em 18/10/2026 e em produção em 19/10/2026, só leitura, com o PX-10001 (Pix de R$ 1,00): `GET /v1/orders/{id}` devolveu só `total_amount` e `total_paid_amount`; a Payments API, na busca por `external_reference` e no `GET /v1/payments/{id}` com o id do pagamento devolvido pela busca, trouxe `fee_details` (`mercadopago_fee` R$ 0,01, `fee_payer: collector`) e `net_received_amount` R$ 0,99. Também conferido (`server/src/payments/mercadopago/fee.sandbox.test.ts`): a busca `GET /v1/payments/search?external_reference=<pedido>` devolve o pagamento com `fee_details` (`mercadopago_fee`) e `net_received_amount`; `/v1/payments/{id}` não aceita o id do pagamento da order. A rotina diária (04:00) grava a tarifa e o líquido dos pedidos pagos há mais de 10 minutos; sem resposta, tenta de novo até 3 dias |

## Textos legais (vigência na data da virada)

- **Termos de Uso 1.3**: seção 4 ("Preço e taxa de serviço"; pagamento confirmado depois de vencida a reserva devolve o total pago, com a
  taxa) e seção 6 (o reembolso corresponde ao total pago, com a taxa).
- **Política de Cancelamento, Troca e Reembolso 1.1**: seção 4 (evento cancelado devolve o total pago, com a taxa) e seção 7 (o reembolso
  é o valor do ingresso mais a taxa; um ingresso só devolve o valor e a taxa dele). "Integral" nas seções 4, 5 e 6 fica coberto pela
  definição da seção 7.
- **Política de Privacidade**: continua 1.2 ("valores" já cobre a taxa).
- `infra/producao/env.prod.yaml`: `TERMS_VERSION 1.3` e `CANCELLATION_VERSION 1.1`, com a data da virada. Quem já aceitou a 1.2 aceita a
  1.3 no próximo login ou checkout; a Política é aceita em cada compra.
- **Travas do `deploy.sh`**: o `conferir` recusa a release que tem a migração 0017 se os textos da tag não forem os da taxa
  (`infra/producao/textos-taxa.py`: versões mínimas e as frases antigas "não há taxa"); o `virar` recusa a candidata que troca a versão
  de um texto legal com data diferente da do dia (São Paulo).

## Testes

- `server/src/domain/serviceFee.test.ts` e `src/site/serviceFee.test.ts`: tabela de casos (R$ 30,00 a 5% = 158, conta exata não sobe,
  mínimo, 0%, 20%, preço alto), a garantia de que o valor chega inteiro com a porcentagem igual à tarifa, e os limites.
- `server/src/api/serviceFee.integration.test.ts` (banco real, 5% da migração): página do evento e formas de pagamento; resumo e pedido
  com a taxa guardada no pedido, no item e no lote; compra dividida entre lotes (R$ 1,58 e R$ 2,11); mudança da taxa com pedido já feito
  (o pedido e o valor cobrado não mudam; resumo novo usa a nova; total antigo recusado); Pix e cartão com o mesmo total no gateway; e-mail
  de compra e Meus ingressos; painel, rotina diária com a tarifa do gateway, relatório e CSV; configurações (só administrador, limites,
  0% esconde a taxa, mínimo).
- `server/src/mail/templates.test.ts`, `server/src/tickets/pdf.test.ts`, `server/src/security/headers.test.ts` (sem mudança),
  `server/src/ops/deployTextos.test.ts` (travas do `deploy.sh`), `server/src/db/schema.integration.test.ts` (0017 nasce com 5%, CHECK,
  reversão), e2e do roteiro 11.2 (item 8 com a taxa) e do painel no celular (Configurações).
- Banco de teste: a migração grava 0%, então os testes anteriores à taxa continuam conferindo total = preço × quantidade sem ajuste;
  os testes da taxa e os e2e de roteiro e de texto longo gravam 5% (`createTestDatabase(url, { serviceFee: { rateBps: 500, minCents: 0 } })`).

## Pendente

- Publicada em 19/10/2026 na revisão `partyx-00046-gul` (`publicacao-producao-2026-10-19.md`), com a taxa em 0%: nada mudou para o
  comprador na virada.
- Porcentagem aprovada (7,5%, mínimo R$ 0,00) e escrita nos Termos 1.4. Falta o administrador gravar 7,5% e mínimo R$ 0,00 no painel,
  em Configurações, **depois** da virada dos Termos 1.4 (vale só para pedidos novos; com evento à venda o painel avisa e a trilha
  registra).
- Conferir no relatório a tarifa real dos primeiros pedidos pagos com taxa em produção.
