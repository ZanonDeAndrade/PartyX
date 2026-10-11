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

Variáveis, em dias, **sem valor padrão** (vazio = não apaga): `RETENTION_LOGIN_ATTEMPTS_DAYS`, `RETENTION_SESSIONS_DAYS` (só sessões já encerradas), `RETENTION_PASSWORD_RESETS_DAYS`. A rotina `POST /internal/jobs/purge-retention` (autenticada como as demais) aplica. **Falta criar o agendamento no Cloud Scheduler** (pendente de infraestrutura). Pedidos, ingressos, pagamentos e auditoria não são apagados por rotina: o prazo é decisão da PartyX com a contabilidade.

## Incidente de segurança

1. **Identificar:** alerta, relato de usuário ou da equipe, anomalia nos logs. Registrar quem, quando e como foi percebido.
2. **Conter:** revogar sessões e credenciais afetadas, trocar segredos e chaves (`QR_HMAC_KEYS` aceita nova versão sem invalidar ingressos), suspender a rota ou a venda (`SALES_OPEN=false`), preservar logs.
3. **Avaliar:** quais dados, de quantos titulares, por quanto tempo, se foram lidos ou só expostos, risco ao titular. Os logs e a auditoria não têm dado pessoal, mas o banco tem.
4. **Avisar a PartyX sem demora indevida**, com o que se sabe e o que não se sabe, para ela decidir sobre a comunicação aos titulares e à autoridade. A CONTRATADA **não** comunica titulares nem a autoridade por conta própria.
5. **Corrigir** a causa, restaurar o serviço e conferir com teste.
6. **Registrar** linha do tempo, decisões, correção e lições; guardar junto aos logs contratuais (`registros/`).

## Pendente do cliente

Base legal de cada finalidade, prazos de retenção (D-62), textos de privacidade (D-11), lista de suboperadores, encarregado (DPO) e canal do titular, prazo de resposta aos pedidos e quem na PartyX autoriza cada remoção.
