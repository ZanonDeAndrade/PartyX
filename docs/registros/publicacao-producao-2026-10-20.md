# Publicação em produção: evento privado (D-92), Privacidade 1.3, Termos 1.6 e Cancelamento 1.2 (20/10/2026)

Release `release-2026-10-20` (commit `f312704`), publicada com OK do responsável (Arthur): "coloque no ar". O Bernardo aprovou o evento
privado e os três textos por WhatsApp em 20/10/2026 (informado pelo responsável). Horários em UTC (Brasília = UTC menos 3).

| Campo | Valor |
|---|---|
| Versão | tag anotada `release-2026-10-20`, commit `f312704` |
| Migração | `0019_evento_privado` (só expande: tipos `event_access_status` e `event_access_origin`, tabela `event_access`, coluna `events.is_private`, dois modelos de e-mail, DELETE para o `partyx_app`; reversão em `drizzle/rollback/0019_evento_privado.down.sql`, que recusa com evento privado ou com alguém na lista) |
| Imagem | `partyx-api:release-2026-10-20-f312704` (Cloud Build `651f1951`, 1 min 51 s); textos dentro da imagem iguais aos da tag (sha256 termos `fd59bf4eca724fb2`, privacidade `13993d561ec17465`, cancelamento `857e1e00fa494c76`) |
| Backup sob demanda | execução `partyx-backup-nhl7t`, cópia `partyx-20261020T141001Z.dump` (131.353 bytes), `check-backup.sh` OK, antes da migração |
| Migração aplicada | execução `partyx-migrate-ql5pd`; conferência só de leitura (abaixo) |
| Revisão | `partyx-00056-lac` |
| No ar desde | 20/10 23:00 UTC (20:00 BRT) |
| Revisão anterior | `partyx-00054-nor` |
| `env.prod.yaml` | `TERMS_VERSION 1.6`, `PRIVACY_VERSION 1.3`, `CANCELLATION_VERSION 1.2`, vigência 2026-10-20; o resto igual (venda aberta, cadastro aberto, e-mail ligado, Turnstile desligado, sem instância mínima); `GLOBAL_SIGNUP_DUPLICATES_PER_HOUR` ausente, vale o padrão 100 |

## O que foi ao ar

Em relação à `release-2026-10-19e` (`7a0aa49`):

- Evento privado (D-92): chave na edição do evento, aba Acesso, página Solicitações com contador, selo, solicitação de acesso pela
  página do evento, e-mails "Solicitação recebida" e "Acesso liberado", compra e transferência só para conta autorizada, conferidas
  no servidor, lista apagada 6 meses depois do evento. Registro: `evento-privado.md`.
- Política de Privacidade 1.3, Termos de Uso 1.6 e Política de Cancelamento 1.2, vigência 20/10/2026. As 20 contas de cliente tinham
  aceitado versões anteriores (1.1/1.1: 1; 1.2/1.2: 14; 1.4/1.2: 1; 1.5/1.2: 4) e aceitam as novas no próximo login ou checkout.
- S-02 da auditoria: teto de 100 respostas "já tem cadastro" por hora no site todo (`correcao-s02-2026-10-20.md`).
- `?voltar=` só com caminho relativo do próprio site.
- Cópia dos dados do titular com as linhas da lista de acesso (evento, situação, origem, datas e observação, sem quem decidiu).
- Sem mudança: a transição da vitrine (variante A) e as logos das formas de pagamento já estavam no ar (19d e 19e).
- Docs e scripts de operação da 19e (publicação, limpeza dos dados de teste, PX-10001), unidos por merge; não entram na imagem.

## Linha do tempo

| Hora | Passo | Resultado |
|---|---|---|
| ~14:07 | tag + `deploy.sh conferir` (com `GO_LIVE_CONFIRMED` e `NO_FICTITIOUS_DATA`) | banco de produção confirmado; trava dos textos do evento privado OK na pasta e na tag |
| 14:07 a 14:09 | `deploy.sh build` | imagem pronta |
| 14:09:58 a 14:10:07 | backup sob demanda | `partyx-backup-nhl7t`, cópia conferida |
| 14:10 | conferência só de leitura antes da 0019 | 19 migrações, nada da 0019, `teste01-2` publicado, taxa 7,5% |
| 14:10:40 a 14:10:49 | `deploy.sh migrate` | `partyx-migrate-ql5pd` ok |
| 14:10 | conferência só de leitura depois da 0019 | 20 migrações; `event_access` vazia, 7 regras e 6 índices; `teste01-2` (único evento) com `is_private` falso; 2 tipos e 2 modelos de e-mail novos; `partyx_app` com DELETE; taxa 7,5% |
| 14:11:24 | `deploy.sh candidata` | `partyx-00056-lac` sem tráfego; teste rápido 15 de 15 (Termos 1.6, Privacidade 1.3, Cancelamento 1.2, vigência 20/10) |
| 14:11 a 14:12 | conferências pela candidata (abaixo) | bateria 58 de 58; Chromium e Firefox 18 de 18 |
| 14:12 a 23:00 | espera do OK do responsável | a `partyx-00054-nor` atendeu com a 0019 aplicada (só expande) |
| 23:00 | `deploy.sh virar` | 100% na `partyx-00056-lac`; teste rápido 15 de 15 |
| 23:00 a 23:01 | conferências pelo domínio (abaixo) | bateria 58 de 58; Chromium e Firefox 18 de 18 |
| 23:00 a 23:30 | logs do Cloud Run | 315 requisições, nenhuma 5xx, nenhum erro |

## Conferências

| Verificação | Candidata | Domínio |
|---|---|---|
| Teste rápido do `deploy.sh` (15 itens, com versão e vigência dos cinco textos) | 15 de 15 | 15 de 15 |
| Bateria por HTTPS (`bateria-i`, `NONCE=1`): a da 19e com as versões novas, mais os trechos do evento privado nos três textos, `teste01-2` com `privado=false`, rotas de acesso sem login 401, `/admin/solicitacoes` sem login 302, painel publicado com a chave, a aba Acesso e o aviso da observação | 58 de 58 | 58 de 58 |
| Playwright 390 px, Chromium e Firefox: `teste01-2` sem selo nem caixa de acesso, R$ 30,00 e R$ 25,00, "Vendas a partir de 22/10"; páginas dos documentos com Versão 1.6, 1.3 e 1.2 e 20/10/2026 e o trecho novo; vitrine sem selo; sem erro de página nem 5xx | 18 de 18 | 18 de 18 |
| Logs do Cloud Run desde a virada | | 315 requisições, todas na `partyx-00056-lac`: 276 de 200, 3 de 201, 3 de 302, 24 de 401, 4 de 403, 2 de 404, 2 de 422, 1 de 301; nenhuma 5xx; nenhuma linha de erro (2 avisos "notificação de pagamento recusada, formato inválido", do webhook inválido da bateria) |

**Sem conta logada.** Não há conta de cliente nem de administrador de teste em produção (`NO_FICTITIOUS_DATA`), e nenhuma foi criada:

- Novo aceite numa compra: a revisão publica 1.6 e 1.3 e nenhuma das 20 contas aceitou essas versões, então a regra do servidor
  (`consentPending`) pede o aceite a todas no login e no checkout; coberto pelos testes de integração. Não foi feita compra real.
- Chave "Evento privado": o código do painel publicado tem a chave, a aba Acesso, a página Solicitações e o aviso; o banco mostra o
  `teste01-2` com a chave desligada. A tela logada não foi vista e a chave não foi tocada.

## Uso real depois da virada

Entre 23:06 e 23:10 o painel foi usado com login de administrador num evento `teste02` (criado às 22:57, ainda na revisão anterior):
a chave ligada, uma pessoa adicionada na lista, publicação recusada sem tipo de ingresso (422), tipo criado e evento publicado, uma
solicitação de acesso pela página com login de cliente (201), a aprovação e o evento encerrado às 23:09:58. Leitura do banco em 21/10 00:37 UTC
(só contagens): `teste02` encerrado e privado, 1 linha na lista (autorizada, origem solicitação), e-mails "Solicitação recebida" e
"Acesso liberado" enviados (1 de cada), nenhum pedido nem ingresso. O `teste01-2` continua publicado e aberto a todos.

O `teste02` é um evento de teste em produção: a lista dele sai sozinha 6 meses depois do evento; apagar o evento antes disso é decisão
do responsável (como na limpeza de 19/10, `limpeza-dados-de-teste-2026-10-19.md`).

## Pontos para o responsável

- Painel e solicitação conferidos em uso real no `teste02` (acima). Falta ver, com uma conta de cliente, o pedido de aceite dos
  textos novos no login ou no checkout.
- `teste01-2` continua público e com venda programada: Masculino a partir de 22/10 01:29 e Feminino a partir de 22/10 23:21 (Brasília).
- Ligar a chave com vendas em andamento não cancela nada: pedido pago fica, pendente anterior pode ser pago, pedido novo só com
  autorização.
- Avaliação de legítimo interesse (`lia-evento-privado.md`): assinatura do Bernardo em PDF, pendente, sem travar a publicação.
- Resumo diário de solicitações: só proposto.

## Voltar atrás

- **Só código:** `PROJECT=partyx-producao REVISAO=partyx-00054-nor ./infra/producao/deploy.sh rollback`. Convive com a 0019 (só
  expande). A revisão anterior não conhece a lista: **um evento privado fica com a compra aberta a todos** enquanto ela estiver no ar
  (hoje só o `teste02`, encerrado, sem venda possível). Os textos voltam para Termos 1.5, Privacidade 1.2 e Cancelamento 1.1 (variáveis da revisão anterior).
- **Banco:** `drizzle/rollback/0019_evento_privado.down.sql` só sem evento privado e sem ninguém na lista: hoje **recusa**, por causa do `teste02`.
