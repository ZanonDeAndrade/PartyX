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

**Estado em 19/10/2026 (interrompida por limite de uso da sessão):** infraestrutura pronta e verificada nos 9 projetos (Chromium, WebKit e
Firefox a 360, 390 e 1280 px): `auditoria/e2e/auditoria.config.ts`, semente com 8 compradores de idades variadas, 2 promoters e 10 eventos
em cada estado da vitrine, servidor local com o gateway fictício e 5 pedidos pagos (`auditoria/e2e/support/`). Cenários escritos:
`01-conta`, `02-vitrine`, `03-checkout`, `05-menores`, `06-transferencia` (interface, 9 projetos), `10-webhook` e `16-concorrencia`
(regras de servidor, Chromium 1280). Primeira execução só em `chromium-1280`: 20 passaram e 15 falharam; a causa dominante era da
própria suíte (o cadastro pela API abre sessão e o login seguinte sem token CSRF recebia 403), corrigida em `fixtures.ts` e **ainda não
reexecutada**. Falhas a investigar na próxima rodada: início da vitrine e página do evento (textos esperados), além de reconferir as
dependentes do login. Faltam escrever: `04-pagamento` (cartão aprovado, recusado, pendente, aviso do Brick com sandbox), `07-admin` e
`13-admin` (evento, imagem, lotes, pedidos, equipe, relatórios, CSV, responsividade do painel), `11-cancelamento-estorno`,
`12-portaria` (câmera simulada, busca manual, câmera negada, contingência, 2 validadores), `14-emails-pdfs`, `15-lgpd`, e a rodada do
roteiro em sandbox (`npm run e2e:roteiro:sandbox`, `npm run test:sandbox`).

Comando para retomar: `npx vite build && npx playwright test -c auditoria/e2e/auditoria.config.ts` (um projeto: `--project=chromium-1280`).

## Fase 3: teste de carga (k6, local)

Pendente.

## Fase 4: UI, UX, acessibilidade e desempenho

Pendente.

## Fase 5: operação e prontidão para entrega

Pendente.
