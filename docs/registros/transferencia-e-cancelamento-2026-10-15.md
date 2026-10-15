# Política de Cancelamento, Troca e Reembolso 1.0 e transferência de ingresso (15/10/2026)

**Estado: publicado em 15/10/2026 23:07 UTC** (`release-2026-10-15h`, revisão `partyx-00030-jos`, migração 0016), com o OK do Bernardo aos três textos, informado pelo responsável antes da virada. Registro: `publicacao-producao-2026-10-15h.md`.

**Decisões do responsável sobre o plano (15/10/2026):**
- transferência como mudança de escopo (D-87), com o `CLAUDE.md` atualizado;
- quem recebe com 16 ou 17 anos recebe na hora, e o QR aparece só depois do aceite do Termo de Ciência;
- **sem pedir a senha** na confirmação da transferência;
- as quatro sugestões de texto entram para o OK do Bernardo (nome novo da Política nos Termos, definição de Titular, Privacidade com o aceite da Política e o nome mascarado, Termos seção 6 com reembolso ao comprador e estorno dos transferidos).

Pedido do responsável (Arthur), nesta data:
- publicar a Política de Cancelamento, Troca e Reembolso 1.0 (texto da PartyX, recebido em anexo), os Termos de Uso 1.2 e a Política de Privacidade 1.2;
- gravar o aceite da Política no checkout;
- permitir a transferência de ingresso entre contas, até 2 horas antes do evento, com desfazer pelo administrador em caso de fraude.

Regras: plano e migração antes, testes, commits locais, sem push, OK antes de qualquer passo na nuvem. Os textos novos precisam do OK do Bernardo antes da virada.

## 1. Escopo e decisões a registrar

| Decisão | Origem | O que fica registrado |
|---|---|---|
| **D-87 Transferência de ingresso** (mudança de escopo, §16.2) | Pedido do responsável, 15/10/2026. O §16 do documento **exclui a transferência de titularidade**; o `CLAUDE.md` também diz para não implementá-la, e a auditoria a lista como fora do escopo | Mesmo tratamento da D-86 (lotes): decisão do responsável, aprovação da PartyX a registrar. O `CLAUDE.md` precisa de decisão do responsável para mudar |
| **D-88 Sem direito de arrependimento** | Decisão do Bernardo (PartyX), 15/10/2026, contra a recomendação de manter o prazo de 7 dias do art. 49 do CDC | A Política diz que não há reembolso por desistência em nenhum prazo, e a transferência fica no lugar dele. Fica registrado que foi decisão da PartyX, tomada depois da recomendação contrária. A frase final da Política ("Nada nesta Política limita os direitos garantidos pelo Código de Defesa do Consumidor") continua |
| **D-80, atualizada** | O aceite da Política de Cancelamento passa a ser gravado no checkout | Antes, a Política era só exigida para vender, sem aceite gravado |

## 2. Textos

**Política de Cancelamento, Troca e Reembolso 1.0**
- Entra em `conteudo-legal/cancelamento.txt` **como foi recebida**, sem mudar o texto.
- Variáveis `CANCELLATION_VERSION=1.0` e `CANCELLATION_DATE` igual ao dia da virada.
- A venda continua fechada (`SALES_OPEN=false`). Com a Política publicada, ela deixa de bloquear a abertura das vendas.

**Termos de Uso 1.2**

Pedido:
- **Seção 5, "Titularidade":** "Não há transferência de titularidade nem troca de nome" é trocado pelo texto pedido: "O titular pode transferir o ingresso para outra pessoa que tenha conta na Plataforma, até 2 horas antes do início do Evento, conforme a Política de Cancelamento, Troca e Reembolso. Na transferência, o QR Code anterior é cancelado e um novo é gerado."
- **Seção 6, reescrita:**
  - não há cancelamento nem reembolso por desistência, em nenhum prazo;
  - o titular pode transferir o ingresso;
  - o reembolso só ocorre nos casos da Política (evento cancelado, adiado ou alterado pela PartyX, entrada recusada por erro da PartyX e cobranças indevidas).
- **Sai a frase** "Ela será publicada na Plataforma antes do início das vendas".

Sugerido, para o mesmo OK do Bernardo:
- **Nome da Política:** atualizar para "Política de Cancelamento, Troca e Reembolso" nos três lugares que ainda dizem "Política de Cancelamento e Reembolso" (seção 1, seção 5 e seção 6).
- **Seção 2, Definições:** acrescentar "Titular: a pessoa em cuja conta o ingresso está; na compra, é o comprador, e depois de uma transferência é quem recebeu".
- **Seção 6, para quem recebe um ingresso saber que:**
  - o reembolso vai para quem fez o pedido;
  - estorno e contestação cancelam também os ingressos do pedido que já foram transferidos.

  As duas coisas já estão na Política (seções 4 e 6) e no pedido ("o pedido continua do comprador original").

**Política de Privacidade 1.2**

Pedido:
- **"Dados que coletamos":** "Transferências: conta de origem, conta de destino, ingresso, data e hora."

Sugerido:
- **"Aceite dos documentos":** acrescentar a versão da Política de Cancelamento, Troca e Reembolso aceita na compra, com o pedido. Passa a ser gravada, e hoje o texto não fala dela.
- **"Com quem compartilhamos":**
  - na transferência, quem transfere vê só parte do nome de quem recebe, para confirmar a conta;
  - quem recebe vê, da mesma forma, quem transferiu.

**Contatos:** conferidos, já são `partyx992@gmail.com` e `+55 55 99156-6900`:
- Termos, seção 8: e-mail e WhatsApp;
- Privacidade, seção 7: e-mail; seção 8: e-mail e WhatsApp;
- Política de Cancelamento, seção 7: e-mail e WhatsApp.

**Novo aceite:** a troca de versão para 1.2 já faz quem aceitou a 1.1 aceitar de novo. O login e o `/auth/me` devolvem `pendingConsent`, a tela de atualização bloqueia o site, e o checkout recusa com `aceite_pendente`. Esse caminho já foi usado na troca da 1.0 para a 1.1.

## 3. Migração `0016_transferencia_e_aceite_da_politica` (só expande)

```sql
-- Titular atual do ingresso. Preenchido com o comprador para os ingressos existentes. Um gatilho põe o comprador
-- quando o código anterior (retorno) emite um ingresso sem informar o titular; o NOT NULL é conferido depois do gatilho.
ALTER TABLE tickets ADD COLUMN holder_user_id uuid REFERENCES users(id);
UPDATE tickets t SET holder_user_id = o.user_id FROM orders o WHERE o.id = t.order_id;
CREATE FUNCTION tickets_holder_default() ...;   -- BEFORE INSERT: se nulo, orders.user_id
ALTER TABLE tickets ALTER COLUMN holder_user_id SET NOT NULL;
CREATE INDEX tickets_holder_idx ON tickets (holder_user_id, event_id);
-- Menor (16 ou 17 na data do evento) pelo titular atual. Nulo: vale orders.buyer_minor, como hoje.
ALTER TABLE tickets ADD COLUMN holder_minor boolean;

-- Histórico de transferências: só acrescenta (sem UPDATE nem DELETE, por gatilho). Desfazer é uma linha nova.
CREATE TABLE ticket_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  event_id uuid NOT NULL REFERENCES events(id),
  from_user_id uuid NOT NULL REFERENCES users(id),
  to_user_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),           -- o titular, ou o administrador que desfez
  reverts_id uuid REFERENCES ticket_transfers(id),       -- preenchido só quando é o desfazer
  reason text,                                           -- obrigatório no desfazer (5 a 500 caracteres)
  old_short_code varchar(12) NOT NULL,
  new_short_code varchar(12) NOT NULL,
  old_code_sha256 bytea NOT NULL,                        -- reconhece o QR antigo na portaria; nunca o código em si
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id),
  CHECK ((reverts_id IS NULL) = (reason IS NULL)),
  CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 5 AND 500)
);
-- índices: (ticket_id, created_at), (to_user_id), (from_user_id), (old_code_sha256), único em reverts_id

-- Termo de Ciência aceito por quem recebeu o ingresso com 16 ou 17 anos (o de hoje é por pedido, de quem comprou).
CREATE TABLE ticket_minor_acceptances (
  id, user_id, ticket_transfer_id UNIQUE, term_version, age_at_event CHECK (16, 17), accepted_at, ip inet, user_agent
);

-- Aceite da Política de Cancelamento no checkout: um por pedido.
CREATE TABLE cancellation_acceptances (
  id, user_id, order_id UNIQUE, policy_version, accepted_at, ip inet, user_agent
);

-- forbid_delete() nas três tabelas novas; permissões do partyx_app só de SELECT e INSERT nelas
ALTER TYPE email_template ADD VALUE 'transferencia_enviada';
ALTER TYPE email_template ADD VALUE 'transferencia_recebida';
ALTER TYPE email_template ADD VALUE 'transferencia_desfeita';
```

**Reversão** (`drizzle/rollback/0016_….down.sql`):
- apaga as três tabelas, o gatilho, a função e as duas colunas;
- os três valores novos do tipo de e-mail ficam, porque o PostgreSQL não remove valor de enum e eles não atrapalham.

**Retorno para a revisão anterior (`partyx-00028-vax`):**
- **Antes da primeira transferência:** é seguro. Ela emite ingresso normalmente, porque o gatilho preenche o titular.
- **Depois de uma transferência:** **não é seguro**. A versão anterior mostra o ingresso pelo pedido, então o comprador veria o ingresso transferido, com o QR novo, e quem recebeu não o veria.
- **Nesse caso:** corrigir para a frente, ou desfazer as transferências antes de voltar.
- **Hoje:** com a venda fechada, não há ingresso em produção.

## 4. Transferência

**Tela** ("Meus ingressos", botão "Transferir" no ingresso)
1. **Informar o destino:** a pessoa digita o e-mail ou o CPF da conta de destino.
2. **Conferir:** o site mostra só o nome mascarado ("Maria S. O.": o primeiro nome e as iniciais dos outros, sem "da", "de" e parecidos).
3. **Confirmar:** um texto diz que o QR atual deixa de valer e que a operação não se desfaz pelo site.

A conferência só funciona para um ingresso que a pessoa pode transferir, e tem limite de tentativas por conta. Ela diz se a conta existe, como o cadastro já diz (D-22).

**Regras, conferidas no servidor**
- **Ingresso:**
  - válido e na conta de quem pede;
  - pedido pago (não estornado, contestado, cancelado nem pago sem estoque);
  - evento publicado e até 2 horas antes do início, pela hora do banco.
- **Destino:**
  - conta de cliente, ativa, não anonimizada, diferente de quem transfere;
  - com data de nascimento. Sem ela, a transferência é recusada, e a pessoa de destino informa a data em "Minha conta", com o mesmo formulário do checkout.
- **Idade na data do evento** (mesmas funções da compra, `domain/age.ts`):
  - menor de 16: recusa;
  - 16 ou 17: só em evento que permite menores;
  - evento 18+: só para maiores.
- **Atomicidade:** uma transação com travas na mesma ordem do estorno (o pedido, depois o ingresso), o que evita impasse. Na mesma transação:
  - confere de novo que o titular é quem pede e que o ingresso está válido;
  - gera código, código curto e QR novos (`newTicketCode`, `newShortCode`, `signQr`);
  - troca `holder_user_id`, `holder_name` (o nome completo de quem recebe) e `holder_minor`;
  - grava a linha de `ticket_transfers`, a trilha `ingresso.transferir` (sem códigos) e os dois e-mails na fila.
- **Concorrência:** duas transferências ao mesmo tempo: a segunda espera a trava, vê que o ingresso não é mais dela e recebe 409 ("Este ingresso não está mais na sua conta").

**Depois da transferência**
- **"Meus ingressos":** o ingresso sai de quem transferiu e aparece para quem recebeu, com "Recebido de Maria S. O. em 15/10".
- **Quem recebeu** não vê o pedido de outra pessoa: sem número nem link do pedido.
- **Pedido do comprador:**
  - continua dele (pagamento, estorno e reembolso);
  - a página do pedido mostra "Transferido para Maria S. O. em 15/10", sem QR;
  - o PDF e a lista de ingressos do pedido trazem só os que ainda estão com ele.
- **Menor de 16 ou 17 que recebe:** o QR e o PDF só aparecem depois de aceitar o Termo de Ciência. A autorização do responsável passa a sair por ingresso, com o nome e a data de nascimento de quem recebeu.
- **QR antigo na portaria:** é recusado com "QR antigo: este ingresso foi transferido", pelo resumo do código antigo, sem mostrar o novo titular.
- **E-mails:** "você transferiu" e "você recebeu", pela fila de sempre. Sem SMTP em produção eles falham como os outros. Hoje, com a venda fechada, não há ingressos para transferir.

**O que muda porque o ingresso passa a ter titular próprio**
- **Portaria:**
  - mostra o titular atual;
  - a busca por CPF e por e-mail usa a conta do titular;
  - a conferência de idade usa `holder_minor` e, sem ele, o pedido, como hoje.
- **Lista de contingência:** sai com o nome, o CPF mascarado e a marca de menor do titular atual.
- **Painel:**
  - lista de ingressos do evento e exportação: e-mail e CPF do titular, com o comprador ao lado;
  - detalhe do ingresso: titular atual, comprador e histórico das transferências;
  - detalhe do comprador: segue pelo pedido.
- **Estorno e contestação:** continuam cancelando todos os ingressos do pedido, inclusive os transferidos, como dizem a Política e os Termos.
- **Anonimização:**
  - troca o nome só nos ingressos que estão com a pessoa;
  - limpa IP e navegador das duas tabelas novas.
- **Exportação de dados da pessoa (LGPD):**
  - inclui os ingressos que ela tem e as transferências feitas e recebidas;
  - não mostra o nome de quem recebeu os ingressos que ela comprou.
- **PDF e tela do ingresso:** o rótulo "Comprador" vira "Titular".
- **Exportação de encerramento:** inclui as colunas e tabelas novas.
- **Taxa mensal, capacidade e conferência da restauração:** sem mudança. A transferência altera a mesma linha e não cria ingresso.
- **Teste que hoje proíbe a transferência** (`tickets.integration.test.ts`, "sem transferência"): passa a conferir só as rotas novas.

## 5. Painel: desfazer em caso de fraude

No detalhe do ingresso, o botão "Desfazer última transferência":
- **Motivo:** obrigatório, de 5 a 500 caracteres, mais a confirmação, no mesmo padrão do cancelamento.
- **Quando:** só com o ingresso válido e ainda não usado.
- **O que faz:**
  - devolve o ingresso a quem transferiu;
  - gera QR e código novos de novo, porque quem recebeu tinha o QR;
  - grava uma linha nova no histórico, ligada à transferência desfeita;
  - grava na trilha `ingresso.transferencia_desfeita`, com o motivo;
  - avisa os dois por e-mail.
- **Cadeia de transferências:** desfaz-se uma por vez, da última para a primeira.

## 6. Aceite da Política no checkout

- **Na tela:** caixa obrigatória, nunca marcada de antemão: "Li e aceito a Política de Cancelamento, Troca e Reembolso", com o link e a versão.
- **No servidor:**
  - exige o aceite e a versão atual (409 se mudou);
  - grava o aceite na mesma transação do pedido: versão, data, IP, navegador e pedido.

## 7. Testes

**Servidor, com banco**
- **Transferência válida:**
  - códigos novos;
  - o QR antigo é recusado na portaria ("transferido") e o novo entra;
  - os dois lados de "Meus ingressos";
  - o pedido continua do comprador.
- **Recusas:**
  - destino inexistente e destino sem data de nascimento;
  - menor de 16;
  - 16 ou 17 em evento com menores (aceita, QR só depois do Termo) e sem menores (recusa);
  - menor em evento 18+;
  - fora do prazo de 2 horas;
  - ingresso já usado, cancelado, estornado ou contestado;
  - para a própria conta.
- **Concorrência:**
  - duas transferências seguidas (A para B, depois B para C);
  - duas simultâneas do mesmo ingresso: uma passa, a outra recebe 409 e nada fica pela metade.
- **Estorno integral depois da transferência:**
  - o pedido e o reembolso continuam do comprador;
  - o ingresso transferido é cancelado.

  Não há fluxo de "evento cancelado" no sistema: o reembolso é feito no painel do Mercado Pago e chega pelo webhook, e é isso que o teste simula.
- **Desfazer pelo administrador:** motivo obrigatório, trilha e QR novo.
- **Portaria e contingência:** a busca e a lista mostram o titular atual.
- **Anonimização e exportação de dados:** com transferência no meio.
- **Aceite da Política no checkout:**
  - gravado com versão, IP, navegador e pedido;
  - sem o aceite, ou com versão antiga, é recusado, e nenhum pedido é criado.
- **Novo aceite dos Termos 1.2** para quem aceitou a 1.1.

**Navegador**
- Transferir a 360 e 1280 px, com a conferência do nome mascarado.
- "Meus ingressos" de quem transferiu e de quem recebeu.
- Página do pedido com "Transferido para".
- Desfazer no painel.
- Caixa da Política no checkout.
- O roteiro de compra é atualizado para marcar a caixa.

**Regressão:** os de sempre (`test:db`, transições, textos, cronômetro, cor, responsivo e roteiro).

## 8. Publicação

- **Até a candidata:** tag nova, build, backup sob demanda conferido, migração 0016, candidata e teste rápido.
- **Variáveis:**
  - `TERMS_VERSION=1.2`, `PRIVACY_VERSION=1.2` e as datas;
  - `CANCELLATION_VERSION=1.0` e a data;
  - venda fechada.
- **Parada antes da virada:** os três textos como aparecem na candidata, para o OK do Bernardo.
- **Depois da virada:**
  - checklist de abertura das vendas (a Política deixa de ser pendência);
  - registro da publicação;
  - README-DEPLOY;
  - memória do projeto.

## Implementação (15/10/2026)

Feito como no plano acima, com estes acertos:

- **Desfazer:** escolhe a transferência que trouxe o ingresso ao titular atual e ainda não foi desfeita (numa cadeia A, B, C, primeiro B para C, depois A para B). Ingresso que volta para quem comprou fica com `holder_minor` nulo, e vale o aceite do pedido.
- **Portaria:**
  - QR antigo de ingresso transferido: "QR antigo: este ingresso foi transferido e este QR não vale mais", sem mostrar o titular novo; a leitura fica registrada como inválida;
  - quem recebeu com 16 ou 17 anos e ainda não aceitou o Termo não entra, nem com a confirmação do validador: "o titular precisa aceitar o Termo de Ciência em Meus ingressos antes de entrar".
- **Recusas de idade:** a mesma mensagem para menor de 16 e para 16 ou 17 em evento sem menores, para quem transfere não ficar sabendo a idade da outra pessoa.
- **Página do pedido:** quando o comprador transfere todos os ingressos, a página mostra a lista "Transferido para", e não fica presa em "Preparando seus ingressos"; o texto conta os que continuam com ele.
- **Minha conta:** conta antiga sem data de nascimento ganha o formulário da data (necessária para receber).
- **Ingresso e PDF:** o rótulo "Comprador" virou "Titular".
- **Migração:** os valores novos do tipo de e-mail usam `ADD VALUE IF NOT EXISTS`, para a 0016 poder ser reaplicada depois de revertida (os valores ficam, como a reversão avisa).
- **Rotas novas:**
  - `POST /api/tickets/:id/transfer/preview` (15 por 10 minutos por conta);
  - `POST /api/tickets/:id/transfer` (20 por hora, exige `confirm: true`);
  - `POST /api/tickets/:id/termo-menor`;
  - `GET /api/tickets/:id/autorizacao-menor.pdf`;
  - `POST /api/admin/tickets/:id/transfer/undo`;
  - `GET /api/legal/versions` passa a trazer `cancellation` e `cancellationDate`.
- **E-mails:** `transferencia_enviada`, `transferencia_recebida` e `transferencia_desfeita`, montados no envio pelo histórico. Nunca levam QR, código secreto nem PDF; o nome da outra pessoa vai mascarado.

**Ponto para o Bernardo:** o Termo de Ciência para Menores (`termo-menor.txt`, 1.0) ainda cita "Política de Cancelamento e Reembolso". Não foi alterado, porque mudar exige uma versão 1.1 de um quarto texto, que não foi pedida. O conteúdo continua certo (é o mesmo documento, com o nome antigo).

### Verificação (local)

Resultados no fim da implementação, no relatório da sessão e em `matriz-requisitos.md`:
- `transfer.integration.test.ts` (12 casos);
- estorno depois da transferência em `reconcile.integration.test.ts`;
- a 0016 em `schema.integration.test.ts`;
- `e2e/transferencia.spec.ts` (6 casos, com capturas a 360 e 1280 px).
