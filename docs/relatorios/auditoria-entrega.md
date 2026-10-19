# Auditoria de entrega do PartyX

**Data:** 19/10/2026. **Escopo:** repositório na branch `feature/fechamento-homologacao` (HEAD `716737d`, com trabalho não
comitado da taxa de serviço, D-90), produção `partyx-producao` só em leitura (revisão `partyx-00044-dil`, commit `5fbfdab`), testes
funcionais e de carga no ambiente local com o PostgreSQL de teste e as credenciais de teste do Mercado Pago. Referência de mercado
para fluxo e informação: minhaentrada.com.br (nunca identidade visual).

Versão para o cliente, sem jargão: [`auditoria-entrega-cliente.md`](auditoria-entrega-cliente.md). Matriz dos testes de interface:
[`matriz-e2e.md`](matriz-e2e.md). Cobertura por rota: [`matriz-cobertura-rotas.md`](matriz-cobertura-rotas.md). Carga:
[`carga/`](carga/). Acessibilidade: [`acessibilidade/`](acessibilidade/). Desempenho: [`desempenho/`](desempenho/). Capturas:
[`capturas/`](capturas/).

## Resumo executivo

**Veredito.** A plataforma está pronta para operar eventos de até 1.500 ingressos na configuração atual, sem achado bloqueante. As
regras que não podem falhar foram provadas sob carga e por testes de concorrência: nunca vende acima da capacidade, todo pedido pago tem
os ingressos comprados, nenhum QR repetido, uma entrada só por ingresso, webhook repetido, fora de ordem ou falsificado não cria
ingresso. O backup diário restaura em 9 segundos com 21 verificações, e a volta de versão leva segundos.

**Números.** 1.172 testes automáticos de servidor passam (93% de cobertura de instruções); 66 cenários novos de ponta a ponta em 3
navegadores e 3 larguras (346 execuções, 318 aprovadas, 14 falhas, todas do WebKit de teste na página do evento, a confirmar no Safari);
carga do evento de 500 ingressos e do triplo sem nenhum erro, com p95 abaixo de 50 ms em todas as rotas e o servidor abaixo de três
quartos de um núcleo; Lighthouse na produção 94 e 96 de desempenho e 100 de acessibilidade; 31 páginas varridas pelo axe com 5
elementos de contraste a corrigir.

**O que pesa.** Dois achados **altos** de segurança, ligados a decisões já tomadas: com o Turnstile desligado e o `run.app` aberto, os
limites por IP não protegem (S-01) e o cadastro revela se um e-mail ou CPF já existem (S-02). Oito **médios** de segurança (bloqueio de
conta por e-mail que pode tirar um validador do ar, troca de senha sem limite, CPF na URL do painel, oráculo da transferência, dois
vetores de consumo de recursos, Pix além da reserva, cadastro sem prova de posse). Fora de segurança: a ponte Vercel Hobby em uso
comercial pode ser pausada em dia de evento (O-01); a página do evento derruba o WebKit de teste (F-09, a confirmar); faltam alertas
para webhook ausente e fila de e-mails parada (O-02); não há manual do painel para o cliente nem runbooks de abertura e de limpeza
(O-03); a homologação continua no ar (O-04); 18 commits sem push e a taxa de serviço inteira sem commit (O-05); endereços desconhecidos
respondem 200 (U-13). O restante é baixo ou de documentação. Decisões do cliente registradas como tal: sem meia-entrada, sem reembolso
por desistência (só transferência), taxa de serviço e desconto de promoter a publicar.

**Ordem recomendada** (seção "Ordem de correção" abaixo): 13 itens antes do primeiro evento grande, cerca de 30 a 40 horas; o resto
depois, por lotes.

## Tabela consolidada de achados

Severidade: bloqueante (nenhum), alta, média, baixa. Evidência: arquivo e linha, cenário da matriz, captura ou log. Detalhes e
controles corretos nas fases correspondentes.

| Id | Área | Sev. | Achado | Evidência | Impacto | Correção sugerida | Esforço |
|---|---|---|---|---|---|---|---|
| S-01 | Segurança, limites | **alta** | Limites por IP contornáveis chamando o `run.app` direto com `X-Forwarded-Host` forjado; Turnstile desligado | `auth/middleware.ts:10-17`, Cloud Run com ingress aberto, `TURNSTILE_ENABLED=false` | Spraying de senhas e cadastros em massa sem desafio; IP do aceite não confiável | Limitar também pelo último IP do `X-Forwarded-For` e validar com `isIP`; reavaliar o Turnstile | 4 a 6 h |
| S-02 | Segurança, privacidade | **alta** | Cadastro diz qual campo já existe (e-mail e CPF) e o teto global só conta cadastros criados | `auth/service.ts:97-108`, `globalLimits.ts:15-16` | Enumeração de clientes por CPF; base para phishing | Teto global para "já cadastrado" com alerta; Turnstile; resposta neutra é decisão do cliente | 2 a 4 h |
| O-01 | Operação, domínio | **alta** (decisão) | Domínio servido pela Vercel Hobby (uso pessoal nos termos) como ponte; certificado do Firebase preso (`HOST_MISMATCH`) | `docs/operacao/vercel.md`, API `customDomains` em 19/10 | Pausa do projeto em dia de evento tira o site do ar | Plano Pro temporário (US$ 20/mês) ou concluir a volta ao Firebase (TXT no Registro.br) | 1 h + decisão |
| S-03 | Segurança, disponibilidade | média | 5 falhas em 15 min por e-mail bloqueiam o dono mesmo com a senha certa | `auth/limits.ts:5-6,46` | Negar o acesso de um validador durante o evento | Bloquear por e-mail e IP, ou atraso progressivo (muda RF-10) | 3 a 6 h |
| S-04 | Segurança, sessão | média | Troca de senha sem limite de tentativas da senha atual | `auth/service.ts:331-355` | Força bruta com aparelho aberto | Reutilizar o limite de login | 1 a 2 h |
| S-05 | Segurança, cadastro | média (decisão) | Sem prova de posse do e-mail nem do CPF; CPF alheio pode ser cadastrado antes do dono | `auth/service.ts:152-162` | Comprador legítimo barrado; atendimento | Confirmar e-mail antes de comprar; contestação de CPF | 8 a 16 h |
| S-06 | LGPD, logs | média | CPF completo na URL das buscas do painel e da rota LGPD | `api/panel.ts:111-115`, `api/privacy.ts:42-45` | CPF nos logs de requisição da infraestrutura | Buscas por CPF em POST | 2 a 4 h |
| S-07 | Privacidade | média | Prévia da transferência é oráculo de conta por CPF ou e-mail (404, 409, 403, 200) | `tickets/transfer.ts:114-170` | Varredura de CPFs por quem tem um ingresso | Unificar as recusas; limite no banco | 2 a 3 h |
| S-08 | Segurança, DoS | média | Limitador do PDF público usa o `x-forwarded-for` bruto | `api/public.ts:71-73` | PDFs sem limite, CPU da instância | `clientIp` e teto global | 0,5 h |
| S-09 | Segurança, DoS | média | `bodyLimit` só para `application/json`; `c.req.json()` aceita qualquer tipo | `app.ts:95-103` | Corpo de dezenas de MB na memória da instância | Limite em todo `/api/*` não multipart | 0,5 h |
| S-10 | Pagamento | média (D-03) | Pix gerado com 31 s de reserva vence 1.860 s depois sem estender a reserva | `orders/payment.ts:89,229-258` | Pagamento vira `pago_sem_estoque`, dinheiro retido até estorno | Estender a reserva até o vencimento do Pix ou exigir folga mínima | 3 a 4 h |
| F-09 | Front, Safari | média (a confirmar) | Página do evento derruba o WebKit de teste a 1280 e 360 px (capa com `filter` mais animações) | matriz (14 falhas), `webkit-repro-css.mjs` | Se reproduzir no Safari real, compra impossível nessas larguras | Testar em iPhone e Mac; trocar o desfoque ao vivo pela miniatura desfocada | 0,5 h + 2 h |
| O-02 | Operação, alertas | média | Sem alerta para webhook ausente com pedidos pagos nem para fila de e-mails parada | seção 5.3 | Webhook quebrado invisível por até 24 h | Métricas por log na varredura e política nova | 2 h |
| O-03 | Documentação | média | Sem manual do painel para o cliente; sem runbooks de abertura de vendas e de limpeza; `estoque.md` diz reserva de 10 min (são 30); `rollback.md` não cita a tag do `db:rollback` | seção 5.5 | Dependência da contratada para operar; erro em dia de evento | Escrever com as capturas desta auditoria | 6 a 8 h |
| O-04 | Operação, custo | média | Homologação no ar (Cloud Run, jobs, Neon, conta de faturamento compartilhada) com dados fictícios públicos | `gcloud` em 19/10 | Custo mensal e exposição | Desligar ou pausar | 0,5 h + decisão |
| O-05 | Processo | média | 18 commits sem push; taxa de serviço (66 arquivos, migração 0017, textos legais) sem commit | `git status` em 19/10 | Perda de trabalho; divergência com o GitHub | Revisar, comitar e fazer push | 0,5 h |
| F-01 | LGPD, produto | média | Exportação e exclusão de dados só por API; sem tela para o administrador nem para o comprador | cenário 15, `api/privacy.ts` | O cliente não atende pedidos da LGPD sozinho | Tela "Privacidade" no painel | 4 a 6 h |
| F-02 | Produto, operação | média | Cancelar um evento com estorno de todos os pedidos não existe como operação | cenário 11 | Estorno manual pedido a pedido no Mercado Pago, sem lista | Lista de pedidos a estornar com marcação | 4 a 8 h |
| U-01 | Acessibilidade | média | Foco não vai ao primeiro campo com erro no login e no cadastro | heurísticas | Teclado e leitor de tela perdem o erro | Mover o foco ao campo ou ao alerta | 1 h |
| U-04 | Acessibilidade | média | Contraste insuficiente em 5 textos de apoio (data no transferir, contagens do painel, descrição do evento) | axe | WCAG 1.4.3 | Escurecer o cinza de apoio | 0,5 h |
| U-07 | Acessibilidade | média | Campo de busca do cabeçalho sem foco visível | axe (teclado) | WCAG 2.4.7 | Anel de foco | 0,25 h |
| U-08 | Desempenho | média | LCP de 2,6 a 2,7 s no 4G (vídeo da abertura e fontes disputam com o JavaScript; 51 kB não usados) | Lighthouse produção | Faixa "precisa melhorar" por pouco | Adiar o vídeo; separar acesso e conta do pacote inicial | 2 a 4 h |
| U-13 | SEO | média | Rotas desconhecidas, `robots.txt` e `sitemap.xml` respondem 200 com o HTML do site | Lighthouse produção; `curl` | "soft 404" e robots inválido nos buscadores | `robots.txt`, `sitemap.xml` e 404 para rotas fora da lista | 1 a 2 h |
| S-11 a S-29 | Segurança | baixa | 19 itens (impasse de travas, id do evento do webhook, teto por instância, `paid_at` do relógio, portaria aberta antes da janela, relatório por lote, nonce em página com cache, tempo da recuperação, `inet` inválido, senha temporária, senhas comuns, admin sobre admin, e-mail na trilha, outro evento com nome, PDFs sem limite, higiene, `unsafe-inline`, exportação de encerramento, documentação) | seção 1.3 | Baixo, individual | Ver seção 1.3 | cerca de 25 h no total |
| F-03 a F-08 | Fluxo | baixa/info | Sessão encerrada após a senha do primeiro acesso; Esc nos diálogos de pessoas; comportamentos corretos registrados | seção 2.3 | Baixo | Ver seção 2.3 | 1,5 h |
| U-02, U-03, U-05, U-06, U-09, U-10, U-11, U-12, U-14 | UX, acessibilidade, SEO | baixa | Limites do campo de data; alvos de toque menores que 44 px; ordem de cabeçalhos; marco repetido; CLS do pedido local; `og:image` do início e de evento sem capa; célula com traço longo; 401 no console | seções 4.2 a 4.6 | Baixo | Ver seções | cerca de 5 h |
| O-06 a O-08 | Operação | baixa | Neon dormindo (latência no primeiro acesso após 5 min); orçamento só do Google; retenção dos logs da Vercel não documentada | seções 3.3 e 5 | Baixo | Ver seções | 1 h + decisões |

## Ordem de correção

**Antes do primeiro evento grande** (cerca de 30 a 40 horas, mais as decisões do cliente):

1. O-01: decidir a ponte do domínio (Pro temporário ou volta ao Firebase com o TXT) para o site não cair em dia de evento.
2. O-05: comitar e revisar a taxa de serviço; fazer push do repositório (nada de técnico depende disso, mas tudo o mais se perde sem isso).
3. F-09: confirmar no Safari real (iPhone e Mac) se a página do evento fecha; se sim, trocar o desfoque ao vivo pela miniatura desfocada.
4. S-01 e S-02: limites pelo último IP real e teto para "já cadastrado", ou religar o Turnstile (decisão de 06/10 a rever).
5. S-03: bloqueio por e-mail e IP, ou atraso progressivo, para um validador não ser tirado do ar na porta (depende de aceitar a mudança em RF-10).
6. S-04, S-08, S-09: três correções de meia hora a duas horas que fecham tomada de conta com aparelho aberto e dois vetores de consumo de recursos.
7. O-02: alertas de webhook ausente e de fila de e-mails parada.
8. S-10: decidir com o cliente a folga do Pix (estender a reserva até o vencimento do Pix).
9. O-03: manual do painel para o Bernardo com as capturas desta auditoria; runbook do dia do evento revisto; runbooks de abertura e de limpeza; corrigir os 10 minutos e a tag do rollback.
10. U-13 e U-14: `robots.txt`, `sitemap.xml`, 404 para rotas desconhecidas e fim do 401 no console (antes de divulgar o link).
11. S-06: CPF fora da URL das buscas do painel.
12. U-01, U-04, U-07: foco no erro, contraste do cinza de apoio e foco visível na busca (3 horas no total).
13. O-04: desligar a homologação.

**Depois do primeiro evento**, por lotes: S-05 (decisão de produto), S-07, F-01 e F-02 (telas novas), U-08 (LCP), os 19 baixos de
segurança (S-11 a S-29), os baixos de UX e acessibilidade, O-06 a O-08, e a limpeza de código (protótipo de 22 mil linhas, coluna
`judicial_authorization`, avisos de lint).

## O que não foi testado e por quê

| Item | Motivo |
|---|---|
| Pagamento com cartão real (Brick, aviso quando não carrega, cartão em análise pelo antifraude), estorno e contestação reais | Exigem o Mercado Pago de teste com o ritmo do antifraude; cobertos pelo roteiro em sandbox do projeto (12 e 18/10) e pelos 14 testes de sandbox |
| Conciliação diária e tarefas do Cloud Tasks de ponta a ponta | Exigem OIDC do Google; cobertas por 87 testes de integração e pela execução em homologação (13/10) |
| Portaria com câmera em WebKit e Firefox, aparelhos e 4G reais | Câmera só simulável em Chromium; aparelhos reais são a seção 11.4 do plano |
| Safari real | Só o WebKit do Playwright (Linux); por isso F-09 fica "a confirmar" |
| Páginas logadas em produção (Lighthouse) e qualquer escrita em produção | Produção é só leitura nesta auditoria |
| Entrega real de e-mail, SPF, DKIM e DMARC em caixas reais | Fora do ambiente local; conferido em 17/10 pelo projeto |
| Consumo de horas e alertas do Neon | Sem acesso à API do Neon nesta sessão |
| Checkout da referência (minhaentrada) | Exige conta e compra real |

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

Quatro rodadas (completa nos 9 projetos; duas só do WebKit com 1 trabalhador; uma final dos cenários corrigidos no roteiro): **346
execuções de 66 cenários, 318 passaram, 5 passaram na segunda tentativa, 14 falharam, 9 puladas** (o cenário do aviso do Brick, que
exige o gateway real, pulado nos 9 projetos). As 14 falhas são todas do **WebKit a 1280 e 360 px** no mesmo ponto: a página do evento
fecha ("Page crashed") ao passar o mouse ou tocar nos botões "+"; a 390 px o WebKit passa (ver F-09). Chromium e Firefox passaram em
tudo nas três larguras.

| Área | Cenários | Chromium 360/390/1280 | WebKit 360/390/1280 | Firefox 360/390/1280 | O que passou | O que não foi possível |
|---|---|---|---|---|---|---|
| Comprador: conta | 6 | ok | ok | ok | Cadastro maior, 17 e 16 anos; menor de 16 recusado; CPF inválido e e-mail repetido; login errado e certo; logout; volta protegida; recuperação por e-mail com link de uso único; troca de senha com senha atual e queda das outras sessões; conferência de que não há exclusão de conta nem cópia de dados na tela (F-01) | |
| Vitrine | 8 | ok | ok | ok | Início com destaque e sem arquivado, rascunho ou encerrado; busca pelo cabeçalho e vazio; página do evento com preço e taxa, formas de pagamento, compartilhar; em breve; vendas encerradas; evento encerrado; esgotado; arquivado e rascunho com 404 no HTML e na API | |
| Checkout | 5 | ok | 1280 e 360 fecham (F-09) | ok | 1 ingresso até a confirmação com Pix; 6 ingressos e API recusando 7; promoter inexistente, desativado e válido sem desconto; reserva expirando com estoque de volta; compra exige login e volta ao checkout com a seleção | |
| Pagamento | 5 | ok | 1280 e 360 fecham (F-09) | ok | Pix expirado; cartão aprovado (2 QR distintos); cartão recusado; cartão pendente com atualização automática | Aviso do Brick que não carrega e cartão em análise real (só com o Mercado Pago de teste; cobertos pelo roteiro em sandbox e por teste unitário) |
| Menores | 4 | ok | 1280 e 360 fecham (F-09) | ok | 17 e 16 anos aceitam o Termo de Ciência, pagam e baixam o Termo de Autorização (PDF sem CPF); evento 18+ recusa 17 anos no servidor; termo público do evento | |
| Transferência | 6 | ok | ok | ok | Caminho feliz com nome mascarado, os dois lados e os dois e-mails; conta inexistente; para si mesmo; dentro das 2 h; utilizado, cancelado e estornado recusados; retransferência; QR antigo invalidado na portaria; desfazer pelo administrador; idade de quem recebe (18+ recusa 17; 16+ exige o Termo antes do QR) | |
| Webhook e conciliação | 6 | ok | | | Duplicado; fora de ordem (estorno e aprovação tardia); assinatura inválida 401; pagamento depois da reserva com estoque (confirma) e sem estoque (`pago_sem_estoque`, e-mail e exceção); rotinas internas 503 sem OIDC | Conciliação diária e tarefas do Cloud Tasks (OIDC do Google; cobertas por 87 testes de integração e pela execução em homologação) |
| Cancelamento e estorno | 5 | ok | | | Cancelar um ingresso e todos do pedido pela tela; estorno total pelo gateway (pedido estornado, válido cancelado, utilizado mantido); contestação; "evento cancelado com estorno de todos" não existe como operação (F-02) | |
| Portaria | 5 | ok | | | Câmera simulada: válido, reutilizado (amarelo com horário), cancelado, QR antigo de transferência, outro evento, adulterado; busca manual por nome, CPF e código com CPF mascarado e entrada manual; câmera negada; dois validadores no mesmo ingresso (uma entrada); lista de contingência em PDF (CPF mascarado, "CONFIDENCIAL") e CSV | Câmera só simulável em Chromium; aparelhos reais e 4G real fora do alcance |
| Admin | 10 | ok | ok (páginas) | ok (páginas) | Todas as 15 páginas e as abas do evento sem rolagem horizontal nas 9 combinações; criar evento pela tela com capa, tipos com janelas, publicar, cor válida e inválida, encerrar vendas, arquivar e desarquivar; excluir rascunho pelo nome e recusa para evento com venda; promoters (criar, repetido, desativar); equipe (senha temporária, primeiro acesso, desativar derruba a sessão); compradores (CPF mascarado e revelação auditada); relatórios e 3 CSVs com BOM e sem CPF; pedidos; entradas; configurações da taxa (prévia e limites) | |
| E-mails e PDFs | 2 | ok | | | 7 modelos gerados na rodada (cadastro, recuperação, compra, 3 de transferência, pagamento sem estoque): assunto, links só do site, rodapé com atendimento, sem "undefined", cabem a 360 px (capturas em `capturas/emails/`); PDF do ingresso e do pedido em A4 com nome, código, valor e sem CPF, QR do PDF lido pelo mesmo leitor da portaria; Termo de Autorização em A4 | Remetente e Reply-To conferidos no código (`EMAIL_FROM`, `Reply-To` = `EMAIL_REPLY_TO` ou o e-mail de atendimento) e na entrega real de 17/10, não na captura local |
| LGPD | 1 | ok | | | Localizar titular, exportar com protocolo (recusa sem protocolo), validador 403, anonimizar com reconhecimento de ingresso válido, conta deixa de entrar, pedido e trilha preservados sem dado pessoal | |
| Concorrência | 2 | ok | | | Dois compradores na última unidade (um reserva); lote esgotando no meio do pedido (preço recalculado e tela avisa) | |

Capturas em `docs/relatorios/capturas/` (262 imagens, só dados fictícios), e-mails renderizados em `capturas/emails/`, PDFs em
`capturas/pdfs/` e `capturas/menores/`.


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
| F-09 | média, a confirmar | O WebKit do Playwright (motor do Safari, Linux) **fecha a página do evento** a 1280 e 360 px em qualquer interação, inclusive passar o mouse no "+"; a 390 px funciona. Isolado em `auditoria/ferramentas/webkit-repro-css.mjs`: o problema some tanto ao desligar `filter`/`backdrop-filter` quanto ao desligar `transform`/`transition` (é a combinação da capa desfocada com as animações); persiste com "menos movimento"; início, lista de eventos e entrar não fecham | 14 falhas da matriz, `webkit-repro.mjs` e `webkit-repro-css.mjs` | Se reproduzir no Safari real (iPhone e Mac), ninguém compra pelo Safari nessas larguras: impacto alto. Pode ser só do WebKit de teste no Linux | Testar num iPhone e num Mac reais em 30 min; se reproduzir, trocar o `filter: blur` da capa pela miniatura já desfocada que o servidor gera (sem filtro ao vivo) ou tirar a transformação dos elementos com filtro | 0,5 h para confirmar; 2 h para corrigir |

A primeira rodada do WebKit, com 3 trabalhadores, sofreu também com falta de memória na máquina da auditoria (o kernel matou um
navegador por falta de memória às 00:33); as duas rodadas seguintes, com 1 trabalhador e memória livre, isolaram o que restou: o
fechamento da página do evento (F-09).

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

Relatórios completos com gráficos: [`carga/escala-1.md`](carga/escala-1.md) e [`carga/escala-3.md`](carga/escala-3.md).

| Medida | Escala 1 (500 ingressos) | Escala 3 (1.500 ingressos) | Limiar |
|---|---|---|---|
| Pessoas simultâneas na abertura (usuários virtuais máximos) | 330 | 990 | |
| Tentativas de compra em 10 min; concluídas (pagas, com ingresso); recusadas por estoque | 600; 335; 265 | 1.800; 1.005; 795 | recusas por estoque são esperadas |
| Ingressos emitidos / capacidade | 500 / 500 | 1.494 / 1.500 (6 unidades sobraram porque os últimos pedidos pediam 2) | nunca acima |
| Erros inesperados (compra) | 0 | 0 | 0 |
| Página do evento (HTML): p50 / p95 / p99 | 5 / 6 / 7 ms | 5 / 8 / 12 ms | p95 abaixo de 1 s |
| Tempo até o primeiro byte da página do evento: p50 / p95 / p99 | 5 / 6 / 7 ms | 5 / 8 / 12 ms | |
| API do evento: p95 | 5 ms | 6 ms | 1 s |
| Login (Argon2): p50 / p95 / p99 | 11 / 36 / 46 ms | 13 / 43 / 60 ms | 5 s |
| Pedido com reserva (`FOR UPDATE`): p50 / p95 / p99 | 8 / 13 / 15 ms | 10 / 16 / 22 ms | 5 s |
| Pix (cobrança): p95 | 7 ms | 9 ms | 5 s |
| Confirmação pelo webhook com emissão dos ingressos: p50 / p95 / p99 | 16 / 20 / 25 ms | 17 / 26 / 43 ms | 5 s |
| Pedido e Meus ingressos: p95 | 8 / 6 ms | 10 / 7 ms | 5 s |
| Compra completa (inclui 1 a 4 s simulados no app do banco): p95 | 3,9 s | 4,0 s | 10 s |
| Webhooks: válidos (200) / assinatura inválida (401) / erros; p95 | 450 / 50 / 0; 7 ms | 1.351 / 150 / 0; 7 ms | 2 s |
| Portaria: leituras; válidas; "já utilizado"; erros; p95 do `/gate/scan` | 505; 459; 46; 0; 14 ms | 1.504; 1.370; 134; 0; 14 ms | 1 s |
| Contador da portaria: p95 | 4 ms | 4 ms | 1 s |
| CPU do processo do servidor: máximo (p95) | 25% (18%) de um núcleo | 72% (56%) de um núcleo | |
| Memória RSS do servidor: máximo | 282 MB | 248 MB | 512 MiB da instância |
| Conexões abertas no PostgreSQL: máximo (ativas) | 5 (3) | 5 (2) | 5 por instância (`DB_POOL_MAX`) |
| Fila de e-mails: enviados / falhas; tempo na fila p95 / máximo | 335 / 0; 0,01 s / 0,02 s | 1.005 / 0; 0,01 s / 0,05 s | (captura local, sem SMTP) |
| Invariantes depois da carga (14 consultas) | todas conferem | todas conferem | 0 violações |

Leitura: com o triplo da carga a latência subiu pouco (p95 da página do evento de 6 para 8 ms, do pedido de 13 para 16 ms) e o
servidor ficou abaixo de três quartos de um núcleo, com o pool de 5 conexões nunca saturado (no máximo 2 ativas). O custo da compra é
dominado pelo login (Argon2id, 36 a 43 ms no p95) e pela confirmação com emissão (20 a 26 ms); a página do evento é servida em
microssegundos de CPU graças ao cache de 60 s do HTML inicial e às consultas leves. A fila de e-mails não acumulou. Nenhum QR
duplicado, nenhuma entrada dupla, nenhum ingresso acima da capacidade em nenhuma das rodadas.


Observações de método: na primeira rodada da escala 1 a fase da portaria falhou por um erro do roteiro k6 (o k6 limpa os cookies do
usuário virtual a cada iteração e a sessão do validador caía; o servidor respondeu 401 corretamente). O roteiro foi corrigido
(`noCookiesReset`) e a escala 1 foi repetida; a sondagem de diagnóstico adicionou 5 webhooks e 12 leituras sem sessão à rodada da
escala 3, sem efeito nos números.

### 3.3 Tradução para a produção (sem rodar lá)

Configuração lida do Cloud Run em 19/10/2026 (só leitura): 1 vCPU, 512 MiB (heap do Node em 320 MB), concorrência 80, tempo limite 60 s,
0 a 3 instâncias, CPU limitada fora da requisição (`cpu-throttling`), `startup-cpu-boost`, ingress aberto; `DB_POOL_MAX=5` por instância;
fila do Cloud Tasks com 5 despachos por segundo e 5 concorrentes. Neon Launch com 0,25 a 2 CU e suspensão automática; pela
documentação do Neon, `max_connections` é 104 a 0,25 CU (97 para a aplicação), 209 a 0,5, 419 a 1 e 839 a 2 CU; o pooler
(PgBouncer, modo transação) aceita até 10.000 conexões de cliente. Vercel Hobby: 100 GB de transferência, 1 milhão de requisições de
CDN por mês e regra de uso pessoal. Cloud Run: 2 milhões de requisições, 180 mil vCPU-s e 360 mil GiB-s grátis por mês por conta de
faturamento.

**Como a conta foi feita.** O servidor local é o mesmo pacote do contêiner, com o mesmo heap e o mesmo pool. A CPU medida aqui é a de
um núcleo de computador de mesa, mais rápido que uma vCPU do Cloud Run; a tradução usa um fator conservador de 2 vezes (cada 1% medido
vira 2% de uma vCPU). O Cloud Run abre instância nova quando a CPU ou a concorrência de uma instância se esgotam; com concorrência 80 e
requisições curtas (p95 de dezenas de ms), o que manda é a CPU.

| Cenário | Medido no local | No Cloud Run (1 vCPU por instância) | Conexões no Neon | Veredito |
|---|---|---|---|---|
| Abertura, escala 1 (300 pessoas em 10 min, 60 pedidos/min) | CPU máxima 25% de um núcleo (p95 18%); memória 282 MB; 5 conexões abertas, 3 ativas | cerca de 50% de uma vCPU: **1 instância** (a segunda só com rajadas); memória dentro dos 512 MiB | 5 por instância (até 15 com 3): cabe folgado nas 97 de 0,25 CU | Aguenta |
| Abertura, escala 3 (900 pessoas, 180 pedidos/min) | CPU máxima 72% de um núcleo (p95 56%, p50 45%); memória 248 MB; 5 conexões, 2 ativas | cerca de 145% de uma vCPU no pico (p95 112%): **2 instâncias no pico, 3 nas rajadas**; é o limite confortável do `--max-instances=3` | até 15 | Aguenta, no limite da configuração atual |
| 500 webhooks em 5 min | p95 de 7 ms, 450 válidos e 50 recusados por assinatura, nenhum erro | desprezível; o Mercado Pago entrega em paralelo mas cada notificação é curta | reconsulta ao gateway por notificação (rede, não CPU) | Aguenta |
| Portaria, 500 leituras em 90 min por 3 validadores (medida 10 vezes mais rápida) | 505 leituras, 0 erros, p95 de 14 ms (contador 4 ms), CPU do servidor abaixo de 10% na fase | desprezível (menos de 1 requisição por segundo no ritmo real) | 1 conexão ativa | Aguenta |

**Neon.** Com `DB_POOL_MAX=5` e no máximo 3 instâncias, o teto é 15 conexões: menos de 16% das 97 disponíveis a 0,25 CU, sem precisar do
pooler para capacidade. O risco real do Neon não é conexão, é o **despertar**: com suspensão automática, a primeira requisição depois
de 5 minutos parados espera o banco acordar (segundos); a decisão de 18/10 (verificação de saúde sem banco, para deixar dormir) troca
custo por essa latência na primeira compra de cada período parado. Na abertura das vendas e no dia do evento, o runbook já prevê
`evento-on` (instância mínima 1), mas o Neon continua a dormir se não houver consulta por 5 minutos: a varredura só roda às 04:00.

**Vercel Hobby.** Um evento de 500 ingressos gera na CDN da Vercel cerca de: página do evento 300 pessoas x 25 requisições = 7.500;
espera do Pix (consulta a cada 4 s por até 30 min, mas em média 3 min) 600 pedidos x 45 = 27.000; portaria (contador a cada 4 s em 3
aparelhos por 3 h) 8.100; painel aberto 2 x 3 h x 900 = 5.400; total perto de **50 mil requisições por evento**, 5% do milhão mensal, e
menos de 1 GB de transferência (100 GB). Três eventos por mês continuam longe do limite. O que pesa não é a cota, é a **regra de uso
pessoal** do Hobby: venda de ingressos é uso comercial e a Vercel pode pausar o projeto sem aviso prévio em horário de evento.

**Cloud Run (franquia).** O mesmo evento: cerca de 50 mil requisições e, com 1 instância ativa por 3 horas no `evento-on` (parada cobra
vCPU e memória: cerca de R$ 0,000021 por vCPU-s e por GiB-s), **R$ 1 a 2 por dia de evento**; o resto do mês escala a zero. A franquia
de 2 milhões de requisições e 180 mil vCPU-s cobre com folga. Escala 3 (1.500 ingressos): três vezes isso, ainda dentro da franquia.

**O que mudar antes do primeiro evento, e o custo.**

| Mudança | Por quê | Custo |
|---|---|---|
| `evento-on` (instância mínima 1) na abertura das vendas e no dia do evento, e `evento-off` depois (já previsto nos runbooks) | Evita o arranque a frio (vários segundos) justamente na primeira leva de compradores e na primeira leitura da portaria | Cerca de R$ 5 por dia ligado (seção 8 do `README-DEPLOY.md`) |
| Manter o Neon acordado nessas janelas: a conciliação sob demanda e o uptime não garantem; opção simples é aumentar o `autosuspend` do Neon para 1 h nos dias de evento (console) ou, por decisão, desligar a suspensão (cerca de US$ 19 por mês a 0,25 CU) | Sem isso, depois de 5 min sem compra o próximo comprador espera o banco acordar | De US$ 0 (ajuste manual nos dias de evento) a US$ 19 por mês |
| Subir `--max-instances` de 3 para 5 só no dia da abertura de um evento grande (acima de 1.500 ingressos) | A escala 3 é o limite confortável de 3 instâncias (ver tabela); acima disso as requisições fazem fila | Zero fora do pico; no pico, centavos |
| Trocar a ponte Vercel Hobby pelo Firebase (ou um plano Pro da Vercel, US$ 20 por mês, enquanto o Firebase não emite o certificado) | Risco de pausa por uso comercial em dia de evento | US$ 0 (Firebase) ou US$ 20 por mês (Pro temporário) |
| Alerta de ausência de webhooks e de fila de e-mails parada (seção 5.3) | Hoje um webhook quebrado só aparece em 24 h | Centavos (métrica por log) |
| Nada a mudar no pool, na memória ou na concorrência | As medições ficaram longe dos limites | |

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

### 4.2 Heurísticas de usabilidade (celular)

Medido com `auditoria/ferramentas/toque-local.mjs` (Chromium emulando iPhone a 390 x 844) e pelas capturas da Fase 2 (relatório
completo em `docs/relatorios/acessibilidade/heuristicas-celular.md`).

| Heurística | Resultado | Achado |
|---|---|---|
| Estados vazios | "Você ainda não tem ingressos. Quando um pagamento for confirmado, os ingressos aparecem aqui. Ver eventos"; "Você ainda não fez nenhuma compra. Ver eventos"; busca sem resultado: "Nenhum evento encontrado para ..." com "Limpar busca" e "Ver todos os eventos"; "Nenhum evento aberto" na portaria | Bons: explicam e dão um caminho |
| Estados de carregamento | Esqueletos com `aria-busy` nas páginas do evento, ingressos, compras, portaria e áreas sob demanda, na mesma altura do conteúdo (sem salto) | Bom |
| Mensagens de erro | Login: "E-mail ou senha incorretos." (mensagem única, sem revelar o campo); cadastro: mensagem por campo com `aria-invalid` e texto específico (CPF, 16 anos, e-mail repetido); código de promoter inválido com mensagem no campo; pagamento recusado e prazo terminado com título, explicação e próximo passo | Bons |
| Foco depois do erro | Depois de enviar o login ou o cadastro com erro, o foco continua no `body`; a mensagem tem `role="alert"` (anunciada), mas o teclado e o leitor de tela não são levados ao primeiro campo com erro | **U-01** (média, acessibilidade) |
| Máscaras de CPF e telefone | CPF `inputmode="numeric"`, máscara ao digitar ("123.456.789-09"); telefone `inputmode="tel"`, `autocomplete="tel"`, máscara "(11) 98765-4321"; e-mail `type="email"` com `autocomplete` | Bom |
| Campos de data no iPhone | `type="date"` (teclado e seletor nativos; aparência própria sem `appearance` nativa, tratado em 16/10 pelo projeto); sem `min` e `max` no nascimento | **U-02** (baixa): `min="1900-01-01"` e `max` = hoje menos 16 anos ajudariam o seletor nativo |
| Teclado numérico | CPF numérico, telefone `tel`, quantidade por botões "+" e "-" com `output` | Bom |
| Botões ao alcance do polegar | "Continuar" na página do evento (barra fixa) em y = 763 de 844, 318 x 52 px; "Entrar" em y = 465; "Criar conta" abaixo da primeira tela (fim do formulário, esperado) | Bom |
| Toque mínimo de 44 px | Fora do padrão: "Entrar" e "Painel" no cabeçalho (81 x 40), o link da Política na página do evento e na revisão (253 x 14, texto corrido), os links dos Termos no aceite (108 x 17), a caixa de aceite (24 x 24, com rótulo clicável ao lado) e os links PX-nnnnn na lista de pedidos do painel (69 x 23) | **U-03** (baixa): subir o cabeçalho para 44 px e dar área de toque de 44 px aos links de texto e às caixas |
| Contraste com a cor de destaque do evento | A cor de destaque só pinta o bloco da data e o cronômetro, com texto calculado pela paleta (`src/site/accent.ts`, testes de contraste em `accent.test.ts` e `e2e/cor-destaque.spec.ts`); o botão de compra continua no roxo da marca | Bom por desenho; o axe não encontrou contraste insuficiente nessas peças |
| Diálogos | Diálogos de evento fecham com Esc; os de promoter e de membro da equipe não (F-04) | Ver F-04 |
| Captura de página inteira | Blocos abaixo da dobra entram em cascata quando aparecem (IntersectionObserver): numa captura de página inteira saem transparentes; para quem rola, aparecem; sem JavaScript de observação, já nascem visíveis | Nenhum |

### 4.3 Acessibilidade (WCAG 2.1 AA)

Varredura com axe-core 4.10 (regras WCAG 2.1 A e AA e boas práticas) em 31 páginas (site, conta, portaria e painel) a 390 e
1280 px, mais navegação por teclado e leitura dos nomes acessíveis nas telas de compra e do ingresso
(`auditoria/ferramentas/axe-local.mjs`; relatório em `docs/relatorios/acessibilidade/axe.md`). Lighthouse deu **100 em acessibilidade**
nas 5 páginas medidas.

| Resultado | Detalhe |
|---|---|
| Páginas sem violação | 25 de 31 nas duas larguras (início, evento, entrar, criar conta, recuperar senha, checkout, pedido, meus ingressos, ingresso, tela cheia, minha conta, minhas compras, portaria, portaria do evento e a maior parte do painel) |
| Contraste insuficiente (sério) | `.px-stub-day` e `.px-stub-month` na página de transferir (o bloco da data no resumo do ingresso); `.px-count` (contagem cinza "10 eventos · 1 arquivado") nas listas de eventos e de compradores do painel; `.px-desc` (descrição do evento no detalhe do painel). Cinco elementos, todos texto de apoio em cinza claro sobre fundo claro | **U-04** (média): escurecer o cinza de apoio para a razão 4,5:1 |
| Ordem de cabeçalhos (moderado) | Cartões da lista `/eventos` usam `h3` logo depois do `h1` (pula o `h2`); página Entradas do painel tem `h3` sem `h2` | **U-05** (baixa) |
| Marco repetido (moderado) | Página dos Termos: duas regiões `nav` sem nome distinto (`.px-legal-nav`) | **U-06** (baixa): `aria-label` no `nav` dos documentos |
| Navegação por teclado | Todas as páginas têm "Ir para o conteúdo" como primeira parada; ordem do Tab segue a leitura; botões "+", "Compartilhar", "Copiar link", "Iniciar leitura" e "Busca manual" alcançáveis. **Sem foco visível** no campo de busca do cabeçalho (`input: Buscar evento`) em todas as páginas e num campo do painel (`admin`) | **U-07** (média): anel de foco no campo de busca (o resto tem `outline` ou sombra) |
| Leitor de tela nas telas de compra e do ingresso | 0 controles sem nome acessível (evento 27 controles, checkout 11, pedido 18, ingresso 26); QR com `aria-label` "QR Code do ingresso PX-...", cronômetro em `role="timer"` com rótulo por extenso e mudanças de estado anunciadas; steppers em `role="group"` com `output` | Bom |
| Textos alternativos | Capas com `alt` do nome do evento; ícones decorativos com `aria-hidden`; logo com `alt="PartyX"` | Bom |

### 4.4 Desempenho (Lighthouse móvel, 4G simulado)

Lighthouse 13.5 móvel (Moto G emulado, 4G simulado 1,6 Mb/s com 150 ms de ida e volta, CPU 4 vezes mais lenta). Duas medições: no
servidor local da suíte (sem compressão de resposta: o Node serve os arquivos sem gzip, o que não ocorre em produção) e **na produção,
só leitura, nas duas páginas públicas** (o domínio passa pela Vercel, que comprime com brotli). Relatórios HTML em
`docs/relatorios/desempenho/`.

| Página | Onde | Desempenho | Acessib. | Boas práticas | SEO | LCP | CLS | TBT | FCP | Speed Index | Transferido |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Vitrine (início) | produção | **94** | 100 | 96 | 91 | 2,6 s | 0 | 140 ms | 1,8 s | 2,1 s | 295 kB |
| Página do evento | produção | **96** | 100 | 96 | 92 | 2,7 s | 0 | 40 ms | 1,4 s | 2,1 s | 298 kB |
| Vitrine (início) | local, sem compressão | 84 | 100 | 96 | 91 | 3,6 s | 0 | 70 ms | 3,0 s | 3,0 s | 548 kB |
| Página do evento | local, sem compressão | 84 | 100 | 96 | 92 | 3,6 s | 0 | 40 ms | 3,0 s | 3,0 s | 549 kB |
| Checkout (revisão) | local, logado | 79 | 100 | 100 | 92 | 4,2 s | 0 | 0 ms | 3,2 s | 3,2 s | 540 kB |
| Pedido (Pix) | local, logado | 72 | 100 | 100 | 92 | 4,4 s | 0,141 | 10 ms | 3,3 s | 3,3 s | 561 kB |
| Meus ingressos | local, logado | 78 | 100 | 100 | 92 | 4,3 s | 0 | 20 ms | 3,3 s | 3,3 s | 552 kB |

Leitura dos Core Web Vitals em produção: LCP de 2,6 a 2,7 s em 4G simulado (limite "bom" do Google é 2,5 s: fica na faixa "precisa
melhorar", por pouco), CLS 0 (ótimo), TBT 40 a 140 ms (bom). O tempo de resposta do servidor na produção foi de 40 a 90 ms. A
composição do download em produção: JavaScript 100 kB, vídeo da abertura 79 kB (só na primeira visita), fontes 70 kB, imagens 23 kB,
CSS 15 kB, HTML 4 kB. As páginas logadas não foram medidas em produção (exigiriam conta real).

| Id | Sev. | Achado | Correção | Esforço |
|---|---|---|---|---|
| U-08 | média | LCP de 2,6 s no 4G: o vídeo da abertura (79 kB) e as fontes (70 kB) disputam a banda com o JavaScript na primeira visita; o Lighthouse aponta 51 a 54 kB de JavaScript não usado no pacote inicial (`index`), que leva as páginas de conta e de acesso | Pré-conectar e priorizar a capa; carregar o vídeo da abertura depois do LCP ou só após a primeira pintura; separar as páginas de acesso e conta do pacote inicial | 2 a 4 h |
| U-09 | baixa | CLS de 0,141 na página do pedido no ambiente local: o resumo lateral e o painel do simulador (só local) entram depois da primeira pintura | Reservar a altura do resumo (esqueleto do mesmo tamanho); o simulador não existe em produção | 1 h |
| U-13 | média, SEO | Qualquer endereço desconhecido responde 200 com o HTML do site (inclusive `/robots.txt` e `/sitemap.xml`): o Lighthouse marca "robots.txt is not valid" e os buscadores veem páginas inexistentes como válidas ("soft 404"). A página do evento inexistente já responde 404 corretamente | `robots.txt` e `sitemap.xml` estáticos em `public/` (os eventos publicados no sitemap pelo servidor), e 404 para rotas fora da lista conhecida do front | 1 a 2 h |
| U-14 | baixa | Erro no console em toda página para visitante sem sessão: a verificação `GET /api/auth/me` responde 401 e o navegador registra "Failed to load resource" (Lighthouse "errors-in-console") | Responder 200 com `{ user: null }` ou 204 para a sondagem da sessão | 0,5 h |

**Pacotes e imagens.** Build de 19/10: JavaScript inicial 313 kB (95,5 kB comprimido) mais CSS 63 kB (13 kB); áreas carregadas sob
demanda: admin 192 kB (46 kB), portaria 145 kB (53 kB, leitor de QR), checkout 36 kB (11 kB), conta 25 kB (7 kB); 14 arquivos de fonte
(quatro famílias, latino, latino estendido e vietnamita, 10 a 36 kB cada; só duas pré-carregadas); vídeo da abertura 80 kB com hash e
cache de 1 ano. Imagens dos eventos: o servidor reprocessa a capa para WebP em 1600, 1080 e 640 px e uma miniatura de 48 px
desfocada embutida no HTML (`srcset` e `sizes` nos cartões, `decoding="async"`, `loading="lazy"` fora da primeira tela, `preload` da capa
do destaque e da página do evento). A abertura em vídeo toca uma vez por visita, no máximo 4 s, não toca nas rotas de tarefa nem com
"economia de dados", e nunca atrasa o carregamento da página por baixo (suíte `e2e/abertura.spec.ts`, 17 casos).

### 4.5 Compartilhamento (pré-visualização dos links)

Medido no servidor local (`curl` no HTML servido): a página do evento leva `og:title` ("Nome do evento · PartyX"), `og:description`
(data, hora, local e início da descrição), `og:url`, `og:site_name`, `og:locale`, `twitter:card` e, quando o evento tem capa, `og:image`
1200 x 630 em JPEG com `og:image:width/height` e `twitter:image`. O WhatsApp e o Instagram não executam JavaScript e leem só o HTML:
o servidor injeta as tags antes de responder (RF-26, verificado também pelos testes de `public.integration.test.ts`). Evento em rascunho
ou arquivado responde 404 com tags genéricas (nada vaza). Dois achados:

| Id | Sev. | Achado | Correção | Esforço |
|---|---|---|---|---|
| U-10 | baixa | O início (`/`) e a lista de eventos não têm `og:image`: o link da bio do Instagram e a mensagem no WhatsApp aparecem só com texto | Imagem padrão da marca 1200 x 630 em `public/brand/` e a tag no `index.html` (ou a capa do evento em destaque) | 0,5 h |
| U-11 | baixa | Evento sem capa fica sem imagem na pré-visualização (`twitter:card` "summary") | Mesma imagem padrão como reserva | 0,25 h |

### 4.6 Consistência de texto em pt-BR

Varredura automática em `src/site`, `server/src/mail`, `server/src/tickets`, `server/src/minors`, `server/src/exports` e
`conteudo-legal`: nenhum travessão em texto visível (os 6 encontrados são comentários de código, mais um traço longo como célula vazia na
tabela de tipos do painel, `src/site/adminEvents.tsx:1915`); "Pix" sempre com essa grafia (0 "PIX"); "e-mail" com hífen em todo texto
visível ("email" só em identificadores); "Mercado Pago" correto (as ocorrências de `MercadoPago` são o nome do SDK no código);
reticências "..." só uma vez; sem "ticket" em texto visível; nenhum "Ops", "Oops" ou "Algo deu errado". Erros de digitação: nenhum
encontrado na amostra de termos comuns. Tom: imperativo direto e "você" minúsculo nas mensagens, títulos de página em caixa alta
pela fonte (não no texto). Achado: a célula vazia com o traço longo deve virar "sem valor" ou ficar vazia (U-12, baixa, 5 min).

## Fase 5: operação e prontidão para entrega

### 5.1 Ensaio de restauração do backup mais recente

Feito em 19/10/2026 com `auditoria/ferramentas/ensaio-restauracao.sh latest` (PostgreSQL 18 local em Docker, descartável; a cópia é lida
do bucket em modo leitura; nenhum dado pessoal impresso; o banco local é apagado no fim).

| Passo | Resultado |
|---|---|
| Cópia mais recente | `partyx-20261019T060014Z.dump` (diária das 03:00 de Brasília de 19/10, 124 KB), manifesto e SHA-256 baixados em 2 s |
| Integridade | SHA-256 confere |
| Restauração (`pg_restore`, 2 trabalhos) | 4 s |
| Verificações do projeto (`npm run backup:verify`) | **21 de 21 OK**: 17 migrações (iguais ao manifesto; o repositório tem 18 porque a 0017 da taxa ainda não foi publicada, informado por `MIGRACOES_ESPERADAS=17`), contagens iguais ou maiores que o manifesto em 13 tabelas (19 usuários, 8 pedidos, 7 ingressos, 7 entradas, 77 eventos de pagamento, 79 linhas de auditoria), códigos únicos, vendidos = emitidos, um ingresso por unidade, `paid_at` presente, estoque dentro da capacidade, entradas registradas, 3 gatilhos presentes |
| Invariantes da auditoria (14 consultas) | 13 conferem; a 11 (total = itens + taxa) não se aplica a esse banco, que ainda não tem a coluna da taxa |
| Tempo total, do download ao banco conferido | 9 s |
| Ponto de recuperação | 19/10 06:00 UTC; o que aconteceu depois não está na cópia (RPO do backup diário: até 24 h; o PITR do Neon cobre 7 dias com precisão de segundos) |

Observação: a primeira execução reprovou a conferência de migrações (17 restauradas contra 18 no repositório) porque a pasta de
trabalho tem a migração não publicada; a verificação prevê esse caso com `MIGRACOES_ESPERADAS`. O procedimento em
`docs/operacao/runbooks/restauracao.md` funciona como está; vale acrescentar a variável no texto para cópias anteriores a uma release.

### 5.2 Ensaio de rollback no ambiente local, cronometrado

Feito com `auditoria/ferramentas/ensaio-rollback.sh`, seguindo `docs/operacao/runbooks/rollback.md`:

| Passo do runbook | Ensaio local | Tempo |
|---|---|---|
| 1. Listar as revisões | `gcloud run revisions list` na produção, só leitura (seção abaixo) | 3,9 s (5 revisões prontas listadas: 00044-dil, 00042-ten, 00040-dow, 00039-faz, 00037-zap) |
| 2. "Só o código": trocar o tráfego para a revisão anterior | Parar o servidor empacotado da versão nova (SIGTERM, como o Cloud Run) e subir o da versão anterior na mesma porta até `/api/health/ready` responder com o banco ok | **1,1 s** (na segunda execução; 1,4 s na primeira) |
| 3. Conferir a página inicial e a saúde | `GET /` 200, `/api/health/ready` com `database: ok` | incluído |
| "Revisão nova tinha migração": reverter por SQL revisado | `npm run db:rollback -- 0017_taxa_de_servico` num banco de teste com as 18 migrações: a reversão da taxa de serviço aplicou (18 para 17); reaplicação da migração em seguida (17 para 18) | reversão 0,9 s; reaplicação 0,85 s |

Em produção o passo 2 é `PROJECT=partyx-producao REVISAO=<anterior> ./infra/producao/deploy.sh rollback` (`update-traffic`), que leva
cerca de 10 a 30 s para propagar; a referência de retorno atual é `partyx-00042-ten` (publicação de 18/10 com vendas abertas). A
reversão de migração em produção continua bloqueada de propósito (`db:rollback` recusa em produção): é decisão humana, com backup, por
SQL revisado, como o runbook diz. O ensaio mostrou um detalhe do runbook a corrigir: ele não diz que `db:rollback` exige a tag da
migração como argumento (sem ela o comando falha com a mensagem de uso).

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
