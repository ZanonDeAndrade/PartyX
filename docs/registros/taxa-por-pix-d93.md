# Taxa da contratada só sobre pedidos pagos por Pix (D-93)

**Decisão:** aditivo ao contrato com a PartyX, informado pelo responsável (Arthur) em 21/10/2026. A partir de 21/10/2026, a taxa da
contratada (Cláusula 6ª) passa a ser de R$ 1,00 por ingresso **só quando o pedido for pago por Pix**; ingressos pagos por cartão não
entram no repasse. O aditivo assinado fica com o responsável, fora do repositório. É assunto entre a contratada e a PartyX: os textos
legais do site (Termos, Privacidade, Política de Cancelamento) não mudam.

**Respostas do responsável ao plano (21/10/2026):** regra numa tabela do banco (migração 0020); aviso do CSV no rodapé; regra da taxa
mensal atualizada no `CLAUDE.md`; estorno, contestação e cancelamento continuam contando, como antes.

## Regra

| Ponto | Como ficou |
|---|---|
| Vigência | Pedidos com `paid_at` a partir de **21/10/2026 00:00 em Brasília** (03:00 UTC). `paid_at` é a aprovação gravada pelo servidor: um Pix gerado em 20/10 e pago em 21/10 entra na regra nova |
| O que entra | Ingresso emitido de pedido aprovado no mês cuja forma de pagamento gravada (`orders.payment_method`) é `pix`. Cartão (crédito, débito ou pré-pago, gravados juntos como `cartao`) e pedido sem forma informada ficam fora |
| Valor | R$ 1,00 por ingresso do pedido, o mesmo de antes; desconto do promoter (D-91) e taxa de serviço (D-90) não mudam a conta |
| Estorno, contestação, cancelamento | Continuam contando, como antes: o que importa é a aprovação original (`paid_at`), não a situação atual |
| Transferência (D-87) | O ingresso continua na mesma linha e no mesmo pedido: conta uma vez, pela forma do pedido de origem |
| Pago sem estoque (D-54) | Continua fora da conta e listado em "Exceções para análise" |
| Pedidos pagos antes de 21/10/2026 | Regra original: R$ 1,00 por ingresso, qualquer forma. Setembro e os meses anteriores não mudam |
| Outubro de 2026 | Dois períodos no mesmo relatório: de 01/10 a 20/10 pela regra original e de 21/10 a 31/10 pela nova |
| Conciliação | Continua sobre todos os ingressos emitidos, de qualquer forma |

## Configuração com vigência

Tabela `contract_fee_rules` (migração `drizzle/0020_regra_taxa_contratada.sql`): início da vigência (`effective_from`, instante),
valor por ingresso (`per_ticket_cents`), formas que entram (`methods`, nula = qualquer forma) e a referência mostrada no aviso. Cada
linha vale até o início da seguinte. A migração grava:

| Início | Valor | Formas | Referência |
|---|---|---|---|
| 01/01/1970 (sempre) | R$ 1,00 | qualquer | Contrato, Cláusula 6ª, regra original |
| 21/10/2026 00:00 em Brasília | R$ 1,00 | só Pix | Aditivo ao contrato de 21/10/2026, D-93 |

Travas no banco: alterar, apagar e truncar são recusados (só inclusão); uma regra com início antes do mês corrente, no fuso de
Brasília, é recusada (meses fechados não mudam); o `partyx_app` só lê. A reversão da 0020 recusa se houver regra além dessas duas.

**Próxima mudança de contrato, sem código:** uma migração só de dados com um INSERT (início no mês corrente ou depois), com a
reversão; o modelo está em `../relatorios.md`. O aviso do relatório é gerado da própria regra (valor, formas e referência).

## Relatório, CSV e extrato

- **Tela** (`/admin/relatorios/taxa-mensal`): aviso no topo com a regra de cada período do mês; indicadores de total a repassar,
  ingressos por Pix e ingressos por cartão ("só para informação, sem valor" quando nenhum período do mês aceita cartão); tabela por
  período; por evento com Pix, cartão, no repasse e valor; detalhe por unidade com a forma e se entra no repasse.
- **CSV** (`/admin/exports/fee.csv`): colunas novas por unidade (forma de pagamento, entra no repasse, valor no repasse); no rodapé,
  a regra de cada período, os números por período, ingressos por Pix, por cartão, no repasse e o total a repassar.
- **Extrato** (`npm run ops:fee`): regra do repasse, a mesma divisão por forma, por período e por evento.
- **Painel:** o aviso do cancelamento de ingresso diz que o ingresso "segue na apuração da taxa mensal pela regra da data do
  pagamento".
- **Tabelas do painel no celular (correção junto):** o `TableWrap` dava os rótulos das colunas contando só as células `td`, e a linha
  de total, que começa com o `th` "Total", saía com os rótulos deslocados de uma coluna em todas as tabelas com total. Agora conta
  todas as células da linha.

## Onde está no sistema

| Parte | Arquivos |
|---|---|
| Banco | `drizzle/0020_regra_taxa_contratada.sql`, `drizzle/rollback/0020_regra_taxa_contratada.down.sql`, `server/src/db/schema/settings.ts` |
| Regras puras | `server/src/domain/contractFee.ts` (entra no repasse, rótulo do período, texto do aviso) |
| Relatório | `server/src/reports/service.ts` (`feeReport`: períodos do mês pela tabela, ingressos por forma, no repasse e valor) |
| CSV e extrato | `server/src/exports/service.ts` (`exportFee`), `server/src/ops/feeStatement.ts` |
| Painel | `src/site/reportPages.tsx`, `src/site/api.ts`, `src/site/styles/admin.css` |

## Testes

- `server/src/domain/contractFee.test.ts` (3): forma que entra, rótulo do período (com e sem hora), aviso gerado da regra.
- `server/src/api/reports.integration.test.ts`, bloco D-93 (9, banco real): Pix entra e cartão só informa; **virada às 00:00:00 de
  21/10** (23:59:59 de 20/10 na regra original); **meses misturados** (setembro como antes, outubro dividido, novembro só Pix);
  **estorno, contestação e cancelamento** no Pix contam e no cartão não; **transferência** pela função real; desconto do promoter;
  pedido sem forma; **as travas da tabela** e uma regra de teste em 2099 (R$ 1,50, Pix e cartão) que muda o mês dela sem código; CSV
  igual à tela.
- `server/src/db/schema.integration.test.ts` (0020 e reversão), `server/src/db/appRole.cluster.test.ts` (o `partyx_app` só lê).
- e2e `e2e/taxa-pix.spec.ts` (`npm run e2e:taxa-pix`): outubro de 2026 a 360 e 1280 px, sem rolagem lateral. Capturas em
  `../ui/taxa-pix/`.

## Pendente

- Não publicado: sem push e sem deploy. A migração 0020 não está no Neon. Entra na próxima release.
- Rollback do código depois da 0020: a versão anterior ignora a tabela e volta a contar os ingressos pagos por cartão.
