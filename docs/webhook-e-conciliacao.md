# Webhook, conciliação e confirmação de pagamento

Implementado em 01/10/2026 (Prompt 12): RF-35, RF-37, CA-18 e CA-P1 a CA-P5, **com o gateway fictício**. Código em `server/src/payments/` (`reconcile.ts`, `notifications.ts`, `jobsAuth.ts`), `server/src/api/webhooks.ts` e `paymentAdmin.ts`. **Sem migração** (usa `payment_events`, `orders`, `reservations`, `tickets`, `audit_log`).

> **Limites desta etapa.** O Prompt 11 (gateway real em sandbox) está **bloqueado**: o cliente não escolheu o gateway (D-01). Tudo foi provado contra o adaptador fictício, cuja assinatura de webhook é inventada. **A assinatura, os eventos e os estados do gateway real precisam ser conferidos quando ele existir.** Os ingressos (QR, HMAC) foram feitos no Prompt 13 (`ingressos.md`) e entram **na mesma transação** da confirmação.

## Princípios

1. **A notificação não aprova nada.** Ela só diz "olhe o pagamento X". O servidor **reconsulta o gateway** e age sobre a resposta da API (um webhook que afirma "aprovado" com o gateway dizendo "pendente" não muda o pedido: testado).
2. **Conferência antes de aprovar** (`checkSnapshotAgainstOrder`): referência do pedido, valor, moeda BRL, **conta da PartyX** e forma de pagamento. Qualquer divergência: não aprova, não emite, grava na trilha (`pagamento.divergente`, uma vez por combinação) e gera log `alert=pagamento_divergente`.
3. **Nenhuma chamada externa dentro de transação.** Consulta primeiro; depois uma transação curta com o pedido trancado. Há teste que consulta `pg_stat_activity` no instante da chamada ao gateway e não encontra transação aberta.
4. **Idempotência em camadas:** evento com chave única; pedido trancado (`FOR UPDATE`) e estado conferido; `approvalOutcome` ignora estados finais; emissão idempotente por `(item, unidade)`.

## Webhook (`POST /api/webhooks/payments`)

Sem sessão, sem CSRF (é servidor para servidor); registrado antes do contexto de autenticação. Autenticado pela **assinatura do gateway**, sobre o corpo bruto (`verifyNotification`).

| Situação | Resposta | O que fica registrado |
|---|---|---|
| Assinatura ausente, malformada, errada, corpo alterado ou vencida (CA-P4) | 401 | Linha em `payment_events` com `signature_valid=false` e **só metadados**: motivo, tamanho, 16 caracteres do SHA-256 do corpo, nomes dos cabeçalhos. Nunca o corpo nem os valores. Nunca é processada. Teto de 30 gravações por minuto por origem |
| Válida, evento novo | 200 `processada` com o desfecho | Evento gravado com id único; processado |
| Válida, evento repetido já processado (CA-P3) | 200 `duplicada` | Nada novo |
| Válida, repetido mas a primeira tentativa falhou | processa agora | — |
| Falha ao consultar o gateway ou erro interno | 503 (o gateway reenvia) | Evento pendente, `attempts` e erro; a conciliação reprocessa (até 10 tentativas, depois fica para revisão com log `alert=webhook_falhou`) |
| Corpo acima de 256 KB | 413 | — |

Um evento forjado **não ocupa** o id de um evento verdadeiro (a unicidade vale só entre eventos válidos). Pagamento desconhecido: processado com o motivo `sem_pedido`.

Decisão D-38: o webhook responde **depois** de processar (uma consulta e uma transação curta), porque o Cloud Run não garante processamento depois da resposta.

## Desfechos (`reconcilePayment`)

| O gateway informa | O pedido faz |
|---|---|
| `aprovado`, reserva válida | `pendente → pago`; reserva `convertida`; `quantity_sold` sobe; ingressos emitidos (Prompt 13); `paid_at` = instante da aprovação informado pelo gateway |
| `aprovado`, reserva vencida **com estoque** | Mesmo caminho, com as linhas dos tipos trancadas e a conta refeita (`confirmado_tardio`) |
| `aprovado`, reserva vencida **sem estoque** | `pago_sem_estoque`: **nada é emitido**, `paid_at` é guardado, log `alert=pago_sem_estoque`, trilha `pagamento.sem_estoque`, **e-mail a cada administrador ativo** (ver abaixo) e o pedido aparece em `GET /api/admin/payments/exceptions` para o **cliente estornar no gateway**. A plataforma não estorna sozinha. É tudo ou nada: se um só tipo faltar, o pedido inteiro fica sem estoque, sem emissão parcial |
| `recusado` (CA-P2) | `pendente → nao_concluido`; reserva liberada (o estoque volta na hora); sem ingresso |
| `expirado` / `cancelado` | `expirado`; reserva `expirada` |
| `estornado` / `contestado` (CA-P5) | `pago → estornado` ou `contestado`; ingressos ainda válidos `cancelados` (a portaria passa a recusar); **`paid_at` não muda** (a taxa mensal segue contando). Ingresso já usado fica `utilizado`. Estorno repetido não faz nada |
| Estorno de pedido nunca aprovado aqui, ou combinação sem previsão | Nada muda; trilha `pagamento.estorno_fora_de_fluxo` e log para revisão manual |

Eventos **fora de ordem** são inofensivos porque cada notificação reconsulta o estado atual: um aviso antigo de "aprovado" chegando depois do estorno não ressuscita o pedido.

**Estoque após estorno:** nada é devolvido nem decrementado. A reposição depende da decisão D-14 do cliente ("não implementar nenhuma das duas até a resposta").

## Conciliação agendada (webhook perdido)

> **Cadência desde 10/10/2026** (antes: tarefa aos 10 min, depois 15 e 30, e varredura só diária, o que não cumpria "a cada poucos minutos" da documentação; achado da auditoria):
>
> 1. **Tarefas por pedido (Cloud Tasks)**, a partir da **criação da cobrança**: +1, +2, +4 e +8 min, e a última **no fim da reserva + margem** (padrão 2 min). Nenhuma passa desse limite. Cada tarefa só agenda a seguinte se o pagamento seguir sem decisão; pedido resolvido encerra a cadeia. Se a última ainda vê "pendente" no gateway, o pedido expira localmente e fica a trilha `conciliacao.revisao_manual` (alerta `conciliacao_revisao_manual`). Cálculo puro em `server/src/domain/reconcileSchedule.ts`; tarefa em `server/src/payments/reconcileTask.ts`; rota `POST /api/internal/tasks/reconcile-order` (OIDC).
> 2. **Varredura de pendentes (Cloud Scheduler, a cada 5 min):** `POST /api/internal/jobs/reconcile-pending` reconsulta os pedidos com cobrança criados nas últimas 24 h que ainda podem mudar (pendente, vencido, não concluído), vence reservas e reprocessa notificações pendentes. **Uma execução por vez:** trava com prazo na tabela `job_leases` (sem `pg_advisory_lock` de sessão, que não é confiável na conexão pooled do Neon); quem chega com outra em andamento responde 200 `em_execucao`; uma execução que cai solta a trava quando o prazo vence.
> 3. **Rotina diária** (`reconcile-payments`, 04:00): fila de e-mails, pedidos de até 3 dias e ingressos que faltarem.
>
> Tudo por variável de ambiente: `RECONCILE_TASK_OFFSETS_SECONDS` (`60,120,240,480`), `RECONCILE_TASK_MARGIN_SECONDS` (`120`), `RECONCILE_SWEEP_WINDOW_HOURS` (`24`), `RECONCILE_SWEEP_LOCK_SECONDS` (`240`), `RECONCILE_SWEEP_BATCH` (`100`); a agenda da varredura é `PENDING_SCHEDULE` nos scripts de infraestrutura. **Custo:** a varredura a cada 5 min mantém o Neon acordado (README-DEPLOY.md, seção 8). A idempotência não mudou: tarefas e varreduras simultâneas do mesmo pedido continuam sem duplicar nada (testado).

`POST /api/internal/jobs/reconcile-payments`, chamado pelo **Cloud Scheduler** (na homologação a cada 2 minutos: `infra/homologacao/scheduler.sh`, **não executado**). Faz, nesta ordem: vence reservas, reprocessa eventos pendentes, reconsulta pedidos com cobrança que ainda podem mudar (pendentes; vencidos ou não concluídos nos últimos 3 dias, porque uma aprovação pode chegar atrasada).

- **Autenticação:** token OIDC do Google em nome da conta `partyx-scheduler`, com o endereço do serviço como `audience`. O serviço confere assinatura, audience e e-mail (`JOBS_AUDIENCE`, `JOBS_CALLER_EMAIL`). Sem segredo compartilhado. Qualquer falha: 401 igual. Sem configuração: 503. **Atenção:** se `PUBLIC_BASE_URL` mudar para um domínio próprio, o `audience` do job precisa acompanhar.
- **Segura com execuções simultâneas:** cada pedido é "reservado" para uma execução (`FOR UPDATE SKIP LOCKED` e carimbo de `updated_at`, intervalo mínimo de 60 s), então duas execuções pegam lotes diferentes; e mesmo que pegassem o mesmo, a confirmação é idempotente (testado com 5 e 6 execuções paralelas).
- Falha numa consulta não impede as outras (log `alert=reconciliacao_falhou`).

## Simulação local

`POST /api/dev/mock-gateway/:pedido/:estado` só existe com `APP_ENV=local` **e** `PAYMENT_GATEWAY=mock`. Muda o estado no fictício e entrega ao servidor uma notificação assinada, pelo mesmo caminho do webhook. A tela do pedido mostra o simulador só nesse ambiente. Em homologação e produção a rota não existe (testado).

## O que foi verificado (PostgreSQL real, 47 testes novos)

CA-P1 (aprovação e emissão atômica), CA-P3 (6 entregas simultâneas do mesmo evento e 4 com ids diferentes: um pedido pago, ingressos uma vez), CA-P4 (5 formas de assinatura inválida, sem vazar corpo, teto de gravação, id forjado não ocupa o real), conferência (valor, conta, pedido, moeda), webhook perdido recuperado, gateway fora do ar e reenvio, recusa devolvendo o estoque, aprovação tardia com e sem estoque (inclusive a **corrida** de uma aprovação tardia contra a reserva da última unidade, 6 rodadas: nunca vende duas vezes), estorno, chargeback, ingresso usado, eventos fora de ordem. **Mutações:** sem a conferência 6 testes falham; sem a trava dos tipos 1; ignorando a assinatura 3; emitindo sempre no pagamento tardio 5. Verificação no navegador: Pix → simulador "aprovado" → a tela passa a "Pago" sozinha, sem recarregar.

## Achado durante a verificação

O teste no navegador mostrou que respostas **privadas** (pedido, conta, painel) saíam com `Cache-Control: public, max-age=15`: o `use('*')` da vitrine (Prompt 08) valia para todas as rotas registradas depois. Corrigido (`/public/*` apenas) e protegido por teste que verifica pedido, `auth/me` e painel. Não houve implantação com esse defeito (nada foi publicado desde o Prompt 08), mas o defeito existia desde então.

## O que **não** foi verificado

- Qualquer gateway real: assinatura, formato de evento, tempo de resposta, limite de chamadas, comportamento de Pix vencido e de estorno parcial.
- Estorno **parcial** (hoje qualquer `estornado` cancela o pedido inteiro) e vários pagamentos por pedido.
- Scheduler real, token OIDC real e logs no Cloud Logging; o alerta no Cloud Monitoring não foi criado (D-41).
- Carga (Prompt 24) e o comportamento do `SKIP LOCKED` na conexão **pooled** do Neon.
- Emissão dos ingressos de verdade (Prompt 13): o teste usa um emissor de teste na mesma transação.

## Pagamento aprovado sem ingresso disponível (procedimento provisório, 10/10/2026)

A decisão D-13 (canal, responsável e prazo) segue **pendente**. Foi implementado só o mínimo e reversível; nada aqui é resposta da PartyX.

- **Aviso por e-mail:** na mesma transação que grava `pago_sem_estoque`, a fila (`email_log`) recebe um item `pagamento_sem_estoque` para **cada administrador ativo** (chave `sem_estoque:<pedido>:<administrador>`, então notificação repetida não duplica). Modelo "Pagamento recebido sem ingresso disponível": número do pedido, evento, comprador (nome e e-mail, **sem CPF**), valor, data da aprovação, referência no gateway e a orientação "o estorno deve ser feito pela PartyX no painel do gateway; a plataforma não estorna automaticamente", com botão para `/admin/excecoes`. A entrega é tentada na hora e segue a política da fila (retentativas e alerta `email_falhou`). Quem deixou de ser administrador ou foi desativado não recebe.
- **Painel:** aba **Exceções** com contador e alerta no topo de **todas** as páginas do painel enquanto houver caso em aberto. Cada caso pode ser **marcado como tratado** (`POST /api/admin/payments/exceptions/:pedido/treat`, só administrador, motivo obrigatório de 5 a 500 caracteres). A marcação é **só** uma linha `pagamento.sem_estoque_tratado` na trilha (com o administrador e o motivo): o pedido continua `pago_sem_estoque`, nada é estornado, nenhum estoque muda e a taxa não muda. Uma marcação por pedido (a segunda responde 409, inclusive com dois administradores ao mesmo tempo).
- **Comprador:** a tela do pedido mostra o contato **da PartyX** se `PARTYX_SUPPORT_EMAIL` e/ou `PARTYX_SUPPORT_WHATSAPP` estiverem configurados (o servidor só manda o contato nesse estado de pedido). Sem configuração, mensagem neutra, sem prazo e sem promessa. Nunca há contato da contratada.
- **Taxa (D-54):** a fórmula **não mudou**. O relatório mensal ganhou a seção **"Exceções para análise"** (pedido, unidades, valor, referência no gateway, tratado ou em aberto, totais), também no extrato `ops:fee`.

## Decisões abertas

D-01 a D-04 (gateway), D-14 (reposição de estoque), D-38, D-39, D-40 (chargeback ganho) e D-41 (canal do aviso de "pago sem estoque").


## Casos difíceis (Prompt 22, 05/10/2026)

Só testes e verificação; **nenhuma correção de código foi necessária**. Arquivo: `server/src/api/reconcile.integration.test.ts`, bloco "casos difíceis de estorno, chargeback e interrupção" (8 testes novos; arquivo com 54). PostgreSQL real, gateway **fictício** (não é sandbox de gateway real: D-01 segue aberto, então a evidência abaixo vale para a lógica da plataforma, não para o comportamento do provedor).

| Cenário | Prova |
|---|---|
| Queda do processo no meio da emissão (falha depois da 1ª unidade) | 503; pedido segue `pendente`, reserva `ativa`, estoque 0, nenhum ingresso e nenhum e-mail na fila; evento fica pendente com `attempts=1` |
| Retomada por reentrega do gateway | Conclui: `pago`, 3 ingressos, estoque 3, uma vez só |
| Retomada pela conciliação agendada (sem reentrega) | Conclui sozinha |
| Estorno e aprovação chegando ao mesmo tempo (4 + 4 em paralelo) | Termina `estornado` conforme o gateway, ingressos cancelados, **uma** trilha de estorno |
| Estorno com valor divergente (devolução parcial) | `divergente`: pedido segue `pago`, ingressos válidos, uma trilha. **Estorno parcial não cancela nada e exige revisão manual** |
| Chargeback de "pago sem estoque" | Ignorado e registrado como fora de fluxo; sem ingresso |
| Estoque após estorno | Continua consumido e uma nova compra é recusada (D-14 pendente: nenhuma reposição automática) |
| Estoque após recusa | Volta na hora (outro comprador leva as duas unidades) |
| Taxa mensal (CA-29) | 8 ingressos pagos em outubro: contam 8 (R$ 8,00) antes e depois de estorno, chargeback e cancelamento de ingresso; a soma por situação atual fecha em 8; a virada de mês não move a venda |

Já cobertos antes e mantidos: webhook duplicado, fora de ordem, assinatura falsa, pedido/valor/conta/moeda divergentes, webhook perdido recuperado, gateway fora do ar/timeout, cartão recusado, estorno repetido, ingresso utilizado.

**Não verificado:** sandbox ou simulador fiel de um gateway real; reordenação e atraso reais de notificações; estorno parcial como regra de negócio (hoje cai em divergência); chargeback ganho pelo cliente (D-40).
