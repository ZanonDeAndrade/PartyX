# Texto longo digitado não quebra o leiaute (14/10/2026)

Pedido do responsável (Arthur) em 14/10/2026: o "Sobre o evento" com uma palavra muito longa sem espaço (ou um link) esticava a coluna, o cartão de compra ficava por cima do texto e a página ganhava rolagem horizontal. Correção geral, não só nesse campo, mais a revisão dos PDFs e dos e-mails.

## Causa

O texto digitado pelo admin ou pelo comprador não tinha regra de quebra em vários pontos (descrição, título do destaque, local nos cartões, tipo de ingresso, nome do comprador no checkout, local em Meus ingressos, no pedido, no painel e na portaria, atrações). Uma palavra sem espaço não cabe na coluna e o navegador a deixa passar da caixa.

## O que mudou no site

- `src/site/styles/base.css`: o corpo do site quebra texto em qualquer ponto quando ele não cabe (`overflow-wrap: anywhere`, com `break-word` antes para Safari anterior ao 15.4). Vale para todo texto, então campo novo já nasce protegido.
- Rótulos fixos da interface (botão, aba, etiqueta, cabeçalho de tabela) mantêm a quebra normal, para não partir palavra no meio quando a linha aperta.
- `min-width: 0` nas colunas de grade e de linha flexível que recebem texto digitado (evento, checkout, ingresso, conta, portaria, listas de itens), nunca no valor curto ao lado.
- `.px-nowrap` (e `.px-mono` sem `.px-break`): preço, data e hora, CPF mascarado, código e telefone ficam inteiros. Sem isso, a regra geral deixava o preço ser espremido ao lado de um tipo de ingresso longo ("R$ 1 / 20,0 / 0").
- Descrição do evento: as quebras de linha digitadas continuam (`white-space: pre-line`); o texto é sempre texto, nunca HTML (nenhum `dangerouslySetInnerHTML` no site).
- Mensagens ao público sem "ambiente": "As vendas deste evento ainda não estão abertas." (página do evento e servidor) e "O pagamento ainda não está disponível. Tente de novo mais tarde." Ficaram as do painel (armazenamento de imagens), que não são para o público.

## Fora do navegador

- **PDF do ingresso** (`server/src/tickets/pdf.ts`): campos no limite quebram em linhas; a fonte diminui (nome 22/18/15, local 12/10,5/9, tipo e comprador 15/12,5/11) e o QR só encolhe se ainda faltar lugar (mínimo de 200 pt). Texto comum sai como antes.
- **Emoji nos PDFs:** sai do texto impresso (antes virava "?" e uma bandeira virava "??"). Outros alfabetos continuam "?" (fontes padrão do PDF, D-43).
- **PDF da autorização de menor** (`server/src/minors/authorizationPdf.ts`): os campos preenchidos deixam de cortar com reticências; quebram em linhas e a linha do formulário cresce. Com os dados de teste no limite, continua em uma página.
- **Lista de contingência** (`server/src/exports/contingency.ts`): comprador e tipo quebram em linhas (antes, reticências) e a linha cresce. O rodapé deixou de levar o nome do evento (já está no cabeçalho de cada página).
- **Defeito antigo corrigido na lista de contingência:** o rodapé "Página X de Y" ficava abaixo da margem e o pdfkit o levava para uma página nova; uma lista de 3 páginas saía com 6 (as 3 últimas só com o rodapé). Visto na versão no ar; corrigido zerando a margem de baixo ao desenhar o rodapé.
- **E-mails** (`server/src/mail/templates.ts`): parágrafos, título, células dos detalhes e rodapé com `word-break: break-word; overflow-wrap: anywhere`, e tabelas com largura fixa. O e-mail de compra com o texto no limite não tem rolagem a 360 px.

## Como conferir

- `npm run e2e:textos`: 26 telas × 360, 768 e 1280 px (78 medições) com os textos no limite. Falha com rolagem horizontal, texto que escapa da própria caixa ou palavra curta partida no meio. Resultado em 14/10/2026: 78 de 78. Capturas em `e2e/.run/textos-longos/img` (fora do Git).
- Testes dos PDFs e do e-mail com o texto no limite: `server/src/tickets/pdf.test.ts`, `server/src/minors/authorizationPdf.test.ts`, `server/src/exports/contingency.test.ts`, `server/src/mail/templates.test.ts`.
