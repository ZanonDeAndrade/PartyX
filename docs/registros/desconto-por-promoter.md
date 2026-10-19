# Desconto por promoter (D-91)

**Decisão:** mudança de escopo aprovada pela PartyX, informada pelo responsável (Arthur) em 19/10/2026, no mesmo modelo das D-86 (lotes)
e D-87 (transferência). O Anexo I (item 12) e o §16 do documento excluem desconto por cupom; esta decisão inclui o desconto opcional no
código do promoter. A aprovação escrita da PartyX fica com o responsável, fora do repositório.

**Respostas do responsável ao plano (19/10/2026):** plano aprovado; total zero pela opção B (o desconto nunca zera o pedido; se zerar, o
código é recusado com "Este código não pode ser usado neste pedido" e nenhuma regra do banco sobre total zero é afrouxada); código fora do
prazo, esgotado ou de outro evento continua atribuindo a venda, sem desconto e com mensagem clara; inativo continua recusado; Termos 1.5
preparados para o Bernardo aprovar, sem a porcentagem da taxa; demais regras propostas aprovadas (arredondamento para baixo por ingresso,
uso segurado pelo pedido pendente, prazo pela criação do pedido, recusa quando o painel muda entre o resumo e o pedido).

## Regras

| Regra | Como ficou |
|---|---|
| Tipos | Nenhum (padrão), porcentagem (1% a 100%, até duas casas) ou valor fixo em reais e centavos (até R$ 100.000,00) |
| Conta | Por ingresso, sobre o preço do lote dele. Porcentagem arredondada para BAIXO ao centavo (7,25% de R$ 25,00 = R$ 1,81). Valor fixo limitado ao preço: o ingresso nunca fica abaixo de R$ 0,00 |
| Taxa de serviço (D-90) | Calculada sobre o valor já com desconto. Ingresso que fica em R$ 0,00 não tem taxa, nem a mínima. Ex.: R$ 30,00 com 10% e taxa de 7,5%: desconto R$ 3,00, taxa R$ 2,19, total R$ 29,19 |
| Total zero (opção B) | Se o pedido inteiro ficaria em R$ 0,00, o código é recusado (`cupom_recusado`, "Este código não pode ser usado neste pedido."), no resumo e na criação do pedido. Nenhum pedido de R$ 0,00 existe: a regra do banco `orders_total_positive` continua. O Mercado Pago nunca é chamado com zero |
| Onde vale | Todos os eventos (padrão) ou os escolhidos (`promoter_discount_events`) |
| Prazo | Primeiro e último dia opcionais, os dois incluídos, no fuso do evento, pela data de criação do pedido. Pedido feito dentro do prazo e pago depois mantém o desconto |
| Limite de usos | Opcional. Contam os pedidos com desconto já pagos (em qualquer situação depois) e os pendentes dentro da reserva (seguram um uso). Reserva vencida ou liberada devolve o uso. A linha do promoter é trancada na criação do pedido: dois pedidos ao mesmo tempo não passam do limite |
| Um código por pedido | O campo aceita um código; não há acúmulo |
| Código sem desconto aplicável | Fora do prazo, esgotado, de outro evento ou promoter sem desconto: o código atribui a venda e a tela explica o motivo. Inativo ou inexistente: recusado (`cupom_invalido`), como antes |
| Retrato no pedido | `orders.coupon_code`, `discount_kind`, `discount_value`, `discount_cents`; `order_items.discount_cents`; `order_item_lots.unit_discount_cents`. Mudar o promoter (código, tipo, valor) depois não altera o pedido |
| Mudança entre o resumo e o pedido | O total muda e o pedido é recusado (`preco_alterado`), como numa virada de lote ou mudança da taxa |
| Valor enviado ao Mercado Pago | O total com desconto (ingressos menos desconto mais taxa), igual no Pix e no cartão |
| Estorno | Devolve o valor pago (o total do pedido); por ingresso, preço menos desconto mais taxa dele |
| Trilha | `promoter.criar` e `promoter.editar` com o desconto inteiro (tipo, valor, alcance, eventos, prazo, limite); `promoter.desconto` quando só o desconto muda |

## Onde está no sistema

| Parte | Arquivos |
|---|---|
| Banco | `drizzle/0018_desconto_por_promoter.sql` (só expande; tipos `promoter_discount_kind` e `promoter_discount_scope`, colunas em `promoters`, `orders`, `order_items`, `order_item_lots`, tabela `promoter_discount_events` com DELETE para o `partyx_app`) e `drizzle/rollback/0018_desconto_por_promoter.down.sql` (recusa com pedido com desconto) |
| Conta | `server/src/domain/promoterDiscount.ts` e `src/site/promoterDiscount.ts`, com a mesma tabela de casos (`promoterDiscount.cases.ts`); `unitAmounts` e `planOrder` em `server/src/domain/checkout.ts` |
| Pedido | `server/src/orders/service.ts`: código com a linha do promoter trancada, contagem de usos, recusa do total zero, retrato no pedido, itens e lotes |
| Painel | `server/src/events/service.ts` (validação, eventos, usos, trilha), `server/src/api/events.ts`; tela em `src/site/adminPeople.tsx` (formulário, lista com desconto e usos, vendas do promoter com desconto e líquido) |
| Checkout e site | `src/site/checkoutPages.tsx` (linha "Desconto (CÓDIGO)", total recalculado, mensagens, porcentagem da taxa), `src/site/pages.tsx` (porcentagem da taxa na página do evento, Termos 1.5), `src/site/ticketPages.tsx` |
| Comprovantes | E-mail de compra (`mail/templates.ts`, `mail/outbox.ts`), PDF (`tickets/pdf.ts`, `ticketPriceText`), Meus ingressos (`tickets/service.ts`), detalhe do pedido e do ingresso no painel (`panel/service.ts`, `panel/people.ts`) |
| Relatórios | `reports/service.ts` (vendas com desconto e líquido; conciliação itens menos desconto mais taxa; ranking ordenado pelo líquido; pedidos do promoter), `exports/service.ts` (CSV), `ops/closureExport.ts` (colunas da 0018) |
| Textos legais | Termos de Uso 1.5 (`conteudo-legal/termos-de-uso.txt`, `env.prod.yaml`); trava `infra/producao/textos-desconto.py` no `deploy.sh conferir` |

## Testes

- `server/src/domain/promoterDiscount.test.ts` e `src/site/promoterDiscount.test.ts`: tabela de casos (porcentagem com centavos, 100%,
  valor fixo maior que o preço, um centavo), limites, prazo, alcance, limite de usos, taxa sobre o valor descontado e o plano do pedido.
- `server/src/api/promoterDiscount.integration.test.ts` (8, banco real, taxa de 7,5%): painel e trilha; resumo, pedido e gateway;
  porcentagem com centavos e valor fixo maior que o preço; total zero recusado sem nada gravado; código sem desconto aplicável; limite
  de usos (pendente segura, vencido devolve, pago conta, dois pedidos ao mesmo tempo); mudança do promoter depois do pedido e entre o
  resumo e o pedido; e-mail, Meus ingressos, painel, vendas, ranking, CSV e conciliação.
- `server/src/mail/templates.test.ts`, `server/src/tickets/pdf.test.ts`, `server/src/ops/deployTextos.test.ts` (Termos 1.5),
  `server/src/db/schema.integration.test.ts` (0018 e reversão), e2e `e2e/desconto.spec.ts` (painel e checkout no navegador).

## Pendente

- Termos 1.5 aprovados pelo Bernardo em 19/10/2026 (informado pelo responsável). A trava do `deploy.sh` exige os Termos 1.5 quando a tag
  tem a migração 0018.
- A Política de Cancelamento 1.1 diz que "voltam o valor dele e a taxa de serviço dele" quando um ingresso é reembolsado. Com desconto,
  "o valor dele" é o valor pago por ele (preço menos desconto), que é o que o painel mostra. Se a PartyX quiser deixar isso explícito, é
  uma Política 1.2, com OK dela.
- Publicado em 19/10/2026 14:06 UTC na revisão `partyx-00050-pey` (`publicacao-producao-2026-10-19.md`).
