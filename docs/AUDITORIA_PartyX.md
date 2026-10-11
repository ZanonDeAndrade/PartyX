# Auditoria do PartyX frente à documentação v1.0

Data da análise: 10/10/2026. Escopo: código e documentos disponíveis nesta cópia local, sem alterações de aplicação, banco, configuração ou infraestrutura. Os três originais pedidos estão em `/home/arthur-zanon/Downloads/` (PDF de 32 páginas e dois TXT); não estão em `docs/`. A transcrição do PDF também está em `reference/docs/documentacao.txt:1`. Contrato assinado e Anexos I/II originais não foram encontrados; sua precedência é reconhecida, mas não foi possível conferir suas cláusulas diretamente. A matriz anterior (`docs/rastreabilidade/matriz-requisitos.md:1`) e o fechamento de 05/10 (`docs/fechamento-interno.md:1`) foram usados como índices, não como prova de funcionamento atual.

## 1. Resumo executivo

1. Cobertura funcional aproximada, considerando API **e** interface operacional: acesso 75%, eventos/promoters 35%, vitrine 85%, compra 70%, ingressos 85%, portaria 80%, painel/relatórios 65%, visual/legal 40%. São estimativas de auditoria, não percentuais de testes aprovados.
2. Maior risco: não existe adaptador de gateway real, nem prova Pix/cartão em sandbox; produção fica sem meio de pagamento (`server/src/payments/index.ts:7`).
3. A API administra eventos, tipos, promoters, equipe e dados de compradores, mas a interface real não oferece esses fluxos; o protótipo em `/prototipo` não os substitui (`src/site/SiteApp.tsx:21`, `src/main.tsx:13`).
4. A conciliação por tarefa começa após 10 minutos e depois escala para revisão, com varredura diária; diverge da reconsulta “a cada poucos minutos” do PDF (`server/src/payments/taskQueue.ts:5`, `infra/producao/deploy.sh:6`).
5. O estado “pago sem estoque” e o alerta no painel existem, mas o texto ao comprador sugere aviso à PartyX sem haver canal ativo confirmado (e-mail/pager); o procedimento de resposta permanece aberto (`src/site/checkoutPages.tsx:823`, `src/site/adminPages.tsx:203`, `server/src/payments/reconcile.ts:239`).
6. Esta rodada não executou testes de integração com PostgreSQL, sandbox, aparelhos reais, Excel real nem console GCP/Neon; 536 testes foram pulados. O contrato e os insumos do cliente seguem sem comprovação completa.
7. Veredito para 20/10/2026: **não é possível declarar a versão pronta para homologação formal hoje**. É tecnicamente viável apenas se gateway/insumos chegarem imediatamente, a interface administrativa essencial for concluída e o roteiro integral for aprovado em homologação; não há base para prometer essa data. O marco contratual depende das condições e registros de prazo da seção 2 do PDF.

## 2. Stack e arquitetura encontrada versus fontes

| Camada | Encontrado | Fonte e diferença |
|---|---|---|
| Front-end | React 19, TypeScript 6, Vite 8, CSS próprio, roteador por History API (`package.json:29`, `package.json:56`, `src/site/router.tsx:26`). | O PDF §5.1 sugere Next.js/Tailwind; o Prompt 02 escolhe Next.js App Router. Não há App Router, SSR geral, Tailwind ou `middleware.ts`. A escolha técnica é da contratada segundo o PDF; `docs/registros/divergencias.md:40` registra a decisão de manter Vite. |
| Servidor | Hono 4 em Node >=24, API `/api/*` e HTML estático no mesmo contêiner (`package.json:4`, `package.json:34`, `server/src/app.ts:75`, `server/src/app.ts:110`). | Regras críticas residem no servidor. Open Graph do evento é injetado pelo Hono (`server/src/app.ts:129`). |
| Banco | PostgreSQL via `pg` + Drizzle 0.45, migrações 0000–0004 e reversões (`package.json:35`, `drizzle/0000_schema_inicial.sql:1`, `drizzle/0004_limites_globais.sql:1`). | Banco Neon configurável, mas instâncias e migrações aplicadas não verificáveis nesta cópia. |
| Provedores | Cloud Storage, SMTP, Cloud Tasks, OIDC Google, Cloudflare Turnstile opcional, gateway fictício (`server/src/index.ts:7`, `server/src/index.ts:13`, `server/src/index.ts:20`, `server/src/config.ts:73`). | Integração com provedor de pagamento real ausente; e-mail real depende de SMTP/remetente. |
| Rotas públicas | `/`, `/eventos`, `/eventos/:slug`, login/cadastro/recuperação, quatro páginas legais, checkout/pedido, conta/compras/ingressos, `/portaria`, `/admin` e subrotas limitadas (`src/site/SiteApp.tsx:21`). | `/prototipo` e `/docs*` também são servidas publicamente no build (`src/main.tsx:7`). O servidor entrega o shell HTML para qualquer caminho; a restrição de páginas é feita no cliente, enquanto as APIs são autorizadas no servidor (`server/src/app.ts:151`, `src/site/adminPages.tsx:18`). |
| APIs | Agrupadas em `server/src/api/`: auth, public, checkout, tickets, events, team, gate, panel, reports, exports, privacy, webhook/jobs, e-mail e exceções de pagamento (`server/src/api/auth.ts:105`, `server/src/api/checkout.ts:51`, `server/src/api/webhooks.ts:66`). | Não há rotas App Router nem middleware Next.js. O contexto de sessão/CSRF é Hono (`server/src/auth/middleware.ts:31`). |

## 3. Matriz completa de requisitos e aceite

Legenda: ✅ regra e fluxo disponíveis no código; 🟡 parcial (API, interface ou prova faltante); ❌ ausente; ⛔ depende de insumo/decisão do cliente; ❓ exige ambiente, gateway, aplicativo externo ou aparelho real. “Evidência” aponta código existente, não equivale a aceite em homologação. Ausência de tela foi conferida contra a lista exaustiva de rotas reais em `src/site/SiteApp.tsx:21` e as ações disponíveis em `src/site/adminPages.tsx:31`. Os textos abreviam a descrição do PDF §8–9; a descrição integral está na fonte e em `docs/rastreabilidade/matriz-requisitos.md:13`.

### RF-01 a RF-68

| ID | Descrição curta | Status | Evidência | O que falta |
|---|---|---|---|---|
| RF-01 | Cadastro com dados exigidos | ✅ | `server/src/auth/service.ts:69`; `server/src/api/auth.ts:114` | — |
| RF-02 | CPF e unicidade de e-mail/CPF | ✅ | `server/src/auth/service.ts:75`; `server/src/db/schema/users.ts:29` | — |
| RF-03 | Aceite versionado de termos/privacidade | ⛔ | `server/src/db/schema/users.ts:60`; `server/src/legal/documents.ts:102` | Textos e versões oficiais da PartyX para cadastro real. |
| RF-04 | Login por e-mail/senha | ✅ | `server/src/api/auth.ts:132`; `server/src/auth/service.ts:170` | — |
| RF-05 | Recuperação por e-mail, uso único, 1 h | ⛔ | `server/src/auth/reset.ts:11`; `server/src/api/auth.ts:154` | Domínio, remetente e entrega SMTP reais. |
| RF-06 | Cliente edita dados; identidade só admin | 🟡 | `server/src/api/auth.ts:183`; `server/src/api/team.ts:94` | API corrige identidade, mas falta tela administrativa correspondente. |
| RF-07 | Três perfis | ✅ | `server/src/db/schema/enums.ts:5`; `server/src/auth/permissions.ts:11` | — |
| RF-08 | Admin gere equipe | 🟡 | `server/src/api/team.ts:65`; `src/site/SiteApp.tsx:28` | API existe; faltam telas de equipe na aplicação real. |
| RF-09 | Perfil checado em cada rota no servidor | 🟡 | `server/src/auth/permissions.ts:11`; `server/src/app.ts:151` | APIs protegidas; URL HTML de `/admin/*` entrega shell 200 e bloqueia conteúdo no cliente. Ver §6. |
| RF-10 | Limite de login | ✅ | `server/src/auth/service.ts:170`; `server/src/db/schema/users.ts:108` | — |
| RF-11 | Criar/editar/publicar/encerrar eventos | 🟡 | `server/src/api/events.ts:91`; `src/site/adminPages.tsx:1061` | API completa; tela real só lista e consulta o evento. |
| RF-12 | Campos completos do evento | 🟡 | `server/src/db/schema/events.ts:7`; `src/site/adminPages.tsx:1061` | Falta formulário administrativo real. |
| RF-13 | Upload/redimensionamento de banner | 🟡 | `server/src/api/events.ts:107`; `server/src/api/events.ts:128` | Falta UI de upload e comprovação de bucket configurado. |
| RF-14 | Tipos, preço e capacidade | 🟡 | `server/src/api/events.ts:145`; `server/src/db/schema/events.ts:41` | Falta UI de criação/edição. |
| RF-15 | Período de venda por tipo | 🟡 | `server/src/db/schema/events.ts:41`; `server/src/api/events.ts:152` | Regra no servidor; falta UI administrativa. |
| RF-16 | Ativar/desativar tipo | 🟡 | `server/src/api/events.ts:152`; `server/src/events/service.ts:444` | Falta UI administrativa. |
| RF-17 | Encerrar venda no limite do estoque | ✅ | `server/src/orders/service.ts:374`; `server/src/orders/service.ts:379` | Prova concorrente desta rodada foi pulada; ver §8. |
| RF-18 | Promoters e código exclusivo | 🟡 | `server/src/api/events.ts:160`; `server/src/db/schema/events.ts:85` | API sem tela real de cadastro/edição. |
| RF-19 | Evento em destaque | 🟡 | `server/src/db/schema/events.ts:7`; `server/src/api/events.ts:95` | Falta edição na UI real. |
| RF-20 | Inicial: destaques/próximos | ✅ | `server/src/api/public.ts:35`; `src/site/SiteApp.tsx:21` | — |
| RF-21 | Lista de eventos à venda | ✅ | `server/src/api/public.ts:38`; `src/site/SiteApp.tsx:22` | — |
| RF-22 | Busca nome/data | ✅ | `server/src/api/public.ts:38`; `src/site/pages.tsx:1` | — |
| RF-23 | Detalhe do evento | ✅ | `server/src/api/public.ts:44`; `src/site/SiteApp.tsx:56` | — |
| RF-24 | Tipos e preços públicos | ✅ | `server/src/api/public.ts:44`; `src/site/pages.tsx:1` | — |
| RF-25 | Esgotado/encerrado | ✅ | `server/src/orders/service.ts:53`; `server/src/api/public.ts:44` | — |
| RF-26 | Compartilhar com Open Graph | ❓ | `server/src/app.ts:129`; `server/src/vitrine/og.ts:1` | Confirmar preview em WhatsApp/HTTPS público. |
| RF-27 | URL amigável por slug | ✅ | `server/src/app.ts:130`; `src/site/SiteApp.tsx:56` | — |
| RF-28 | Seleção e limite por compra | ⛔ | `server/src/orders/service.ts:103`; `server/src/config.ts:48` | Limite 6 é premissa; PartyX precisa defini-lo. |
| RF-29 | Login e retorno com seleção | ✅ | `src/site/cart.ts:3`; `src/site/checkoutPages.tsx:183`; `server/src/api/checkout.ts:42` | — |
| RF-30 | Código promoter sem desconto | ✅ | `server/src/orders/service.ts:88`; `server/src/orders/service.ts:393` | — |
| RF-31 | Código inválido/desativado recusado | ✅ | `server/src/orders/service.ts:92` | — |
| RF-32 | Revisão do total antes de pagar | ✅ | `server/src/orders/service.ts:166`; `src/site/checkoutPages.tsx:180` | — |
| RF-33 | Reserva, contador e expiração | 🟡 | `server/src/orders/service.ts:329`; `server/src/orders/service.ts:276`; `src/site/checkoutPages.tsx:120` | Regra existe; confirmar job/tempo na homologação e duração com cliente. |
| RF-34 | Pix/cartão via gateway | ⛔ | `server/src/payments/index.ts:7`; `server/src/config.ts:52` | Escolha, conta, credenciais e adaptador real. |
| RF-35 | Confirmação e liberação automática | 🟡 | `server/src/payments/reconcile.ts:75`; `server/src/payments/reconcile.ts:105` | Implementado com fictício; homologar sandbox real e latência. |
| RF-36 | E-mail de compra com link | ⛔ | `server/src/mail/templates.ts:1`; `server/src/index.ts:20` | SMTP, domínio/remetente autenticados, entrega real. |
| RF-37 | Status de pedido atualizado | 🟡 | `src/site/checkoutPages.tsx:526`; `server/src/api/checkout.ts:63` | Estados existem; comportamento do gateway real pendente. |
| RF-38 | Um ingresso por unidade | ✅ | `server/src/tickets/issuer.ts:1`; `server/src/db/schema/sales.ts:171` | — |
| RF-39 | QR único aleatório e HMAC | ✅ | `server/src/domain/ticketCode.ts:1`; `server/src/tickets/issuer.ts:1` | — |
| RF-40 | Dados obrigatórios no ingresso | ✅ | `server/src/tickets/pdf.ts:70`; `src/site/ticketPages.tsx:1` | CPF não é exibido; decisão opcional ainda aberta. |
| RF-41 | PDF por ingresso/pedido | ✅ | `server/src/api/tickets.ts:54`; `server/src/api/tickets.ts:64` | — |
| RF-42 | Meus ingressos e histórico | ✅ | `server/src/api/tickets.ts:44`; `src/site/SiteApp.tsx:49` | — |
| RF-43 | Tela cheia legível no celular | ❓ | `src/site/SiteApp.tsx:52`; `src/site/ticketPages.tsx:1` | Leitura/brilho em celular real não ensaiados nesta rodada. |
| RF-44 | Portaria só equipe | ✅ | `server/src/api/gate.ts:34`; `src/site/gatePages.tsx:51` | — |
| RF-45 | Seleção de evento | ✅ | `server/src/api/gate.ts:50`; `src/site/gatePages.tsx:79` | — |
| RF-46 | Câmera no navegador | ❓ | `src/site/gatePages.tsx:262` | Chrome Android e Safari iPhone físicos. |
| RF-47 | Validação no servidor | ✅ | `server/src/api/gate.ts:58`; `server/src/gate/service.ts:229` | — |
| RF-48 | Verde/amarelo/vermelho e som | 🟡 | `src/site/gatePages.tsx:10`; `src/site/gatePages.tsx:129` | Som/câmera em aparelhos reais e ambiente ruidoso. |
| RF-49 | Tipo do ingresso na portaria | ✅ | `src/site/gatePages.tsx:162`; `server/src/gate/service.ts:170` | — |
| RF-50 | Uso único | ✅ | `server/src/gate/service.ts:194`; `server/src/gate/service.ts:198` | — |
| RF-51 | Horário e validador | ✅ | `server/src/gate/service.ts:197`; `server/src/gate/service.ts:201` | — |
| RF-52 | Busca por código/nome/CPF/e-mail | ✅ | `server/src/api/gate.ts:65`; `server/src/gate/service.ts:287` | — |
| RF-53 | Contador de entradas | ✅ | `server/src/api/gate.ts:53`; `src/site/gatePages.tsx:214` | — |
| RF-54 | Outro evento recusado | ✅ | `server/src/gate/service.ts:240`; `src/site/gatePages.tsx:134` | — |
| RF-55 | Visão geral de vendas/estoque | ✅ | `server/src/api/panel.ts:57`; `src/site/adminPages.tsx:189` | — |
| RF-56 | Pedidos e filtros | ✅ | `server/src/api/panel.ts:59`; `src/site/adminPages.tsx:351` | — |
| RF-57 | Compradores/ingressos por evento | 🟡 | `server/src/api/panel.ts:87`; `src/site/adminPages.tsx:1066` | Acesso como abas do evento; faltam detalhe/correção do comprador na UI. |
| RF-58 | Vendas por evento/tipo | ✅ | `server/src/reports/service.ts:47`; `src/site/SiteApp.tsx:31` | — |
| RF-59 | Relatório e ranking de promoters | ✅ | `server/src/reports/service.ts:137`; `src/site/SiteApp.tsx:32` | Cadastro/gestão do promoter continua sem UI. |
| RF-60 | Taxa mensal pelo `paid_at` | ✅ | `server/src/reports/service.ts:243`; `server/src/reports/service.ts:249` | Interpretação de pago sem estoque pendente (D-54). |
| RF-61 | Entradas atualizadas automaticamente | ✅ | `server/src/api/panel.ts:104`; `src/site/adminPages.tsx:748` | — |
| RF-62 | Cancelamento auditado | ✅ | `server/src/api/panel.ts:107`; `src/site/adminPages.tsx:486` | Estorno financeiro permanece no gateway da PartyX. |
| RF-63 | Exportar CSV/XLSX | ✅ | `server/src/api/exports.ts:88`; `server/src/exports/csv.ts:66` | CSV atende o “ou”; abertura no Excel real não verificada. |
| RF-64 | Lista de contingência | ✅ | `server/src/api/exports.ts:142`; `server/src/exports/contingency.ts:7` | Uso físico depende do cliente. |
| RF-65 | Layout responsivo | ❓ | `src/site/site.css:1207`; `docs/visual-e-legal.md:5` | Há registro de 116 medições Chromium anteriores; esta rodada não repetiu navegador nem aparelho real. |
| RF-66 | Identidade visual aprovada | ⛔ | `docs/registros/aprovacao-visual.md:7`; `src/site/site.css:1` | Tema final/aprovação escrita. Logo PNG registrado no item 2. |
| RF-67 | E-mails na identidade PartyX | ⛔ | `server/src/mail/templates.ts:1`; `docs/visual-e-legal.md:29` | Identidade final e SMTP. |
| RF-68 | Páginas com textos fornecidos | ⛔ | `server/src/legal/documents.ts:76`; `src/site/SiteApp.tsx:41` | Três textos oficiais e versões; páginas atuais são aviso. |

### CA-01 a CA-33 e CA-P1 a CA-P5

| ID | Descrição curta | Status | Evidência | O que falta |
|---|---|---|---|---|
| CA-01 | Cadastra, recebe e-mail, entra | ⛔ | `server/src/api/auth.ts:114`; `server/src/index.ts:20` | Confirmação em caixa real depende de remetente/provedor. |
| CA-02 | CPF inválido/duplicado recusado | ✅ | `server/src/auth/service.ts:75`; `server/src/auth/service.ts:82` | — |
| CA-03 | Sem aceite, cadastro recusado | ✅ | `server/src/api/auth.ts:121` | Texto oficial ainda pendente para cadastro real. |
| CA-04 | Recuperação e link de uso único | ⛔ | `server/src/auth/reset.ts:11`; `server/src/auth/service.ts:263` | Entrega do link por e-mail real. |
| CA-05 | Validador não abre administração | 🟡 | `server/src/auth/permissions.ts:25`; `src/site/adminPages.tsx:18` | API 403 e UI negada, porém HTML de URL `/admin/*` responde shell 200 (`server/src/app.ts:151`). |
| CA-06 | Desativado não entra | ✅ | `server/src/auth/sessions.ts:77`; `server/src/auth/team.ts:305` | — |
| CA-07 | Rascunho não público/publicado visível | ✅ | `server/src/api/events.ts:99`; `server/src/app.ts:147` | — |
| CA-08 | Janela “em breve”/“encerrada” | ✅ | `server/src/orders/service.ts:53`; `server/src/api/public.ts:44` | — |
| CA-09 | Último ingresso esgota tipo | ✅ | `server/src/orders/service.ts:374`; `server/src/api/public.ts:44` | Prova com banco não repetida nesta rodada. |
| CA-10 | Código duplicado recusado | ✅ | `server/src/db/schema/events.ts:85` | — |
| CA-11 | Evento encerrado sai da venda | ✅ | `server/src/api/events.ts:102`; `server/src/api/public.ts:38` | — |
| CA-12 | Busca parcial encontra evento | ✅ | `server/src/api/public.ts:38`; `src/site/SiteApp.tsx:22` | — |
| CA-13 | Preview em WhatsApp | ❓ | `server/src/app.ts:129` | Compartilhamento real em URL pública HTTPS. |
| CA-14 | Funciona em celular/tablet/desktop | ❓ | `docs/visual-e-legal.md:7`; `src/site/site.css:1207` | Registro prévio só Chromium; aparelho e navegador reais não repetidos. |
| CA-15 | Limite por compra | ⛔ | `server/src/orders/service.ts:103`; `server/src/config.ts:48` | Valor deve ser definido pela PartyX. |
| CA-16 | Disputa da última unidade | ✅ | `server/src/orders/service.ts:124`; `server/src/orders/service.ts:329` | Teste PostgreSQL existe, mas foi pulado nesta rodada. |
| CA-17 | Pix não pago expira e libera | 🟡 | `server/src/orders/service.ts:276`; `server/src/orders/payment.ts:176` | Expiração Pix do gateway real ainda não compatibilizada/testada. |
| CA-18 | Pagamento libera em segundos | ❓ | `server/src/payments/reconcile.ts:75`; `server/src/payments/index.ts:7` | Latência e callback de gateway real não verificáveis. |
| CA-19 | Cupom atribui promoter certo | ✅ | `server/src/orders/service.ts:392`; `server/src/reports/service.ts:137` | — |
| CA-20 | Três unidades, três QR | ✅ | `server/src/tickets/issuer.ts:1`; `server/src/db/schema/sales.ts:171` | — |
| CA-21 | PDF completo e QR legível | 🟡 | `server/src/api/tickets.ts:54`; `server/src/tickets/pdf.ts:103` | Prova automatizada de PDF existe, mas leitura por aparelho real não foi feita. |
| CA-22 | QR adulterado recusado | ✅ | `server/src/domain/ticketCode.ts:55`; `server/src/gate/service.ts:230` | — |
| CA-23 | Primeira verde, repetida amarela | ✅ | `server/src/gate/service.ts:194`; `server/src/gate/service.ts:214` | — |
| CA-24 | Cancelado vermelho | ✅ | `server/src/gate/service.ts:245`; `src/site/gatePages.tsx:133` | — |
| CA-25 | Dois validadores: só um verde | ✅ | `server/src/gate/service.ts:194`; `server/src/db/schema/operations.ts:33` | Teste concorrente foi pulado nesta rodada. |
| CA-26 | Android Chrome e iPhone Safari | ❓ | `src/site/gatePages.tsx:262`; `docs/portaria.md:1` | Ensaio nos dois aparelhos físicos. |
| CA-27 | Contador aumenta uma vez | ✅ | `server/src/gate/service.ts:200`; `server/src/api/gate.ts:53` | — |
| CA-28 | Total = pedidos pagos | ✅ | `server/src/reports/service.ts:82` | Prova com dados de homologação pendente. |
| CA-29 | Cancelado conta na taxa | ✅ | `server/src/reports/service.ts:243`; `server/src/reports/service.ts:249` | — |
| CA-30 | Ranking decrescente | ✅ | `server/src/reports/service.ts:159` | — |
| CA-31 | CSV abre no Excel com acentos | ❓ | `server/src/exports/csv.ts:60`; `server/src/exports/csv.ts:66` | BOM/acento e anti-fórmula em código; abertura por pessoa no Excel real não vista. |
| CA-32 | Sem rolagem horizontal a 360 px | ❓ | `docs/visual-e-legal.md:7`; `src/site/site.css:1046` | 116 medições antigas alegadas; esta rodada não executou browser, inclusive estados longos/de erro. |
| CA-33 | Aprovação visual escrita | ⛔ | `docs/registros/aprovacao-visual.md:7` | Proposta consta como não enviada. |
| CA-P1 | Pix/cartão sandbox aprovam | ⛔ | `server/src/payments/index.ts:7` | Gateway escolhido, conta/credenciais e sandbox. |
| CA-P2 | Cartão recusado libera estoque | ⛔ | `server/src/payments/reconcile.ts:116`; `server/src/payments/index.ts:7` | Fluxo só com fictício; falta prova sandbox real. |
| CA-P3 | Webhook repetido não duplica | 🟡 | `server/src/payments/notifications.ts:79`; `server/src/db/schema/sales.ts:171` | Idempotência no código; falta webhook real e teste com PostgreSQL nesta rodada. |
| CA-P4 | Assinatura inválida ignorada/registrada | 🟡 | `server/src/payments/notifications.ts:49`; `server/src/payments/notifications.ts:55` | Verificador só do fictício; formato real depende do gateway. |
| CA-P5 | Estorno gateway cancela ingressos | ⛔ | `server/src/payments/reconcile.ts:120`; `server/src/payments/index.ts:7` | Webhook/estado de estorno do gateway real. |

## 4. Banco: seção 6.1 e regras 6.2

As 14 entidades principais existem no schema Drizzle. Além delas há `sessions`, `login_attempts` e `global_limit_counters` para sessão e limites entre instâncias (`server/src/db/schema/users.ts:82`, `server/src/db/schema/users.ts:108`, `server/src/db/schema/operations.ts:135`). Migrações 0000–0004, snapshots e rollback estão no repositório (`drizzle/meta/_journal.json:1`); a aplicação efetiva no Neon não foi consultada. Abaixo, diferenças materiais em relação à lista resumida do PDF; “conforme” significa campos centrais encontrados no schema, não comparação de banco em execução.

| Entidade | Situação e diferença material | Evidência |
|---|---|---|
| `users` | Conforme; `must_change_password`, `updated_at`, `anonymized_at`; e-mail único, CPF único quando presente e cliente com CPF salvo. | `server/src/db/schema/users.ts:7`, `server/src/db/schema/users.ts:28` |
| `password_resets` | Conforme; hash de token único, `created_at`. | `server/src/db/schema/users.ts:45`, `server/src/db/schema/users.ts:57` |
| `consents` | Conforme: versões, data, IP, user agent. | `server/src/db/schema/users.ts:61` |
| `events` | Conforme nos campos centrais; instante de início sem campo de fuso por evento, status lógico e slug único. Exibição depende do fuso adotado na aplicação. | `server/src/db/schema/events.ts:7`, `server/src/db/schema/events.ts:30` |
| `ticket_types` | Conforme; preço/quantidades inteiros, índices, `CHECK` de vendidos <= total e preço > 0. | `server/src/db/schema/events.ts:41`, `server/src/db/schema/events.ts:64` |
| `promoters` | Conforme; código único, normalizado e `is_active`. | `server/src/db/schema/events.ts:73`, `server/src/db/schema/events.ts:85` |
| `reservations` | Conforme; acrescenta `created_at`/`released_at`, índice parcial de ativas; expiração lógica. | `server/src/db/schema/sales.ts:106`, `server/src/db/schema/sales.ts:125` |
| `orders` | Conforme; número único e `updated_at`; enum amplia para não concluído, contestado e pago sem estoque; `paid_at` tem índice e trigger de imutabilidade na migração. | `server/src/db/schema/sales.ts:29`, `server/src/db/schema/sales.ts:61`, `drizzle/0001_regras_de_integridade.sql:1` |
| `order_items` | Conforme; repete `event_id` para FKs compostas e impede tipo de outro evento. | `server/src/db/schema/sales.ts:74`, `server/src/db/schema/sales.ts:86` |
| `tickets` | Conforme; `order_item_id` + `unit_index` únicos para emissão idempotente; código curto não autenticador, versão da chave e dados de cancelamento. | `server/src/db/schema/sales.ts:136`, `server/src/db/schema/sales.ts:169` |
| `checkins` | Conforme; `code_presented` parcial em tentativas inválidas; índice único parcial impede duas entradas válidas. | `server/src/db/schema/operations.ts:13`, `server/src/db/schema/operations.ts:33` |
| `payment_events` | `gateway_event_id` tem índice único **parcial** para eventos de assinatura válida e ID não nulo; eventos inválidos podem repetir ID para preservar a trilha. É uma diferença da descrição simplificada “único” do PDF. Payload guarda metadados, não corpo bruto. | `server/src/db/schema/operations.ts:49`, `server/src/db/schema/operations.ts:65` |
| `email_log` | Conforme; também funciona como outbox com chave idempotente, tentativas e próxima tentativa. | `server/src/db/schema/operations.ts:80`, `server/src/db/schema/operations.ts:97` |
| `audit_log` | Conforme; motivo, índices por entidade/ator e trigger append-only previsto na migração. | `server/src/db/schema/operations.ts:108`, `drizzle/0001_regras_de_integridade.sql:1` |

**Regras 6.2.** Dinheiro em centavos inteiros (`server/src/db/schema/events.ts:50`, `server/src/db/schema/sales.ts:44`, `server/src/db/schema/sales.ts:83`). Código do ingresso: 144 bits aleatórios e HMAC-SHA256 truncado a 128 bits (`server/src/domain/ticketCode.ts:6`, `server/src/domain/ticketCode.ts:18`). A reserva usa transação e `FOR UPDATE` por tipo em ordem de ID, calcula `quantity_sold + reservas ativas não vencidas` antes de inserir (`server/src/orders/service.ts:124`, `server/src/orders/service.ts:329`, `server/src/orders/service.ts:374`). A expiração é idempotente; disponibilidade já ignora reserva vencida, mesmo se o job atrasar (`server/src/orders/service.ts:271`). A aprovação tardia reconta estoque sob trava; sem capacidade grava `pago_sem_estoque` e não emite QR (`server/src/payments/reconcile.ts:186`, `server/src/payments/reconcile.ts:225`). Check-in usa `UPDATE WHERE status='valido'` e preserva a primeira entrada (`server/src/gate/service.ts:194`, `server/src/gate/service.ts:214`). A taxa conta `tickets` unidos a `orders` por `paid_at`, sem filtro do estado atual (`server/src/reports/service.ts:243`). Exclusão lógica de eventos, tipos, promoters, reservas, pedidos e ingressos; dados técnicos têm rotina de purga configurável (`server/src/privacy/retention.ts:7`). Há risco de divergência entre schema e banco real por falta de acesso ao Neon.

### Verificações críticas exigidas

| # | Resultado da inspeção | Lacuna/prova necessária |
|---|---|---|
| 1. Login na compra | `/checkout/:slug` exige sessão; a seleção fica em `sessionStorage` e o retorno usa o caminho original (`src/site/checkoutPages.tsx:20`, `src/site/checkoutPages.tsx:183`, `src/site/cart.ts:3`). A API também exige cliente (`server/src/api/checkout.ts:42`). | Reavaliar disponibilidade ao voltar, como faz o servidor. Fluxo de navegador não repetido nesta rodada. |
| 2. Estoque/reserva | Transação com `SELECT … FOR UPDATE`; soma vendidos + reservas ativas dentro da capacidade; reserva vencida sai do cálculo mesmo antes da limpeza. Expiração é condicional/idempotente (`server/src/orders/service.ts:124`, `server/src/orders/service.ts:329`, `server/src/orders/service.ts:374`, `server/src/orders/service.ts:276`). | Reexecutar disputa concorrente e job em PostgreSQL; confirmar D-03 e reposição após cancelamento (D-14). |
| 3. Promoter | Código validado/atribuído ao pedido, sem alterar preços nem total; ranking lê a atribuição (`server/src/orders/service.ts:88`, `server/src/orders/service.ts:393`, `server/src/reports/service.ts:137`). | Gestão do promoter pela UI real. |
| 4. Pagamento | Interface `PaymentGateway` isolada, mas só há fictício/nenhum (`server/src/payments/gateway.ts:66`, `server/src/payments/index.ts:7`). Webhook verifica assinatura e reconsulta a API; duplicidade válida é protegida por índice único parcial e emissão idempotente (`server/src/payments/notifications.ts:49`, `server/src/payments/reconcile.ts:75`, `server/src/db/schema/operations.ts:65`). Não há emissão pelo navegador. | Adaptador e assinatura do gateway real; primeira reconsulta aos 10 min, depois 15/30 min, não “a cada poucos minutos” (`server/src/payments/taskQueue.ts:5`). Pago após expiração sem estoque vira exceção sem QR e alerta no painel (`server/src/payments/reconcile.ts:225`, `src/site/adminPages.tsx:203`); canal ativo e procedimento D-13 pendentes. |
| 5. Ingresso | Emissão por unidade com unicidade item/índice; código aleatório de 144 bits + HMAC; PDF, tela cheia e ausência de CPF no ingresso (`server/src/tickets/issuer.ts:1`, `server/src/db/schema/sales.ts:171`, `server/src/domain/ticketCode.ts:6`, `server/src/api/tickets.ts:54`, `src/site/SiteApp.tsx:52`). | Ler QR impresso/na tela em aparelho real; D-07 decide CPF opcional, portanto não foi incluído. |
| 6. Portaria | `UPDATE` condicional preserva primeira entrada; respostas distinguem válido, já usado, inválido/cancelado e outro evento; contador e busca manual mascaram CPF (`server/src/gate/service.ts:194`, `server/src/gate/service.ts:214`, `server/src/gate/service.ts:240`, `server/src/gate/service.ts:287`, `server/src/api/gate.ts:53`). | Sem validação offline: conexão perdida bloqueia admissão digital e orienta lista impressa (`src/site/gatePages.tsx:343`, `src/site/gatePages.tsx:444`). Concorrência/aparelhos não testados nesta rodada. |
| 7. Taxa mensal | Consulta `tickets` ligados a `orders.paid_at` do mês sem filtrar `tickets.status` nem `orders.status`; cancelados/estornados continuam contados (`server/src/reports/service.ts:243`). | Decisão D-54 sobre caso sem emissão de ingresso não consta resolvida; não alterar fórmula sem ela. |
| 8. Permissões | Middleware de perfil nas APIs; validador recebe negação nas APIs admin e a UI nega navegação; sessão de desativado é recusada (`server/src/auth/permissions.ts:11`, `server/src/auth/sessions.ts:77`, `src/site/adminPages.tsx:18`). | O Hono devolve shell HTML 200 para URL `/admin/*` sem sessão (`server/src/app.ts:151`); não há dados administrativos no HTML, mas não é bloqueio HTTP da rota de página. |
| 9. Segurança/LGPD | Argon2id; cookie HttpOnly/Secure/SameSite; checagens Origin/CSRF; limites de login/cadastro/validação; rejeição de PAN/CVV; logger com redação; trilha de cancelamento/usuário (`server/src/providers/passwordHasher.ts:11`, `server/src/api/auth.ts:94`, `server/src/auth/middleware.ts:31`, `server/src/auth/limits.ts:5`, `server/src/api/gate.ts:30`, `server/src/api/checkout.ts:88`, `server/src/security/redact.ts:5`, `server/src/panel/service.ts:608`, `server/src/auth/team.ts:176`). | Validação é limitada em memória por instância, sem teto global; testes de segurança em produção e histórico Git não verificáveis. Nenhuma chave evidente foi encontrada nos arquivos atuais, mas ausência de `.git` impede procurar chaves anteriormente commitadas. |
| 10. Exportação | CSV com UTF-8 BOM, `;`, CRLF, sanitização de fórmula; lista de contingência é PDF (`server/src/exports/csv.ts:23`, `server/src/exports/csv.ts:60`, `server/src/exports/contingency.ts:7`). | Não há XLSX, mas RF-63 permite CSV **ou** XLSX; abrir no Excel real e testar entradas adversariais. |
| 11. 360 px | CSS inclui adaptação de tabelas e algumas áreas roláveis (`src/site/site.css:1046`, `src/site/site.css:1207`). | Documento interno relata 116 medições antigas sem rolagem horizontal (`docs/visual-e-legal.md:7`); não é uma verificação desta rodada nem cobre todos os estados longos. |
| 12. Excluídos | Não se encontrou desconto por cupom, comissão, lote automático, cortesia/valor zero, transferência de titularidade ou validação offline nas regras de produção (`server/src/orders/service.ts:88`, `server/src/db/schema/events.ts:62`, `src/site/gatePages.tsx:444`). | `/prototipo` é ferramenta de demonstração pública, não funcionalidade operacional; controlar exposição antes do go-live (`src/main.tsx:13`). Ver §11. |

## 5. Telas do inventário de design versus aplicação real

Fonte do inventário: `/home/arthur-zanon/Downloads/Prompt_PartyX_Claude_Design.txt:65` a `:302`. A tabela abaixo conta **a aplicação real** em `src/site/SiteApp.tsx:21`, não o protótipo navegável, que usa `src/logic/routes.ts:1` e é publicado separadamente em `/prototipo` (`src/main.tsx:13`). “Mesmo fluxo” indica estado/seção no mesmo endereço, não página independente; dependências de gateway/insumos continuam valendo.

| Grupo | Existente na aplicação real | Ausente ou incompleto |
|---|---|---|
| P01–P07 | P01 `/`, P02 `/eventos`, P03 `/eventos/:slug`, P04–P06 páginas legais, P07 fallback 404 (`src/site/SiteApp.tsx:21`, `src/site/SiteApp.tsx:41`, `src/site/SiteApp.tsx:56`). | P04–P06 só exibem aviso até textos oficiais. Prévia WhatsApp e estados de dispositivos externos não homologados (`server/src/legal/documents.ts:76`, `server/src/app.ts:129`). |
| A01–A06 | Login, cadastro, pedido de recuperação e redefinição; A04/A06 são estados do mesmo fluxo, incluindo links vencidos/usados (`src/site/SiteApp.tsx:23`, `src/site/authPages.tsx:620`). | Confirmação por e-mail real depende de SMTP/domínio; termos oficiais bloqueiam cadastro real (`server/src/legal/documents.ts:102`). |
| C01–C10 | C01 na página do evento; C02/C03 no checkout; C04–C10 estados da página do pedido. C08 expirado e C10 pago sem estoque **existem** (`src/site/pages.tsx:252`, `src/site/checkoutPages.tsx:180`, `src/site/checkoutPages.tsx:526`, `src/site/checkoutPages.tsx:775`, `src/site/checkoutPages.tsx:814`). | C04/C05/Pix/cartão somente com fictício; gateway real ausente. C10 tem alerta administrativo na visão geral e filtro de pedidos, mas não há notificação ativa/procedimento comprovado (`src/site/adminPages.tsx:203`). |
| U01–U07 | U01, U02, U06 em rotas próprias; U03 estado/detalhe no pedido; U04/U05 rotas do ingresso e tela cheia; U07 modal em Minha conta (`src/site/SiteApp.tsx:49`, `src/site/SiteApp.tsx:52`, `src/site/accountPages.tsx:10`). | Leitura QR e brilho em aparelho real não comprovados. |
| ADM01–ADM24 | ADM01, ADM02, ADM04 parcial, ADM10/11, ADM12 e ADM14 como abas no evento, ADM15 como ação/detalhe no painel de ingressos, ADM16–18 e ADM19 como aba de entradas, ADM23 por links de exportação; ADM22 `/primeiro-acesso` (`src/site/SiteApp.tsx:28`, `src/site/adminPages.tsx:842`, `src/site/adminPages.tsx:965`, `src/site/adminPages.tsx:1061`, `src/site/adminPages.tsx:304`). | Faltam ADM03 (criar/editar evento), ADM05/06 (gerir tipos), ADM07–09 (promoters), ADM13 (detalhe/correção de comprador), ADM20/21 (equipe), ADM24 (conta admin). ADM02/04 não têm ações de gestão; ADM15/19/23 são parciais, não uma área própria. As APIs correspondentes existem em parte (`server/src/api/events.ts:91`, `server/src/api/team.ts:65`). |
| V01–V09 | V01 `/portaria`, V02–V08 estados do leitor/busca/resultado no mesmo endereço; V09 **existe**, inclusive perda de conexão, permissão/câmera e instrução para contingência (`src/site/SiteApp.tsx:37`, `src/site/gatePages.tsx:138`, `src/site/gatePages.tsx:343`). | Falta prova em iPhone Safari/Android Chrome e duas sessões simultâneas reais. |
| G01–G08 | Componentes de carregamento, vazios, erro/tentar de novo, acesso negado, sessão e exportação aparecem distribuídos (`src/site/adminPages.tsx:142`, `src/site/gatePages.tsx:63`, `src/site/adminPages.tsx:304`). | G06 manutenção/indisponibilidade não tem página operacional dedicada; G07 (drawer mobile, alterações não salvas) não está completo no painel de gestão, pois os formulários faltam. Não houve varredura visual exaustiva de todas as variantes. |
| E01–E05 | Templates de cadastro, recuperação e compra, PDF e metadados Open Graph no código (`server/src/mail/templates.ts:1`, `server/src/tickets/pdf.ts:70`, `server/src/app.ts:129`). | Entrega SMTP real, renderização em clientes de e-mail, leitura do PDF e preview de rede social não verificáveis. |

## 6. Segurança e LGPD: achados por severidade

| Severidade | Achado, consequência e evidência |
|---|---|
| Crítico | **Gateway real ausente.** Pix/cartão e estorno não podem ser aceitos em produção; nenhum aceite CA-P1–P5 em sandbox real (`server/src/payments/index.ts:7`). Trata-se de bloqueio operacional, não de vulnerabilidade demonstrada. |
| Alto | Canal ativo para “pago sem estoque” não demonstrado. Há log e alerta condicional no dashboard, mas o comprador vê texto de aviso; sem monitoramento operacional e D-13, caso pode ficar sem atendimento (`server/src/payments/reconcile.ts:239`, `src/site/adminPages.tsx:203`, `src/site/checkoutPages.tsx:823`). |
| Alto | IP em ambiente com proxy: `TRUSTED_PROXY_HOPS=2` foi medido apenas atrás do Hosting; acesso direto ao `run.app` pode forjar chave de limites por IP segundo registro interno (`docs/registros/decisoes-pendentes.md:80`, `server/src/auth/middleware.ts:10`). Confirmar proteção de origem/proxy na implantação. Limite por e-mail persiste no banco (`server/src/auth/limits.ts:40`). |
| Médio | Limites da portaria são memória por instância; várias réplicas repartem o teto de leituras/buscas. Cadastro/recuperação têm teto global no banco, mas o valor atual de cadastro (30/h) pode barrar compradores em abertura de vendas (`server/src/api/gate.ts:30`, `server/src/api/auth.ts:119`, `server/src/config.ts:85`). |
| Médio | O controle de CSRF exige token em mutações **com sessão** e confere `Origin` quando enviado. Se `Origin` faltar em pedido sem sessão (inclusive login/cadastro), a checagem de origem não bloqueia; risco deve ser avaliado em teste de navegador/proxy (`server/src/auth/middleware.ts:31`, `server/src/auth/middleware.ts:47`). Não foi demonstrada exploração nesta rodada. |
| Médio | Retenção de dados técnicos é configurável sem padrão; apagar/anonymizar dados de compra depende de regra legal/operacional da controladora, não resolvida aqui (`server/src/privacy/retention.ts:7`, `docs/lgpd.md:1`). Não inferir prazo sem decisão. |
| Médio | `/prototipo` e `/docs*` fazem parte do bundle servido publicamente. O protótipo usa dados fictícios, mas pode confundir compradores se o domínio de produção for divulgado (`src/main.tsx:7`). Avaliar publicação/aviso antes de go-live. |
| Baixo | URL de administração recebe o shell HTML mesmo sem sessão; React nega a tela e APIs exigem papel. Não foi encontrada exposição de dados admin por isso, mas difere da leitura literal de “cada rota” checada no servidor (`server/src/app.ts:151`, `server/src/auth/permissions.ts:25`). |

Controles positivos verificados no código: Argon2id para senha (`server/src/providers/passwordHasher.ts:11`), cookies HttpOnly/Secure/SameSite (`server/src/api/auth.ts:94`), Origin e CSRF (`server/src/auth/middleware.ts:31`), CSP/HSTS (`server/src/security/headers.ts:20`), rejeição de campos PAN/CVV (`server/src/api/checkout.ts:88`), redação de campos sensíveis no logger (`server/src/security/redact.ts:5`), e auditoria de cancelamentos e alterações de equipe (`server/src/panel/service.ts:608`, `server/src/auth/team.ts:176`). A busca em arquivos atuais não encontrou arquivo `.env`, PEM ou token obviamente preenchido; **não foi possível auditar o histórico de segredos**, pois esta cópia não contém `.git`. Não se afirma que todo log de produção, dependência ou provedor externo jamais registra CPF/token.

## 7. Infraestrutura, ambientes e backup

| Item | Estado verificável no repositório | Falta verificar externamente |
|---|---|---|
| Contêiner/Cloud Run | `Dockerfile:4` usa Node 24 e build multiestágio; Hono serve API e SPA (`server/src/app.ts:110`). `firebase.json:5` prevê Hosting como frente. | Revisão ativa, URL, HTTPS/domínio e isolamento do `run.app` no GCP. |
| Configuração/segredos | `.env.example:1` documenta Neon pooled/direto, chaves de sessão/QR, gateway, SMTP, buckets e jobs sem valores reais. Scripts de deploy referenciam Secret Manager (`infra/producao/deploy.sh:2`). | Existência, permissões, rotação e valores dos segredos no console; nenhum valor deve ser colocado neste relatório. |
| CI/CD/branches | `.github/workflows/ci.yml:3` cobre push em `main`, `develop`, `feature/**` e PR; inclui PostgreSQL, lint, typecheck, migrações, testes, build e auditoria de dependências. `.github/workflows/deploy-homologacao.yml:5` prevê deploy de `develop` com WIF. | Branches de fato existentes/protegidas, histórico de runs e aprovações: `.git` ausente. Não há workflow automático de produção; `infra/producao/deploy.sh:2` é manual e marcado “NÃO FOI EXECUTADO”. |
| Cloud Storage/Tasks/Scheduler | Scripts criam buckets versionados, fila de conciliação e varredura diária (`infra/producao/deploy.sh:57`); tarefas usam OIDC (`server/src/payments/taskQueue.ts:71`, `server/src/api/webhooks.ts:107`). | Recursos criados, IAM efetivo, jobs acionados, erros e custo no console GCP. |
| Backup/monitoramento | `infra/backup/setup.sh:2` prevê `pg_dump` diário às 03h, bucket privado e alertas de falha/ausência; `infra/operacao/alerts.sh:2` configura alertas de aplicação. Há relato interno de restauração em homologação (`docs/fechamento-interno.md:5`). | Evidência atual de objetos de backup, 7+ dias de retenção, restauração, alertas entregues e RPO real. Scripts não provam execução; o cabeçalho do setup de produção diz não executado. |
| Neon | Schema e migrações SQL estão versionados (`drizzle/meta/_journal.json:1`). | Plano, região, PITR, papéis, migrações aplicadas, replicação e acesso ao banco real. |

## 8. Lint, typecheck, testes e build desta auditoria

| Comando | Resultado observado em 10/10/2026 |
|---|---|
| `npm run lint` | **Concluiu, exit 0**, sem erros, com cerca de 25 avisos (incluindo variáveis não usadas e regex em CSV). Executado no repositório; não houve correção. |
| `npm run typecheck` | **Concluiu, exit 0**. Executado em cópia temporária fora do projeto para evitar artefatos no workspace. |
| `npm test` | **Concluiu, exit 0**: suíte principal 27 arquivos aprovados/19 pulados, 204 testes aprovados/536 pulados; suíte de papéis PostgreSQL 1 arquivo e 4 testes pulados. Não havia `TEST_DATABASE_URL`/`DATABASE_URL`; testes de integração/concorrência com banco **não foram executados**. |
| `npm run build` | **Concluiu, exit 0** na cópia temporária; Vite gerou bundle e esbuild concluiu servidor. Aviso de chunk de aproximadamente 989 kB, acima do limite de 500 kB. |

A cópia temporária usada nos comandos acima fica em `/tmp/partyx-audit-Ueu9qslU` e não constitui entrega. Não foram rodados gateway sandbox, Chromium nesta rodada, teste físico, `check:migrations` isolado ou `npm audit` isolado. Portanto, não são “aprovados” por esta auditoria.

**Verificação posterior, 10/10/2026:** os testes antes pulados por falta de PostgreSQL foram executados. A suíte principal aprovou 740/740 e a suíte de papéis 4/4; três repetições dos cenários de concorrência e idempotência aprovaram 205/205 cada. A reversão e reaplicação das migrações 0000–0004 também passou. Evidência e limite do ambiente local: [`registros/testes-postgresql-2026-10-10.md`](registros/testes-postgresql-2026-10-10.md).

## 9. Insumos e decisões pendentes do cliente

Fonte: PDF §4.1–4.2 e `docs/registros/insumos-etapa-0.md:1`. “Sem registro” significa falta de comprovação nesta cópia, não afirma que o cliente não enviou. Os itens 1–14 condicionam a Etapa 0; 15–19 podem chegar durante o desenvolvimento, mas atraso pode afetar prazo. O quadro antigo diz “0 de 14 recebidos” (`docs/registros/insumos-etapa-0.md:35`), porém o próprio item 2 foi atualizado como recebido em 10/10; esse total está desatualizado.

| # | Insumo | Situação comprovada e impacto |
|---|---|---|
| 1 | Contrato assinado/Anexos I–II | Sem registro; impede conferir precedência e marco de prazo. |
| 2 | Logotipo em alta resolução | PNG registrado como recebido 10/10; SVG, se existir, não comprovado. Não é bloqueio total. |
| 3 | Cores/fontes/identidade | Tema preto/branco/roxo provisório; aprovação escrita visual pendente. |
| 4 | Dados e contato da PartyX | Sem registro; rodapé/e-mails/atendimento definitivo. |
| 5 | Gateway escolhido | Sem registro; bloqueia adaptador real e sandbox. |
| 6 | Conta do gateway aprovada | Sem registro; bloqueia Pix/cartão real. |
| 7 | Credenciais sandbox/produção | Sem registro; bloqueia integração e teste. Não registrar seus valores no Git. |
| 8 | Domínio e acesso DNS | Sem registro; bloqueia URL pública, e-mail autenticado e preview social. |
| 9 | Termos de Uso | Sem registro; bloqueia cadastro real. |
| 10 | Política de Privacidade | Sem registro; bloqueia cadastro real. |
| 11 | Política de cancelamento/troca/reembolso | Sem registro; bloqueia compra real e páginas definitivas. |
| 12 | Regras de meia-entrada | Sem registro; bloqueia texto público correspondente, não autoriza validar documentos automaticamente. |
| 13 | Dados de evento/banner | Apenas dados fictícios/provisórios; sem evento de homologação fornecido. |
| 14 | Tipos/preço/capacidade/período | Apenas fictícios/provisórios; compra real não pode assumir os valores. |
| 15 | Limite por compra | Sem registro; 6 é premissa técnica, não decisão do cliente. |
| 16 | Promoters iniciais | Sem registro; apenas demonstração. |
| 17 | Equipe inicial/perfis | Sem registro; não criar contas reais por inferência. |
| 18 | Remetente de e-mail | Sem registro; bloqueia entrega transacional autenticada. |
| 19 | Cenários de teste do cliente | Sem registro; roteiro técnico mínimo não substitui aceite do cliente. |

Decisões do §4.2 ainda abertas: gateway e parcelamento (D-01/D-02), duração da reserva compatível com Pix (D-03), regras/valores comerciais do provedor (D-04), limite por compra (D-05), meia-entrada (D-06), CPF opcional no ingresso (D-07; atualmente **não exibido**), domínio (D-08), remetente (D-09), identidade/aprovação visual (D-10), textos/versionamento legais (D-11), dados operacionais reais (D-12) e datas de aberturas/eventos para manutenção (D-15) (`docs/registros/decisoes-pendentes.md:8`). Acrescentam-se D-13 (canal/responsável por pagamento tardio sem estoque), D-14 (reposição após cancelamento) e D-54 (tratamento contábil de pago sem estoque), sem resposta presumida. Há decisões da contratada ainda marcadas “confirmar com cliente”; o registro deve ser fechado antes do aceite onde afetar operação. Não se conclui que o prazo contratual correu sem prova da assinatura e do último insumo.

## 10. Plano de ação em ordem de dependência

Esforço: P = até poucos dias; M = vários dias; G = trabalho de maior porte/incerteza. É estimativa relativa, não promessa de calendário. “Bloqueia” significa necessário ao aceite formal conforme PDF/CA, não autorização para mudar o escopo. A execução depende dos insumos da §9.

| Ordem | Ação / critério de conclusão | Esforço | Prompt(s) | Bloqueia homologação? |
|---|---|---|---|---|
| 1 | Receber contrato/anexos, registrar decisões D-01/03/05/11/12/13/14/54 e insumos 1–19 com datas; validar precedência e cronograma. | M | Prompt 01, 27 | Sim, para aceite formal e alcance correto. |
| 2 | Reexecutar migrações e cenários concorrentes em PostgreSQL: última unidade, reserva vencida/idempotente, compra tardia e cancelamento; fixar duração com gateway e decisão de reposição. | M | Prompt 03, 09, 21 | Sim: preservação de estoque. |
| 3 | Integrar **um** gateway escolhido (Pix/cartão e tokenização/checkout hospedado), expiração alinhada à reserva, credenciais seguras. | G | Prompt 10, 11 | Sim. |
| 4 | Homologar assinatura/webhook/reconsulta real, duplicidade, recusa, estorno e chargeback; aproximar a cadência de “poucos minutos” ou obter aprovação expressa da divergência; definir alerta operacional para pago sem estoque. | G | Prompt 12, 22, 21 | Sim. |
| 5 | Verificar emissão por unidade, idempotência, QR/PDF, e-mail de compra e estados C07/C10 em sandbox; manter CPF ausente até decisão. | M | Prompt 13, 14 | Sim. |
| 6 | Testar portaria concorrente, câmera/QR em Android Chrome e iPhone Safari, busca/CPF mascarado, contador e perda de rede com lista impressa. | M | Prompt 15, 23 | Sim. |
| 7 | Concluir UI real de eventos/tipos/promoters/equipe/compradores (ADM03, 05–09, 13, 20–21, 24) e garantir trilha/permissão por API; não contar `/prototipo` como entrega. | G | Prompt 06, 07, 16 | Sim. |
| 8 | Revalidar relatórios (inclusive taxa em cancelados/estornados), exportações com acentos/injeção em Excel, contingência e decisão D-54. | M | Prompt 17, 18 | Sim. |
| 9 | Instalar textos oficiais/versões, domínio e SMTP; obter aprovação visual, checar 360 px/estados G01–G08, e-mail renderizado e OG público. | G | Prompt 14, 19, 20 | Sim. |
| 10 | Conferir Cloud Run/Neon/Secrets/Storage/Scheduler/alertas no console, executar backup e restauração; fechar operação de incidentes e exposição de `/prototipo`. | M | Prompt 04, 25, 28 | Sim para ambiente de homologação confiável; produção em Prompt 28–30 é marco posterior. |
| 11 | Rodar CI integral com PostgreSQL, segurança, carga, todos os roteiros CA/CA-P e registrar evidências; solicitar aceite formal e corrigir apenas achados dentro do escopo aprovado. | G | Prompt 20, 24, 26, 27 | Sim. |

O caminho técnico crítico é **estoque/reserva → gateway/webhook → ingresso → portaria → relatórios → testes/aceite**. A UI administrativa e os textos/ambiente são trilhas paralelas que convergem antes da homologação; hoje não há evidência suficiente para assegurar conclusão até 20/10/2026.

## 11. Fora do escopo encontrado e evolução separada

O PDF §16 exclui cupom de **desconto**, comissão de promoter, virada automática de lotes, cortesia/lista de convidados, transferência de titularidade, mapa/assento, bilheteria/POS, aplicativo nativo, nota fiscal, SMS/WhatsApp automático, múltiplos gateways, cashless e migração de outra plataforma (`reference/docs/documentacao.txt:1134`). A seção 15 prevê contingência **impressa**, não validação offline no sistema (`reference/docs/documentacao.txt:1128`). Na aplicação operacional, não foi encontrada implementação dessas funções: “cupom” apenas atribui promoter sem desconto (`server/src/orders/service.ts:88`), tipo de ingresso não admite preço zero (`server/src/db/schema/events.ts:64`) e perda de rede remete à lista impressa (`src/site/gatePages.tsx:444`). O PDF de contingência é requisito, não autorização para modo offline. O protótipo e a documentação navegável publicados junto ao bundle são artefatos extras de demonstração, não novas regras de venda (`src/main.tsx:7`).

Como **evolução contratada separadamente**, e não pendência deste escopo, poderiam ser avaliados descontos, comissão, lotes automáticos, cortesia, transferência, offline ou aplicativo nativo. Qualquer escolha exige pedido e análise de mudança previstos no §16.2; esta auditoria não propõe implementá-los nem resolve decisões do cliente.


