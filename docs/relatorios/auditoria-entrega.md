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

Em andamento.

## Fase 2: testes funcionais de ponta a ponta (local)

Pendente.

## Fase 3: teste de carga (k6, local)

Pendente.

## Fase 4: UI, UX, acessibilidade e desempenho

Pendente.

## Fase 5: operação e prontidão para entrega

Pendente.
