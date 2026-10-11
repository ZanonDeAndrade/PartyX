# Painel administrativo e cancelamento

Implementado em 01/10/2026 (Prompt 16): RF-55 a RF-57, RF-61 e RF-62. Código em `server/src/panel/service.ts`, `server/src/api/panel.ts` e `src/site/adminPages.tsx`. **Sem migração.** Tudo sob `/api/admin` (só administrador; visitante 401, validador e cliente 403) e sempre `private, no-store`.

> Não faz parte desta etapa: criar e editar eventos, tipos, promoters e equipe **pelas telas** (as APIs existem desde os Prompts 06 e 07, sem tela), relatórios de vendas e taxa (Prompt 17) e exportações (Prompt 18).

## Rotas

| Rota | O que faz |
|---|---|
| `GET /admin/overview?month=AAAA-MM` | Vendas de hoje e do mês, vendas por dia, eventos em andamento com o que resta, avisos (RF-55) |
| `GET /admin/orders` | Pedidos com filtros `eventId`, `status`, `from`, `to`, `q`, `page`, `pageSize` (RF-56) |
| `GET /admin/orders/:id` | Detalhe: itens, ingressos, comprador, id no gateway, histórico e eventos do gateway |
| `GET /admin/events/:id/buyers` | Compradores do evento (RF-57) |
| `GET /admin/events/:id/tickets` | Ingressos emitidos, com filtros (RF-57) |
| `GET /admin/events/:id/entries` | Entradas em tempo real (RF-61) |
| `POST /admin/tickets/:id/cancel` e `POST /admin/orders/:id/cancel-tickets` | Cancelamento (RF-62) |

## Números (RF-55, D-51)

- **Venda = pedido pago**, pela data original da aprovação (`paid_at`), no **fuso do evento**: um pagamento às 23h30 de Brasília é do dia anterior, e a virada do mês também respeita o fuso (testado nos dois casos).
- Estornados, contestados e pagos sem estoque aparecem **separados** das vendas pagas. Pendente, expirado e não concluído não são venda. Um pedido estornado continua com `paid_at` (a taxa mensal depende disso, Prompt 17), mas não conta como venda ativa.
- Por evento publicado e por tipo: capacidade, **vendidos** (`quantity_sold`), **reservados agora** (só reservas ainda válidas) e **restantes** = capacidade − vendidos − reservados.
- Aviso quando há pagamento aprovado sem estoque, com link para os pedidos.

## Pedidos (RF-56)

Filtros por evento, situação, período (datas inclusivas, no fuso do evento) e busca por número (`PX-10001` ou `10001`), nome (sem acento) ou e-mail. Paginação de até 100 por página. Cada linha traz a **situação do pagamento** em texto: Pago, Expirado, Não concluído, Estornado, Contestado, Aguardando e Pago sem estoque (com a orientação de estornar no gateway). Filtro inválido (situação, data que não existe como 2026-02-31, período invertido, busca curta) volta 422 com o campo. O detalhe mostra o id do pagamento no gateway, para o cliente achar a cobrança no painel dele.

## Compradores e ingressos (RF-57, D-53)

Compradores: só quem tem pedido pago, estornado, contestado ou pago sem estoque no evento, com número de pedidos, ingressos, cancelados, quantos entraram e quanto pagou. Ingressos: filtro por situação, tipo e busca (código `PX-`, nome, e-mail), com quem validou, quando e o motivo do cancelamento. **CPF sempre mascarado; nenhum código secreto nem QR sai em lista.**

## Entradas em tempo real (RF-61)

Contador, por tipo, tentativas por resultado (entrou, já utilizado, inválido, cancelado, outro evento), entradas por validador e as últimas 30 leituras com hora, resultado, ingresso, tipo, titular e validador. A tela consulta a cada **4 segundos** (pausa com a aba escondida) e avisa quando perde a conexão. Conferido: uma leitura feita na portaria apareceu no painel aberto, sem recarregar.

## Cancelamento de ingresso (RF-62, D-52)

Exige **confirmação** (`confirm: true`) e **motivo** de 5 a 500 caracteres; a tela pede o motivo e uma caixa de ciência de que o estorno financeiro é do cliente. Só ingresso **válido** pode ser cancelado:

- Cancelado de novo: responde ok sem mudar nada, sem nova linha de trilha e sem trocar o motivo.
- Já usado na portaria: **409**, continua utilizado.
- Pedido inteiro: cancela os válidos, informa quantos já tinham entrado e quantos já estavam cancelados.
- Cada ingresso cancelado gera uma linha em `audit_log` (`ingresso.cancelar`) com **autor, momento, motivo e antes/depois**.
- **Nada é apagado nem reposto:** pedido, itens, ingressos, `paid_at` e a evidência da taxa ficam; `quantity_sold` não muda (reposição de estoque é a decisão D-14, pendente: nenhuma das duas leituras foi implementada). O pedido continua "pago": o estorno financeiro é feito pelo **cliente no gateway**, e então o webhook leva o pedido a "estornado" (os ingressos já cancelados não mudam).
- A resposta traz a orientação para mostrar ao administrador.

Depois de cancelado: a portaria mostra **vermelho "cancelado"** (testado com leitura real após o cancelamento), o comprador vê "cancelado" sem QR, o contador de ingressos válidos diminui, e o outro ingresso do mesmo pedido segue valendo.

**Concorrência:** cancelar e ler ao mesmo tempo nunca dá dois resultados (20 rodadas): ou o ingresso entrou (e o cancelamento recebe 409), ou foi cancelado (e a leitura recebe "cancelado"). O cancelamento tranca a linha do ingresso e faz a mesma marcação condicional (`WHERE status = 'valido'`) da portaria.

## O que foi verificado

- 26 testes novos (525 passam, contra PostgreSQL real): acesso, números do dia e do mês no fuso, separação por situação, restantes com reserva válida e vencida, todos os filtros e a paginação, detalhe, compradores, ingressos, entradas ao vivo refletindo a portaria, cancelamento (confirmação, trilha, nada apagado, idempotência, usado, pedido inteiro, corrida, perfis, evidência da taxa). **Mutações:** sem a confirmação 1 teste falha; período em UTC em vez do fuso 1. A condição `status = 'valido'` no `UPDATE` do cancelamento é redundante com o bloqueio da linha (`FOR UPDATE`) e retirá-la sozinha não quebra teste; mantida como segunda barreira.
- **Navegador real** (Chromium, servidor local): login do administrador voltando ao painel; números do dia e do mês; restantes por tipo; filtro por situação com estado vazio; detalhe do pedido; botão de cancelar desabilitado sem motivo e sem ciência; cancelamento com aviso e histórico; portaria recusando o cancelado; entradas ao vivo atualizando sozinhas; ingressos e compradores do evento. **Sem rolagem horizontal a 1280 e a 360 px** (as tabelas rolam dentro do próprio quadro).

## O que **não** foi verificado

- Volume: as consultas usam expressões de fuso sem índice. Está bem para milhares de pedidos; para dezenas de milhares, conferir o plano e acrescentar índice (Prompt 24).
- Leitor de tela e foco do modal (há `aria-modal`, foco inicial no motivo e fechamento por Esc, sem armadilha de foco completa).
- Aparelhos reais; Safari.
- A tela de eventos, tipos, promoters e equipe (APIs prontas, telas não).

## Decisões abertas

D-14 (reposição de estoque), D-51 (o que é venda), D-52 (cancelar ingresso usado), D-53 (dados pessoais nas listas).
