# Infraestrutura de homologação

Criada e verificada em 01/10/2026 (Prompt 04). **Produção não existe ainda** (Prompt 28).

> **Atualização de 06/10/2026.** A homologação roda a versão atual (revisão `partyx-hml-00006-gc7`) **atrás do Firebase Hosting** (`https://partyx-hml.web.app`; o Firebase foi ligado ao projeto). Novos recursos: fila do Cloud Tasks `partyx-conciliacao`, conta `partyx-tasks`, segredos `qr-hmac-keys`, `turnstile-secret` (chave de teste), `smtp-url` (SMTP de teste), `database-url-backup`; job `partyx-backup` e agendamento `partyx-backup-diario` (03:00); 12 políticas de alerta e canal de e-mail. O gateway fictício e o escalonamento 1/1 usados nos testes foram **desligados**. Medições em `../README-DEPLOY.md`, seção 11, e backup em `backup.md`. O Neon de homologação ganhou o papel `partyx_backup`.

## Recursos

| Recurso | Nome | Detalhe |
|---|---|---|
| Projeto Google Cloud | `partyx-hml` | Só homologação. Separado dos demais projetos da conta. Faturamento: conta "Pagamento do Firebase". |
| Região | `southamerica-east1` (São Paulo) | Público brasileiro e Neon na mesma região (`aws-sa-east-1`), para reduzir latência e tráfego entre regiões. |
| Cloud Run (serviço) | `partyx-hml` | 1 vCPU, 512 MiB (heap do Node em 320 MB, `NODE_OPTIONS`; `docs/operacao/memoria.md`), **mínimo 0 e máximo 3 instâncias**, concorrência 80, tempo limite 60 s. Escala a zero. |
| Cloud Run (job) | `partyx-migrate` | Roda as migrações com a conexão direta. Executado antes de cada deploy. |
| URL | `https://partyx-hml-fypn7xnohq-rj.a.run.app` | Pública, em HTTPS, sem domínio próprio ainda (D-08). |
| Artifact Registry | `partyx` | Mantém as 5 imagens mais recentes e apaga as com mais de 7 dias. |
| Cloud Storage | `partyx-hml-banners` | Leitura pública, escrita só do runtime, versionado. |
| Cloud Storage | `partyx-hml-backups` | **Privado** (acesso público bloqueado), versionado, retenção de 35 dias. |
| Secret Manager | `session-secret`, `qr-hmac-key-v1`, `database-url`, `database-url-direct` | Valores nunca saem do Secret Manager nem aparecem em log. |
| Neon | projeto `partyx-homologacao` (`super-hall-33204918`) | PostgreSQL 18, `aws-sa-east-1`, autoscaling 0,25–2 CU (era 1 CU fixa até 01/10/2026), suspensão automática padrão de 5 min. Banco `neondb`. |
| Monitoramento | Verificação `partyx-hml-saude` | A cada 5 minutos, de 3 regiões, em `/api/health` (sem banco). Não aponte para `/api/health/ready`: o `select 1` a cada ~1,7 min impede o autosuspend do Neon. Rollback: `gcloud monitoring uptime update partyx-hml-saude-UuAnjS9Qe0c --project partyx-hml --path=/api/health/ready`. |
| Alerta | "PartyX homologação: saúde indisponível" | E-mail para zanondea@gmail.com depois de 10 minutos de falha. |
| Orçamento | `partyx-hml`, R$ 150/mês | Alertas em 50%, 90% e 100%. |

## Contas de serviço e acesso (menor privilégio)

| Conta | Pode | Não pode |
|---|---|---|
| `partyx-app` (runtime) | Ler `database-url`, `session-secret`, `qr-hmac-key-v1`. Gravar nos banners. Criar objetos nos backups. | Ler `database-url-direct` (dono do banco). Apagar backups. |
| `partyx-deploy` (migração e CI) | Ler `database-url-direct`. | Nada mais até a CI ser ligada (`wif.sh`). |
| `partyx-scheduler` | Reservada para as rotinas autenticadas (Prompt 12). Sem permissões ainda. | — |

No banco, a aplicação conecta como **`partyx_app`**, um papel sem privilégio de dono. Testado no Neon real:

- lê e grava nas tabelas;
- **não** apaga pedidos, ingressos nem entradas (sem `DELETE`);
- **não** altera a auditoria (sem `UPDATE` em `audit_log`);
- **não** cria nem remove tabelas e papéis.

Conexões: a aplicação usa a URL **pooled**. As migrações usam a **direta**, com o dono. São credenciais diferentes.

## Como publicar

```bash
./infra/homologacao/deploy.sh      # build, migração (job) e deploy, com teste rápido no fim
./infra/homologacao/setup.sh       # recria a infraestrutura (idempotente)
REPO=dono/nome ./infra/homologacao/wif.sh   # liga a CI do GitHub sem chave de serviço
```

Fluxo de branches: `main` produção (protegida), `develop` homologação, `feature/*`. A CI (`.github/workflows/ci.yml`) roda lint, tipos, testes com PostgreSQL real, build e auditoria de dependências. O deploy de `develop` (`deploy-homologacao.yml`) usa o mesmo `deploy.sh`.

## Verificado

- `https://.../api/health` e `/api/health/ready` respondem 200 com `database: ok` (Cloud Run para Neon, pelo pooler, com o papel limitado).
- O front-end e as rotas do app respondem. HSTS e demais cabeçalhos de segurança presentes.
- O job de migração executou com sucesso no Cloud Run e é idempotente.
- Primeiro backup independente: `gs://partyx-hml-backups/manual/partyx-hml-20261001T174634Z.dump` (60 KB, formato `pg_dump` custom). A lista de conteúdo foi lida com `pg_restore --list` (17 entradas de dados).

## Neon: plano e janela de restauração (fatos medidos)

| Item | Valor |
|---|---|
| Janela de restauração do projeto (`history_retention_seconds`) | **86.400 s = 24 horas** |
| Computação | 1 CU fixa (mínimo e máximo) |
| Conexões máximas do servidor | 450 |
| Conexão pooled (PgBouncer) | Funciona. Primeira conexão ~1 s (computação acordando). |

**O plano contratado no Neon não aparece pela API.** Confirme no console. Com 24 horas de restauração, o Neon **não** atende sozinho o requisito de 7 dias: o backup independente no Cloud Storage é obrigatório. Hoje existe **só o backup manual** acima. A rotina diária automática, o teste de restauração e o alerta de falha são do **Prompt 25**.

## Limites e custo

- Instâncias: máximo 3. Conexões ao Neon: no máximo 3 × 5 (`DB_POOL_MAX`) = 15, muito abaixo das 450.
- Custo **estimado, não medido**: Cloud Run sem tráfego não cobra computação (escala a zero). Armazenamento, segredos, imagens e logs somam pouco em homologação. O custo relevante é o do Neon, conforme o plano. O orçamento de R$ 150/mês e os alertas são a trava. Revisar com a fatura real depois do primeiro mês.
- Extras acima do previsto exigem autorização do cliente (Cl. 8.3).

## Pendente

| Item | Situação |
|---|---|
| CI ligada ao GitHub | Falta o repositório. Rodar `wif.sh` e definir `GCP_WIF_PROVIDER` e `GCP_DEPLOY_SA`. A CI nunca foi executada. |
| Domínio `homolog.<domínio>` e DNS | Depende do cliente (D-08). |
| Frente do domínio: Firebase Hosting ou balanceador | Comparar custos quando houver domínio. Não usar o mapeamento direto do Cloud Run em prévia como pressuposto. |
| SPF, DKIM e DMARC | Dependem do domínio e do remetente (D-08, D-09). |
| Coleta de erros (Sentry ou equivalente) | Não configurada. Cloud Logging está ativo por padrão. |
| Primeiro administrador | Prompt 06. |
| Backup diário e teste de restauração | Prompt 25. |
| Produção | Prompt 28, com aceite do cliente. |
| Revisão do acesso público da URL | A homologação está aberta na internet, sem login, porque o app ainda é protótipo com dados fictícios. Restringir antes de colocar dados reais do cliente. |
| `sslmode` da URL do Neon antes de upgrade major do `pg` | **Feito em homologação em 13/10/2026** (as URLs já usam `verify-full`; aceita o certificado certo e recusa nome trocado e CA falsa; `operacao/inventario-homologacao.md`). Falta replicar em produção. Texto original: testar `sslmode=verify-full` na URL do Neon de homologação antes de qualquer upgrade major do `pg`; replicar em produção no próximo deploy. Motivo: o `pg` 8 avisa que, no `pg` 9 (`pg-connection-string` 3), `sslmode=require` passa à semântica do libpq e deixa de verificar o certificado. Hoje: `pg` 8.23.1 e `pg-connection-string` 2.14.1; `"pg": "^8.23.1"` não deixa subir para a 9. URLs **não** alteradas (pedido do responsável, 10/10/2026). Ver `registros/migracoes-neon-2026-10-10.md`. |

## Checklist da etapa 10 (infra de homologação e backup)

Itens da etapa 10 da sequência de fechamento. **Executados em 13/10/2026** (registro em `operacao/registro-rotinas.md`, inventário em `operacao/inventario-homologacao.md`); o responsável confirmou em 13/10/2026 o recebimento dos e-mails dos dois alertas (item 6). Checklist completo.

### Alertas por log: 13 sinais em HOMOLOGAÇÃO, com disparo de propósito

Pedido do responsável em 12/10/2026. **Em produção os alertas não são criados agora:** entram junto com o deploy de produção, depois do aceite (`README-DEPLOY.md`, seção 9).

- [x] **1. Mostrar o custo estimado ao responsável e esperar o "pode rodar".** Conferir antes o preço vigente na página oficial ([preços do Google Cloud Observability](https://cloud.google.com/products/observability/pricing), [exemplos de preço](https://cloud.google.com/stackdriver/observability-pricing-examples)) e atualizar a tabela abaixo se mudou. Listar o que já existe no projeto, para mostrar só o acréscimo: `gcloud alpha monitoring policies list --project=partyx-hml --format='value(displayName)'` e `gcloud logging metrics list --project=partyx-hml --format='value(name)'`.

  Estimativa preliminar (12/10/2026, **não medida**; as fontes divergem sobre o modelo de cobrança dos alertas em vigor):

  | Item | Base de cálculo | Estimativa por mês |
  |---|---|---|
  | 13 políticas de alerta, 1 condição cada | US$ 0,10 por condição (modelo com vigência indicada a partir de 01/05/2026) ou US$ 0,35 por métrica referenciada (modelo anterior). Os 2 sinais novos são US$ 0,20 a 0,70 desse total | US$ 1,30 a 4,55 |
  | Séries ou pontos lidos pelas condições | US$ 0,35 por milhão de séries ou US$ 0,50 por milhão de pontos. Cada condição lê uma métrica quase sempre vazia, a cada 5 min | menos de US$ 0,05 |
  | 13 métricas baseadas em log | Cobradas como métrica do usuário, por volume ingerido; os primeiros 150 MiB por **conta de faturamento** são gratuitos. Só geram amostra quando o sinal aparece (raro em homologação) | perto de US$ 0 |
  | Ingestão de logs | Não muda: as métricas leem os logs que já são gravados | US$ 0 a mais |
  | **Total** | | **cerca de US$ 1,35 a 4,60** (R$ 7 a 26, câmbio de referência de R$ 5,50), dentro do orçamento de R$ 150 da homologação |

  Observações: a conta "Pagamento do Firebase" é compartilhada com outros projetos, então a cota grátis de 150 MiB também é. Se o custo por condição incomodar, dá para trocar as 13 métricas por **uma** métrica com o rótulo `alert` e uma política agrupada por rótulo (1 condição). Isso muda o script e fica para decidir.

- [x] **2. Criar os alertas em homologação.** O `infra/producao/deploy.sh` recusa projeto de homologação, então use o script direto: `PROJECT=partyx-hml SERVICE=partyx-hml NOTIFY_EMAIL=<caixa da equipe> ./infra/operacao/alerts.sh`. Ele é idempotente: cria só o que falta e termina com "13 métricas e 13 políticas".
- [x] **3. Pré-requisito do disparo:** homologação com o Mercado Pago de **teste** (`PAYMENT_GATEWAY=mercadopago`, `GATEWAY_ENVIRONMENT=sandbox`, credenciais de teste no Secret Manager do `partyx-hml`). O gateway fictício de homologação não simula estorno parcial nem cobrança em dobro.
- [x] **4. Disparar `estorno_parcial` de propósito:** comprar 2 ingressos com Pix (pagador de teste `APRO`), fazer um estorno **parcial** pela API (`POST /v1/orders/{id}/refund` com valor menor que o total) e entregar a notificação.
  - Limitação conhecida: as notificações das compras de teste vêm assinadas pela aplicação do usuário de teste e a plataforma as recusa com 401 (`pagamento-mercadopago.md`). A notificação precisa ser montada e assinada com a assinatura secreta de homologação, como faz `server/src/api/mercadopago.sandbox.test.ts`.
  - Script de disparo: `infra/testes/alertas-hml.sh` (13/10/2026). Usa cartão de teste APRO no lugar do Pix, que oscilou no ambiente de teste, e entrega as notificações assinadas pelo Hosting.
  - Esperado: pedido continua `pago`, nenhum ingresso cancelado, trilha `pagamento.estorno_parcial` com o texto do ADM15 no histórico do pedido.
- [x] **5. Disparar `cobranca_duplicada` de propósito:** criar pela API uma segunda order aprovada com a **mesma referência externa** de um pedido já pago e o mesmo valor, e entregar a notificação assinada. Esperado: nada emitido, caso na aba **Exceções > Cobranças em dobro**; marcar como tratada com motivo.
- [x] **6. Confirmar que o aviso chega (verificado em 13/10/2026: o responsável confirmou o recebimento dos dois e-mails, `estorno_parcial` e `cobranca_duplicada`):** e-mail do Cloud Monitoring na `NOTIFY_EMAIL` para os dois sinais. Na medição de 06/10, o tempo do log ao alerta aberto foi de 3 a 4,5 min. Conferir também o incidente aberto no console. Só o responsável vê a caixa de entrada.
- [x] **7. Registrar a evidência** em `operacao/registro-rotinas.md`: data, sinais, horário do log, horário do e-mail e pedidos de teste usados. Sem token, assinatura, CPF nem endereço de caixa real. Os incidentes fecham sozinhos em 24 h (`autoClose`).

Uma linha de log falsa (`gcloud logging write`) provaria só o caminho do alerta, não o código. Não vale como disparo de propósito.

## Ocorrências desta etapa

- O papel criado pela API do Neon vem como membro de `neon_superuser` e conseguia apagar histórico. Foi apagado e recriado por SQL, sem privilégios extras, e os testes passaram a provar a restrição.
- Apagar e recriar um papel deixa o pooler do Neon com uma sessão antiga. Reiniciar a computação resolveu. Em operação normal o papel não é recriado.
- O faturamento da conta "Pagamento do Firebase" estava no limite de projetos. A pedido do responsável, o projeto `certificados-prod-2ea4fc` foi desvinculado dela, o que **tirou do ar** os 4 serviços Cloud Run dele. Se precisar religar, vincule-o a outra conta de faturamento.
