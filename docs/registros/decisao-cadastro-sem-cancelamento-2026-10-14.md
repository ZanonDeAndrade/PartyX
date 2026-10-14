# Decisão: cadastro sem a Política de Cancelamento (14/10/2026, D-84)

| Campo | Registro |
|---|---|
| Quem decidiu | Arthur (responsável da contratada) |
| Data | 14/10/2026 |
| Canal | Pedido escrito nesta sessão de trabalho |
| O que foi decidido | O cadastro de compradores em produção exige só os **Termos de Uso** e a **Política de Privacidade** publicados (arquivo, versão e data de vigência). A **Política de Cancelamento** passa a ser exigida apenas para abrir a venda (`SALES_OPEN=true`) |
| Por quê | O aceite gravado no cadastro (RF-03) é só dos Termos e da Privacidade. A Política de Cancelamento ainda não foi fornecida, e a venda continua fechada |
| O que substitui | A premissa de D-80 (11/10/2026), que exigia os três textos para abrir o cadastro |

## Efeito

- Servidor: `signupBlockers` (`server/src/legal/documents.ts`) confere só Termos e Privacidade; `salesBlockers` continua exigindo os três textos, versões, datas e a aprovação visual.
- Publicação: `infra/producao/deploy.sh conferir` aceita `SIGNUP_OPEN=true` com Termos e Privacidade e recusa `SALES_OPEN=true` sem `conteudo-legal/cancelamento.txt`, `CANCELLATION_VERSION` e `CANCELLATION_DATE`. O teste rápido passou a conferir o cadastro (`ready` de `/api/legal/versions`) contra `SIGNUP_OPEN`.
- Site: a página `/politica-de-cancelamento` mostra "documento ainda não disponível" até a publicação. Os Termos 1.0 dizem que ela será publicada antes do início das vendas.
- Testes: `server/src/legal/documents.test.ts` e `server/src/api/auth.integration.test.ts` (cadastro em produção sem a Política de Cancelamento). Mutação conferida: voltando a exigir os três textos no cadastro, 3 testes falham.

## Pendente

- Política de Cancelamento da PartyX, com versão e data, antes de abrir a venda (D-11).
- Confirmação escrita da PartyX sobre o conteúdo dos Termos 1.0 e da Privacidade 1.0, a arquivar junto a este registro.
