# Inventário da homologação (12/10/2026)

Levantamento **só de leitura**, feito com o `gcloud` e o `neonctl` autenticados na máquina do responsável, em 12/10/2026 à noite (horário de Brasília). Nenhum recurso foi criado, alterado ou cobrado nesta conferência. Segredos: só nomes, versões e quem lê; nenhum valor foi impresso. As URLs do banco foram lidas do Secret Manager direto para a variável de ambiente do processo.

Comparação com o repositório (`infra/homologacao/`, `infra/backup/`, `infra/operacao/`) e com a seção 7 do PDF (`docs/fontes/PartyX_Documentacao_Desenvolvimento.pdf`, "Etapa 1: Ambientes e infraestrutura") no fim.

## Projeto Google Cloud

| Item | Valor |
|---|---|
| Projeto | `partyx-hml` (nº 508762490937), ativo |
| Faturamento | conta `0158D3-9C1431-A0ABCF`, ativo |
| Orçamento | `partyx-hml`, R$ 150/mês, avisos em 50%, 90% e 100% |
| Região | `southamerica-east1` (São Paulo) |

## Cloud Run

| Item | Valor |
|---|---|
| Serviço | `partyx-hml` |
| URL do Cloud Run | `https://partyx-hml-fypn7xnohq-rj.a.run.app` (também `https://partyx-hml-508762490937.southamerica-east1.run.app`, usada como audience das rotinas) |
| URL pública (Firebase Hosting) | `https://partyx-hml.web.app` (rewrite de `/api/**` e `**` para `partyx-hml`, release de 06/10/2026 00:40 UTC) |
| Revisão no ar | `partyx-hml-00009-jdx`, criada em 06/10/2026 15:35 UTC, 100% do tráfego |
| Imagem | `partyx-api:20261006-153316` (anterior às etapas 06, 07 e 08 e à correção de memória de 12/10) |
| Recursos | 1 vCPU, 512 MiB, concorrência 80, tempo limite 60 s, **mín. 1 e máx. 1 instância** (exigência do gateway fictício, que guarda estado na memória) |
| Conta de serviço | `partyx-app` |
| Acesso | `allUsers` com `roles/run.invoker` (público, como previsto: app atrás do Hosting) |
| Gateway | **fictício** (`PAYMENT_GATEWAY=mock`, `HOMOLOGACAO_GATEWAY_FICTICIO=true`). Sem Mercado Pago de teste |
| Turnstile | ligado, chave de teste da Cloudflare |
| E-mail | `smtp-url` aponta para `smtp.ethereal.email:587` (caixa de captura, nada é entregue de verdade); remetente `ingressos@exemplo.com` |
| `NODE_OPTIONS` | **ausente** (o heap de 320 MB entrou no `deploy.sh` em 12/10, sem deploy) |
| Saúde agora | `/api/health` 200 em 0,65 s; `/api/health/ready` com `"database":"ok"` |

Jobs do Cloud Run:

| Job | Imagem | Última execução |
|---|---|---|
| `partyx-migrate` | `partyx-api:20261006-153316` | 06/10/2026 15:35 UTC |
| `partyx-backup` | `partyx-backup:v3`, conta `partyx-backup`, segredo `database-url-backup`, tempo limite 900 s | 12/10/2026 06:00 UTC, sucesso |

Artifact Registry `partyx`: 5 imagens `partyx-api` (todas de 06/10) e 4 `partyx-backup`. Política de limpeza do repositório: `infra/homologacao/artifact-cleanup.json`.

## Neon

| Item | Valor |
|---|---|
| Organização | `org-flat-recipe-26026612`, plano **Launch** |
| Projeto | `super-hall-33204918` ("partyx-homologacao"), `aws-sa-east-1`, PostgreSQL 18.6 |
| Branch | `br-still-flower-b63xoki7` (`main`, padrão, sem proteção), cerca de 32 MiB lógicos |
| Computação | `ep-winter-silence-b6rvpfz5`, leitura e escrita, autoscaling 0,25 a 2 CU, suspensão padrão |
| Banco | `neondb`, dono `neondb_owner`; papéis `partyx_app` (aplicação, pooled) e `partyx_backup` (leitura, backup) |
| PITR (janela de restauração) | **1 dia** (`history_retention_seconds` 86400). Produção tem 7 dias |
| IP permitido | sem restrição (`allowed_ips` vazio) |
| Manutenção | quinta, 08:00 a 09:00 UTC |
| TLS | as três URLs (`database-url`, `database-url-direct`, `database-url-backup`) já usam `sslmode=verify-full&channel_binding=require`. Ver "sslmode=verify-full" abaixo |

Migrações aplicadas (`drizzle.__drizzle_migrations`), comparadas com `drizzle/`:

| Arquivo local | Aplicada em homologação | Hash igual ao arquivo |
|---|---|---|
| `0000_schema_inicial` | 01/10/2026 13:39 UTC | **não** |
| `0001_regras_de_integridade` | 01/10/2026 13:39 UTC | **não** |
| `0002_permissoes_da_aplicacao` | 01/10/2026 17:38 UTC | **não** |
| `0003_anonimizacao_lgpd` | 04/10/2026 13:37 UTC | sim |
| `0004_limites_globais` | 06/10/2026 14:01 UTC | sim |
| `0005_excecoes_pagamento` | **não aplicada** | |
| `0006_encerramento_do_evento` | **não aplicada** | |
| `0007_banner_responsivo` | **não aplicada** | |
| `0008_recusa_do_pagamento` | **não aplicada** | |

As linhas de 0000 a 0002 têm ids 1, 2 e 6 e hash diferente do arquivo atual: os arquivos foram alterados antes do primeiro commit do Git (10/10) e depois de aplicados em homologação. O migrador do Drizzle decide pelo `created_at` da última linha (o da 0004), então as 0005 a 0008 entram no próximo deploy e as anteriores não são reaplicadas. **Risco:** o esquema real de homologação pode diferir do que os arquivos 0000 a 0002 criam hoje. A restauração do item 3 compara o esquema restaurado com um banco criado só pelos arquivos.

Linhas por tabela (dados fictícios): `audit_log` 30, `checkins` 6, `consents` 10, `email_log` 14, `events` 2, `global_limit_counters` 2, `login_attempts` 12, `order_items` 9, `orders` 9, `payment_events` 5, `promoters` 0, `reservations` 9, `sessions` 21, `ticket_types` 5, `tickets` 10, `users` 12.

### sslmode=verify-full (teste de 12/10/2026)

Com `pg` 8.23.1 e `pg-connection-string` 2.14.1, a partir desta máquina, sem aviso do driver:

| Caso | Pooled (`partyx_app`) | Direta (`partyx_backup`) |
|---|---|---|
| URL do segredo, `verify-full` | conecta; TLS 1.3, certificado `*.c-2.sa-east-1.aws.neon.tech` autorizado | igual |
| Mesmo servidor pelo IP (nome não confere) | **recusa** (`ERR_TLS_CERT_ALTNAME_INVALID`) | **recusa** |
| CA que não emitiu o certificado | **recusa** (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`) | **recusa** |

Conclusão: a verificação de nome e cadeia funciona com as URLs atuais. A pendência de `infraestrutura.md` fica atendida para homologação; produção replica no próximo deploy (as URLs de produção não foram lidas nesta conferência).

## Secret Manager

Todos com replicação gerenciada em `southamerica-east1` e 1 versão ativa. Nenhum valor foi lido para este inventário, exceto o formato (sem senha) das URLs de banco e do SMTP.

| Segredo | Quem lê | Observação |
|---|---|---|
| `database-url` | `partyx-app` | papel `partyx_app`, pooled |
| `database-url-direct` | `partyx-deploy` | dono do banco, só para migração |
| `database-url-backup` | `partyx-backup` | papel de leitura |
| `session-secret` | `partyx-app` | |
| `qr-hmac-keys` | `partyx-app` | formato `versão:chave` |
| `qr-hmac-key-v1` | `partyx-app` | **órfão**: formato antigo, não usado pelo serviço. Candidato a desativar |
| `turnstile-secret` | `partyx-app` | chave de teste da Cloudflare |
| `smtp-url` | `partyx-app` | Ethereal (captura) |
| `mp-access-token`, `mp-public-key`, `mp-webhook-secret` | | **não existem** em homologação |

## Cloud Storage

| Bucket | Local e classe | Acesso | Versionamento e retenção |
|---|---|---|---|
| `partyx-hml-backups` | `southamerica-east1`, Nearline | **privado** (prevenção de acesso público imposta); `partyx-backup` cria e lê, `partyx-app` cria | versionado; ciclo de vida apaga com 35 dias |
| `partyx-hml-banners` | `southamerica-east1`, Standard | leitura pública (`allUsers` objectViewer); `partyx-app` só cria | versionado; sem ciclo de vida |
| `partyx-hml_cloudbuild` | US, Standard | padrão do Cloud Build | sem ciclo de vida |
| `run-sources-partyx-hml-southamerica-east1` | padrão do Cloud Run | | |

Cópias no bucket de backup: diárias de 06/10 a 12/10 (`daily/2026/10/partyx-AAAAMMDDTHHMMSSZ.dump`, `.sha256` e `.manifest.json`, cerca de 74 KiB cada) e uma manual de 01/10. 37 objetos, 900 KiB.

## Cloud Tasks e Cloud Scheduler

| Recurso | Configuração |
|---|---|
| Fila `partyx-conciliacao` | ativa, 5/s, 5 simultâneas, 3 tentativas. `partyx-app` enfileira; tarefas assinadas por `partyx-tasks` |
| `partyx-backup-diario` | `0 3 * * *` America/Sao_Paulo, chama o job `partyx-backup`, última execução 12/10 06:00 UTC com sucesso |
| Rotina diária de conciliação (04:00) | **ausente** em homologação (`scheduler.sh` nunca rodou; em produção é `partyx-varredura-diaria`) |

## Alertas e monitoramento

Canais de e-mail: `PartyX operação (z***@gmail.com)` e `PartyX homologação (e-mail)`. Verificação de disponibilidade `partyx-hml-saude`: `/api/health` no `run.app`, a cada 5 min, de 3 regiões.

13 políticas ativas, cada uma com 1 canal:

| Política | Fonte |
|---|---|
| saúde indisponível | verificação de disponibilidade (falha por 10 min) |
| backup ausente | métrica `partyx_alerta_backup_ok` abaixo de 1 em 25 h |
| `backup_falhou` | log do job de backup |
| `pago_sem_estoque`, `webhook_falhou`, `reconciliacao_falhou`, `pagamento_divergente`, `estorno_fora_de_fluxo`, `email_falhou`, `conciliacao_revisao_manual`, `fila_conciliacao_falhou`, `fila_email_falhou`, `verificacao_humana_indisponivel` | métricas por log (`jsonPayload.alert`) do serviço `partyx-hml` |

**Faltam 3 dos 13 sinais de `infra/operacao/alerts.sh`:** `estorno_parcial`, `cobranca_duplicada` e `limite_global_atingido`. Não há métrica nem política para eles.

## IAM

| Conta | Papéis | Chaves de usuário |
|---|---|---|
| `zanondea@gmail.com` | Owner | |
| `partyx-app` | só nos recursos (segredos, buckets, fila; usuário de `partyx-tasks`) | 0 |
| `partyx-deploy` | **nenhum papel no projeto**; lê `database-url-direct` | 0 |
| `partyx-backup` | segredo e bucket de backup | 0 |
| `partyx-scheduler`, `partyx-tasks` | só como identidade dos tokens OIDC | 0 |
| `508762490937-compute@developer` | **Editor** (padrão do Google, amplo) | não conferido |
| Agentes de serviço do Google e Firebase Admin SDK | padrão | |

**Workload Identity Federation:** nenhum pool. `infra/homologacao/wif.sh` nunca rodou.

## GitHub e deploy automático

| Item | Estado |
|---|---|
| Repositório | `ZanonDeAndrade/PartyX` |
| Branches remotas | `main` e `feature/fechamento-homologacao` (na `c306acb`; a local está à frente, sem push) |
| Branch `develop` | **não existe** (nem local nem remota) |
| Ambiente `homologacao` e variáveis `GCP_WIF_PROVIDER` e `GCP_DEPLOY_SA` | **não existem** |
| Workflow `deploy-homologacao.yml` | nunca executou. Mesmo com WIF, falharia: chama `npm run db:env` sem `setup-node` nem `npm ci` |
| CI (`ci.yml`) | última execução em 11/10, sucesso |

Todos os deploys de homologação até hoje foram feitos com `infra/homologacao/deploy.sh` rodado nesta máquina.

## Comparação com o repositório

| Script | Situação |
|---|---|
| `setup.sh` | aplicado (APIs, contas, fila, buckets, segredos, orçamento). Segredo antigo `qr-hmac-key-v1` sobrou |
| `deploy.sh` | aplicado até 06/10. **Não sabe ligar o Mercado Pago de teste** (só o fictício), e a versão atual (heap de 320 MB, `LEGAL_CONTENT_DIR`, `MAINTENANCE_MODE`) nunca foi publicada |
| `scheduler.sh` | **não aplicado** (sem rotina diária de conciliação). Também não envia `X-Forwarded-Host`, ao contrário do de produção |
| `wif.sh` | **não aplicado** |
| `infra/backup/setup.sh` | aplicado (job, agenda, conta `partyx-backup`, segredo) |
| `infra/operacao/alerts.sh` | aplicado numa versão anterior: 10 dos 13 sinais |

## Comparação com o PDF, seção 7

| Tarefa do PDF (7.2 e 7.3) | Homologação hoje |
|---|---|
| Ambiente com gateway **sandbox** e endereço `homolog.dominio-partyx` | gateway **fictício**; endereço `partyx-hml.web.app` (domínio depende da D-08) |
| Branches `main`, `develop`, `feature/*` | sem `develop` |
| CI com testes e lint em cada push | sim (`ci.yml`) |
| Deploy automático de `develop` em homologação | **não funciona** (sem `develop`, sem WIF, workflow incompleto) |
| PostgreSQL gerenciado | sim (Neon) |
| Bucket de banners com URL pública só de leitura | sim |
| E-mail transacional com SPF, DKIM e DMARC | não em homologação (Ethereal); ver `operacao/email.md` |
| Migrações versionadas | sim; 4 pendentes no Neon de homologação |
| Cofre de segredos fora do repositório | sim (Secret Manager); sem as credenciais do gateway |
| DNS do domínio do cliente e HTTPS automático | HTTPS automático do Hosting; domínio pendente (D-08) |
| Backup diário com retenção de 7 dias ou mais | sim: diário às 03:00, bucket privado, 35 dias. PITR do Neon de 1 dia, além disso |
| Monitoramento de disponibilidade de 1 a 5 min com alerta | sim: 5 min, e-mail |
| Coleta de erros e logs centralizados | Cloud Logging; sem Sentry (alertas por log no lugar) |
| Administrador inicial | existe (dados fictícios) |
| 7.3: página publicada com HTTPS, banco, deploy automático e primeiro backup | atendido, **menos o deploy automático** |

## Pontos de atenção

1. Homologação roda código de 06/10: sem Mercado Pago, sem as migrações 0005 a 0008, sem o heap de 320 MB.
2. Deploy automático de `develop` não existe na prática (ver tabela do GitHub).
3. Mín. 1 instância permanente por causa do gateway fictício: custo fixo mensal sem uso. Com o Mercado Pago de teste, volta a 0.
4. Rotina diária de conciliação ausente em homologação.
5. 3 sinais de alerta faltando.
6. Hash das migrações 0000 a 0002 diferente do arquivo atual.
7. Conta padrão do Compute com papel Editor (padrão do Google; o serviço não a usa).
8. Segredo órfão `qr-hmac-key-v1`.

## Atualização em 13/10/2026 (depois da etapa 10)

O texto acima é a fotografia de 12/10, antes das mudanças. O que mudou:

| Item | Antes | Agora |
|---|---|---|
| Revisão | `partyx-hml-00009-jdx` (código de 06/10) | `partyx-hml-00012-tqz`, imagem `partyx-api:20261013-173327-e9e31e9` |
| Gateway | fictício, 1 instância fixa | Mercado Pago de **teste** (`sandbox`), 0 a 3 instâncias |
| Variáveis | montadas na linha de comando | `infra/homologacao/env.hml.yaml`, conferido por `infra/env-check.py` antes do build |
| Barreira de Host | desligada | ligada (`PUBLIC_HOST_CHECK=true`): `run.app` sem `X-Forwarded-Host` responde 403 |
| `NODE_OPTIONS` | ausente | `--max-old-space-size=320` |
| Remetente | `ingressos@exemplo.com` | `ingressos@partyx-hml.web.app` (caixa de captura; entrega real em `email-homologacao-smtp-real.md`) |
| Migrações no Neon | até a 0004 | até a 0008 (9 linhas); esquema idêntico ao criado pelos arquivos, conferido na restauração |
| Segredos | sem os do gateway | mais `mp-access-token`, `mp-public-key`, `mp-webhook-secret` (teste) |
| Scheduler | só o backup | mais `partyx-varredura-diaria` (04:00) |
| Alertas | 13 políticas, 12 métricas | 16 políticas, 15 métricas (entraram `estorno_parcial`, `cobranca_duplicada`, `limite_global_atingido`) |

Continua igual: deploy automático de `develop` inexistente (sem `develop`, sem WIF; o workflow foi corrigido no repositório, mas não ativado), segredo órfão `qr-hmac-key-v1`, conta padrão do Compute com papel Editor, PITR de 1 dia. Dados fictícios acumulados: `../registros/dados-ficticios-homologacao.md`.

