# Taxa de serviço: como é calculada e o que chega para a PartyX

Para o Bernardo (PartyX). Preparado por Zanon de Andrade em 19/10/2026.

## O que é

O Mercado Pago cobra uma tarifa sobre cada pagamento, descontada do valor antes de ele chegar para a PartyX. A taxa de serviço é um
valor somado ao preço do ingresso, pago pelo comprador, para cobrir essa tarifa e deixar o valor do ingresso chegar inteiro.

Ela aparece separada do preço na página do evento, na tela de compra, no comprovante, no e-mail e no PDF do ingresso. Enquanto a
porcentagem estiver em zero, nada de taxa aparece para o comprador.

## Como é calculada

A tarifa do Mercado Pago incide sobre o total pago (ingresso mais taxa). Por isso a taxa é calculada sobre o total, e não só sobre o
preço do ingresso:

**taxa por ingresso = preço × porcentagem ÷ (1 − porcentagem)**, arredondada para cima ao centavo.

A porcentagem é uma só, para Pix e cartão. Opcionalmente há um valor mínimo por ingresso (hoje sugerido em R$ 0,00, porque o Mercado
Pago não cobra tarifa fixa no Pix nem no cartão).

## As tarifas do Mercado Pago

Tarifas públicas do Checkout do Mercado Pago, consultadas em 18/10/2026, sem tarifa fixa:

| Forma de pagamento | Liberação do dinheiro | Tarifa |
|---|---|---|
| Pix | na hora | 0,99% |
| Cartão de crédito à vista | na hora | 4,98% |
| Cartão de crédito à vista | em 14 dias | 4,49% |
| Cartão de crédito à vista | em 30 dias | 3,98% |

A conta abaixo usa Pix a 0,99% e cartão a 4,98% (liberação na hora, que é a configuração padrão da conta). Se a conta do Mercado Pago
estiver com liberação em 14 ou 30 dias, a tarifa do cartão é menor e sobra mais.

Conferido num pagamento real da PartyX em 19/10/2026 (pedido de teste de R$ 1,00 no Pix): o Mercado Pago cobrou R$ 0,01 de tarifa e
liberou R$ 0,99.

## Exemplo: ingresso de R$ 30,00

O comprador vê "R$ 30,00 + taxa" e paga o total. Depois o Mercado Pago desconta a tarifa dele e o restante chega para a PartyX.

| Opção | Taxa no ingresso | Comprador paga | Pix: tarifa | Pix: chega para a PartyX | Cartão: tarifa | Cartão: chega para a PartyX |
|---|---|---|---|---|---|---|
| 4,98% | R$ 1,58 | R$ 31,58 | R$ 0,31 | **R$ 31,27** (sobra R$ 1,27) | R$ 1,57 | **R$ 30,01** (sobra R$ 0,01) |
| 2,99% | R$ 0,93 | R$ 30,93 | R$ 0,31 | **R$ 30,62** (sobra R$ 0,62) | R$ 1,54 | **R$ 29,39** (falta R$ 0,61) |
| 0,99% | R$ 0,30 | R$ 30,30 | R$ 0,30 | **R$ 30,00** (exato) | R$ 1,51 | **R$ 28,79** (falta R$ 1,21) |

Como ler:

- **4,98%** cobre a tarifa nas duas formas de pagamento. No Pix sobra mais de um real por ingresso, que fica com a PartyX.
- **2,99%** fica no meio: sobra no Pix e falta no cartão. Só empata se metade das compras for no Pix e metade no cartão.
- **0,99%** cobre só o Pix. No cartão, a PartyX recebe R$ 1,21 a menos que o preço do ingresso.

Qualquer outra porcentagem entre 0% e 20% também pode ser usada, com até duas casas depois da vírgula.

## O que precisa ser decidido

1. A porcentagem da taxa.
2. O valor mínimo por ingresso (sugestão: R$ 0,00).

Até a decisão, a taxa fica em 0% e o comprador paga só o preço do ingresso. Depois, a porcentagem é informada uma vez no painel, em
Configurações, e passa a valer para os pedidos feitos a partir daquele momento. Os pedidos já feitos não mudam. A tarifa real cobrada
pelo Mercado Pago em cada pedido pago aparece no relatório de vendas do painel, para acompanhar se a porcentagem escolhida está
cobrindo.

## Decisão

Em 19/10/2026 o Bernardo aprovou **7,5%**, com mínimo de R$ 0,00, em todos os ingressos, para cobrir também um eventual
parcelamento no cartão. Num ingresso de R$ 30,00: taxa de R$ 2,44, comprador paga R$ 32,44. A porcentagem está escrita nos Termos de
Uso 1.4.
