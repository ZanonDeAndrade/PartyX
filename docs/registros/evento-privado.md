# Evento privado com lista de autorizados (D-92)

**Decisão:** mudança de escopo aprovada pela PartyX, informada pelo responsável (Arthur) em 20/10/2026, no mesmo modelo das D-86 (lotes),
D-87 (transferência) e D-91 (desconto por promoter). O §16 do documento exclui "cortesias/lista de convidados"; esta decisão inclui uma
lista de **autorizados a comprar**, que não é cortesia (quem está na lista paga normalmente) e não muda a portaria (a entrada continua
só pelo ingresso válido; a lista não é conferida na porta e não é validação offline). A aprovação escrita da PartyX fica com o
responsável, fora do repositório.

**Respostas do responsável ao plano (20/10/2026):** plano aprovado; premissas 1 a 6 aprovadas (abaixo); limites de 10 solicitações por
conta e 30 por IP por hora; `?voltar=` só com caminho relativo do próprio site; S-02 da auditoria feito antes, em commit próprio
(`correcao-s02-2026-10-20.md`); textos legais só como proposta para o Bernardo.

**Textos aprovados (20/10/2026):** o responsável informou que ele e o Bernardo aprovaram a Política de Privacidade 1.3 (com o trecho da
seção 7), os Termos de Uso 1.6 e a Política de Cancelamento 1.2 (`evento-privado-textos-propostos.md`), com a avaliação de legítimo
interesse em `lia-evento-privado.md` (a assinar pelo Bernardo, como encarregado), o aviso junto da observação da decisão e a orientação
no `../manual-do-painel.md`.

**Aprovação do Bernardo (20/10/2026):** o responsável informou que o Bernardo aprovou, por WhatsApp, em 20/10/2026, o evento privado e
os três textos (Política de Privacidade 1.3, Termos de Uso 1.6 e Política de Cancelamento 1.2), com vigência em 20/10/2026. A
assinatura da avaliação de legítimo interesse vem depois, em PDF, e não trava a publicação. A mensagem fica com o responsável, fora do
repositório.

## Regras

| Regra | Como ficou |
|---|---|
| Chave | "Evento privado" na edição do evento (`events.is_private`, padrão desligada). Ligar e desligar entram na trilha (`evento.privado`) |
| Vitrine e busca | O evento privado continua aparecendo, com o selo "Evento privado" (cadeado) no cartão, no destaque e na página; o botão vira "Ver evento". Nada da lista sai nas respostas públicas |
| Quem compra | Só a conta autorizada. Resumo e pedido recusam com 403 `evento_privado`: "Este evento é privado. Só pessoas autorizadas pelo organizador podem comprar." Janelas de venda, lotes, capacidade e regras de menores continuam iguais, conferidas depois |
| Reconhecimento | Uma linha da lista vale para a conta quando bate a conta, o e-mail da conta (minúsculas) ou o CPF da conta (só dígitos). A pessoa cadastrada antes de ter conta é reconhecida ao criar a conta ou ao entrar, sem gravação extra. Com mais de uma linha da mesma pessoa, autorizada vale antes de pendente e pendente antes de recusada |
| Chave ligada com vendas em andamento (premissa 1) | A regra vale na criação do pedido: pedido pago não é cancelado; pedido pendente criado antes pode ser pago; pedido novo só com autorização |
| Remover ou recusar quem já comprou (premissa 2) | Os ingressos continuam válidos |
| Chave desligada | A compra fica livre para todos e a lista é mantida |
| Lista no painel | Aba "Acesso": adicionar por e-mail ou CPF (um basta), nome opcional; colar lista (uma por linha, até 1.000, e-mail, CPF e nome em qualquer ordem, com vírgula, ponto e vírgula ou tabulação; erros e repetidas pela linha); busca por nome, e-mail ou CPF (no corpo da requisição, nunca na URL); filtro por situação; CSV; remover. Cadastrar quem já está na lista atualiza a linha (autoriza), não duplica |
| Cada linha | Situação (autorizada, pendente, recusada), origem (cadastrada pelo painel ou solicitação), se já tem conta, datas, quem decidiu e a observação. CPF sempre mascarado nas telas e no CSV |
| Solicitação | Na página do evento: sem login, "Entrar para solicitar acesso" (volta ao evento); logado e fora da lista, "Solicitar acesso a este evento" (um toque, com os dados da conta, sem formulário); depois, "Solicitação enviada. Você recebe um e-mail quando for aprovada"; recusada, "Solicitação não aprovada"; autorizada, compra normal. Uma por conta por evento (trava por evento e índice único). Vale antes de as vendas abrirem; evento encerrado ou que já aconteceu não aceita |
| Recusada (premissa 4) | Não solicita de novo pela tela; o painel pode aprovar a mesma linha depois |
| Aprovação | Na aba "Acesso" e na página "Solicitações" (menu com contador de pendentes; card na Visão geral), uma a uma ou várias, com observação opcional (a página do evento não mostra; o campo avisa que ela fica na trilha, que a pessoa pode pedir uma cópia e que não se escrevem motivos pessoais). Trilha `acesso.solicitar`, `acesso.adicionar`, `acesso.importar`, `acesso.aprovar`, `acesso.recusar`, `acesso.remover`, com e-mail e CPF mascarados |
| E-mails (premissa 3) | "Solicitação recebida" para quem solicitou; "Acesso liberado", com o link do evento, só quando uma solicitação é aprovada (quem foi cadastrado pelo painel não recebe e-mail); nada na recusa. Sem e-mail ao Bernardo a cada solicitação; resumo diário só proposto |
| Transferência | Ingresso de evento privado só vai para conta autorizada: 403 `destino_nao_autorizado` na prévia e na confirmação ("Este evento é privado e essa conta não está autorizada pelo organizador. Peça para a pessoa solicitar acesso na página do evento."). O "desfazer" pelo painel continua. A mensagem revela a quem já sabe o e-mail ou CPF que a conta não está autorizada (premissa 5, aceita) |
| Privacidade | A página só recebe a situação da própria conta (`GET /api/events/:slug/access`); nenhuma resposta diz se outra pessoa está na lista |
| Limites | 10 solicitações por conta por hora, somando os eventos (no banco), e 30 por IP por hora (por instância); 429 `muitas_requisicoes` |
| Retenção | A lista e as solicitações são apagadas 6 meses depois do fim do evento (ou do início, sem fim), pela limpeza diária das 04:05 (`purge-retention`), sempre, sem variável. A anonimização de um titular apaga as linhas da conta, do e-mail e do CPF dele. A trilha fica, com e-mail e CPF mascarados. A cópia dos dados do titular traz as linhas dele (evento, situação, origem, datas e observação, sem quem decidiu) |
| Equipe | Contas de administrador e validador não solicitam (só cliente compra); a página explica |

## Onde está no sistema

| Parte | Arquivos |
|---|---|
| Banco | `drizzle/0019_evento_privado.sql` (só expande: tipos `event_access_status` e `event_access_origin`, tabela `event_access`, coluna `events.is_private`, dois valores no tipo de e-mail, DELETE para o `partyx_app`) e `drizzle/rollback/0019_evento_privado.down.sql` (recusa com evento privado ou com alguém na lista) |
| Regras puras | `server/src/domain/eventAccess.ts` (pessoa, lista colada, precedência, máscara de e-mail, observação, prazo de 6 meses) |
| Servidor | `server/src/events/access.ts`, `server/src/api/eventAccess.ts`; chave em `events/service.ts` e `api/events.ts`; pedido em `orders/service.ts`; transferência em `tickets/transfer.ts`; vitrine em `vitrine/service.ts`; e-mails em `mail/templates.ts` e `mail/outbox.ts`; CSV em `exports/service.ts` e `api/exports.ts`; retenção em `privacy/retention.ts`; anonimização em `privacy/service.ts` |
| Painel | `src/site/adminAccess.tsx` (aba Acesso, página Solicitações, contador, card), `adminEvents.tsx` (chave e aba), `adminPages.tsx` (menu e Visão geral), `areas/admin.tsx` (rota `/admin/solicitacoes`) |
| Site | `src/site/pages.tsx` (selo, caixa de acesso e barra do celular), `components.tsx` (selo no cartão), `icons.tsx`, `checkoutPages.tsx` (erro com volta ao evento), `session.tsx` (`safeReturnPath`) |
| Textos e deploy | `conteudo-legal/` com Privacidade 1.3, Termos de Uso 1.6 e Política de Cancelamento 1.2; `env.prod.yaml` com as versões e a vigência; trava `infra/producao/textos-privado.py` no `deploy.sh conferir`: release com a 0019 só sobe com os três textos que falam do evento privado |
| LGPD e manual | `lia-evento-privado.md` (avaliação de legítimo interesse) e `../manual-do-painel.md` (seção do evento privado) |

## Testes

- `server/src/domain/eventAccess.test.ts` (9): pessoa, lista colada, limite de 1.000, precedência, máscaras, observação, prazo.
- `server/src/api/eventAccess.integration.test.ts` (20, banco real): chave e trilha; vitrine sem a lista; cliente fora do painel;
  adicionar, normalizar e não duplicar; lista colada; busca, filtro, CSV e remover com CPF mascarado; pedido e resumo recusados sem
  nada gravado; **pessoa cadastrada antes da conta**, pelo e-mail e pelo CPF, compra depois do cadastro; **chave ligada no meio da
  venda** (pago intacto, pendente continua, novo só com autorização) e **desligada** (todos compram, lista fica); janelas de venda
  continuam; solicitação, repetição e corrida; antes da abertura e evento encerrado; quem já está na lista; aprovar e recusar em lote com
  observação, e-mails e trilha; API só com a própria situação; **limite de solicitações** por conta e por IP; **transferência barrada**
  e permitida, desfazer; quem comprou antes da chave; retenção de 6 meses e idempotência; anonimização.
- `server/src/db/schema.integration.test.ts` (0019 e reversão), `appRole.cluster.test.ts` (DELETE do `partyx_app`),
  `server/src/mail/templates.test.ts` (dois e-mails), `server/src/ops/deployTextos.test.ts` (trava dos textos),
  `src/site/session.test.ts` (`?voltar=`).
- e2e `e2e/acesso.spec.ts` (`npm run e2e:acesso`, 9 casos): painel (chave, aba Acesso, lista colada, CPF mascarado, busca) e página do
  evento (selo, sem login, entrar e voltar, solicitar, enviada, aprovada pela página Solicitações e compra liberada, recusada), a 360,
  390 e 1280 px, sem rolagem lateral. Capturas em `docs/ui/evento-privado/`.

## Pendente

- Assinatura do Bernardo, como encarregado, na avaliação de legítimo interesse (`lia-evento-privado.md`), em PDF; não trava a
  publicação.
- Resumo diário de solicitações: só proposto (`evento-privado-textos-propostos.md`).
- Não publicado: sem push e sem deploy. A migração 0019 não está no Neon.
