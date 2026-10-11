# Carrinho, reserva e estoque

Implementado em 01/10/2026 (Prompt 09): RF-17, RF-28 a RF-33, RF-37 (parte) e CA-15 a CA-17. Código em `server/src/orders/service.ts`, `server/src/api/checkout.ts`, `server/src/domain/checkout.ts` e `server/src/domain/orderState.ts`. **Sem migração.**

As telas de seleção, revisão e pedido foram feitas no Prompt 10 (ver `pagamento.md`). **Nada aqui marca pagamento como aprovado nem emite ingresso.**

## Rotas (todas exigem login com perfil `cliente`)

| Rota | O que faz |
|---|---|
| `POST /api/checkout/quote` | Resumo antes do pagamento (RF-32): recalcula tudo no servidor e confere o estoque **sem reservar** |
| `POST /api/orders` | Cria o pedido pendente e **reserva** o estoque (201) |
| `GET /api/orders/:id` | Pedido do próprio comprador, com contador pelo relógio do servidor. De outro usuário: 404 |
| `POST /api/orders/:id/cancel` | Desistir antes de pagar: libera a reserva na hora |

Corpo de `quote` e `orders`: `{ eventSlug, items: [{ ticketTypeId, quantity }], couponCode?, expectedTotalCents? }`. **Preço, total e desconto enviados pelo navegador são descartados.** `expectedTotalCents` só serve para avisar que o preço mudou (409 `preco_alterado`, com o novo total); nunca para cobrar.

Erros: 422 `limite_por_compra`, 422 `dados_invalidos`, 422 `cupom_invalido` (campo `couponCode`), 409 `estoque_alterado` (com `itens: [{ ticketTypeId, motivo, disponivel, mensagem }]`), 409 `evento_indisponivel`, 409 `pedido_em_andamento`, 409 `pagamento_iniciado`, 503 `vendas_fechadas`.

## Como a reserva evita sobrevenda

`createOrder` faz tudo em **uma transação PostgreSQL**, nesta ordem:

1. **Trava por comprador** (`pg_advisory_xact_lock`): dois cliques seguidos, mesmo com tipos diferentes, viram um pedido só.
2. Evento publicado.
3. **Linhas dos tipos trancadas** (`SELECT ... FOR UPDATE`, ordem de id). É a mesma trava da edição de capacidade (Prompt 07), então reserva e edição não se atropelam.
4. Solta o pedido pendente anterior do mesmo comprador neste evento (D-33), para ele não competir consigo mesmo.
5. Conta **vendidos + reservas válidas** (ativas e dentro do prazo) com a linha trancada e planeja o pedido (`planOrder`, função pura).
6. Grava pedido, itens (com o preço **do banco**) e reservas.

Não há chamada externa dentro da transação. Várias instâncias do Cloud Run funcionam porque quem decide é o banco.

## Regras

- **Limite por compra (CA-15):** `MAX_TICKETS_PER_ORDER` (padrão 6), somando todos os tipos. Também: quantidade inteira maior que zero, sem tipo repetido, tipo do mesmo evento.
- **Reserva (RF-33):** `RESERVATION_MINUTES` (padrão 10). O contador usa `serverNow` e `secondsLeft` da resposta, não o relógio do aparelho.
- **Cupom (RF-30, RF-31):** só vincula o pedido ao promoter; **o total não muda**. Inexistente, desativado ou malformado: 422 com mensagem clara e nada é reservado. Em branco equivale a sem cupom.
- **Fora de venda:** em breve, encerrada, desativada, esgotada, reservada por outros, evento em rascunho ou encerrado: recusa o pedido inteiro, sem reservar item algum.
- **Reserva não é venda:** `quantity_sold` não muda e `paid_at` fica nulo.
- **Vendas fechadas:** em produção, `SALES_OPEN` precisa ser `true` (D-34); sem isso, 503 e nada é reservado.

## Expiração (CA-17)

O estoque **volta sozinho** quando a reserva vence, porque a contagem ignora reserva vencida. `expireOverdue` só acerta os estados (reserva `expirada`, pedido `expirado`) para o painel e os relatórios; é idempotente e segura em execução simultânea (cada `UPDATE` só age sobre quem ainda está ativa ou pendente). Roda sob demanda ao consultar o pedido e por `npm run jobs:expire`. **O agendamento autenticado (Cloud Scheduler) é do Prompt 12.**

## Estados e confirmação tardia

Contrato em `server/src/domain/orderState.ts` (com testes), que o Prompt 12 vai seguir:

- `pendente → pago | expirado | nao_concluido`; `nao_concluido → pendente | expirado`.
- `expirado → pago` (aprovado depois, **com** estoque: emite) ou `→ pago_sem_estoque` (**sem** estoque: não emite, avisa o administrador, o cliente estorna no gateway).
- `pago → estornado | contestado | cancelado`; estados finais não têm saída.
- `approvalOutcome(...)` decide: `confirmar` (reserva válida), `emitir_tardio`, `sem_estoque` ou `ignorar` (notificação repetida).

Pedido abandonado ou substituído vira `expirado` e a reserva `liberada` (D-35); por prazo, a reserva fica `expirada`.

## O que foi verificado (PostgreSQL real, 50 testes novos no total)

- **CA-16:** 1 unidade e 8 compradores simultâneos, 4 rodadas: sempre exatamente um 201. 5 unidades e 12 compradores: 5 vendas. Quantidades mistas, tipos em ordens opostas (sem impasse) e rajada aleatória em 3 tipos: a conta fecha (reservas = soma dos pedidos pendentes) e nunca passa da capacidade.
- **CA-15:** 6 passa, 7 não, também somando tipos; zero, negativo, decimal, texto e repetido recusados.
- **CA-17:** reserva vencida devolve o estoque sem rotina; rotina repetida e simultânea não duplica; não rebaixa pedido pago; consulta depois do prazo mostra `expirado` e contador zero.
- **Adulteração:** preço, total, desconto, status e userId do corpo ignorados; preço mudado entre a tela e o pedido é avisado; tipo de outro evento recusado.
- **Cupom:** válido, em minúsculas, inválido, desativado, injeção de SQL em texto.
- Isolamento entre compradores, perfil de equipe barrado, vendas fechadas.
- **Mutações:** sem `FOR UPDATE`, 5 testes falham; sem a trava por comprador, 1 falha; com reserva vencida contando, 3 falham; sem o limite, 3 falham.

## O que **não** foi verificado

- **Neon real.** Tudo rodou em PostgreSQL local. A trava de linha e o *advisory lock* funcionam com a conexão **pooled** do Neon (modo transação)? O `pg_advisory_xact_lock` vale só dentro da transação, o que é compatível, mas não foi testado lá.
- **Carga:** a disputa foi com 8 a 12 compradores. A meta de 200 simultâneos é do Prompt 24.
- **`ORDER BY id` antes do `FOR UPDATE`:** retirá-lo não quebrou nenhum teste (o PostgreSQL já percorre as linhas numa ordem estável). Foi mantido como garantia explícita.
- O limitador de pedidos (30 por 10 min) é em memória, por instância.
- A rotina de expiração não está agendada.

## Decisões abertas

D-03 (duração da reserva, compatível com o Pix do gateway) e D-05 (limite por compra) seguem com o cliente; os padrões são premissas. Novas: D-33, D-34 e D-35.
