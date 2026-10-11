# Infraestrutura de homologação

Criada e verificada em 01/10/2026 (Prompt 04). **Produção não existe ainda** (Prompt 28).

> **Atualização de 06/10/2026.** A homologação roda a versão atual (revisão `partyx-hml-00006-gc7`) **atrás do Firebase Hosting** (`https://partyx-hml.web.app`; o Firebase foi ligado ao projeto). Novos recursos: fila do Cloud Tasks `partyx-conciliacao`, conta `partyx-tasks`, segredos `qr-hmac-keys`, `turnstile-secret` (chave de teste), `smtp-url` (SMTP de teste), `database-url-backup`; job `partyx-backup` e agendamento `partyx-backup-diario` (03:00); 12 políticas de alerta e canal de e-mail. O gateway fictício e o escalonamento 1/1 usados nos testes foram **desligados**. Medições em `../README-DEPLOY.md`, seção 11, e backup em `backup.md`. O Neon de homologação ganhou o papel `partyx_backup`.

## Recursos

| Recurso | Nome | Detalhe |
|---|---|---|
| Projeto Google Cloud | `partyx-hml` | Só homologação. Separado dos demais projetos da conta. Faturamento: conta "Pagamento do Firebase". |
| Região | `southamerica-east1` (São Paulo) | Público brasileiro e Neon na mesma região (`aws-sa-east-1`), para reduzir latência e tráfego entre regiões. |
| Cloud Run (serviço) | `partyx-hml` | 1 vCPU, 512 MiB, **mínimo 0 e máximo 3 instâncias**, concorrência 80, tempo limite 60 s. Escala a zero. |
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

## Ocorrências desta etapa

- O papel criado pela API do Neon vem como membro de `neon_superuser` e conseguia apagar histórico. Foi apagado e recriado por SQL, sem privilégios extras, e os testes passaram a provar a restrição.
- Apagar e recriar um papel deixa o pooler do Neon com uma sessão antiga. Reiniciar a computação resolveu. Em operação normal o papel não é recriado.
- O faturamento da conta "Pagamento do Firebase" estava no limite de projetos. A pedido do responsável, o projeto `certificados-prod-2ea4fc` foi desvinculado dela, o que **tirou do ar** os 4 serviços Cloud Run dele. Se precisar religar, vincule-o a outra conta de faturamento.
