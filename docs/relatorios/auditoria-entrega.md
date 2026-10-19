# Auditoria de entrega do PartyX

**Data:** 19/10/2026. **Escopo:** repositório na branch `feature/fechamento-homologacao` (HEAD `716737d`, com trabalho não
comitado da taxa de serviço, D-90), produção `partyx-producao` só em leitura (revisão `partyx-00044-dil`, commit `5fbfdab`), testes
funcionais e de carga no ambiente local com o PostgreSQL de teste e as credenciais de teste do Mercado Pago. Referência de mercado
para fluxo e informação: minhaentrada.com.br (nunca identidade visual).

> Documento em construção, por fases. Cada fase fecha com um resumo e segue para a próxima. O resumo executivo, a tabela de
> achados, a ordem de correção e a versão para o cliente (`auditoria-entrega-cliente.md`) ficam prontos no fim.

## Fase 0: inventário e plano

### 0.1 Estado do repositório encontrado

| Item | Situação |
|---|---|
| Branch e HEAD | `feature/fechamento-homologacao`, `716737d`, 15 commits à frente de `origin` (sem push desde `9130662`) |
| Trabalho não comitado | 66 arquivos alterados e 20 novos (cerca de 1.100 linhas): a **taxa de serviço (D-90)** inteira (migração `0017`, domínio, API, painel, textos legais 1.3 e 1.1, `env.prod.yaml` já com as versões e a data de hoje). Não está em produção |
| Produção | `partyx-00044-dil` (`5fbfdab`), vendas abertas desde 19/10 01:25 UTC, cartão corrigido às 02:20 UTC; Termos 1.2, sem taxa de serviço |
| Decisão desta auditoria | Auditar a **pasta de trabalho** (o que será entregue), marcando os achados que dependem do trabalho não comitado. A segurança do que está no ar é conferida no HEAD |

### 0.2 Rotas HTTP

**Páginas (front-end, roteador próprio em `src/site/SiteApp.tsx` e `src/site/areas/*.tsx`).** O servidor nega as páginas de
`/admin`, `/portaria` e `/primeiro-acesso` antes de servir o HTML (`server/src/app.ts`).

| Área | Páginas |
|---|---|
| Pública | `/`, `/eventos`, `/eventos/:slug`, `/entrar`, `/criar-conta`, `/recuperar-senha`, `/redefinir-senha`, `/termos-de-uso`, `/privacidade`, `/politica-de-cancelamento`, `/termo-menor`, `/meia-entrada` (301 para os Termos) |
| Comprador | `/checkout/:slug`, `/pedido/:id`, `/meus-ingressos`, `/minhas-compras`, `/minha-conta`, `/ingressos/:id`, `/ingressos/:id/tela-cheia`, `/ingressos/:id/transferir`, `/autorizacao-menor/pedido/:id`, `/primeiro-acesso` (equipe) |
| Portaria | `/portaria`, `/portaria/:eventId` |
| Admin | `/admin`, `/admin/pedidos`, `/admin/pedidos/:id`, `/admin/eventos`, `/admin/eventos/novo`, `/admin/eventos/:id`, `/admin/eventos/:id/editar`, `/admin/eventos/:id/previa`, `/admin/excecoes`, `/admin/promoters`, `/admin/promoters/:id`, `/admin/compradores`, `/admin/compradores/:id`, `/admin/ingressos`, `/admin/ingressos/:id`, `/admin/entradas`, `/admin/equipe`, `/admin/conta`, `/admin/configuracoes` (taxa, não comitado), `/admin/relatorios/vendas`, `/admin/relatorios/promoters`, `/admin/relatorios/taxa-mensal` |

**API (`/api`, Hono).** 123 rotas registradas em `server/src/api/*.ts`: 13 públicas, 23 do comprador, 6 da portaria, 71 do admin,
5 de rotina e webhook, 5 técnicas. A lista completa, com a cobertura de teste de cada uma, está em
[`matriz-cobertura-rotas.md`](matriz-cobertura-rotas.md) (gerada por `auditoria/ferramentas/cobertura-rotas.mjs`).

### 0.3 Rotinas

| Rotina | Disparo | Rota ou job | O que faz | Teste automatizado |
|---|---|---|---|---|
| Varredura diária | Cloud Scheduler `partyx-varredura-diaria`, 04:00 (São Paulo), OIDC | `POST /api/internal/jobs/reconcile-payments` | Fila de e-mails (50), travas vencidas, viradas de lote por data, reconsulta de pedidos de até 3 dias, ingressos faltantes (backfill), tarifa real do Mercado Pago (não comitado) | Integração: `reconcile.integration.test.ts` (87 casos), `ops.integration.test.ts`; execução real em homologação (13/10) |
| Limpeza de retenção (LGPD) | Cloud Scheduler, 04:05 | `POST /api/internal/jobs/purge-retention` | Apaga tentativas de login, sessões e pedidos de redefinição pelos prazos (`RETENTION_*_DAYS`) | Integração: `security.integration.test.ts`, `team.integration.test.ts` |
| Conciliação por pedido | Cloud Tasks `partyx-conciliacao` (1, 2, 4, 8 min, fim da reserva mais margem; tardias até 24 h) | `POST /api/internal/tasks/reconcile-order` | Reconsulta o pagamento no gateway, emite ingressos, reagenda ou marca revisão manual | Integração (`reconcile.integration.test.ts`), unitário (`taskQueue.test.ts`, `reconcileSchedule.test.ts`); API real do Cloud Tasks verificada em homologação (05/10) |
| Reenvio de e-mail | Cloud Tasks (+2, +10, +30 min) | `POST /api/internal/tasks/send-email` | Tenta de novo um e-mail que falhou; na 4ª falha marca `falhou` e emite `email_falhou` | Integração: `mail.integration.test.ts` (37) |
| Backup diário | Cloud Scheduler `partyx-backup-diario`, 03:00; Cloud Run Job `partyx-backup` | `infra/backup/backup.sh` | `pg_dump` custom, manifesto, SHA-256, envio ao bucket privado (35 dias), alertas `backup_falhou` e `backup ausente` | Shell sem teste automatizado; restauração conferida por `restoreCheck.integration.test.ts` (10) e ensaio real em homologação (13/10) e em produção com banco vazio (06/10) |
| Expiração de reservas | Dentro das transações de checkout e na varredura (`jobs:expire` manual) | `server/scripts/expire-reservations.ts` | Libera reservas vencidas de forma idempotente | Integração: `checkout.integration.test.ts`, `stock.integration.test.ts` |
| Verificação de saúde | Cloud Monitoring uptime (3 regiões, 5 min) | `GET /api/health` (sem banco, decidido em 18/10) | Alerta "saúde indisponível" após 10 min | Unitário: `app.test.ts`; não há teste do alerta em si |

### 0.4 E-mails e PDFs gerados

| Artefato | Origem | Teste automatizado |
|---|---|---|
| E-mail `cadastro` (boas-vindas) | `mail/templates.ts: composeCadastro` | `templates.test.ts` (18 casos no total), `mail.integration.test.ts` |
| E-mail `recuperacao_senha` (link de uso único, 1 h) | `composeRecuperacao` | idem; e2e `roteiro-11-2` segue o link |
| E-mail `compra` (ingressos, link, taxa de serviço) | `composeCompra` | idem; e2e `roteiro-11-2` lê a caixa de captura |
| E-mail `pagamento_sem_estoque` (aos administradores) | `composePagamentoSemEstoque` | `templates.test.ts`, `reconcile.integration.test.ts` |
| E-mails `transferencia_enviada`, `transferencia_recebida`, `transferencia_desfeita` | `composeTransferencia*` | `templates.test.ts`, `transfer.integration.test.ts`, e2e `transferencia.spec.ts` |
| Senha temporária da equipe | Não há e-mail: o administrador vê a senha na tela (`team.ts`) | `team.integration.test.ts` |
| PDF do ingresso (um por unidade) e PDF do pedido (todos) | `tickets/pdf.ts` | `pdf.test.ts` (rasteriza com poppler e lê o QR), `tickets.integration.test.ts` |
| PDF do Termo de Autorização (menor): público por evento, por pedido e por ingresso | `minors/authorizationPdf.ts` | `authorizationPdf.test.ts` (3), `minors.integration.test.ts` (19) |
| Lista de contingência da portaria (PDF e CSV) | `exports/contingency.ts` | `contingency.test.ts` (texto longo, poppler), `exports.integration.test.ts` (13) |
| CSV: pedidos, vendas, promoters, pedidos por promoter, taxa mensal, ingressos e compradores do evento | `exports/csv.ts`, `exports/service.ts` | `csv.test.ts` (14, inclui neutralização de fórmula), `exports.integration.test.ts` |
| Exportação de encerramento, extrato da taxa, revisão semanal | `ops/*.ts` | `ops.integration.test.ts` (9) |

### 0.5 Integrações

| Integração | Onde | Estado em produção | Teste automatizado |
|---|---|---|---|
| Mercado Pago (Orders API, Pix e cartão por Brick, webhook assinado, reembolso, busca de pagamento para a tarifa) | `payments/mercadopago/*` | Credenciais de produção, `MP_COLLECTOR_ID` conferido na partida | Unitário com fixtures (`mercadopago.test.ts`, 32), integração (`mercadopago.integration.test.ts`, 17), **sandbox real** (`mercadopago.sandbox.test.ts`, 13; `fee.sandbox.test.ts`, 1; só por `npm run test:sandbox`) |
| E-mail transacional (SMTP via nodemailer; provedor Resend, `docs/operacao/resend-registros.json`) | `providers/email.ts`, `mail/outbox.ts` | `smtp-url` v1 desde 17/10; remetente `ingressos@partyx.com.br` | Integração com servidor SMTP de teste (`mail.integration.test.ts`); entrega real conferida à mão (PX-10001) |
| Neon (PostgreSQL 18, pooled para a aplicação, direta para migração e backup) | `db/client.ts`, `db/environment.ts`, `db/appRole.ts` | Launch, 0,25 a 2 CU, `DB_POOL_MAX=5`, marca `producao` no banco | Integração (`client`, `environment`, `schema`), cluster (`appRole.cluster.test.ts`), `check:migrations` na CI |
| Cloud Run (serviço `partyx`, 1 vCPU, 512 MiB, heap 320 MB, concorrência 80, 0 a 3 instâncias, 60 s) | `infra/producao/deploy.sh`, `Dockerfile` | Revisão `partyx-00044-dil`; `evento-on` não ligado | Unitário das travas do script (`deployEvento.test.ts`, `deployTextos.test.ts`, `envCheck.test.ts`); teste rápido manual a cada publicação |
| Cloud Tasks e Cloud Scheduler | `payments/taskQueue.ts`, `payments/jobsAuth.ts` | Fila `partyx-conciliacao` (3 tentativas, 5/s); 2 jobs (04:00 e 04:05) mais o backup | Unitário (`taskQueue.test.ts`, 8), integração do OIDC (`reconcile.integration.test.ts`) |
| Cloud Storage (banners, variantes; backups) | `providers/bannerStorage.ts`, `media/*` | `partyx-producao-banners` público para leitura; `partyx-producao-backups` privado | `banner.test.ts` (11), `bannerVariants.integration.test.ts`; backup sem teste automatizado |
| Vercel (ponte do domínio `partyx.com.br`, plano Hobby, rewrite para o `run.app`) | `infra/vercel/vercel.json`, `api/health.ts` (`/health/origem`) | Em uso desde 14/10; meta: voltar ao Firebase | `proxy.test.ts` (9) para a cadeia de cabeçalhos; teste rápido do `deploy.sh` |
| Firebase Hosting (destino final do domínio) | `firebase.json` | Certificado preso (`CERT_VALIDATING`, pede TXT `_acme-challenge`) | Nenhum |
| Cloud Monitoring (alertas por log, uptime, 5xx, orçamento) | `infra/operacao/alerts.sh`, `uptime.sh` | 13 sinais, uptime do domínio, 5xx (18/10), orçamento R$ 30 | Disparo de propósito em homologação (13/10); sem teste automatizado |
| Cloudflare Turnstile | `security/humanCheck.ts`, `src/site/HumanCheck.tsx` | **Desligado** (`TURNSTILE_ENABLED=false`) | `humanCheck.test.ts` (5), e2e `turnstile.spec.ts` (5, chave de teste) |
| GitHub Actions (CI e deploy de homologação) | `.github/workflows/*.yml` | CI roda em `push`; deploy de `develop` **nunca funcionou** (sem WIF) | A CI é o teste |

### 0.6 Matriz de cobertura (resumo)

Base automatizada encontrada: **1.116 casos vitest** em 82 arquivos (integração com PostgreSQL real, unitários, 14 de sandbox do
Mercado Pago rodados à parte) e **12 suítes Playwright** (`e2e/*.spec.ts`), a maior parte só em Chromium e a 360 e 1280 px; `abertura`
e `painel-celular` também em WebKit (390 px). Nenhuma suíte roda em Firefox.

| Área | Cobertura de API (integração) | Cobertura de interface (Playwright) | Lacunas aparentes (a confirmar na Fase 2) |
|---|---|---|---|
| Cadastro, login, senha, conta | Alta (`auth.integration.test.ts`, 60) | Parcial: roteiro 11.2 (cadastro, login, recuperação) | Troca de senha, exclusão de conta e cópia dos dados (LGPD) só por API; idades 16 e 17 na interface |
| Vitrine e página do evento | Alta (`public.integration.test.ts`, 26) | Alta (`busca`, `cronometro`, `cor-destaque`, `transicoes`, `abertura`) | Evento esgotado e arquivado na interface |
| Checkout, reserva, estoque | Alta (`checkout`, `stock`, `lots`: 59 casos, concorrência real) | Parcial: roteiro 11.2 | Reserva expirando na tela, dois compradores ao mesmo tempo pela interface, lote esgotando no meio |
| Pagamento e webhook | Alta (`payment`, `reconcile`, `mercadopago*`: 141 casos; sandbox real) | Parcial: Pix pelo fictício e Brick a 360 px | Cartão recusado e pendente na interface, webhook fora de ordem e atrasado pela interface |
| Ingressos, PDF, transferência | Alta (`tickets`, `transfer`, `minors`: 55 casos) | Média (`transferencia.spec.ts`, 4) | Transferência para conta inexistente, para si, dentro das 2 h, cancelado, retransferência na interface |
| Portaria | Alta (`gate.integration.test.ts`, 47, com concorrência) | Baixa: só o QR válido no roteiro | Reutilizado, cancelado, QR antigo, outro evento, adulterado, câmera negada, 2 validadores na interface |
| Admin | Alta por API (71 rotas, 1 só sem teste direto: `GET /media/*`, local) | Baixa: eventos e promoters no roteiro; cor; painel no celular | Pedidos, ingressos, compradores, equipe, relatórios, exceções, entradas e CSV pela interface |
| E-mails e PDFs | Alta (modelos e fila) | Média: roteiro lê a caixa de captura | Renderização em tela estreita e Reply-To não conferidos visualmente |
| Rotinas e backup | Alta por API; backup e alertas sem teste automatizado | Não se aplica | Ensaio de restauração em produção pendente |

### 0.7 Plano das fases

| Fase | Conteúdo | Estimativa |
|---|---|---|
| 0 | Inventário, matriz de cobertura, plano (este bloco) | 1 h, concluída |
| 1 | Lint, typecheck, build, bateria completa com cobertura por área; `npm audit` e dependências; revisão de segurança OWASP Top 10 no código e no build local; varredura de segredos no histórico do Git; código morto | 3 h |
| 2 | Playwright novo em `auditoria/e2e/` para o que falta (comprador, menores, transferência, cancelamento e estorno, portaria, admin, e-mails e PDFs), em Chromium, WebKit e Firefox a 360, 390 e 1280 px; lista do que passou, falhou ou não foi possível | 8 h |
| 3 | k6 local: abertura (300 pessoas em 10 min), pico de 60 pedidos/min, 500 webhooks em 5 min, portaria 500 leituras em 90 min por 3 validadores; o mesmo em 3 vezes; invariantes como consultas SQL só leitura; tradução para o Cloud Run, Neon e Vercel com custo de cada mudança | 3 h |
| 4 | Comparação passo a passo com a referência; heurísticas de usabilidade; axe (WCAG 2.1 AA) e teclado; Lighthouse móvel 4G em 5 páginas; bundles e imagens; Open Graph; consistência de texto | 3 h |
| 5 | Restauração do backup mais recente em banco local; rollback local cronometrado; alertas (17) e lacunas; LGPD; documentação e runbooks; pendências conhecidas | 2,5 h |
| Entrega | Relatório completo, versão para o cliente, ordem de correção, capturas | 1,5 h |

Total estimado: cerca de 22 horas de trabalho, sem custo em nuvem. Produção só é consultada em leitura (configuração do Cloud Run e
cópia do backup). Nenhuma correção é aplicada durante a auditoria.

### 0.8 Limites do ambiente local desta auditoria

| Recurso | Valor | Efeito |
|---|---|---|
| Disco | 13 GB livres de 233 (95% usado) | Rodadas sem vídeo; traços só em falha; limpeza entre rodadas |
| Memória | 14 GiB, cerca de 2 GiB disponíveis no início | Carga e navegadores em sequência, não em paralelo |
| Ferramentas | Node 24.18, Docker (PostgreSQL 16 de teste ativo, imagens `postgres:18`, `grafana/k6:1.0.0`), Playwright 1.62 com os 3 navegadores, poppler, gcloud autenticado; sem `psql` nem `k6` nativos (usados pelo Docker); Lighthouse por `npx` | Suficiente para todas as fases |

## Fase 1: código, segurança e dependências

### 1.1 Lint, typecheck, build e bateria

| Comando | Resultado | Observação |
|---|---|---|
| `npm run lint` | 0 erros, 27 avisos | Avisos só no protótipo (`src/logic`, `src/lib`), em `infra/testes/*.mjs`, `infra/ui/flows-ui.mts` e 2 `no-control-regex` intencionais em `server/src/exports/csv.ts` (neutralização de CSV) |
| `npm run typecheck` | OK (19 s) | |
| `npm run build` | OK (14 s) | Pacotes: `index` 313 kB (95,5 kB gzip), `admin` 192 kB (46,4), `gate` 145 kB (52,8, leitor jsQR), `checkout` 36 kB (10,7), CSS principal 63 kB (13,0); 14 arquivos de fonte; vídeo da abertura 80 kB |
| `npm run test:db` (bateria com PostgreSQL de teste) | 79 arquivos, 1.172 casos: **1.170 passaram, 2 falharam por tempo** (80 s) | As duas falhas foram por carga da máquina (outros processos da auditoria em paralelo): `environment.integration.test.ts` sobe o servidor de verdade 3 vezes e mata o processo em 12 s; `deployTextos.test.ts` roda o `deploy.sh virar` com `gcloud` falso e estourou os 20 s. **Repetidos em isolamento: 2 de 2 passaram (28 s).** Suíte de cluster (papéis do PostgreSQL): 4 de 4. Poppler presente: os testes de PDF rodaram, não foram pulados |
| `npm run test:sandbox` (Mercado Pago de teste, 14 casos) | Não executado nesta fase | Exige credenciais de teste e rede; fica para a Fase 2 junto com a rodada do roteiro em sandbox |

Cobertura de código da bateria (`@vitest/coverage-v8`, instalado sem gravar no `package.json`), por área:

| Área | Arquivos | Instruções | Ramos |
|---|---|---|---|
| Checkout, reserva, lotes | 8 | 94,9% | 87,1% |
| Pagamento, webhook, conciliação | 21 | 87,2% | 81,3% |
| Ingressos, PDF, transferência, menores | 8 | 95,3% | 89,0% |
| Portaria | 2 | 98,4% | 91,9% |
| Admin (painel, eventos, relatórios, exportações, LGPD) | 18 | 97,1% | 87,4% |
| E-mails | 4 | 91,0% | 85,1% |
| Autenticação e segurança | 16 | 97,4% | 91,3% |
| Vitrine | 6 | 97,2% | 92,7% |
| **Servidor inteiro (`server/src`)** | 128 | **93,1%** | **86,9%** |
| Front-end `src/site` | 49 | 7,6% | | 

O front-end só é exercitado pelo Playwright (sem instrumentação); os módulos `.ts` puros do site (formatação, contagem, taxa, sessão) têm teste unitário. Abaixo de 80% no servidor: `index.ts` (partida real, coberto pelo teste de processo), `payments/mercadopago/index.ts` (73%: os ramos reais ficam nos testes de sandbox), `providers/bannerStorage.ts` (36%: Cloud Storage real), `db/appRole.ts` (36%: suíte de cluster, à parte), `payments/index.ts` e `providers/email.ts` (seleção por ambiente).

### 1.2 Dependências

| Verificação | Resultado |
|---|---|
| `npm audit` (tudo) | 6 avisos **moderados**, 0 altos ou críticos: 4 pela cadeia `drizzle-kit` > `@esbuild-kit` > `esbuild` 0.18 (servidor de desenvolvimento do esbuild, GHSA-67mh-4wv8-2f99; só `devDependencies`); 2 por `uuid` 9 via `gaxios` (`@google-cloud/storage`, `google-auth-library`; GHSA-w5hq-g745-h8pq, função v3/v5/v6 não usada) |
| `npm audit --omit=dev` (o que vai para a imagem) | 2 moderados (`uuid`, `gaxios`), com correção disponível sem mudança maior |
| `npm outdated` | 21 pacotes atrás. Só correções e menores: `hono` 4.13.13, `drizzle-orm` 0.45.4, `nodemailer` 10.1.7, `zod` 4.6.7, `react` e `react-dom` 19.3.1, `@google-cloud/storage` 8.4.0, `@hono/node-server` 2.1.5, `vite` 8.3.4, `vitest` 5.0.5, `@playwright/test` 1.64.1. Maiores disponíveis (não aplicar agora): `google-auth-library` 11, `typescript` 7, `@types/node` 26 |
| CI (`.github/workflows/ci.yml`) | Roda `npm audit --omit=dev --audit-level=high`: os moderados não travam a CI, por decisão registrada em `docs/registros/riscos-aceitos.md` (10/10/2026), com reavaliação marcada para **20/10/2026**, amanhã |

Recomendação: aplicar as atualizações de correção e menores num lote único depois da entrega (com lint, tipos, bateria e build), e tratar `uuid`/`gaxios` com `npm update @google-cloud/storage google-auth-library` dentro das faixas atuais.

### 1.3 Segurança (OWASP Top 10, no código e no build local)

Método: quatro revisões independentes só de leitura, por frente (autenticação e sessão; autorização e IDOR; estoque, pagamento, webhook, emissão e portaria; entrada, upload, injeção, cabeçalhos, segredos e logs), cada uma com arquivo e linha, mais conferência minha dos pontos mais graves. Relatórios completos em `auditoria/` (resumos em `docs/relatorios/`). Os achados abaixo recebem os ids `S-nn` da tabela final; entre parênteses, o id da frente.

**Controles conferidos e corretos (resumo).** Sessão com token de 256 bits e só o hash no banco; cookie `__session` HttpOnly, Secure fora do local, SameSite=Lax; expiração absoluta e por inatividade por perfil; troca e redefinição de senha derrubam as demais sessões; desativação derruba todas. CSRF por `Origin` exato (ou `Sec-Fetch-Site`) mais token HMAC por sessão em tempo constante; webhook e rotinas fora do cookie, autenticados por assinatura e OIDC. Argon2id; login com tempo igualado e mensagem única; recuperação com token de uso único de 1 h. Autorização: nenhum IDOR encontrado nas 123 rotas; pedidos e ingressos filtram pelo dono (404 para terceiros e para o dono anterior após transferir); portaria com CPF mascarado e janela operacional no servidor; `/admin/*` inteiro atrás de `requireAdmin`. Estoque: transação única com `FOR UPDATE` em ordem fixa e recontagem das reservas válidas; preço só do banco; limite por pedido no servidor; promoter só vincula. Webhook: HMAC-SHA256 em tempo constante com janela de 300 s, idempotência por índice único, reconsulta obrigatória e conferência de valor, moeda, conta e método. Emissão: 144 bits aleatórios mais HMAC, versão de chave e rotação, índices únicos, emissão dentro da transação que marca pago. Portaria: `UPDATE` condicional preservando a primeira entrada, índice único de entrada válida. Cabeçalhos: CSP com nonce por resposta e fontes justificadas, HSTS, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, `nosniff`, `Cache-Control: private, no-store` em toda a API. Upload: 5 MB, validação pelo conteúdo com sharp, reencode em WebP sem EXIF, nome gerado no servidor. SQL só com parâmetros ligados; LIKE escapado; CSV com neutralização de fórmulas; HTML injetado escapado; logs com mascaramento por nome e por formato; erro interno sem stack.

**Achados de segurança.**

| Id | Sev. | Área | Achado (arquivo:linha) | Correção sugerida | Esforço |
|---|---|---|---|---|---|
| S-01 (A-1) | **alta** | Limites por IP | Quem chama o `run.app` direto, com `X-Forwarded-Host` forjado, escolhe o IP que o servidor considera do visitante (`auth/middleware.ts:10-17`, `TRUSTED_PROXY_HOPS=2`, ingress aberto, Turnstile desligado). Todos os limites por IP (cadastro 50/h, recuperação, 30 falhas de login por IP) deixam de valer; o IP gravado no aceite e na sessão é escolhido pelo atacante. Sobram o limite por e-mail e os tetos globais. O risco do `X-Forwarded-Host` foi aceito em 10/10 (`riscos-aceitos.md`), mas a combinação com o Turnstile desligado não foi reavaliada | Limitar também pelo último elemento do `X-Forwarded-For` (o vizinho real que o Google acrescenta) e validar com `isIP`; reavaliar religar o Turnstile | 4 a 6 h |
| S-02 (A-2) | **alta** | Enumeração | `POST /auth/register` diz qual campo já existe ("Este e-mail já tem cadastro", "Este CPF já tem cadastro"; `auth/service.ts:97-108`) e o teto global só conta cadastros criados (`globalLimits.ts:15-16`): com S-01, enumeração de e-mail e CPF sem limite efetivo | Teto global para respostas "já cadastrado" com alerta; Turnstile; resposta neutra exige decisão do cliente (CA-02) | 2 a 4 h |
| S-03 (A-3) | média | Disponibilidade | 5 falhas em 15 min por e-mail bloqueiam o dono mesmo com a senha certa, sem depender de IP (`auth/limits.ts:5-6,46`): dá para negar o acesso de um validador ou administrador durante o evento repetindo a cada 14 min | Bloqueio por par e-mail mais IP, ou atraso progressivo e desafio em vez de negar (muda RF-10: decisão do cliente) | 3 a 6 h |
| S-04 (A-4) | média | Sessão | `POST /me/password` não limita tentativas da senha atual (`auth/service.ts:331-355`); com um aparelho aberto (tablet da portaria) dá força bruta da senha atual e tomada da conta. `docs/autenticacao.md:154` afirma o contrário | Reutilizar `loginBlock`/`recordLoginAttempt` na troca | 1 a 2 h |
| S-05 (A-5) | média, decisão | Cadastro | Sem prova de posse do e-mail nem do CPF; CPF de terceiro pode ser cadastrado antes do dono e só o atendimento corrige (`auth/service.ts:152-162`) | Confirmar e-mail antes de comprar e fluxo de contestação de CPF; registrar como pendência do cliente | 8 a 16 h |
| S-06 (B-1) | média | LGPD, logs | CPF completo viaja na URL de `GET /admin/buyers?q=` e `GET /admin/privacy/subjects?cpf=` (`api/panel.ts:111-115`, `api/privacy.ts:42-45`, `src/site/api.ts:1209`): os logs de requisição do Cloud Run e da Vercel gravam a URL fora do mascaramento da aplicação | Buscas por CPF em `POST` com corpo JSON, como `/gate/search` | 2 a 4 h |
| S-07 (B-2, C-7) | média | Privacidade | Prévia da transferência é oráculo por CPF ou e-mail: 404 sem conta, 409 sem data de nascimento, 403 menor para o evento, 200 nome mascarado (`tickets/transfer.ts:114-170`); limite de 15 por 10 min em memória, por instância | Unificar as recusas de destino na mesma resposta; limite no banco | 2 a 3 h |
| S-08 (D-1, B-3) | média | Negação de serviço | Limitador do PDF público (`/public/events/:slug/autorizacao-menor.pdf`) usa o `x-forwarded-for` bruto como chave (`api/public.ts:71-73`): variar o prefixo cria uma chave por chamada e cada chamada gera um PDF | `clientIp(..., TRUSTED_PROXY_HOPS)` e teto global | 0,5 h |
| S-09 (D-2) | média | Negação de serviço | `bodyLimit` de 1 MB só vale com `Content-Type: application/json` (`app.ts:95-103`), mas `c.req.json()` aceita qualquer tipo: corpo de dezenas de MB em `text/plain` vai inteiro à memória da instância de 512 MiB | `bodyLimit` em todo `/api/*` não multipart, ou recusar tipo não JSON em `parseJson` | 0,5 h |
| S-10 (C-2) | média, decisão (D-03) | Pagamento | Pix gerado com 31 s de reserva vence 1.860 s depois e a reserva não é estendida (`orders/payment.ts:89,229-258`): outro comprador reserva a unidade e o pagamento vira `pago_sem_estoque`, com dinheiro retido até estorno manual | Estender a reserva até o vencimento do Pix, ou exigir folga mínima para gerar Pix | 3 a 4 h |
| S-11 (C-1) | baixa | Concorrência | Ordem de travas invertida entre `expireOverdue` (reservas, depois pedidos) e a aprovação (pedidos, tipos, reservas): impasse possível com reserva vencida e webhook tardio; o webhook recebe 503 e é reentregue, o comprador pode ver um 500 | Trancar os pedidos primeiro em `expireOverdue` ou repetir em 40P01 | 1 a 2 h |
| S-12 (C-3) | baixa | Webhook | Id do evento inclui `type`, `action` e `date_created`, que não são assinados (`mercadopago/index.ts:243-246`): reenvio de notificação autêntica com `action` variado em 5 min cria linhas e reconsultas (só carga) | Compor o id só com partes assinadas | 1 h |
| S-13 (C-4) | baixa | Webhook | Teto de notificações inválidas por instância e por IP forjável | Teto global no banco | 1 a 2 h |
| S-14 (C-5) | baixa | Taxa mensal | `paid_at` é o relógio do servidor na conciliação, não o instante da aprovação do gateway (`mercadopago/mapping.ts:174-175`); a documentação afirma o contrário; aprovação tardia na fronteira do mês muda o mês da taxa | Ler a data de aprovação da transação (a confirmar na API) ou corrigir o documento | 1 a 2 h |
| S-15 (C-6) | baixa, requisito | Portaria | Evento publicado abre a portaria a qualquer hora; a janela operacional só vale para encerrado (`gate/service.ts:102-105`): um validador pode marcar "utilizado" dias antes, sem desfazer | Aplicar a abertura (ex.: 12 h antes) também ao publicado, ou confirmação fora da janela | 1 a 2 h |
| S-16 (C-8) | baixa | Lotes | Aprovação tardia depois da virada soma em `quantity_sold` do lote original (a sobra já passou): relatório por lote incoerente; o teto do tipo é respeitado | Devolver a unidade de `carried_in` do lote seguinte ou documentar | 2 h |
| S-17 (D-3) | baixa, a confirmar | CSP | `/eventos/:slug` sai com `Cache-Control: public, max-age=60` e nonce novo por resposta: se a CDN guardar, todos recebem o mesmo nonce por 60 s | `no-cache` ou `private` | 0,25 h |
| S-18 (A-6) | baixa | Enumeração | Tempo de resposta de `POST /auth/password/forgot` difere entre e-mail existente e inexistente (fila processada dentro da requisição, até 3 s) | Responder 202 e processar depois | 1 a 2 h |
| S-19 (A-7) | baixa | Robustez | Valor não-IP no `X-Forwarded-For` vira 500 no login, cadastro e aceite (colunas `inet`) | Validar com `isIP`, gravar nulo | 1 h |
| S-20 (A-8) | baixa, doc | Senha temporária | `PATCH /me` e `/me/birth-date` ficam acessíveis com senha temporária, ao contrário do que `docs/autenticacao.md:112` afirma | Regra no `requireUser` ou corrigir a doc | 1 h |
| S-21 (A-9) | baixa | Senhas | Sem bloqueio de senhas comuns ("senha123" passa) | Lista local de senhas comuns | 2 a 3 h |
| S-22 (A-10, B-9) | baixa, decisão | Equipe | Um administrador redefine a senha ou o e-mail de outro administrador e entra como ele; fica na trilha, sem aviso | Avisar o alvo e exigir motivo, ou só com alvo desativado | 2 a 4 h |
| S-23 (B-8) | baixa, a confirmar | LGPD | E-mail completo em `before/after` da trilha; a anonimização não toca `audit_log` | Hash ou máscara do e-mail na trilha | 1 a 2 h |
| S-24 (B-10) | baixa, RF-54 | Portaria | Leitura de QR de outro evento devolve o nome do titular | Devolver só o código curto e o nome do evento | 0,5 h |
| S-25 (B-4) | baixa | Negação de serviço | 4 rotas de PDF do comprador sem limite por conta (`api/tickets.ts:62-104`) | Reutilizar o limitador das outras rotas | 1 h |
| S-26 (B-5, B-6, B-7, B-11, D-5, D-6, D-8, C-9, C-10) | baixa | Higiene | `FOR SHARE` antes de conferir o titular; `orderId` sem UUID no simulador de homologação; proteção de `/admin/*` dependente da ordem de montagem (`ROUTE_POLICY` só usada na portaria); contador da portaria sem `loadEvent`; contexto do Docker com `e2e/.run` e `auditoria/`; `X-Request-Id` do cliente aceito e ecoado; comentário de CSV desatualizado; 404 de ingresso com texto de pedido; rótulo de ingresso utilizado em pedido estornado | Itens de 10 min a 2 h cada | 4 a 6 h no total |
| S-27 (D-4) | baixa, aceito | CSP | `style-src 'unsafe-inline'` por causa de `style={{}}` do React | Registrar como aceito ou migrar para classes | 2 a 4 h |
| S-28 (D-7) | baixa, decisão | LGPD | Exportação de encerramento (`ops/closureExport.ts`) tem CPF completo, e-mail, nascimento e telefone, sem procedimento de transporte cifrado e descarte em 30 dias | Documentar o procedimento operacional | 1 h |
| S-29 (A-11) | baixa, doc | Documentação | `docs/autenticacao.md` afirma garantias que o código ou a produção não têm (Turnstile obrigatório, tempo igualado na recuperação, limite na troca de senha) | Atualizar e registrar a decisão do Turnstile | 1 h |

Lacuna funcional registrada (não é defeito de segurança): não existe forma de o administrador **desativar um cliente**; a única via é a anonimização LGPD.

### 1.4 Segredos e histórico do Git

- `gitleaks` sobre os 118 commits: 8 ocorrências, **todas falsos positivos**: 2 chaves públicas DKIM em `docs/operacao/dkim-para-copiar.txt` (públicas por natureza, para o DNS) e 6 valores fictícios em testes (`tok_...`, assinatura de teste, token de cartão de exemplo).
- Nenhum `.env`, `.pem`, `.key` ou arquivo de credencial foi versionado em qualquer commit; só `.env.example`. Os scripts `scripts/setup-mp-credentials*.sh` leem os valores por `stdin` e gravam no Secret Manager, nunca em arquivo.
- Segredos sem valor padrão fora do ambiente local (`config.ts`); a imagem Docker não recebe `.env*`; `USER node`.

### 1.5 Código morto e restos

| Item | Situação | Recomendação |
|---|---|---|
| Protótipo navegável (`src/screens`, `src/logic`, `src/docs`, `src/components`, `src/data`, `src/lib`, `src/prototype*`, `src/Shell.tsx`, `src/App.tsx`) | **22.407 linhas**, mais que o site real (17.081) e quase o servidor (20.989). Só compila com `ENABLE_PROTOTYPE=true` em homologação; o build de produção não gera o pacote (confirmado nos arquivos do `dist`). Concentra os avisos de lint e textos de meia-entrada, lotes manuais e regras antigas | Mover para `reference/` ou apagar antes da entrega, por decisão do responsável (o cliente não recebe código-fonte, Cl. 9.4, mas o repositório é o que a contratada mantém) |
| Meia-entrada | No produto só o redirecionamento 301 de `/meia-entrada` para os Termos (correto, mantém links antigos) e textos no protótipo | Nenhuma ação no produto |
| Autorização judicial | Coluna `events.judicial_authorization` sem uso desde a 0010 (expand/contract documentado) | Remover numa migração futura, depois da próxima publicação estável |
| Tema provisório | `VISUAL_APPROVED`/`provisionalTheme` continuam como trava de venda e campo em `/public/site`; em produção `true` | Manter (trava útil) ou remover a flag com a aprovação registrada |
| Homologação | Referências legítimas: `EMAIL_ALLOWLIST`, `HOMOLOGACAO_GATEWAY_FICTICIO`, `ENABLE_PROTOTYPE`, avisos de documento provisório, `/admin/dev/mock-gateway` (só com flag). Todas guardadas por `APP_ENV` e recusadas em produção pelo `config.ts` | Nenhuma ação |
| TODO, FIXME, HACK | Nenhum real (os 5 resultados são máscaras `PX-XXXX-XXXX` e um cupom de teste) | Nenhuma ação |
| Flags de configuração | Todas as 18 conferidas são lidas em pelo menos um arquivo fora de `config.ts` | Nenhuma ação |
| `infra/testes/*.mjs`, `infra/ui/*` | Scripts de rodadas anteriores com variáveis não usadas (avisos de lint) | Limpeza opcional |
| `reference/` (2,2 MB de HTML exportado do Claude Design) | Fonte de design; ignorada pelo lint | Manter fora do pacote entregue ao cliente |
| Trabalho não comitado (taxa de serviço) | 66 arquivos alterados e 20 novos sem commit há mais de um dia de trabalho | Comitar assim que revisado; risco de perda e de divergência entre a pasta e a tag publicada |

### 1.6 Resumo da Fase 1

Sem bloqueante. Dois achados **altos**, ligados entre si e a uma decisão já tomada (Turnstile desligado em 06/10 e `X-Forwarded-Host` aceito em 10/10): com o `run.app` aberto, os limites por IP não protegem, e o cadastro revela se e-mail e CPF existem. Oito **médios**: bloqueio de conta por e-mail (negação de acesso à portaria), troca de senha sem limite, CPF na URL das buscas do admin, oráculo da transferência, dois vetores de consumo de CPU e memória, Pix além da reserva e cadastro sem prova de posse (decisão). O restante é baixo ou de documentação. Bateria, tipos, lint e build passam; dependências sem aviso alto; histórico do Git limpo.

## Fase 2: testes funcionais de ponta a ponta (local)

### 2.1 Como foi feito

Suíte nova em `auditoria/e2e/` (Playwright 1.62), servidor local com o gateway fictício pelo caminho real do webhook, PostgreSQL de
teste descartável, semente própria (8 compradores de idades diferentes, 2 promoters, 10 eventos em cada estado da vitrine, 5 pedidos
pagos). 35 cenários de interface rodam em **9 projetos** (Chromium, WebKit e Firefox a 360, 390 e 1280 px) e 31 cenários de regra de
servidor, portaria com câmera simulada, admin, e-mails, PDFs e LGPD rodam uma vez em Chromium 1280. Comando:
`npx vite build && npx playwright test -c auditoria/e2e/auditoria.config.ts`. A matriz completa (cenário por navegador e largura) está em
[`matriz-e2e.md`](matriz-e2e.md), gerada por `auditoria/ferramentas/resumo-e2e.mjs`; as capturas em `docs/relatorios/capturas/`.

O que ficou fora, e por quê: pagamento com cartão real (Card Payment Brick, aviso quando o Brick não carrega, cartão em análise pelo
antifraude) exige as credenciais de sandbox do Mercado Pago e o ritmo que o antifraude de teste impõe; é coberto pela rodada do
roteiro 11.2 em sandbox do projeto (`npm run e2e:roteiro:sandbox`, feita em 12/10 e 18/10) e por `src/site/cardBrickMount.test.ts`.
A rotina diária de conciliação e as tarefas do Cloud Tasks não são chamáveis no ambiente local (exigem OIDC do Google; respondem
503), e ficam com os 87 casos de `reconcile.integration.test.ts` e a execução real em homologação (13/10). A leitura de QR pela câmera
só é simulável em Chromium (vídeo falso); em WebKit e Firefox a portaria foi testada pela busca manual e pela API.

### 2.2 Resultado por área

RESULTADO_FASE2

### 2.3 Achados funcionais e de fluxo

| Id | Sev. | O que | Evidência | Impacto | Correção sugerida | Esforço |
|---|---|---|---|---|---|---|
| F-01 | média | Não existe forma de o comprador excluir a própria conta nem baixar os próprios dados; também não há tela no painel para o administrador atender o pedido (só API com protocolo) | `01-conta` (cenário "não existe na interface"), `15-lgpd` | A Política promete os dois direitos "a pedido" e o fluxo hoje depende de a contratada rodar a API; o Bernardo não consegue atender sozinho | Tela "Privacidade" no painel (localizar, exportar, anonimizar com protocolo); exclusão pelo comprador é decisão do cliente | 4 a 6 h |
| F-02 | média | "Evento cancelado com estorno de todos os pedidos" não existe como operação: encerrar o evento não estorna nem cancela ingressos; o estorno é pedido a pedido no Mercado Pago e cada webhook cancela os ingressos | `11-cancelamento-estorno` | Num cancelamento com dezenas de pedidos, o Bernardo faz um estorno por vez no painel do Mercado Pago, sem checklist nem lista pronta | Página do evento no painel com a lista de pedidos pagos a estornar (link para cada pagamento no Mercado Pago, valor com a taxa) e marcação do que já foi estornado; o estorno pela API seria mudança de escopo | 4 a 8 h |
| F-03 | baixa | Depois de salvar a senha nova no primeiro acesso, a sessão é encerrada e a pessoa precisa entrar de novo | `13-admin` (equipe) | Mais um passo para o validador no dia do evento | Manter a sessão atual ao trocar a senha no primeiro acesso (como já ocorre na troca pela conta) | 1 h |
| F-04 | baixa | Os diálogos de promoter e de membro da equipe não fecham com Esc; os de evento e de desfazer transferência fecham | `13-admin` (anotação) e `src/site/adminPeople.tsx` | Inconsistência de teclado (WCAG 2.1.2 na prática) | Mesmo tratamento de Esc nos quatro diálogos | 0,5 h |
| F-05 | baixa | Cartão sem resposta do banco: a tela do pedido mostra a mensagem registrada no cenário "cartão pendente" (ver matriz) e atualiza sozinha quando a aprovação chega | `04-pagamento` | Nenhum | Nenhuma | |
| F-06 | info | Lote esgotando no meio do pedido: o servidor recalcula e a tela avisa "Atenção. O valor do pedido mudou. Confira o novo total antes de continuar." e mostra o valor novo | `16-concorrencia` | Comportamento correto | | |
| F-07 | info | Dois compradores na última unidade: um reserva, o outro vê o aviso de estoque; dois validadores no mesmo QR: uma entrada só | `16-concorrencia`, `12-portaria` | Correto | | |
| F-08 | info | Pagamento depois da reserva vencer: com estoque confirma e emite; sem estoque vira `pago_sem_estoque`, aviso por e-mail aos administradores e item em Exceções | `10-webhook` | Correto (procedimento provisório D-13) | | |

A instabilidade do WebKit na rodada com 3 trabalhadores (navegador fechado no meio do teste por falta de memória na máquina da
auditoria) foi tratada com uma rodada só dos projetos WebKit com 1 trabalhador; o resultado consolidado está na matriz.

## Fase 3: teste de carga (k6, local)

### 3.1 Modelo e hipóteses

Evento de **500 ingressos numa cidade pequena** (Pista 350 a R$ 60,00 e VIP 150 a R$ 120,00), compradores já cadastrados (quem compra na
abertura já tem conta), 3 validadores. Servidor local empacotado como no contêiner (`dist-server`), heap de 320 MB, `DB_POOL_MAX=5`,
gateway fictício com confirmação pelo caminho real do webhook, PostgreSQL 16 de teste em Docker. Ferramentas em `auditoria/carga/`;
execução por `auditoria/carga/run-carga-auditoria.sh [escala]`. Nada toca a produção.

| Hipótese | Como foi modelada | Métrica de sucesso |
|---|---|---|
| H1 Abertura das vendas: 300 pessoas ao mesmo tempo nos primeiros 10 min | `ramping-vus` 0 a 300 em 2 min, 300 por mais 8 min; cada pessoa abre a página do evento (HTML com Open Graph e API) e lê por 5 a 15 s, repetidamente | p95 da página do evento e da API abaixo de 1 s; tempo até o primeiro byte do HTML; 0 erros |
| H2 Pico de 60 pedidos por minuto | `constant-arrival-rate` de 60/min por 10 min (600 tentativas para 500 ingressos: as recusas por estoque depois de esgotar são esperadas, não erros); cada pedido: login, pedido com reserva (1 ou 2 unidades, 70% Pista), Pix, confirmação pelo webhook, consulta do pedido até "pago", Meus ingressos | p95 de cada etapa abaixo de 5 s; compra completa p95 abaixo de 10 s; nenhum erro inesperado; vendidos nunca acima de 500 |
| H3 500 webhooks do Mercado Pago em 5 min | 100/min por 5 min: 90% repetições de confirmação de pedidos já pagos (idempotência) e 10% com assinatura inválida (devem dar 401) | p95 abaixo de 2 s; repetição não duplica ingresso; 401 nas inválidas |
| H4 Portaria: 500 leituras em 90 min por 3 validadores | 3 usuários virtuais (um por validador) com a mesma quantidade de leituras **em 9 min** (tempo comprimido 10 vezes para caber na rodada: a taxa é 10 vezes maior que a real, portanto mais exigente); 1 em cada 12 leituras repete um QR já usado; cada leitura consulta o contador, como a tela faz | p95 do `/gate/scan` abaixo de 1 s; uma entrada só por ingresso; 0 erros |
| H5 Três vezes a carga | Escala 3: 900 pessoas, 180 pedidos/min, 1.500 webhooks, 1.500 leituras, evento de 1.500 ingressos | Os mesmos limiares |

Medidas: p50, p95 e p99 por rota (etiqueta `etapa` do k6), taxa de erro, tempo até o primeiro byte da página do evento, conexões
abertas e ativas no PostgreSQL (amostra a cada 2 s em `pg_stat_activity`), CPU e memória RSS do processo (a cada 2 s), tempo de fila
dos e-mails (`email_log`: criado até enviado, p50, p95, máximo). Depois de cada rodada, as invariantes do banco
(`auditoria/consultas/invariantes.sql`, 14 consultas só leitura, executadas numa transação `read only` por
`auditoria/ferramentas/invariantes.mjs`): ingressos nunca acima da capacidade, todo pedido pago com os ingressos comprados, nenhum
ingresso de pedido não pago, nenhum QR, código ou código curto repetido, nenhuma entrada válida duplicada, vendidos iguais aos emitidos,
lotes dentro da capacidade, total igual a itens mais taxa, notificação processada uma vez, reserva ativa só em pedido pendente.
Para rodar em produção, só leitura: `node auditoria/ferramentas/invariantes.mjs "<URL do papel partyx_backup>"`.

### 3.2 Resultados

Em execução (escala 1 e depois escala 3); os números e os gráficos vão para `docs/relatorios/carga/escala-1.md` e `escala-3.md` e o
resumo entra aqui.

## Fase 4: UI, UX, acessibilidade e desempenho

### 4.1 Comparação com a referência (minhaentrada.com.br), fluxo e informação

Fonte: páginas públicas da referência lidas em 19/10/2026 (início, página de evento, fale conosco, termos de uso). O checkout da
referência não foi percorrido (exige conta e compra). Nada de identidade visual foi considerado.

**Cliques do Instagram até o Pix pago no PartyX** (comprador que já tem conta e já está logado): link da bio abre o início (com a
abertura em vídeo de até 4 s na primeira visita) > cartão do evento > "+" no tipo > "Continuar" > caixa da Política de Cancelamento >
"Ir para o pagamento" (reserva de 30 min) > "Pix" > "Gerar Pix" > "Copiar código" > pagamento no app do banco > a página confirma
sozinha. **9 toques** até o código Pix. Comprador novo: mais a tela de cadastro (7 campos, aceite e "Criar conta", volta ao checkout
com a seleção preservada), cerca de **19 toques**. Na referência o acesso é por CPF e senha ou Google e o "Compre Agora" também
pede login antes; o número de toques depois do login não foi medido.

| Tema | PartyX hoje | Referência | Recomendação |
|---|---|---|---|
| Preço e taxa | Preço do ingresso com a taxa de serviço separada ao lado ("R$ 80,00 + R$ 4,22 taxa"), no evento, na revisão, no pedido, no e-mail e no PDF (trabalho não comitado) | Taxa de conveniência não aparece na página do evento (fica nos termos, por evento) | **Manter o PartyX**: a taxa visível desde o início é mais transparente e evita surpresa no checkout (CDC) |
| Formas de pagamento no evento | Bloco "Formas de pagamento": Pix e cartão de crédito ou débito, sem parcelas (à vista, D-02) | Bandeiras com "Em até 6x" e PIX | Parcelamento é decisão do cliente (D-02); se adotar, mostrar "em até Nx" no mesmo bloco |
| Local com mapa | Nome do local e endereço em texto; **sem link para o mapa** | Nome do local com link para o Google Maps | **Adotar**: link "Ver no mapa" (endereço codificado numa URL do Google Maps), baixo esforço, muito usado no celular |
| Horário | Só o horário de início | Abertura dos portões e início | Opcional, decisão do cliente: campo "abertura" por evento |
| Classificação etária | Classificação com a frase da regra e as regras de menores (16 e 17 com termo) | Campo vazio no evento consultado; aviso em texto livre | **Manter o PartyX** |
| Lineup e descrição | Descrição e lista de atrações | Descrição com "Mostrar mais"; sem lista separada | Manter; "Mostrar mais" para descrições longas é um ganho pequeno |
| Lote e disponibilidade | Nome do lote, "últimas unidades", "em breve", "esgotado", "indisponível no momento" (reservas em andamento) | Sem lote nem "a partir de" nos cartões | **Manter o PartyX**; considerar "a partir de R$ X" nos cartões da vitrine |
| Limite por pedido | "Até 6 por pedido" visível e imposto no servidor | Não aparece | Manter |
| Cupom | Código de promoter (só atribui a venda, sem desconto) | Campo de cupom de desconto | Desconto de promoter é decisão do cliente, a implementar; não é defeito |
| Política na página | Link para a Política de Cancelamento, Troca e Reembolso abaixo do "Continuar" e caixa obrigatória na revisão | Políticas só no rodapé | **Manter o PartyX** |
| Sinais de confiança | Rodapé com razão social, CNPJ, e-mail, WhatsApp e horário de atendimento (por configuração); HTTPS | CNPJ, endereço, telefone e horário, redes sociais | **Adotar**: link para o Instagram da PartyX no rodapé e, na página do evento, uma linha "Compra segura: pagamento pelo Mercado Pago" perto do botão |
| Ajuda e perguntas frequentes | **Não existe** página de ajuda; só os documentos legais e o contato no rodapé | "Central de ajuda" é um formulário de contato com telefone; também sem FAQ | **Adotar** uma página "Ajuda" curta (8 a 10 perguntas: como recebo o ingresso, não recebi o e-mail, transferir, reembolso, menores, entrada, Pix não aprovado, cartão recusado) com link no rodapé e no e-mail de compra |
| Área "Meus ingressos" | Carteira por evento com QR, tela cheia, PDF, transferir, Termo de Autorização; "Minhas compras" com o estado de cada pedido | "Meus pedidos" com cancelamento em 7 dias | Manter; o cancelamento por desistência não existe por decisão do cliente (só transferência) |
| Entrega do ingresso | Na conta (QR), PDF por ingresso e do pedido, e-mail de compra com link (sem anexo) | E-ticket por e-mail; impressão | Manter; considerar o PDF anexado no e-mail como opção futura (hoje o link exige login, o que protege o QR) |
| Compartilhar e salvar | Compartilhar com WhatsApp, Instagram, copiar link e compartilhamento nativo; Open Graph com a capa | WhatsApp e Facebook; sem salvar na agenda | **Adotar** "Adicionar à agenda" (arquivo `.ics` ou link do Google Agenda) na página do evento e na confirmação |
| Transferência | Ilimitada, por e-mail ou CPF, até 2 h antes, com regras de idade e termo para menores | Uma única vez, por termo com nome e CPF; o novo titular não retransfere | Manter (mais flexível); avaliar com o cliente se quer limitar a uma retransferência |
| Reembolso | Sem reembolso por desistência (decisão do cliente); evento cancelado devolve pelo Mercado Pago | 7 dias de arrependimento, nunca nas 48 h antes do evento; Pix devolve para carteira própria | Decisão do cliente; registrar o risco do art. 49 do CDC na Política (já citada) |
| Login | E-mail e senha; recuperação por e-mail | CPF ou documento e senha; login com Google | Login social é evolução, não defeito |
| Atendimento ao comprador | E-mail e WhatsApp da PartyX, horário comercial | Telefone e formulário, seg a sáb 9h às 18h | Manter; a página de Ajuda cobre o que o formulário faz |

Diferenças que não recomendo adotar: carteira virtual própria (MECash), reconhecimento facial, PDV e área de relações públicas
(escopo fora do contrato), devolução de Pix para uma carteira interna (pior para o comprador).

### 4.2 Heurísticas, acessibilidade, desempenho e compartilhamento

Em execução.

## Fase 5: operação e prontidão para entrega

### 5.1 Ensaio de restauração do backup mais recente

Em execução (depois da carga): cópia `partyx-20261019T021135Z.dump` (124 KB, 19/10 02:11 UTC, feita antes da candidata
`partyx-00044-dil`) baixada do bucket privado em modo leitura, SHA-256 conferido, manifesto com 24 tabelas e 17 migrações.

### 5.2 Ensaio de rollback no ambiente local

Em execução (depois da carga).

### 5.3 Alertas: os 17 em produção, o que cobrem e o que falta

Lidos do Cloud Monitoring do projeto `partyx-producao` em 19/10/2026 (só leitura): 17 políticas, todas ativas, canal de e-mail da
operação. As 13 por log vêm de `infra/operacao/alerts.sh`; as outras 4 foram criadas à mão (uptime, 5xx, backup).

| Alerta | O que cobre | Limite |
|---|---|---|
| `saúde indisponível (partyx.com.br)` | `GET /api/health` pelo domínio, 3 regiões a cada 5 min, com validação do certificado; dispara após 10 min de falha em 2 regiões ou mais | Desde 18/10 aponta para `/api/health` (sem banco), para o Neon poder dormir: um banco fora do ar **não** dispara este alerta; só o de 5xx |
| `respostas 5xx (partyx)` | Respostas 5xx do serviço no Cloud Run (criado em 18/10) | Cobre o banco fora do ar quando há tráfego; sem tráfego, nada dispara |
| `backup_falhou`, `backup ausente` | Job de backup falhou; nenhum backup bem-sucedido em 25 h | |
| `pago_sem_estoque` | Pagamento aprovado depois da reserva vencer, sem estoque; também avisa os administradores por e-mail | |
| `webhook_falhou`, `reconciliacao_falhou`, `fila_conciliacao_falhou`, `conciliacao_revisao_manual` | Webhook não processado; reconsulta ao gateway falhou; não conseguiu agendar a tarefa no Cloud Tasks; pedido sem estado conclusivo depois de 24 h | |
| `pagamento_divergente`, `estorno_fora_de_fluxo`, `estorno_parcial`, `cobranca_duplicada` | Valor, conta ou pedido diferentes; estorno de pedido nunca aprovado; estorno parcial (D-82); segunda cobrança (D-83) | |
| `email_falhou`, `fila_email_falhou` | E-mail que esgotou as 4 tentativas; não conseguiu agendar o reenvio | |
| `limite_global_atingido`, `verificacao_humana_indisponivel` | Teto global de cadastros ou recuperações por hora; Turnstile fora do ar (hoje desligado: nunca dispara) | |

Lacunas pedidas na auditoria:

| Situação | Coberta? | Como cobrir |
|---|---|---|
| Fila de e-mails parada (e-mails `pendente` acumulando sem nenhuma tentativa) | **Não.** `email_falhou` só sai depois de 4 tentativas de um e-mail; `fila_email_falhou` só quando o Cloud Tasks recusa o agendamento. Se as tarefas forem criadas e nunca executadas (fila pausada, permissão da conta de serviço), ninguém é avisado até a varredura das 04:00 | Métrica por log na varredura diária (`conciliação de pagamentos executada` com `emails.pending` acima de 0) ou uma verificação de uptime num endpoint de saúde que conte `email_log` pendente há mais de 30 min (exige mudança de código) |
| Webhook sem chegar por 1 hora com pedidos pendentes | **Não.** Hoje a conciliação por pedido (1, 2, 4, 8 min e tardias) confirma o pagamento mesmo sem webhook, e `conciliacao_revisao_manual` só aparece após 24 h. Um webhook quebrado (assinatura secreta trocada no Mercado Pago, URL errada) fica invisível enquanto a conciliação sob demanda compensa | Métrica "pedidos pagos nas últimas horas sem `payment_events` válido" na varredura, ou alerta de ausência da métrica de webhooks válidos quando há pedidos pagos (log `webhook processado`) |
| Conciliação com divergência | **Sim**: `pagamento_divergente` | |
| Certificado | **Parcial**: o uptime valida o certificado do domínio (expiração ou cadeia inválida falham a verificação). Não há aviso antecipado (ex.: 14 dias antes); a Vercel renova sozinha | Aceitável enquanto a Vercel for a ponte; ao voltar ao Firebase, o Firebase também renova |
| Orçamento | **Parcial**: orçamento `partyx-prod` de R$ 30 com avisos em 50, 90 e 100% por e-mail de faturamento, só para o Google. O Neon (cobrado à parte) e a Vercel não têm alerta de custo | Configurar o alerta de consumo do Neon (console) e acompanhar o uso da Vercel antes e depois dos eventos |
| Neon dormindo | **Parcial**: o uptime não acorda o banco de propósito; um erro de conexão só aparece como 5xx no primeiro acesso | Decisão registrada em 18/10 (`neon-dormindo-2026-10-18.md`) |

### 5.4 LGPD

| Item | Situação |
|---|---|
| Cadastro de aceites | Termos e Privacidade com versão, data, IP e navegador no cadastro e no novo aceite; Política de Cancelamento por compra; Termo de Ciência por pedido e por transferência (`consents`, `cancellation_acceptances`, `minor_term_acceptances`, `ticket_minor_acceptances`). O IP registrado pode ser forjado no acesso direto ao `run.app` (S-01) |
| Exportação e exclusão de dados | Só por API de administrador, a pedido da PartyX, com protocolo, limite por minuto e trilha sem dado pessoal; a anonimização desativa a conta, apaga nome, e-mail, CPF, telefone e senha e mantém pedidos (obrigação legal). **Não há tela** no painel nem na conta do comprador. Verificado na Fase 2 (cenário 15) |
| Retenção descrita na Política x real | Sessões, tentativas de login e códigos de recuperação: Política diz 6 meses, produção apaga com 180 dias às 04:05 (**confere**). Backups 35 dias (**confere**, bucket com retenção de 35 dias e cifra em repouso do Google). Registros de acesso 30 dias (**confere** no Cloud Logging; a retenção dos logs da Vercel no plano Hobby não está documentada). Pedidos e aceites 5 anos (sem rotina de descarte, por decisão). **Exceção**: a trilha de auditoria guarda o e-mail completo em `before/after` de correções de identidade e equipe, e a anonimização não a toca (S-23); a Política promete que o e-mail é apagado ou anonimizado |
| Logs sem CPF | Logs da aplicação mascaram por nome e por formato (Fase 1). Os logs de requisição da infraestrutura recebem a URL com o CPF nas buscas do painel e na rota LGPD (S-06) |
| Encarregado e contato | Publicados na Política (seção 1 e 8): nome, e-mail e WhatsApp; resposta em 15 dias |
| Exportação de encerramento | Contém CPF completo, e-mail, nascimento e telefone, sem procedimento de transporte e descarte (S-28) |

### 5.5 Documentação

| Pedido | Existe? | Observação |
|---|---|---|
| Runbook de abertura de vendas | Parcial: `docs/registros/checklist-abertura-de-vendas.md` (lista) e `README-DEPLOY.md` seção 7 ("dias de evento"), fora da pasta de runbooks | Consolidar em `docs/operacao/runbooks/abertura-de-vendas.md`: revisão de capacidade, `evento-on`, backup do dia, alertas, varredura, teste rápido, quem avisa quem |
| Runbook do dia do evento | `portaria.md`: antes (lista impressa, teste nos aparelhos, `evento-on` cedo), durante (tabela de situações), depois (`evento-off` no dia seguinte) | Adequado como base. Falta: conferir validadores e senhas temporárias na véspera, o caso do QR antigo de transferência ("Inválido" com explicação), a linha de "meia-entrada" (não existe mais) e "reserva de 10 min" em `estoque.md` (a reserva é de 30 min) |
| Runbook de incidente | `incidente.md`: 6 passos (identificar, conter, avaliar, avisar a PartyX sem demora, corrigir, registrar; ANPD e titulares são decisão da PartyX) | Base correta. Falta: modelo de comunicação à PartyX, lista de contatos, comando pronto para revogar todas as sessões e trocar cada segredo (sessão, QR, webhook, SMTP), e um exemplo de linha do tempo |
| Runbook de rollback | `rollback.md` (18 linhas) com os comandos e a regra para migrações | Adequado; acrescentar a referência de retorno atual e o ensaio cronometrado (5.2) |
| Runbook de limpeza | **Não existe** | Pós-evento: `evento-off`, exportações (CSV de ingressos e compradores), descarte da lista impressa, Termos de Autorização em papel (6 meses), retenção |
| Manual do painel para o Bernardo, em linguagem simples, com capturas | **Não existe**. Há rascunhos internos em `docs/homologacao/` (guia da portaria 0.26 com seção de meia-entrada já desatualizada, roteiro de testes 0.26, orientação remota de 1 h) | Escrever a partir das capturas desta auditoria (`docs/relatorios/capturas/admin/` e `portaria/`): criar evento e tipos, publicar, promoters, acompanhar pedidos, cancelar ingresso, estornar no Mercado Pago, exceções, relatórios e CSV, equipe e senhas, portaria passo a passo |
| Lista do que é da Zanon de Andrade e do que é do cliente | Espalhada (`README-DEPLOY.md`, `docs/operacao/*.md`, `docs/producao.md`) | Consolidada abaixo (5.7) |

### 5.6 Pendências conhecidas (estado em 19/10/2026)

| Pendência | Estado | Risco |
|---|---|---|
| Firebase e DNS antigo | Domínio `partyx.com.br` servido pela Vercel (plano Hobby, uso pessoal nos termos da Vercel) como ponte; certificado do Firebase preso em validação desde 15/10 por causa da zona antiga em `a.auto.dns.br`/`b.auto.dns.br`; o Firebase pede um TXT `_acme-challenge` no Registro.br | Pausa do projeto na Vercel por uso comercial tira o site do ar; a volta de emergência está em `docs/operacao/vercel.md` |
| Homologação a desligar | `partyx-hml` continua no ar: Cloud Run `partyx-hml-00012-tqz`, varredura 04:00 e backup 03:00 ativos, Neon de homologação, faturamento na conta `0158D3-9C1431-A0ABCF` (compartilhada com outros projetos) | Custo mensal do Neon de homologação e dos jobs; dados fictícios expostos na internet |
| CNPJ | Produção configurada com a razão social e o CNPJ do MEI do Bernardo (`PARTYX_LEGAL_NAME`, `PARTYX_CNPJ`), mostrados no rodapé, nos e-mails e nos PDFs; a conta do Mercado Pago é a mesma pessoa (`MP_COLLECTOR_ID` conferido na partida) | Se a PartyX passar a operar por outra pessoa jurídica, troca-se a configuração e a conta do gateway |
| Neon: plano e horas | Projeto `polished-truth-93517378`, plano Launch, 0,25 a 2 CU com suspensão automática, restauração de 7 dias; consumo de horas de computação não consultado (sem acesso à API do Neon nesta auditoria) | Conferir no console o consumo do mês e configurar o alerta de consumo |
| Push do repositório | A branch local está 15 commits à frente de `origin/feature/fechamento-homologacao`, mais os 3 commits desta auditoria; o trabalho da taxa de serviço (66 arquivos, 20 novos) continua sem commit | Perda de trabalho em falha da máquina; divergência entre o que está publicado (tags locais) e o GitHub |
| Taxa de serviço (D-90) | Pronta na pasta de trabalho, com migração `0017`, textos legais 1.3 e 1.1 e `env.prod.yaml` datado de 19/10; produção ainda na 1.2 sem taxa | Publicar só com backup, migração e virada no mesmo dia da data dos textos (o `deploy.sh` já exige) |

### 5.7 O que é da Zanon de Andrade e o que é do cliente

| Item | De quem | Custo | Observação |
|---|---|---|---|
| Projeto Google Cloud `partyx-producao` (Cloud Run, Tasks, Scheduler, Storage, Secret Manager, Monitoring, Firebase) | Conta Google do responsável (Zanon de Andrade), faturamento `01B4CE-D0C9DA-391606` ("PartyX", organização `zanondea-org`) | Dentro da franquia: perto de zero por mês; orçamento de R$ 30 com avisos | Para transferir ao cliente seria preciso uma conta Google dele e a mudança do dono do projeto e do faturamento |
| Projeto Google Cloud `partyx-hml` | Idem, faturamento `0158D3-9C1431-A0ABCF` (compartilhado) | Baixo, mas não nulo (Neon de homologação, jobs) | A desligar |
| Neon (produção `polished-truth-93517378` e homologação) | Conta Neon do responsável, plano Launch | Estimativa US$ 2 a 5 por mês em produção (`README-DEPLOY.md` seção 8), cobrado à parte | Não entra no orçamento do Google |
| GitHub `ZanonDeAndrade/PartyX` | Zanon de Andrade | Zero | O cliente não recebe o código (Cl. 9.4) |
| Vercel (`partyx-dominio`, time `zanondeandrades-projects`, Hobby) | Zanon de Andrade | Zero (Hobby, uso pessoal) | Temporário |
| Domínio `partyx.com.br` (Registro.br, vence em 24/04/2027) | **Cliente** (titular do domínio; o DNS passou a ser o do Registro.br em 14/10 por decisão do responsável) | Cerca de R$ 40 por ano | Só o titular altera registros |
| Mercado Pago (conta `3563483345`, credenciais de produção, assinatura secreta do webhook) | **Cliente** (Bernardo) | Tarifas por transação (Pix 0,99%, cartão 3,98% a 4,98%) | Segredos no Secret Manager do projeto; estornos feitos pelo cliente no painel do Mercado Pago |
| E-mail transacional (Resend por SMTP, remetente `ingressos@partyx.com.br`, DKIM no domínio) | Conta do provedor: a confirmar quem criou (os registros em `docs/operacao/resend-registros.json` foram preparados pelo responsável) | Plano gratuito do Resend (limite diário e mensal a conferir) | Depende do domínio do cliente |
| Caixa `partyx992@gmail.com` e WhatsApp de atendimento | **Cliente** | Zero | Publicados na Política como encarregado e contato |
| Cloudflare Turnstile | Chave de teste; desligado | Zero | Religar exige conta e chave de produção |
| Canal de alertas (e-mail da operação) | Zanon de Andrade | Zero | Avisos chegam só à contratada |
