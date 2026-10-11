# Disputa de estoque e pagamento tardio

Verificado em 05/10/2026 (Prompt 21). Só testes de integração e concorrência, mais **uma correção que eles revelaram**. Arquivo: `server/src/api/stock.integration.test.ts` (12 testes), PostgreSQL real, relógio controlado, chamadas paralelas, **emissor de ingressos de verdade** (não o simulado) e gateway fictício. Sem migração.

## O que se afirma e como foi provado

Depois de cada cenário, `assertStock` lê o banco (não a resposta da API) e confere:

| Invariante | Como |
|---|---|
| **Vendidos + reservas válidas ≤ capacidade**, por tipo | soma direta em `ticket_types` e `reservations` (ativas e dentro do prazo) |
| Ingressos emitidos = vendidos, por tipo | `count(tickets)` contra `quantity_sold` |
| Pedido pago tem exatamente os ingressos comprados; os demais estados, nenhum | consultas por pedido |
| Reserva convertida só de pedido pago; reserva viva só de pedido pendente | consultas cruzadas |
| Nenhum código de ingresso repetido | agrupamento |
| **Nenhuma resposta 5xx** (impasse ou erro) | todas as respostas da rodada são registradas |

## Cenários

| Cenário | Resultado |
|---|---|
| Duas ou mais pessoas disputam a última unidade (12 ao mesmo tempo) | Exatamente uma reserva; as outras recebem 409/422, nunca erro |
| Vários tipos, capacidades pequenas e combinações diferentes (16 compradores) | Nenhum tipo passa da capacidade; pedido recusado não deixa reserva parcial |
| Pedido duplicado (8 envios simultâneos do mesmo comprador) | Um pedido pendente e uma reserva |
| Abandono e expiração | A reserva vence, o estoque volta, outro comprador leva |
| Falha na criação da cobrança | 503; a reserva continua valendo (ninguém fura a fila); depois de vencer, a unidade volta |
| Pix aprovado depois de expirar, **com estoque** | Emite uma vez só, mesmo com 6 notificações iguais, 4 conciliações e a rotina de expiração ao mesmo tempo |
| Pix aprovado depois de expirar, **sem estoque** | Não emite, guarda `paid_at`, log de alerta `pago_sem_estoque`, auditoria e lista de exceções para o cliente estornar no gateway; **nenhum QR** |
| Última unidade: aprovação tardia de A contra aprovação normal de B, em paralelo, 8 rodadas (ordens alternadas) | B (reserva válida) sempre leva; A fica "pago sem estoque" |
| Rotinas repetidas e simultâneas | Depois do primeiro acerto, 3 ciclos a mais não mudam pedidos, vendidos, ingressos nem reservas |
| **Rajada aleatória** (18 compradores, 5 rodadas, semente fixa): reservar, iniciar Pix, relógio andando, aprovar (também tarde), notificações duplicadas, conciliações e expiração em paralelo, novas reservas | Invariantes fechados depois de cada etapa e no acerto final |
| Escrita direta no banco | `quantity_sold` acima do total ou negativo é recusado pelo próprio banco |

A rajada aceita `STOCK_SEED=<número>` para repetir ou variar a sequência. Foi repetida com dezenas de sementes diferentes.

## Achado e correção: impasse entre "novo pedido" e "aprovação"

A rajada falhou de forma intermitente (um 503 na notificação, 1 vez em cerca de 15 execuções). A causa era uma **inversão na ordem das travas**:

- criar um pedido que **substitui** o pendente anterior trancava primeiro os **tipos** e depois o **pedido antigo**;
- a aprovação do pagamento trancava primeiro o **pedido** e depois os **tipos**.

Duas transações em ordens opostas formam um impasse: o PostgreSQL derruba uma. Se a vítima era o novo pedido, o comprador via erro 500; se era a aprovação, a notificação voltava 503 e só era refeita na reentrega ou na conciliação (nada se perdia, mas atrasava o ingresso de quem pagou).

**Correção** (`server/src/orders/service.ts`, `createOrder`): a ordem passou a ser sempre **pedidos antes dos tipos**, igual à da aprovação. Teste dedicado (`ordem das travas`, 30 rodadas): com a correção, 3 execuções limpas; com a ordem antiga restaurada de propósito, **falha em 3 de 3** (erro 500 ao criar o pedido). Também passei a registrar o **código do erro** (por exemplo `40P01`, impasse) no alerta de notificação que falha, sem a mensagem.

## Limites e o que não foi verificado

- Estoque e reserva são conferidos pela **aplicação com travas de linha**, não por uma restrição do banco; a única barreira do próprio banco é `0 ≤ vendidos ≤ capacidade`. A soma "vendidos + reservas válidas" depende de as travas serem respeitadas, por isso a ordem delas é uma regra (comentário no código).
- Gateway **fictício**: a sandbox do gateway real (D-01, Prompt 11) pode atrasar, repetir e reordenar notificações de formas que o simulador não cobre. O Prompt 22 repete os casos difíceis nele.
- Banco local em contêiner, uma instância: não foi testado com várias instâncias do Cloud Run nem com latência do Neon; a concorrência real em produção pode expor outros intervalos.
- Carga: dezenas de compradores simultâneos, não milhares. Teste de carga é do Prompt 24.
- Reposição de estoque após cancelamento segue pendente do cliente (D-14): nada devolve estoque depois de pago.

## Decisões abertas

D-13 (procedimento do "pago sem estoque"), D-14 (reposição após cancelamento), D-41 (quem recebe o alerta), D-54 (taxa e "pago sem estoque").
