# Lotes por tipo de ingresso (15/10/2026), D-86

## Escopo

O documento de desenvolvimento (§16) exclui a **virada automática de lotes**, e o `CLAUDE.md` do projeto manda não implementá-la. O responsável (Arthur) pediu a funcionalidade nesta data e, perguntado, escolheu **"Sigo como mudança"**: implementar tudo, inclusive a virada automática, como mudança de escopo (§16.2). **A aprovação da PartyX (e o aditivo, se houver) fica a registrar.** Enquanto isso, o `CLAUDE.md` ainda lista "lotes automáticos" entre os excluídos: o responsável decide se o atualiza.

## Regras implementadas

- **Modelo:** cada tipo tem lotes em ordem (1º, 2º...), cada um com nome, preço, quantidade e, se quiser, início e fim. Só um fica à venda por vez. A capacidade do tipo continua sendo o teto: a soma das quantidades dos lotes não passa dela, e a compra confere o teto do tipo como antes.
- **Virada automática:** o lote à venda encerra quando esgota (vendidos mais reservas válidas) e existe próximo lote, ou quando passa a data de fim dele, o que vier primeiro. O próximo abre na hora, ou na data de início dele ("Próximo lote: em breve" até lá). Sem próximo lote, o último não encerra por esgotar: o tipo fica **esgotado** e volta a vender se uma reserva vencer.
- **Virada manual:** no painel ("Virar para o próximo lote", ou "Encerrar o lote" quando não há próximo), com confirmação, a pergunta da sobra e o registro na trilha (`lote.virar`, com quem virou).
- **Sobra na virada:** as unidades que não foram vendidas nem estão reservadas passam para o próximo lote (padrão) ou são descartadas. Na virada automática vale a regra escolhida em cada lote; na manual, a escolha no diálogo.
- **Preço e reserva:** o preço de cada lote fica preso no pedido no momento da reserva (`order_item_lots`); quem estiver pagando quando o lote virar paga o preço reservado. Reserva que vence num lote já encerrado devolve as unidades ao lote à venda (`lote.devolver` na trilha).
- **Compra dividida** (escolha do responsável): se o lote à venda não basta, o restante sai do próximo, pelo preço dele, no mesmo pedido. O item do pedido continua um por tipo; a divisão fica em `order_item_lots`, e o preço unitário do item é a média arredondada (relatórios e conciliação somam por lote, centavo a centavo).
- **Tudo no servidor e em transação:** toda mudança de lote acontece com a linha do tipo trancada (`FOR UPDATE`), a mesma trava da compra e da confirmação do pagamento. A página pública e o painel mostram o lote certo sem gravar (mesmo cálculo); a gravação acontece na compra, na confirmação, nas ações do painel e na rotina diária.
- **Painel (Tipos de ingresso):** lotes de cada tipo com preço, quantidade, vendidos, reservados, disponíveis e situação (aguardando, à venda, encerrado, com o motivo). Criar, editar, reordenar (só os que aguardam), apagar (só o que nunca vendeu nem foi usado por pedido) e virar. Lote com vendas não muda de preço nem sai. Interruptor "Últimas unidades" por tipo (ligado por padrão).
- **Site:** no card de compra, "Pista · 2º lote" e o preço; "Últimas unidades deste lote" (menos de 10 unidades, ou menos de 10% do lote); "Próximo lote: em breve", sem o preço. Quando a quantidade escolhida passa do que resta no lote, o card avisa que o restante sai do próximo lote e o valor aparece no resumo, antes de pagar. Tipo de lote único aparece como antes.
- **Ingresso, pedido, e-mail, painel, relatórios:** o lote comprado aparece como "Pista · 2º lote" no ingresso (tela e PDF), no e-mail de compra, no pedido (uma linha por lote), na lista de ingressos e na exportação de dados pessoais. O relatório de vendas e a exportação têm as vendas por lote (quantidade e valor) dentro de cada tipo.

## Banco: migração 0013 (só expande) e dados existentes

- Tabelas novas `ticket_lots` e `order_item_lots`; `tickets.lot_id` (anulável) e `ticket_types.last_units_notice` (padrão ligado).
- **Dados existentes:** cada tipo vira um "Lote único" com o preço, a capacidade e os vendidos atuais, já à venda; cada item de pedido ganha a linha desse lote com a mesma quantidade e o mesmo preço; cada ingresso aponta para ele. Nada que já existia muda de valor. Em produção, em 15/10/2026: dois tipos (Camarote do Teste01 e Pista do segundo evento), nenhum pedido.
- **Volta atrás:** o preço do tipo continua espelhando o do lote à venda, então a versão anterior vende pelo preço certo; um tipo criado por ela sem lote ganha o "Lote único" na primeira compra. Reversão em `drizzle/rollback/0013_lotes_por_tipo.down.sql`: recusa se algum tipo tiver mais de um lote.

## Premissas a confirmar com a PartyX

- Aprovação da mudança de escopo (§16.2).
- Compra dividida entre lotes, com o preço do próximo lote visto só no resumo (a página mostra "Próximo lote: em breve", sem o preço).
- "Últimas unidades": menos de 10 unidades ou menos de 10% do lote.
- O último lote não encerra por esgotar (fica "esgotado"); encerrar o último lote à mão faz o tipo parar de vender.
- Preço do tipo com mais de um lote: muda no lote; com lote único, o formulário do tipo edita o preço do lote (travado se já vendeu).

## Verificação (local)

- `npm run lint` (0 erros, 27 avisos antigos), `npm run typecheck`, `npm run build`, `npm run test:db` (1.070 + 4, nenhum pulado), `npm run check:migrations` (14 migrações), `npm run e2e:textos` (78 de 78), `npm run e2e:cronometro` (7 de 7).
- `server/src/domain/lots.test.ts` (14): viradas por esgotamento, por data e manual; sobra passada e descartada; reservas no lote delas; reserva vencida devolvida; próximo lote com início futuro; lote que aguardava e cujo fim passou; compra dividida; teto do tipo; "últimas unidades".
- `server/src/api/lots.integration.test.ts` (10): virada por esgotamento com compra dividida e preço preso; virada por data com sobra passada e descartada; virada manual com trilha; compra simultânea no último ingresso (com e sem próximo lote); reserva que vence depois da virada; preço preso com virada no meio do pagamento; tipo sem próximo lote; relatório e exportação por lote com a conciliação certa; regras do painel e só administrador; tipo sem lote de uma versão anterior.
- Capturas a 360 e 1280 px (painel e site), servidor local com banco descartável, sem rolagem lateral nem erro na página.
