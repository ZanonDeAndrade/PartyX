# LGPD: papéis, inventário, direitos do titular e incidentes

Preparado em 04/10/2026 (Prompt 20). **Não é parecer jurídico.** Prazos de guarda, bases legais e textos são da PartyX (controladora) e de quem a assessora; aqui estão os mecanismos técnicos e o que cada parte decide.

## Papéis

| Papel                       | Quem                                                                                                  | O que decide                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Controladora**            | PartyX                                                                                                | Finalidades, bases legais, textos de privacidade, prazos de retenção, a quem atender e quando, comunicação a titulares e à autoridade                  |
| **Operadora**               | CONTRATADA                                                                                            | Opera o sistema conforme as instruções da PartyX; executa exportação e remoção **mediante solicitação formal da PartyX**; avisa a PartyX de incidentes |
| Suboperadores (a confirmar) | Provedor de nuvem e banco (Google Cloud, Neon), gateway de pagamento (D-01), serviço de e-mail (D-09) | Definir e listar quando contratados                                                                                                                    |

## Inventário de dados pessoais

| Dado                                                                                    | Onde                                            | Para quê                                  | Quem acessa                                                    | Retenção                                                                        |
| --------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Nome, e-mail, CPF, telefone                                                             | `users`                                         | Conta, compra, ingresso, atendimento      | Titular; administrador (CPF mascarado nas telas e exportações) | Decisão da PartyX; removível por anonimização                                   |
| Nome do titular do ingresso                                                             | `tickets.holder_name`                           | Ingresso e portaria                       | Titular, administrador, validador                              | Idem                                                                            |
| Aceite dos Termos e da Privacidade (versões, data, IP, navegador)                       | `consents`                                      | Prova do aceite                           | Administrador                                                  | Versões e datas ficam; IP e navegador saem na anonimização                      |
| Pedidos, valores, forma de pagamento, ingressos, entradas                               | `orders`, `order_items`, `tickets`, `checkins`  | Operação, taxa do contrato, contabilidade | Administrador                                                  | **Mantidos** (obrigação contratual e fiscal da PartyX); decisão do prazo é dela |
| Notificações do gateway                                                                 | `payment_events`                                | Idempotência e auditoria                  | Sistema                                                        | Mantidas; campos pessoais mascarados na anonimização                            |
| Sessões (IP, navegador), tentativas de login (e-mail, IP), tokens de recuperação (hash) | `sessions`, `login_attempts`, `password_resets` | Segurança                                 | Sistema                                                        | **Configurável** (abaixo); sem prazo configurado, não apaga                     |
| Fila de e-mails                                                                         | `email_log`                                     | Entrega e reenvio                         | Sistema                                                        | Sem endereço guardado (só `user_id` e modelo)                                   |
| Lista de autorizados de evento privado (e-mail, CPF, nome opcional, situação, observação) e solicitações de acesso (D-92) | `event_access` | Controle de quem compra em evento privado | Administrador (CPF mascarado nas telas e no CSV); a própria conta vê só a própria situação | **6 meses depois do evento**, apagada pela limpeza diária; sai na anonimização |
| Trilha de auditoria                                                                     | `audit_log`                                     | Prestação de contas                       | Administrador                                                  | Só inclusão; **sem dado pessoal**                                               |
| Cartão (PAN, CVV)                                                                       | **não existe aqui**                             | —                                         | —                                                              | O cartão vai direto ao gateway                                                  |

## Direitos do titular, a pedido da PartyX

Rotas só de administrador (`/api/admin/privacy/...`), sem cache, com limite por pessoa e auditoria. Procedimento:

1. A PartyX recebe e valida o pedido do titular e abre um **protocolo** próprio. A CONTRATADA só executa com esse protocolo.
2. **Localizar:** `GET /admin/privacy/subjects?email=` ou `?cpf=` (busca exata, sem listagem). Registra a consulta.
3. **Cópia dos dados (acesso):** `GET /admin/privacy/subjects/:id/export?protocolo=...` devolve um JSON com cadastro, aceites, pedidos, ingressos, e-mails enviados e sessões. Inclui o CPF completo (é o dado do próprio titular) e **não** inclui hashes de senha e token, assinatura do QR e identificadores do gateway. Entregue à PartyX por canal seguro e **apague o arquivo depois**.
4. **Remoção (anonimização):** `POST /admin/privacy/subjects/:id/anonymize` com `reference` (protocolo), `reason`, `confirm: true` e, se houver ingressos válidos de evento futuro, `acknowledgeValidTickets: true`.
   - **Remove:** nome, e-mail, CPF, telefone, senha, IP e navegador do aceite, sessões, tokens de recuperação, tentativas de login, nome nos ingressos e campos pessoais do payload do gateway. O acesso é desativado de forma irreversível.
   - **Mantém:** pedidos, valores, datas de aprovação, ingressos, entradas, pagamentos, versões e datas do aceite e a auditoria. A **taxa mensal não muda** (testado).
   - **Recusa:** pedido aguardando pagamento (aguarde expirar ou cancele); perfil de equipe (desative o acesso); titular já anonimizado.
   - Ingressos válidos de evento futuro continuam valendo com o nome "Titular removido". Se a PartyX quiser cancelá-los, faça antes, pelo painel.
5. **Não é desfeito.** A reversão da migração é recusada enquanto houver titular anonimizado.

Não há tela: é procedimento operacional. Não há prazo legal embutido: a PartyX define em quanto tempo responde.

## Retenção configurável (D-62)

Variáveis, em dias, **sem valor padrão** (vazio = não apaga): `RETENTION_LOGIN_ATTEMPTS_DAYS`, `RETENTION_SESSIONS_DAYS` (só sessões já encerradas), `RETENTION_PASSWORD_RESETS_DAYS`. A rotina `POST /internal/jobs/purge-retention` (autenticada como as demais) aplica. Pedidos, ingressos, pagamentos e auditoria não são apagados por rotina: o prazo é decisão da PartyX com a contabilidade.

**Produção, desde 14/10/2026 (decisão do responsável, igual à Política de Privacidade 1.0):** as três com 180 dias (6 meses) no `infra/producao/env.prod.yaml`. O agendamento é a rotina `partyx-limpeza-retencao` do Cloud Scheduler, todo dia às 04:05 (America/Sao_Paulo), criada pelo `deploy.sh varredura` junto com a rotina diária. Os logs de acesso do Google ficam com a retenção padrão de 30 dias, também por decisão do responsável.

**Evento privado (D-92, 20/10/2026):** a lista de autorizados e as solicitações (`event_access`) têm prazo decidido, sem variável: a mesma rotina `purge-retention` apaga as linhas de eventos cujo fim (ou início, sem fim) passou de 6 meses, sempre. A anonimização de um titular apaga as linhas da conta, do e-mail e do CPF dele. A trilha guarda e-mail e CPF mascarados. A cópia dos dados do titular traz as linhas dele, com a observação da decisão. Política de Privacidade 1.3 aprovada em 20/10/2026 (seções 2, 3, 6 e 7; `registros/evento-privado-textos-propostos.md`), com a avaliação de legítimo interesse em `registros/lia-evento-privado.md`, a assinar pelo encarregado; o `deploy.sh conferir` recusa a release com a 0019 sem ela.

## Incidente de segurança

1. **Identificar:** alerta, relato de usuário ou da equipe, anomalia nos logs. Registrar quem, quando e como foi percebido.
2. **Conter:** revogar sessões e credenciais afetadas, trocar segredos e chaves (`QR_HMAC_KEYS` aceita nova versão sem invalidar ingressos), suspender a rota ou a venda (`SALES_OPEN=false`), preservar logs.
3. **Avaliar:** quais dados, de quantos titulares, por quanto tempo, se foram lidos ou só expostos, risco ao titular. Os logs e a auditoria não têm dado pessoal, mas o banco tem.
4. **Avisar a PartyX sem demora indevida**, com o que se sabe e o que não se sabe, para ela decidir sobre a comunicação aos titulares e à autoridade. A CONTRATADA **não** comunica titulares nem a autoridade por conta própria.
5. **Corrigir** a causa, restaurar o serviço e conferir com teste.
6. **Registrar** linha do tempo, decisões, correção e lições; guardar junto aos logs contratuais (`registros/`).

## Pendente do cliente

A Política de Privacidade 1.0 (14/10/2026) trouxe bases legais, prazos de guarda, suboperadores, encarregado (Bernardo Peixoto Fortes Bittencourt), canal do titular (partyx992@gmail.com desde a 1.1; antes, o e-mail pessoal do Bernardo) e prazo de resposta (15 dias). Falta: confirmação escrita da PartyX sobre o texto e quem na PartyX autoriza cada remoção.

## Menores de idade (14/10/2026, D-85)

| Dado | Onde | Para quê | Retenção |
|---|---|---|---|
| Data de nascimento | `users.birth_date` | Idade na data do evento, classificação etária, termo de menor | Como a conta; a anonimização apaga |
| Aceite do Termo de Ciência (versão, idade, data, IP, navegador) | `minor_term_acceptances` | Prova do aceite, ligada ao pedido | Fica (prova); a anonimização apaga IP e navegador |
| Comprador menor no pedido | `orders.buyer_minor` | Aviso na portaria | Fica com o pedido |
| Confirmação da autorização na entrada | `checkins.minor_authorization_received` | Prova da conferência | Fica com a leitura |
| Termo de Autorização em papel | Portaria (PartyX) | Controle de acesso | 6 meses após o evento e destruído (Política 1.1): procedimento da PartyX |

A cópia dos dados do titular inclui a data de nascimento e os aceites de menor. O PDF da autorização não imprime CPF; o do pedido sai só para o dono; o em branco não tem dado pessoal.
