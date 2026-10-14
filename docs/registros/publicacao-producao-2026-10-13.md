# Publicação em produção (13 e 14/10/2026)

Registro da execução. Autorização: `autorizacao-publicacao-producao-2026-10-13.md`. Horários em UTC (Brasília = UTC menos 3 h).

## Resumo

| Item | Registro |
|---|---|
| Projeto | `partyx-producao`, Cloud Run `partyx` (São Paulo), atrás do Firebase Hosting |
| Endereço público | `https://partyx-producao.web.app` (o domínio `partyx.com.br` ainda não está ativo, ver "O que ficou pendente") |
| Versão | tag local `release-2026-10-13`, commit `e9e31e9`, a mesma validada em homologação (`partyx-hml-00012-tqz`, roteiro 11.2 com 21 de 21) |
| Imagem | `partyx-api:release-2026-10-13-e9e31e9` |
| Revisão no ar | `partyx-00003-xeq`, 100% do tráfego desde 14/10 00:49 |
| Revisão anterior | `partyx-00002-bkn`, mantida para rollback |
| Gateway | Mercado Pago de produção, conta `3563483345`, com as vendas fechadas |
| Estado | `SALES_OPEN=false`, `SIGNUP_OPEN=false`, `VISUAL_APPROVED=false` |

## Sequência executada

| Horário | Passo | Resultado |
|---|---|---|
| 13/10 23:22 | Backup antes da migração (`partyx-20261013T232229Z`) e restauração de conferência em banco isolado | ok, 5 migrações esperadas |
| 13/10 | Branch do Neon `pre-release-2026-10-13` (`br-young-bird-b6mfou1b`) como ponto de retorno do banco | criada |
| 13/10 | Build da imagem a partir da tag (git archive) | ok |
| 13/10 23:29 | Migrações 0005 a 0008 | aplicadas, 9 de 9; banco com 0 linhas de dados |
| 13/10 23:30 | Backup depois da migração (`partyx-20261013T233020Z`) e restauração em `restore_ensaio2` | 20 de 20 verificações, esquema idêntico |
| 14/10 00:25 | `mp-webhook-secret` versão 4, gravada pelo responsável | ok |
| 14/10 | Candidata `partyx-00003-xeq` sem tráfego, com teste rápido | 7 de 7 |
| 14/10 00:49 | Virada (`deploy.sh virar`) e teste rápido depois da virada | 100% na revisão nova; 7 de 7 |
| 14/10 00:50 | `deploy.sh varredura` | **falhou**: o gcloud exige `--update-headers` para atualizar um job existente e o script usava `--headers`. O job não foi alterado e a rotina passou a receber 403 da revisão nova, que exige `X-Forwarded-Host`. Sem dano: vendas fechadas e banco vazio. Script corrigido no commit `4960044` |
| 14/10 01:58 | `deploy.sh varredura` repetido, com autorização | job atualizado com o cabeçalho; execução manual respondeu **200** |
| 14/10 01:59 | `deploy.sh alertas` | criados `estorno_parcial`, `cobranca_duplicada` e `limite_global_atingido` |
| 14/10 02:00 | `infra/operacao/uptime.sh` | verificação `partyx-saude-publica` (a cada 5 min, três regiões, exige 200 e `"database":"ok"`) e política "PartyX: saúde indisponível" |
| 14/10 02:01 | Alerta de teste: linha de log sintética de `webhook_falhou`, marcada como TESTE (sem compra nem webhook real) | incidente aberto às 02:05 e fechado em seguida; **e-mail recebido, confirmado pelo responsável** |

## Verificação final (14/10 02:30, pelo endereço público)

| Verificação | Resultado |
|---|---|
| `/api/health/ready` | 200 |
| `/`, `/entrar`, `/eventos` | 200 |
| `/admin` sem sessão | 302 |
| `run.app` direto, sem passar pelo Hosting | 403 em `/`, `/entrar`, `/api/events` e `/api/webhooks/payments`; só `/api/health` e `/api/health/ready` respondem 200 |
| Webhook pelo endereço público, POST sem assinatura | 401 (recusa de assinatura, não a barreira de Host) |
| Vendas e cadastro | fechados |
| Banco | 0 linhas de dados depois da migração; nada foi criado na publicação |
| Rotina diária `partyx-varredura-diaria` (04:00 de Brasília) | ativa, com `X-Forwarded-Host`; última execução 200 |
| Fila `partyx-conciliacao` | ativa |
| Backup diário (03:00) | agendado |
| Alertas | 16 políticas ativas, todas com o canal de e-mail da operação |

O alerta de teste prova o caminho log, política e e-mail. O disparo pelo código real foi provado em homologação (etapa 10).

## Rollback

```bash
PROJECT=partyx-producao REVISAO=partyx-00002-bkn ./infra/producao/deploy.sh rollback
```

As migrações 0005 a 0008 são compatíveis com a revisão anterior (README-DEPLOY, 8d). A branch do Neon `pre-release-2026-10-13` é o ponto de retorno do banco e só deve ser apagada no fim da publicação, com autorização.

## O que ficou fechado ou pendente, e por quê

| Item | Motivo |
|---|---|
| Vendas e cadastro | Fora da autorização de 13/10. Abrem só pelo `checklist-abertura-de-vendas.md` |
| Domínio `partyx.com.br` | DNS publicado no Registro.br (servidores `a.sec.dns.br` e `b.sec.dns.br`); em 14/10 02:25 o Firebase ainda não tinha reconhecido a posse nem emitido o certificado. `PUBLIC_BASE_URL` segue no `web.app` |
| Webhook do Mercado Pago | Cadastrado no painel em `https://partyx.com.br/api/webhooks/payments`. Só passa a valer depois do domínio ativo e da troca de `PUBLIC_BASE_URL` |
| E-mail de produção | `smtp-url` e `EMAIL_FROM` pendentes do domínio verificado no Resend |
| Textos legais e dados da PartyX no rodapé | Pendentes da PartyX (D-11) |
| `sslmode=verify-full` nas URLs do banco | Produção ainda usa `require`; homologação já usa `verify-full` |
| Usuários reais da equipe | Lista a informar pelo responsável |
| Verificação de saúde | Aponta para o `web.app`; recriar com `https://partyx.com.br` quando o domínio entrar |
| Limite de cadastro por IP (10 por hora) | Revisar antes de abrir as vendas |
| Branch do Neon `pre-release-2026-10-13` | Apagar no fim da publicação, com autorização |
| Push da branch e da tag | Tudo em commits locais; depende de autorização |
