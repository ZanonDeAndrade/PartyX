# Relatórios e taxa mensal

Implementado em 02/10/2026 (Prompt 17): RF-58, RF-59, RF-60, CA-19 e CA-28 a CA-30. Código em `server/src/reports/service.ts`, `server/src/api/reports.ts` e `src/site/reportPages.tsx`. **Sem migração.** Somente leitura; exportação em planilha e PDF é do Prompt 18. Só administrador, sem cache.

> **O relatório da taxa é financeiro e contratual.** A regra abaixo é a da Cláusula 6.3 como a documentação a descreve. O contrato não está no repositório (ver `registros/divergencias.md`): **confira o texto do contrato** antes de usar este relatório para cobrar. A única interpretação que eu precisei fazer está em D-54.

## Rotas (`/api/admin/reports`)

| Rota | O que faz |
|---|---|
| `GET /sales?eventId&typeId&from&to` | Vendas por evento e tipo (RF-58) |
| `GET /promoters?eventId&from&to&metric=qtd\|valor` | Ranking de promoters (RF-59) |
| `GET /promoters/:id` | Pedidos atribuídos a um promoter |
| `GET /fee?month=AAAA-MM&page&pageSize` | Relatório mensal da taxa (RF-60) |

Datas em AAAA-MM-DD, **no fuso do evento**, com as duas pontas incluídas; filtro inválido (data que não existe como 2026-02-31, período invertido, mês fora do formato) volta 422.

## Taxa mensal (RF-60, CA-29)

**Regra (Cl. 6.3):** ingressos vendidos no mês = ingressos **emitidos** cujo pedido teve `paid_at` (a data **original** da aprovação) dentro do mês, no fuso do evento, **independentemente da situação atual do ingresso ou do pedido**. Cancelados, reembolsados, estornados e contestados continuam contando, **R$ 1,00 cada** (`FEE_PER_TICKET_CENTS = 100`). Valor = unidades × 100, em centavos inteiros.

O que o relatório mostra, como a documentação pede ("explicar ao cliente e visível no relatório"):

- **Período e critério** em texto, no topo da tela.
- **Unidades** (não pedidos) e **valor da taxa**, com a conta (`9 × R$ 1,00`).
- **Situação atual** das unidades apuradas: Válido, Utilizado, Cancelado (administrador), Cancelado (estorno), Cancelado (contestação). Todas somam o total.
- **Por evento** e **detalhe por unidade** (código, pedido, evento, data de aprovação, situação atual), paginado.
- **Conciliação:** quantas unidades os itens dos pedidos aprovados no mês previam, contra quantos ingressos existem. Pedido aprovado **sem nenhum ingresso** que não seja "pago sem estoque" é divergência a investigar antes de cobrar (a recuperação de ingressos do Prompt 13 a resolve, e a conciliação passa a fechar: testado).
- **Exceções:** pagamento aprovado **sem estoque** não gera ingresso, **não conta** e é listado para análise (o cliente estorna no gateway). É exceção, não venda inventada (D-54).
- **Receita separada da taxa:** bruta, estornada, contestada e líquida do mês. A taxa é por unidade emitida, não sobre a receita.
- Cobrança e boleto acontecem **fora** do sistema.

Garantias testadas: o ingresso cancelado pelo painel, o pedido estornado e o contestado continuam contando; o mesmo mês dá o **mesmo resultado** antes e depois de mudanças posteriores nos ingressos; o banco impede alterar `paid_at` depois de definido; confirmações repetidas do gateway não criam unidades novas; a virada do mês respeita o fuso (23h59m59s de Brasília é o mês anterior à meia-noite exata, e 31/12 às 23h59m59s ainda é dezembro).

## Vendas por evento e tipo (RF-58, CA-28)

Base: pedidos **pagos**, pela data original da aprovação. Linhas por evento e tipo (ingressos e valor), subtotal por evento, total e série diária. **Conciliação:** o total das linhas precisa bater com a soma dos pedidos pagos; se não bater, a tela avisa (testado adulterando um preço de item). Com filtro de tipo a conciliação por pedido não se aplica. Estornados e contestados ficam **fora** do total e aparecem separados, com a receita bruta e a líquida; pagos sem estoque aparecem como exceção. Ingresso cancelado no painel dentro de um pedido ainda pago **continua** no total (D-55). Não inclui taxas do gateway (D-04).

## Promoters (RF-59, CA-19, CA-30)

Quantidade de ingressos, valor atribuído e pedidos, de pedidos **pagos** com código de promoter, filtráveis por evento e período. O código só atribui a venda: **sem desconto e sem comissão** (testado: a venda com cupom aparece com o valor cheio e no promoter certo, comprada pelo fluxo real e paga pelo webhook). Ranking do **maior para o menor**, por quantidade (padrão) ou valor; empate desempata pelo outro critério; empate total divide a posição. Todos os promoters aparecem, inclusive sem venda e inativos. Vendas sem código ficam fora do ranking, informadas à parte (D-56).

## O que foi verificado

- 22 testes novos (548 passam, contra PostgreSQL real). **Mutações:** taxa contando só ingressos válidos de pedidos pagos, 4 testes falham; mês em UTC em vez do fuso, 1; vendas incluindo estornados, 1; ranking do menor para o maior, 1.
- **Navegador real** (Chromium, servidor local, fluxo de compra com cupons e simulador do gateway, um estorno e um cancelamento no painel): vendas R$ 630,00 conferindo com 3 pedidos pagos; líquida R$ 630,00 contra bruta R$ 790,00 e estornada R$ 160,00; ranking João 3 ingressos/R$ 240,00, Maria 2/R$ 230,00, Zé 0; taxa de **9 unidades = R$ 9,00** (inclusive os 2 do pedido estornado e o cancelado pelo painel), conciliação "confere" e a explicação do critério na tela. Sem rolagem horizontal a 1280 e 360 px.
- Bug achado nos testes: o mês vazio (`?month=`) dava erro em vez de usar o mês atual; corrigido.

## O que **não** foi verificado

- O texto do contrato (Cláusulas 6.3 e 6.4): **conferir** a regra e a leitura do "pago sem estoque" (D-54).
- Reteste com webhook de estorno de um gateway **real** (CA-29 também é do Prompt 22).
- Volume: as consultas usam expressões de fuso sem índice; bom para milhares de pedidos, conferir o plano para dezenas de milhares (Prompt 24).
- A tela não tem filtro por tipo nem o detalhe de pedidos de um promoter (a API tem). Exportação: Prompt 18.
- Envio mensal automático do relatório (Prompt 30: "relatório mensal até o dia 5" é rotina de operação; aqui só a consulta).

## Decisões abertas

D-54 (pago sem estoque e a taxa), D-55 (receita líquida), D-56 (critério e empate do ranking), além de D-04 (taxas do gateway fora dos números).
