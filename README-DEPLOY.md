# Como publicar o PartyX em produção (custo mínimo)

Google Cloud (Cloud Run + Cloud Tasks) em **São Paulo**, **Firebase Hosting** na frente (domínio próprio, HTTPS e CDN) e **Neon** (Postgres) em `aws-sa-east-1`.
Este roteiro registra a preparação original e o primeiro deploy descrito na seção 13. Nenhuma publicação foi feita nesta correção.

**Roteamento validado para o deploy atual:** em produção, o Hono aceita o `Host` de `PUBLIC_BASE_URL` ou o encaminhamento medido do Firebase Hosting (`Host=*.run.app` e `X-Forwarded-Host=PUBLIC_BASE_URL`). Acesso ao `run.app` sem esse cabeçalho recebe 403, exceto nos health checks. Cloud Tasks, Scheduler e o teste rápido enviam o mesmo cabeçalho ao chamar o serviço diretamente. O script está liberado, mas não foi executado nesta correção.

```
navegador ──HTTPS──> Firebase Hosting (domínio próprio, CDN) ──rewrite "**"──> Cloud Run "partyx" (SP) ──pooler──> Neon (sa-east-1)
                                                                                  ^   ^
  Cloud Tasks (por pedido: 1, 2, 4, 8 min, fim da reserva; 15 min a 24 h) ──────────┘   └── Cloud Scheduler (rotina diária 04:00 e backup 03:00)
```

## 1. Decisões e o que foi medido

| Tema | Decisão | Evidência |
|---|---|---|
| Região | São Paulo (`southamerica-east1`) + Neon `aws-sa-east-1` | Dados e usuários no Brasil; latência menor |
| Cookie | `__session` (era `px_session`) | O Hosting remove todos os cookies das requisições ao Cloud Run **exceto** `__session` (documentação oficial). **Medido na homologação em 05/10/2026**: enviando `__session`, `px_session` e `outro`, o servidor recebeu só `__session`; a resposta com `Set-Cookie` chegou ao navegador |
| Cache da API | Toda resposta de `/api/*` é `Cache-Control: private, no-store` | Pelo documentado, `private`/`no-store` impede o cache na CDN. **Medido**: `public, max-age=60` virou HIT na CDN e `private, no-store` foi MISS em todas as vezes; com `__session` diferentes, respostas nunca se misturaram. Testes automáticos percorrem **todas** as rotas, anônimo e logado, sucesso e erro |
| Cache dos estáticos | `/assets/*` (hash do Vite): `public, max-age=31536000, immutable`. `index.html` e rotas do app: `no-cache`. Outros (ícones): 1 h | `server/src/app.cache.test.ts` |
| Corpo da requisição | Chega byte a byte igual ao enviado (importa para a assinatura do webhook) | **Medido**: SHA-256 idêntico dos dois lados |
| `TRUSTED_PROXY_HOPS` | **2** atrás do Hosting (era 1 direto no Cloud Run) | Ver abaixo |
| Conciliação | Só por pedido (Cloud Tasks): 1, 2, 4 e 8 min da cobrança e no fim da reserva + margem; tardias aos 15 min, 30 min, 1 h, 3 h, 8 h e 24 h. Uma única agenda fixa: a rotina diária. **Sem cron frequente**: sem pedido em aberto, o Neon dorme (D-78) | Seção 5 |
| Neon | Plano pago **Launch** (só uso, sem mensalidade mínima), projeto de produção separado, dev com Postgres local | Seção 8 |
| Front-end | Junto da API, atrás do Hosting. O Hosting tem só um `404.html` e o rewrite para o Cloud Run | `firebase.json` |

### Cabeçalhos medidos atrás do Hosting (sonda na homologação; IP parcialmente mascarado)

| Cabeçalho recebido pelo Cloud Run | Valor |
|---|---|
| `x-forwarded-for` | `177.86.x.x,192.178.11.130` (cliente real, depois IP do Google) |
| `x-forwarded-for` com `1.2.3.4, 5.6.7.8` forjado pelo cliente | `177.86.x.x,74.125.210.101`: **o Hosting descarta o que o cliente enviou** |
| `fastly-client-ip` | `177.86.x.x` |
| `x-forwarded-host` / `host` | `partyx-hml.web.app` / o endereço `run.app` (o app **não** vê o domínio no `Host`: use `PUBLIC_BASE_URL`) |
| `x-forwarded-proto`, `via` | `https`, `1.1 Firebase Hosting` |
| **Direto no `run.app`** com `1.2.3.4, 5.6.7.8` forjado | `1.2.3.4, 5.6.7.8,<IP real>` (o Google acrescenta o real no fim) |

**Valor medido de `TRUSTED_PROXY_HOPS`: 2** atrás do Hosting (o cliente é o penúltimo da lista). Com 1, todos os usuários cairiam no mesmo IP do Google e os limites por IP bloqueariam todo mundo junto. A regra de Host não altera `X-Forwarded-For`, portanto o valor continua correto. Revalidar os saltos se a infraestrutura de entrada mudar.

**Acesso direto ao `run.app`:** sem `X-Forwarded-Host` válido, o Hono devolve 403 antes de ler o IP ou rotear a API. Esse cabeçalho pode ser forjado por um cliente HTTP direto, portanto a barreira reduz acesso casual e não comprova a origem. O risco residual e a alternativa futura estão em `docs/registros/riscos-aceitos.md`.

**Latência (medida, 15 requisições, uma única origem, conexão nova a cada requisição):** mediana 0,77 s pelo Hosting contra 0,32 s direto no Cloud Run, ou seja, **cerca de 0,4 s a mais**. Navegadores reutilizam conexão e devem ficar melhor, mas o domínio próprio via Hosting tem esse custo. O balanceador fica como evolução condicionada a abuso real ou aumento de tráfego e a aprovação do custo.

## 2. O que mudou no código

- Cookie `__session`; política de cache central em `server/src/app.ts`.
- Conciliação sob demanda: `server/src/payments/taskQueue.ts` (Cloud Tasks por REST, nome determinístico `reconcile-<pedido>-<tentativa>`), `reconcileTask.ts` e a rota `POST /api/internal/tasks/reconcile-order` (token OIDC, `audience` = URL `run.app`).
  - **Desde 10/10/2026 (D-78):** ao **criar a cobrança** (não mais o pedido), agenda a 1ª tarefa para +1 min; cada tarefa que ainda encontra o pagamento sem decisão agenda a seguinte. Enquanto a reserva está ativa: +2, +4 e +8 min, e uma **no fim da reserva + margem** (padrão 2 min; nenhuma inicial passa desse limite). Depois, **tardias** para a aprovação que chega após o vencimento: 15 min, 30 min, 1 h, 3 h, 8 h e 24 h depois da cobrança. Tarefa atrasada pula as que ficaram para trás.
  - No limite o pedido só **vence** (a reserva é liberada); as tardias seguem verificando. **Revisão manual** (trilha `conciliacao.revisao_manual`, alerta `conciliacao_revisao_manual`) só se, depois da **última** tardia, o gateway ainda não tiver estado conclusivo.
  - Pedido já em estado final: a tarefa encerra **em silêncio** (sem log nem nova tarefa). Uma verificação por pedido de cada vez: trava com prazo em `job_leases` (`reconcile-order:<pedido>`); a confirmação continua idempotente.
  - Erro de rede com o gateway não gasta tentativa: devolve 503 e o Cloud Tasks repete. Falha ao agendar nunca derruba a criação da cobrança nem a tarefa (alerta `fila_conciliacao_falhou`); a **rotina diária** pega o pedido.
  - Variáveis: `RECONCILE_TASK_OFFSETS_SECONDS` (padrão `60,120,240,480`), `RECONCILE_TASK_MARGIN_SECONDS` (`120`), `RECONCILE_LATE_OFFSETS_SECONDS` (`900,1800,3600,10800,28800,86400`), `RECONCILE_LOCK_SECONDS` (`120`).
  - **Rotina diária** (04:00, `POST /api/internal/jobs/reconcile-payments`), única agenda fixa: fila de e-mails, pedidos de até 3 dias que ainda podem mudar (reconsulta antes de vencer, para não pular o pedido que perdeu as tarefas), ingressos que faltarem e limpeza das travas vencidas há mais de 2 dias. Uma execução por vez (trava `reconcile-daily`).
- `JOBS_CALLER_EMAIL` aceita mais de uma conta (Scheduler e Cloud Tasks). Novas variáveis: `TASKS_QUEUE`, `TASKS_INVOKER_EMAIL`.
- `google-auth-library` passou a ser dependência direta (já era importada).
- Já estavam atendidos: escala a zero, porta via `$PORT`, encerramento limpo no `SIGTERM`, `/api/health` sem banco, rate limit, logs sem corpo, migrações fora do boot, `.dockerignore`.
- **Imagem:** `node:24-slim`, multi-stage, só dependências de produção. Não troquei por alpine/distroless: o `@node-rs/argon2` é nativo e eu não medi ganho. Se quiser, é um teste à parte.

## 3. Antes de começar (você faz, no console ou na conta)

- [ ] Projeto Google Cloud de produção (id, ex.: `partyx-prod`) e a **conta de faturamento**. O `setup` pode criar o projeto (`CREATE_PROJECT=1`).
- [ ] Conta no **Neon**: criar o projeto de produção em **AWS São Paulo (`aws-sa-east-1`)**, mudar o plano para **Launch**, ver se o console oferece limite de gasto mensal (não verifiquei) e anotar as duas conexões: **pooled** (host com `-pooler`, para o app) e **direta** (para migrações), ambas com `sslmode=require`.
- [ ] Conta no **Cloudflare** (grátis): criar o widget **Turnstile** do domínio e anotar a chave **do site** (pública) e a **secreta**.
- [ ] Os **papéis do banco** (`partyx_app` e `partyx_backup`) são criados por `./infra/producao/deploy.sh roles` **antes da primeira migração**: a migração `0002` aborta sem eles. Você só precisa gravar a conexão **direta do dono** em `database-url-direct`.
- [ ] `npx firebase-tools login` (interativo) com a mesma conta.
- [ ] Domínio comprado em nome do cliente e acesso ao DNS (D-08).

## 4. Do zero

**Produção da PartyX (criada em 06/10/2026):** projeto Google Cloud **`partyx-producao`** (nº 391817439013; o ID `partyx-prod` já pertence a outra conta), conta de faturamento **`01B4CE-D0C9DA-391606`** (nome "PartyX", organização `zanondea-org`, BRL), projeto Neon **`polished-truth-93517378`** (`aws-sa-east-1`, Launch). O orçamento de R$ 30 é criado **nesta** conta, filtrado pelo projeto `partyx-producao`. Nunca use a conta da homologação (`0158D3-9C1431-A0ABCF`) nem `01DB8A-D7B08E-16D694` (cota de projetos esgotada). Comandos desta produção: `export PROJECT=partyx-producao BILLING_ACCOUNT=01B4CE-D0C9DA-391606`.

```bash
export PROJECT=partyx-prod BILLING_ACCOUNT=<id da conta de faturamento> BUDGET_BRL=30
CREATE_PROJECT=1 ./infra/producao/deploy.sh setup      # recursos, fila, segredos vazios, orçamento (cria custo)

# Segredos que dependem de terceiros (valores fora do Git; nunca em chat nem em chamado):
printf '%s' '<URL DIRETA do Neon, do DONO>' | gcloud secrets versions add database-url-direct --data-file=- --project=$PROJECT
printf '%s' '<URL SMTP>'                    | gcloud secrets versions add smtp-url            --data-file=- --project=$PROJECT
printf '%s' '<chave SECRETA do Turnstile>'  | gcloud secrets versions add turnstile-secret     --data-file=- --project=$PROJECT

# PAPÉIS DO BANCO: ANTES da primeira migração. A migração 0002 ABORTA com erro claro se o papel partyx_app não existir.
./infra/producao/deploy.sh roles       # cria partyx_app (aplicação) e partyx_backup (só leitura) por SQL e grava database-url e database-url-backup

export PUBLIC_BASE_URL=https://seudominio.com.br        # antes do domínio: https://$PROJECT.web.app
export TURNSTILE_SITE_KEY=<chave PÚBLICA do site no Turnstile>
export BACKUP_DONE=sim NO_FICTITIOUS_DATA=sim           # SÓ depois de cumprir de verdade (ver seção 9)
./infra/producao/deploy.sh deploy                       # build + migração + Cloud Run + teste rápido (vendas FECHADAS)
./infra/producao/deploy.sh varredura                    # rotina diária 04:00 (precisa do serviço no ar); remove a varredura de 5 min, se existir
./infra/producao/deploy.sh hosting                      # publica o firebase.json
NOTIFY_EMAIL=voce@partyx.test ./infra/producao/deploy.sh alertas
NOTIFY_EMAIL=voce@partyx.test ./infra/producao/deploy.sh backup   # backup diário 03:00 (seção 10). Rode o job UMA vez logo depois (o alerta "backup ausente" dispara até o 1º backup)
```

Primeiro administrador: `npm run admin:bootstrap` (ver `docs/autenticacao.md`).

**Ordem que importa:** `setup` → valores dos segredos → `roles` → `deploy` (migra) → `varredura`, `hosting`, `alertas`, `backup`. Em produção a configuração **recusa subir** sem `TURNSTILE_SECRET` e `TURNSTILE_SITE_KEY`.

## 5. Conciliação por pedido e rotina diária

- **Webhook** é o caminho principal. As tarefas e a rotina diária só protegem contra webhook perdido ou atrasado.
- **Cloud Tasks (por pedido, sem cron):** a partir da cobrança, +1, +2, +4 e +8 min e no fim da reserva + margem ("a cada poucos minutos" enquanto a reserva está ativa); depois +15 min, +30 min, +1 h, +3 h, +8 h e +24 h para a aprovação tardia. 1 fila (`partyx-conciliacao`), 3 tentativas de entrega, 5 despachos/s no máximo. Detalhes na seção 2.
- **Rotina diária (Cloud Scheduler, 04:00):** única agenda fixa. Envia e-mails que ficaram na fila, reconsulta pedidos de até 3 dias (cobre tarefas que falharam) e emite ingressos que faltarem. **Limitação:** e-mail que falha de manhã e esgota as 3 retentativas do Cloud Tasks só sai na madrugada seguinte; pedido cujas tarefas não puderam ser agendadas só é reconsultado na madrugada (se o webhook também se perder). `ops:weekly` e os alertas `email_falhou` e `fila_conciliacao_falhou` mostram.
- **Custo:** sem pedido em aberto, nada roda além da rotina diária e do backup: o Neon dorme. Estimativa na seção 8.

## 6. Novo deploy, migrações e rollback

- **Novo deploy:** `./infra/producao/deploy.sh deploy` (exige as travas `BACKUP_DONE` e `NO_FICTITIOUS_DATA`). O `index.html` é sempre revalidado, então a versão nova vale na hora.
- **Migrações:** rodam no deploy, num Cloud Run Job com a conexão **direta**, antes de a nova revisão receber tráfego, **nunca no boot**. Só se desfazem restaurando backup ou por SQL revisado (`drizzle/rollback/`; `npm run db:rollback` é bloqueado em produção de propósito).
- **Rollback do código:** `./infra/producao/deploy.sh rollback` (revisão anterior) ou `REVISAO=<nome> ./infra/producao/deploy.sh rollback`. São mantidas as 3 últimas imagens. Antes, leia a migração da revisão: não verifiquei se o código antigo roda com o esquema novo.
- `./infra/producao/deploy.sh status` mostra revisão, min/max, fila, varredura e avisa se `min-instances` ficou ligado.

## 7. Dias de evento

```bash
./infra/producao/deploy.sh evento-on     # min-instances=1, antes do evento (sem cold start)
./infra/producao/deploy.sh evento-off    # min-instances=0, depois
```
Instância parada cobra CPU e memória em tarifa reduzida: cerca de **US$ 0,014 por hora** nos preços do Tier 1 que consegui confirmar; São Paulo é Tier 2 (um pouco mais). Esquecer ligado o mês inteiro custaria cerca de US$ 10. O `status` avisa.

## 8. Estimativa de custo mensal

**Premissas:** 1.000 acessos/mês e 1 pico de 500 pessoas comprando ou validando em 1 hora (2 eventos por mês), cerca de 15 mil requisições na base e 20 mil na hora de pico, 200 ms de CPU por requisição. Valores em dólar; **câmbio a conferir**.

| Item | Franquia / preço (fonte oficial) | No seu volume |
|---|---|---|
| Cloud Run | 2 mi requisições, 180 mil vCPU-s e 360 mil GiB-s grátis por mês; desconto calculado no Tier 1 e agregado **por conta de faturamento** | cerca de 55 mil requisições e 11 mil vCPU-s: **US$ 0** |
| `evento-on` | idle US$ 0,0000025 por vCPU-s e por GiB-s (Tier 1) | 8 h/mês: cerca de **US$ 0,11** |
| Cloud Tasks | 1 milhão de operações grátis; depois US$ 0,40 por milhão | alguns milhares: **US$ 0** |
| Cloud Scheduler | 3 jobs grátis **por conta de faturamento** (compartilhado com seus outros projetos); depois US$ 0,10/job | 2 jobs (backup 03:00 e rotina diária 04:00): **US$ 0** se a conta não estiver cheia |
| Secret Manager | 6 versões ativas grátis; extras cerca de US$ 0,06/mês cada; 10 mil acessos grátis | 6 a 8 versões: **US$ 0 a 0,12** |
| Artifact Registry | 0,5 GiB grátis, depois cerca de US$ 0,10/GiB-mês | 3 imagens: **menos de US$ 0,1** |
| Cloud Build | 2.500 min grátis por conta, manual | **US$ 0** |
| Firebase Hosting | 10 GB de armazenamento e 360 MB/dia grátis; depois US$ 0,15/GB | assets em cache: **US$ 0** |
| Logs, Monitoring | não confirmei a franquia atual | provavelmente **US$ 0**, a verificar |
| **Subtotal Google** | | **cerca de US$ 0,1 a 0,3** |
| **Neon Launch** | US$ 0,106 por CU-hora; US$ 0,35 por GB-mês; sem mensalidade mínima; autosuspend configurável | **estimativa minha: US$ 2 a 4** (ver abaixo) |

**Neon, como cheguei no número:** 0,25 CU enquanto desperto. Pior caso para 1.000 visitas espalhadas (banco acordado 5 min a cada uma): cerca de 83 h, ou 21 CU-h = US$ 2,2; picos de 2 eventos × 3 h a 1 CU = 6 CU-h = US$ 0,64; varredura diária 0,6 CU-h = US$ 0,07; armazenamento menor que 0,5 GB = cerca de US$ 0,2. **Não confirmei** o piso de autoescala do Launch nem o arredondamento da cobrança. Se o autosuspend fosse desligado (24 h por dia), seriam cerca de **US$ 19** por mês.

**Custo da cadência por pedido (D-78, 10/10/2026), estimativa, não medido.** Premissa de volume desta seção: cerca de 1.000 pedidos por mês, concentrados em 2 picos de 1 hora; a conta também vale para 10 mil.

*Tarefas por pedido no Cloud Tasks* (cada tarefa custa cerca de 2 operações: criar e entregar):

| Caso | Tarefas | Operações |
|---|---|---|
| Pago com webhook em segundos (o normal) | 1 (a de 1 min já encontra o pedido resolvido e encerra) | 2 |
| Pago tarde, achado por uma tarefa | até a que achou | 2 a 22 |
| Pix abandonado, gateway informa o vencimento | 5 ou 6 (1, 2, 4, 8 min, limite e talvez a de 15 min) | 10 a 12 |
| Pior caso: gateway nunca dá estado conclusivo | 11 (até a de 24 h) e revisão manual | 22 |

Mesmo no pior caso para todos os pedidos: 1.000 pedidos = 22 mil operações; 10 mil = 220 mil. A franquia é de **1 milhão por mês** (depois, US$ 0,40 por milhão): só passaria dela com uns 45 mil pedidos por mês, todos no pior caso. **Custo: US$ 0.** Os reenvios de e-mail usam a mesma fila e somam pouco.

*Tempo de Neon acordado por pedido* (suspensão automática depois de 5 min sem atividade):

- As tarefas de 1 a 12 min caem enquanto o comprador ainda está no checkout, com o banco já acordado: **0 extra**. A de 15 min também cai dentro dos 5 min de folga depois da última atividade.
- Cada tardia isolada (30 min, 1 h, 3 h, 8 h, 24 h) acorda o banco por cerca de 5 min. Só roda se o pedido ainda não estiver resolvido: no caso normal (pago, ou vencido no gateway), **0 extra**; no pior caso, cerca de **25 min por pedido** (0,1 CU-h, cerca de US$ 0,011).
- Pedidos de um mesmo pico compartilham as janelas: as tardias de um pico de 1 h acordam o banco em uns 5 intervalos de cerca de 1 h, por volta de 6 h e 1,5 CU-h (cerca de **US$ 0,16 por pico** no pior caso).
- Limite superior, 1.000 pedidos espalhados e todos no pior caso: cerca de 100 CU-h, **US$ 10,6**. Realista (picos e gateway que informa o vencimento): **menos de US$ 0,50 por mês**.
- Sem pedido em aberto: só a rotina diária (cerca de 5 min por dia, US$ 0,07 por mês, já na conta acima) e o backup. **Custo ocioso perto de zero**, contra cerca de US$ 16 a 17 por mês da varredura a cada 5 min, que foi descartada.

**Total estimado: cerca de US$ 2 a 5 por mês**, como antes da mudança da cadência (cerca de R$ 11 a 28 com câmbio de referência próximo de R$ 5,50). **Atenção:** o orçamento de **R$ 30** do Google cobre **só a parte do Google (cerca de R$ 1)**. O Neon é cobrado à parte, pelo próprio Neon, e **não entra** nesse alerta. O orçamento só avisa (50%, 90%, 100%): o teto real de gasto é `MAX_INSTANCES=3`. Domínio (cerca de R$ 40 por ano no Registro.br) e e-mail transacional ficam de fora. O preço do Neon é o registrado nesta seção (não reconferido em 10/10/2026).

## 8b. Proteção contra abuso no cadastro e na recuperação de senha

**Decisão de 06/10/2026: o Turnstile fica DESLIGADO em produção** (`TURNSTILE_ENABLED=false`, o padrão). O código continua todo no lugar; ligar depois é só mudar variáveis. A proteção que não depende de IP passa a ser a dos **limites globais** abaixo.

### Limites globais (no banco, valem entre todas as instâncias, não dependem de IP)
| Limite | Padrão | Como conta |
|---|---|---|
| **Cadastros** novos, no total | **1000 por hora** (`GLOBAL_SIGNUPS_PER_HOUR`) | Confere **antes** e só conta **depois** de criar a conta. Tentativa inválida (CPF repetido, senha fraca, sem aceite) **não** gasta o limite |
| **Pedidos de recuperação** de senha, no total | **60 por hora** (`GLOBAL_RECOVERIES_PER_HOUR`) | Conta cada pedido aceito, de forma atômica (uma trava por tipo no banco), com o mesmo 202 exista a conta ou não |
| **Por conta**, na recuperação (já existia) | 3 por hora | Dentro do global; vale com IP forjado |
| Por IP (camada rápida) | cadastro 100/h (`SIGNUPS_PER_IP_PER_HOUR`), recuperação 20/h por instância | Compartilhar NAT ainda pode concentrar usuários; acompanhar os 429 em uma abertura |
| Portaria, todas as instâncias | 3000 leituras/min e 400 buscas/min (`GATE_SCANS_PER_MINUTE`, `GATE_SEARCHES_PER_MINUTE`) | Contador atômico no banco por minuto fixo; memória por validador filtra primeiro |

Janela deslizante de 60 minutos feita de baldes de 10 minutos (tabela `global_limit_counters`, migração `0004`; na prática 50 a 60 minutos). Atingido o limite: **429 `limite_global`** e **um alerta `limite_global_atingido` por balde**, por tipo (não um por requisição), no canal de e-mail existente (`alerts.sh` cria a política). Provado: 60 pedidos simultâneos com limite 10 passam exatamente 10; IPs todos diferentes não furam; lixo não bloqueia cadastro legítimo.

> **Dimensionamento provisório:** 1000 cadastros/h deixa espaço para uma abertura de vendas com centenas de compradores; 100/h por IP tolera redes compartilhadas melhor que 10/h. São tetos de proteção, não capacidade comprovada do banco ou do gateway. Medir a taxa de cadastro e os 429 na homologação antes do evento e ajustar as duas variáveis conforme a carga esperada.
> **Custo de usar contador "aceito":** lixo enviado ao pedido de recuperação (e-mails inexistentes) também gasta os 60 por hora e bloqueia a recuperação de quem precisa até a janela deslizar.

### Como LIGAR o Turnstile no futuro
1. Na Cloudflare: Turnstile → *Add site* → nome `PartyX`, o domínio de produção (e `partyx-producao.web.app`), modo *Managed*. Anote a chave **do site** (pública) e a **secreta**.
2. No seu terminal (não cole a secreta em chat): `printf '%s' '<secreta>' | gcloud secrets versions add turnstile-secret --data-file=- --project=partyx-producao`
3. `TURNSTILE_ENABLED=true TURNSTILE_SITE_KEY=<chave do site> BACKUP_DONE=sim NO_FICTITIOUS_DATA=sim PUBLIC_BASE_URL=... ./infra/producao/deploy.sh deploy`. O script **recusa** se faltar uma das duas chaves; o servidor também recusa subir ligado sem elas.
4. Para **desligar** de novo: faça o deploy sem `TURNSTILE_ENABLED` (ou `false`). As chaves, se ainda estiverem no ambiente, são ignoradas.

Efeito de cada estado: **desligado** = o servidor sobe sem a chave secreta, `/api/public/site` devolve `turnstileSiteKey: null`, a tela **não carrega o script** da Cloudflare e o CSP **não libera** a Cloudflare. **Ligado** = cadastro e recuperação exigem o token (`captchaToken`), conferido no servidor na API da Cloudflare **antes** dos limites; sem token 422 sem chamar a Cloudflare; Cloudflare fora do ar = 503 (falha fechada) e alerta `verificacao_humana_indisponivel`. A chave de **teste** da Cloudflare (aceita qualquer token) só serve na homologação, que **mantém o Turnstile ligado**.

**Login** não pede desafio; o bloqueio é por conta (5 falhas em 15 minutos).

## 8c. E-mail: reenvio por Cloud Tasks

Falha de e-mail **nunca** desfaz pagamento ou cadastro. A tentativa 1 acontece logo depois do fato; cada falha agenda a próxima no Cloud Tasks, reaproveitando a fila da conciliação: **+2, +10 e +30 minutos** (4 tentativas no total). Esgotadas, o item vira `falhou` (**revisão manual**), entra na trilha (`email.revisao_manual`) e dispara o alerta `email_falhou`; o administrador reabre em `POST /api/admin/emails/:id/retry`. A **varredura diária** fica só como rede de segurança (pega o que venceu sem tarefa). Se a fila falhar ao agendar: alerta `fila_email_falhou`, e a varredura cobre.

SMTP, segredo `smtp-url`, `EMAIL_FROM`, registros SPF/DKIM/DMARC e o roteiro do teste de entrega real: `docs/operacao/email.md` (provedor e domínio ainda não definidos pela PartyX em 11/10/2026).

## 8c-2. Textos legais, dados da PartyX, cadastro e manutenção (etapa 08, 11/10/2026)

- **Textos legais:** os arquivos `termos-de-uso.txt`, `privacidade.txt`, `cancelamento.txt` (e `meia-entrada.txt`, se houver) ficam na pasta **`conteudo-legal/`** na raiz, **versionados no Git** desde 14/10/2026 (textos públicos, decisão do responsável). O `deploy.sh build` leva a pasta **da tag** (`git archive`) e recusa se a pasta de trabalho tiver um arquivo diferente do da tag; o `Dockerfile` a copia para `/app/legal`; o deploy define `LEGAL_CONTENT_DIR=/app/legal`. Publicar uma versão = trocar o arquivo **e** passar `TERMS_VERSION`/`TERMS_DATE` (idem `PRIVACY_*`, `CANCELLATION_*`) no mesmo deploy. O deploy imprime o sha256 de cada arquivo. Rollback volta texto e versão juntos.
- **Cadastro:** `SIGNUP_OPEN=false` por padrão em produção. Com `SIGNUP_OPEN=true` o `deploy` recusa sem as seis variáveis de versão e data e sem os três arquivos; o servidor também recusa (503 `cadastro_indisponivel`) se faltar qualquer um.
- **Dados públicos da PartyX:** `PARTYX_LEGAL_NAME`, `PARTYX_CNPJ`, `PARTYX_ADDRESS`, `PARTYX_SUPPORT_EMAIL`, `PARTYX_SUPPORT_WHATSAPP`, `PARTYX_SUPPORT_HOURS`, passados no ambiente de quem roda o deploy. Nunca dados da contratada.
- **Manutenção (G06):** `./infra/producao/deploy.sh manutencao on|off`. Detalhes em `docs/operacao/runbooks/indisponibilidade.md`.

## 8d. Migrações retrocompatíveis (expand/contract) e rollback

O deploy aplica a migração **antes** de a nova revisão receber tráfego. `deploy.sh rollback` volta o **código**, mas o banco **continua no esquema novo**. Por isso toda migração precisa deixar o código da revisão **anterior** funcionando:

1. **Expandir primeiro** (permitido): criar tabela, coluna nula ou com valor padrão, índice, tipo, função; afrouxar uma regra.
2. **Contrair só num deploy posterior**, quando nenhuma revisão que ainda possa receber rollback usa o que sai: apagar ou renomear coluna e tabela, mudar tipo, exigir `NOT NULL`, apagar restrição ou índice.
3. **Restringir gravações** (nova restrição, gatilho que recusa, `REVOKE`) pode derrubar o código anterior: exige análise.
4. Migração de dados (`UPDATE`, `DELETE`, `TRUNCATE`) também.

**Como é imposto:** `npm run check:migrations` (na CI) acusa o que merece análise e **reprova** a migração sem uma linha `-- expand-contract: <por que é seguro para o código anterior>`. O verificador não decide: acusa; quem escreve analisa e o revisor lê. Os achados em blocos `DO $$ ... $$` também contam.

**Verificação das 4 migrações atuais (06/10/2026):**

| Migração | O que faz | Segue a regra? |
|---|---|---|
| `0000_schema_inicial` | Cria o esquema do zero | **Sim.** Não há código anterior que ela possa quebrar |
| `0001_regras_de_integridade` | Funções e gatilhos que **recusam** exclusão e alteração de `paid_at` e da auditoria | **Sim, com ressalva.** É uma restrição de gravação, mas foi aplicada antes de qualquer release e o código nunca exclui nem reescreve esses dados (exclusão lógica). Daqui para frente, restrição nova exige análise |
| `0002_permissoes_da_aplicacao` | Concede privilégios à aplicação e revoga `UPDATE` na auditoria | **Sim.** Não altera tabelas nem dados. **Mudou nesta etapa:** agora aborta se o papel `partyx_app` não existir |
| `0003_anonimizacao_lgpd` | Coluna nova **nula** e remove/recria a regra do CPF **mais permissiva**, na mesma transação | **Sim.** O código anterior não conhece a coluna e a regra ficou mais frouxa. Reversão em `drizzle/rollback/` (recusa se já houver usuário anonimizado) |

**Nenhuma das quatro viola a regra.** Mas a `0001` e a `0003` só passam por serem anteriores ao primeiro release: **não serviriam como modelo** para uma migração nova.

**Procedimento de rollback:** (1) só volte o código; (2) se a migração da revisão for aditiva, o código antigo funciona e **pare aí**; (3) só reverta o banco com backup do momento, SQL revisado e a reversão de `drizzle/rollback/` (`npm run db:rollback` é bloqueado em produção de propósito). **Mudança de esquema que contrai** vai sempre em **dois deploys**: primeiro o código que deixa de usar, depois a migração que remove.

**Papel `partyx_app` e a migração 0002:** sem o papel, a migração **aborta** com `O papel "partyx_app" não existe neste banco. Crie-o antes de migrar` e **nada é aplicado** (a migração roda numa transação: testado, nenhuma tabela fica pela metade). Antes ela ignorava o bloco em silêncio e o banco ficava sem as permissões mínimas da aplicação. Só o ambiente **local** e os testes dispensam o papel, de forma explícita (`PARTYX_ALLOW_MISSING_APP_ROLE=1`). O papel é criado por **SQL** com a conexão direta do dono (`deploy.sh roles`), nunca pela API do Neon (que o coloca em `neon_superuser`, com poder de apagar histórico: já aconteceu na homologação).

## 8e. Proteções contra ambiente trocado (produção x homologação)

Nada de produção reaproveita banco, segredo ou credencial da homologação, e o contrário também. Camadas, todas testadas:

1. **O banco declara a que ambiente pertence.** A marca é o **comentário do banco** (`partyx-env:producao`). Escolhi o comentário porque no **Neon** o dono do banco **não consegue** definir parâmetros personalizados (`ALTER DATABASE ... SET` dá `permission denied to set parameter`), enquanto o comentário o dono grava, qualquer papel lê, existe antes de qualquer migração e **o papel da aplicação não consegue alterar** (verificado no Neon real). `npm run db:env -- show|mark|check <ambiente>`; `mark` recusa remarcar um banco de outro ambiente.
2. **O servidor recusa subir** (antes de atender qualquer requisição) se o banco não for do ambiente dele ou não tiver marca: log `banco_de_outro_ambiente`, saída 1, sem imprimir a URL. Provado subindo o processo de verdade.
3. **A migração recusa** banco de outro ambiente ou sem marca, antes de criar qualquer tabela.
4. **`deploy.sh` (produção)** recusa, antes do build: banco que não seja de produção, URLs pooled e direta de bancos diferentes, credenciais de **sandbox** do gateway, gateway configurado sem `GATEWAY_ENVIRONMENT=producao`, gateway fictício, projeto com `hml` no nome. **`deploy.sh` (homologação)** recusa o inverso: banco de produção, credenciais de produção do gateway, projeto com `prod` no nome.
5. **A configuração** recusa `GATEWAY_ENVIRONMENT=sandbox` em produção, `producao` em homologação e `producao` no ambiente local; com `PAYMENT_GATEWAY=mercadopago` exige as três credenciais e o `MP_COLLECTOR_ID`, e recusa token `TEST-` com `producao`. Na partida, o servidor confere a conta das credenciais (`GET /users/me`) contra `MP_COLLECTOR_ID` (alerta `gateway_conta`), e toda order reconsultada precisa ter esse recebedor.

A marca é posta pelo `deploy.sh roles` (produção) e já foi posta no banco de homologação.

## 8f. Mercado Pago (D-01): painel, segredos e troca para produção

Detalhes técnicos e provas em `docs/pagamento-mercadopago.md`. A integração usa a **API de Orders** com o Card Payment Brick.

**No painel do Mercado Pago** (Suas integrações > aplicação da PartyX > **Webhooks > Configurar notificações**):

- **Modo produtivo:** URL `https://<domínio>/api/webhooks/payments` (hoje `https://partyx-producao.web.app/api/webhooks/payments`;
  trocar quando o domínio próprio existir, D-08). Evento **Order (Mercado Pago)**: ele traz também a contestação (`order.charged_back`).
- **Modo de teste:** só durante testes (um túnel temporário ou a homologação). Não deixe o endereço de um túnel no modo produtivo.
- **Assinatura secreta:** salvar a configuração pode gerar uma nova. Depois de qualquer "Redefinir" ou salvamento que a troque, grave
  de novo: `bash scripts/setup-mp-credentials-producao.sh --so-webhook` (e `bash scripts/setup-mp-credentials.sh --so-webhook` no
  local). Use **Simular notificação**: com a assinatura certa, o servidor responde **200** (o id fictício `123456` é ignorado).

**Segredos de produção** (Secret Manager do `partyx-producao`, lidos só por `partyx-app`): `mp-access-token`, `mp-public-key` e
`mp-webhook-secret`, gravados por `bash scripts/setup-mp-credentials-producao.sh` (digitação oculta, confere a conta pela API, nunca
grava em arquivo). Gravados em 11/10/2026; a assinatura foi regravada no mesmo dia e conferida com a notificação simulada do painel.

**Ligar em produção** (só com autorização expressa; continua com as vendas fechadas até o go-live):

```bash
PAYMENT_GATEWAY=mercadopago GATEWAY_ENVIRONMENT=producao MP_COLLECTOR_ID=<id da conta da PartyX> \
  PUBLIC_BASE_URL=https://partyx-producao.web.app BACKUP_DONE=sim NO_FICTITIOUS_DATA=sim ./infra/producao/deploy.sh deploy
```

O `deploy` recusa sem `MP_COLLECTOR_ID` ou sem versão ativa nos três segredos, monta os segredos como `MP_ACCESS_TOKEN`,
`MP_PUBLIC_KEY` e `MP_WEBHOOK_SECRET`, e a migração `0008` (motivo da recusa e tentativa de cobrança) entra pelo job antes do deploy.
A reserva passa a 30 minutos pelo padrão do código (D-03); não precisa de variável. Depois: compra real de baixo valor (13.1),
conferir no log `gateway de pagamento: conta conferida` e a chegada do webhook. Estorno é feito pela PartyX no painel do Mercado Pago.

**Voltar para teste** (homologação): as credenciais de teste do painel (Testes > Credenciais de teste) com
`GATEWAY_ENVIRONMENT=sandbox`; produção nunca aceita `sandbox`.

**Homologação com o Mercado Pago de TESTE** (13/10/2026): `bash scripts/setup-mp-credentials-homologacao.sh` copia as credenciais
de teste do `.env.local` para o Secret Manager do `partyx-hml` (confere `test_user` na API, nada é impresso). Com os três segredos, o
`infra/homologacao/deploy.sh` liga sozinho `PAYMENT_GATEWAY=mercadopago` e `GATEWAY_ENVIRONMENT=sandbox`, obtém o `MP_COLLECTOR_ID` da
própria conta de teste e escala de 0 a 3 instâncias. O fictício continua disponível com `HML_GATEWAY=ficticio` (1 instância). No
painel, o **modo de teste** do webhook aponta para `https://partyx-hml.web.app/api/webhooks/payments`, evento Order (conferência do
responsável). A homologação também liga `PUBLIC_HOST_CHECK=true` (a barreira de Host da produção) e o teste rápido do deploy confere
403 no `run.app` sem `X-Forwarded-Host` e 200 com ele.

## 9. Checklist final (manual)

- [ ] Projeto, faturamento e Neon (seção 3). **Papéis do banco antes da 1ª migração** (`deploy.sh roles`).
- [ ] **Turnstile: desligado em produção por decisão** (seção 8b). Para ligar: widget, `turnstile-secret` e `TURNSTILE_ENABLED=true`. **Antes de um evento, suba `GLOBAL_SIGNUPS_PER_HOUR`.**
- [ ] Domínio: no console do Firebase (Hosting) adicione o domínio, crie os registros DNS que ele pedir (TXT de verificação e A/AAAA) e espere o certificado. Ajuste `PUBLIC_BASE_URL` para o domínio e faça novo `deploy` (a checagem de origem, contra CSRF, depende dele). Domínio no Turnstile também.
- [ ] E-mail: provedor SMTP, remetente e **SPF, DKIM, DMARC** do domínio (`DOMAIN=<domínio> DKIM_SELECTOR=<seletor> ./infra/email-dns-check.sh`).
- [ ] **Mercado Pago** (D-01, seção 8f): segredos `mp-*` gravados (feito em 11/10/2026), URL do webhook de produção e evento **Order (Mercado Pago)** no painel, deploy com `PAYMENT_GATEWAY=mercadopago GATEWAY_ENVIRONMENT=producao MP_COLLECTOR_ID=<id>` e a compra real de baixo valor (13.1). D-04 segue com o cliente.
- [ ] Textos legais e versões (D-11), identidade visual aprovada (D-10), regras de meia-entrada.
- [ ] **Backup diário ativo e uma restauração de teste feita: PRÉ-REQUISITO DO GO-LIVE.** Os scripts estão prontos e foram verificados na **homologação** (seção 10 e `docs/backup.md`); **em produção** falta rodar `deploy.sh backup`, executar o job uma vez e fazer o ensaio de restauração com o banco real. O `deploy` recusa sem `BACKUP_DONE=sim`.
- [ ] **Cópia semanal do backup em outro projeto** (recomendado): hoje as cópias ficam no mesmo projeto do banco.
- [ ] Alertas ativos (`alertas`, `backup`) e **confirmação de que os e-mails chegam à caixa certa** (o Monitoring mostra o alerta aberto; só você vê a caixa de entrada). **13 sinais desde 12/10/2026:** produção tem as 12 políticas de 06/10 e ainda **não** tem `estorno_parcial` e `cobranca_duplicada`. Eles entram **junto com o deploy de produção, depois do aceite**, rodando `deploy.sh alertas` (idempotente: cria só os 2 que faltam). Não rodar antes. Antes, provar os 13 em homologação com disparo de propósito (`docs/infraestrutura.md`, checklist da etapa 10).
- [ ] Equipe real criada, senhas temporárias trocadas no primeiro acesso.
- [ ] Compra real de baixo valor e estorno pelo cliente (só no go-live).
- [ ] **Aceite do cliente ou autorização expressa de produção:** pela Cláusula 5.4 isso conta como aceite e inicia os 12 meses e os 30 dias de garantia. Para abrir a venda: `SALES_OPEN=true` com gateway, versões dos textos, `VISUAL_APPROVED=true` e `GO_LIVE_CONFIRMED=sim-aceite-e-autorizacao-registrados`.

## 10. Backup diário e restauração (referência)

Resumo (detalhes, medidas e limites em **`docs/backup.md`**): `pg_dump` às **03:00 de São Paulo** por um Cloud Run Job, para um bucket **privado**, com **35 dias** de retenção, conferência de tamanho e MD5 no envio, manifesto e SHA-256. Papel de leitura `partyx_backup`, conta de serviço própria sem permissão de apagar. Alertas `backup_falhou` e `backup ausente` (janela de 25 h). Restauração só em banco **isolado e vazio** (`infra/backup/restore.sh`), com 20 verificações. **Perda possível: até 24 h.** Conferência diária: `infra/operacao/check-backup.sh`; ensaio de restauração trimestral.

## 11. Resultados medidos na homologação (06/10/2026, atrás do Firebase Hosting)

**Ambiente:** `https://partyx-hml.web.app` → Cloud Run `partyx-hml` (São Paulo, revisões 00004 a 00006) → Neon `aws-sa-east-1`. Cloud Tasks, SMTP de teste (Ethereal, um sumidouro que aceita sem entregar a ninguém) e a chave de **teste** do Turnstile (a verificação é feita de verdade na API da Cloudflare). Medido de **uma máquina e uma rede**, abrindo conexão nova a cada requisição.

> **O pagamento foi feito com o gateway FICTÍCIO** (`HOMOLOGACAO_GATEWAY_FICTICIO=true`, só administrador, nunca em produção). **Não é o sandbox do gateway real** (D-01 segue aberto): a assinatura, os eventos e os estados do gateway de verdade continuam por provar. O webhook, porém, foi entregue pelo **caminho público de verdade** (Hosting → Cloud Run), com corpo e assinatura.

| Etapa | Tempo |
|---|---|
| Página inicial (HTML pelo Hosting) | 0,3 s |
| Cadastro com Turnstile (inclui a verificação na Cloudflare) | 0,6 a 0,9 s |
| Cadastro **sem token**, token de 2.100 caracteres, recuperação sem token | recusados (422) em 0,4 a 0,6 s |
| Pedido (reserva e agendamento da tarefa de +10 min) | 0,5 a 0,8 s |
| Pix | 0,4 s |
| **Webhook público** confirmando o pedido e emitindo os ingressos | 0,4 a 0,6 s (pedido pago ao consultar: 1,0 s) |
| Meus ingressos / detalhe com QR / PDF do pedido | 0,3 s / 0,3 s / 0,5 s |
| Portaria: leitura do QR (verde, amarelo na repetição, vermelho no adulterado) | 0,3 a 0,4 s |
| **Webhook perdido, recuperado pelo Cloud Tasks** | pedido criado 00:43:44, aprovado no gateway 00:43:45, **confirmado 00:53:44** (10:00 depois do pedido), 2 ingressos emitidos |
| Pedido que fica pendente: verificações +10, +25, +55 min | **revisão manual exatamente 55 min depois do pedido**, com trilha e alerta |
| E-mail sem SMTP: tentativas | 0, **+2:00, +10:00, +30:00**, depois **revisão manual 42 min depois da 1ª tentativa** (5 e-mails, trilha e alerta reais) |
| E-mail do ingresso com SMTP (aprovação até "enviado") | 4,8 s (SMTP de teste lento) |
| Reabrir e-mail em revisão com o provedor de volta | entrega na hora (a rota espera até 3 s) |
| Backup (job do Cloud Run, via Scheduler) | 2 s, 66 KB, 156 entradas |
| Restauração em banco isolado (download, SHA-256, restauração, 20 verificações) | 5 s |
| Alerta: do log ao alerta aberto no Cloud Monitoring | 3 a 4,5 min |

**Alertas disparados de verdade (12 de 12 abriram):** com evento **real** da aplicação ou do job: `estorno_fora_de_fluxo`, `email_falhou`, `conciliacao_revisao_manual`, `backup_falhou`, `backup ausente`. Com entrada de log **sintética** (mesmo recurso e mesmo campo `alert`, que prova o caminho filtro → métrica → política → alerta, não que a aplicação emita o sinal): `pago_sem_estoque`, `webhook_falhou`, `reconciliacao_falhou`, `pagamento_divergente`, `fila_conciliacao_falhou`, `fila_email_falhou`, `verificacao_humana_indisponivel`. **A chegada do e-mail à caixa de entrada eu não consigo ver**: o Monitoring mostra o alerta aberto e o canal de e-mail ativo, mas só você confirma a caixa.

**Navegador real (Chromium, 390 px, atrás do Hosting):** widget do Turnstile carregou em 3,1 s (token em 1,5 s), o botão ficou desabilitado até o token, cadastro concluiu em 1,3 s, recuperação de senha respondeu, **nenhuma violação de CSP**.

### Observações e riscos que a medição mostrou

1. **A 1ª verificação do Cloud Tasks cai exatamente no fim da reserva** (+10 min, com reserva de 10 min). Um Pix perdido de webhook é por isso quase sempre confirmado pelo caminho "tardio", que **confere o estoque de novo**: se o último ingresso foi vendido nesse intervalo, o pedido vira "pago sem estoque" (o cliente estorna). Sugestão: primeira verificação **1 minuto antes** de a reserva vencer (+9 min), o que costuma cair ainda dentro da reserva. Mantive os +10 min que você pediu.
2. **E-mail lento atrasa cadastro e webhook.** Hoje a requisição espera **até 3 s** pelo envio. Com o SMTP de teste isso levou o cadastro de 0,7 s para 3,5 s e o webhook de 0,4 s para 3,5 s. Com um provedor rápido some, mas um gateway com limite curto de resposta ao webhook corre risco. Sugestão: enviar por uma tarefa imediata do Cloud Tasks (sem esperar na requisição). Não implementei.
3. **Pedido pendente cujo gateway já diz "estornado"** gera uma trilha `estorno_fora_de_fluxo` por verificação e a conciliação **para** (não vai a "revisão manual"): quem opera é avisado pelo alerta. Intencional, mas vale saber.
4. **O estado do gateway fictício fica na memória:** só funciona com uma instância (`min=max=1`). Foi usado assim e revertido.
5. **Falhas de rede locais** (timeout de conexão e `ERR_NETWORK_CHANGED`) derrubaram dois dos meus scripts de teste; nada a ver com o servidor.

## 12. Estado da produção da PartyX (06/10/2026)

**Criado e verificado** (projeto `partyx-producao`, conta de faturamento `01B4CE-D0C9DA-391606`, Neon `polished-truth-93517378`; nada reaproveitado da homologação):

| Item | Situação |
|---|---|
| Projeto, faturamento ativo, orçamento | Projeto vinculado só à conta `01B4CE-...`. Orçamento **R$ 30/mês** nessa conta, filtrado pelo projeto, alertas em **50%, 90% e 100%** |
| Contas de serviço | `partyx-app`, `partyx-deploy`, `partyx-scheduler`, `partyx-tasks`, `partyx-backup`, cada uma com o mínimo |
| Artifact Registry | `partyx`, mantém as 3 imagens mais recentes |
| Cloud Tasks | fila `partyx-conciliacao` (3 tentativas, 5 despachos/s) |
| Buckets | `partyx-producao-backups` (**privado**, versionado, 35 dias) e `partyx-producao-banners`. O Cloud Build criou `partyx-producao_cloudbuild` (região **US**, só código-fonte enviado para build; apaga em 7 dias) |
| Segredos **novos** | `session-secret`, `qr-hmac-keys` (v1, chave nova), `database-url` (pooled, `partyx_app`, `sslmode=require`), `database-url-direct` (dono, direta), `database-url-backup` (`partyx_backup`, só leitura). **Faltam** `turnstile-secret` e `smtp-url` |
| Neon | PostgreSQL 18, `aws-sa-east-1`, Launch, 0,25 a 2 CU, restauração de **7 dias**. Banco marcado `producao`. Papéis criados **antes** da migração |
| Migração | Cloud Run Job `partyx-migrate`: 4 migrações. **Banco com 16 tabelas e 0 linhas** (nenhum dado fictício ou de qualquer tipo); `partyx_app` sem `DELETE` em pedidos nem `UPDATE` na auditoria; 3 gatilhos de integridade |
| Backup | Job `partyx-backup` e agendamento diário **03:00**; primeiro backup real (60 KB, 156 entradas, 3 s) e **restauração de teste** em PostgreSQL 18 isolado: **20 verificações OK**, 3 s. Agendamento disparado à mão: ok. **A restauração foi num banco vazio**: prova o esquema e o caminho, não o volume |
| Alertas de log | 12 políticas e 1 canal de e-mail (`zanondea@gmail.com`) |
| Firebase | ligado; site `partyx-producao.web.app` (vazio até o deploy) |

**Defeitos encontrados e corrigidos nesta etapa:** (1) o `pg_dump` falhava com `sslmode=require` + raízes do sistema (a homologação usava `verify-full`, por isso não apareceu): o job agora sobe `require` para `verify-full`; (2) o `setup` do backup caía por condição de corrida do IAM com conta recém-criada: agora repete; (3) o ID `partyx-prod` já era de outra conta.

**Falta, e por quê:**

1. **Turnstile: desligado por decisão de 06/10/2026** (seção 8b). Não bloqueia o deploy.
2. **SMTP (você)**: provedor, remetente e SPF/DKIM/DMARC; grave em `smtp-url` e informe `EMAIL_FROM`. Sem isso o servidor sobe, mas nenhum e-mail sai (cadastro e recuperação de senha dependem dele).
3. **Textos legais (D-11)**: em produção o **cadastro real fica bloqueado** sem eles (`cadastro_indisponivel`, por desenho). O smoke test de cadastro só vale com os textos; sem eles verifico que o bloqueio funciona.
4. **Primeiro administrador**: nome e e-mail reais, para o login do smoke test (`npm run admin:bootstrap`). Não crio usuário de teste em produção (a aplicação não apaga usuário).
5. **Gateway (D-01)** e **domínio (D-08)**.
6. Depois disso: `deploy` (migra de novo, sem efeito, e sobe com vendas **fechadas**), `varredura` (04:00), `hosting`, smoke test.


## 13. Primeiro deploy de produção, com as vendas FECHADAS (06/10/2026)

**Publicado:** revisão `partyx-00001-6v8` do Cloud Run `partyx` (São Paulo, 0 a 3 instâncias), atrás do Firebase Hosting em **https://partyx-producao.web.app**. `SALES_OPEN=false`, sem gateway, sem SMTP, **Turnstile desligado**, limites globais de 30 cadastros e 60 recuperações por hora. Migração `0004` (tabela `global_limit_counters`) aplicada pelo job; banco com **17 tabelas e 0 linhas**. Varredura diária às 04:00 e backup diário às 03:00 agendados e ativos.

**Smoke test (sem compra e sem criar usuário), tudo pelo endereço público:**

| Verificação | Resultado |
|---|---|
| Home, `/api/health`, `/api/health/ready` | 200; `database: ok` |
| `/api/*` | `Cache-Control: private, no-store` |
| `/assets/index-*.js` | `public, max-age=31536000, immutable` |
| `index.html` e rotas do app | `no-cache` |
| Cookie `__session` atrás do Hosting | `Set-Cookie: __session=; Path=/; Max-Age=0; Secure` chega ao navegador. **Só a resposta foi provada em produção** (não há sessão para testar a ida); a ida (só o `__session` atravessa o Hosting) foi provada na homologação |
| Eventos à venda | `events: []`, home vazia |
| Caminhos de compra | criar pedido e cotação: **401** (exigem conta); webhook: **503** `pagamento_indisponivel` (sem gateway); rota do Cloud Tasks: **401**; simulador fictício: **404** |
| Cadastro | corpo válido com aceite: **503** `cadastro_indisponivel` (textos legais pendentes); **nada foi gravado** (banco com 0 linhas depois) |
| CSP | sem a Cloudflare (Turnstile desligado) |

**Rollback:** `PROJECT=partyx-producao ./infra/producao/deploy.sh rollback` volta para a revisão anterior. **Com uma só revisão publicada não há para onde voltar**: vale a partir do segundo deploy. As migrações **não** se desfazem por ele (seção 8d).

**Tempos medidos (pelo Hosting, de uma máquina e uma rede, conexão nova a cada requisição):**

| Requisição | Tempo |
|---|---|
| **Primeiro acesso com o serviço frio** (Cloud Run em zero instâncias, confirmado pela métrica, e Neon parado) | **5,5 s** |
| Logo depois, rota que consulta o banco (`/api/health/ready`) | 0,51 s |
| Seguintes, com tudo quente (`/api/health`, 5 medidas) | 0,40 a 0,51 s |
| Seguintes, `/api/health/ready`, home e `/api/public/site` | 0,40 a 0,61 s (uma de 1,3 s, com 1 s só de conexão e TLS) |
| Direto no Cloud Run, sem o Hosting (3 medidas) | 0,24 a 0,25 s (a primeira, 0,50 s) |

Os 5,5 s do primeiro acesso incluem o **boot do servidor**, que confere a marca de ambiente no banco e por isso também acorda o Neon. O Hosting soma cerca de 0,15 a 0,25 s por requisição. Para evitar o acesso frio em dia de evento: `./infra/producao/deploy.sh evento-on` (instância sempre quente).

## 14. Segunda publicação de produção, ainda com as vendas FECHADAS (13 e 14/10/2026)

**Publicado:** revisão `partyx-00003-xeq` (tag `release-2026-10-13`, commit `e9e31e9`), 100% do tráfego desde 14/10 00:49 UTC, com o Mercado Pago de produção e `SALES_OPEN=false` e `SIGNUP_OPEN=false`. Migrações 0005 a 0008 aplicadas, com backup restaurado antes e depois. Registro completo: `docs/registros/publicacao-producao-2026-10-13.md`.

**Rollback:** `PROJECT=partyx-producao REVISAO=partyx-00002-bkn ./infra/producao/deploy.sh rollback`.

**Roteiro usado (variáveis só de `infra/producao/env.prod.yaml`):** `conferir`, `build`, `candidata` (sem tráfego, com teste rápido), `virar`, `varredura`, `alertas` e `infra/operacao/uptime.sh`.

**Lições desta publicação:**

- Depois de toda virada que mude `PUBLIC_BASE_URL` ou ligue a barreira de Host, rodar `varredura` e executar o job uma vez: sem o `X-Forwarded-Host` a rotina diária recebe 403. Na atualização de um job o gcloud exige `--update-headers` (corrigido no commit `4960044`).
- A verificação de saúde aponta para o endereço público; ao trocar para `partyx.com.br`, recriar com o endereço novo.
- No modo avançado do Registro.br os servidores são `a.sec.dns.br` e `b.sec.dns.br`; os `a.auto` e `b.auto` seguem respondendo a zona antiga.

**Abertura de vendas:** só pelo `docs/registros/checklist-abertura-de-vendas.md`.

## 15. Terceira publicação: cadastro aberto, vendas FECHADAS (14/10/2026)

**Publicado:** revisão `partyx-00008-gaz` (tag `release-2026-10-14b`, commit `4009917`), 100% desde 14/10 17:56 UTC, com `SIGNUP_OPEN=true`, `SALES_OPEN=false`, Termos e Privacidade 1.0 e `PUBLIC_BASE_URL=https://partyx.com.br` (Vercel como ponte, apontando para o endereço principal do serviço). Registro: `docs/registros/publicacao-producao-2026-10-14.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00008-gaz`.** Na próxima publicação, se a nova revisão der problema: `PROJECT=partyx-producao REVISAO=partyx-00008-gaz ./infra/producao/deploy.sh rollback`. A `partyx-00003-xeq` **só serve para emergência e derruba o domínio** (espera o `partyx-producao.web.app` e responde 403 em `partyx.com.br`); ver `docs/operacao/vercel.md`, "Volta de emergência".

**Tráfego preso à revisão:** depois de `virar`, um `gcloud run services update` cria revisão nova com 0%. Troca rápida de variável = `services update` + `services update-traffic --to-latest` (é o que `deploy.sh manutencao on|off` faz desde 14/10).

A publicação das regras de menores, prevista aqui, saiu no mesmo dia: ver a seção 16.

## 16. Quarta publicação: regras de menores, textos 1.1 e contatos novos (14/10/2026)

**Publicado:** revisão `partyx-00010-ced` (tag `release-2026-10-14d`, commit `247534b`), 100% desde 14/10 19:05 UTC, depois do backup sob demanda (`partyx-backup-gmhk6`, conferido) e da migração `0009_menores_de_idade` (`partyx-migrate-67cxn`). Continua com cadastro aberto e venda fechada. Termos e Privacidade 1.1, Termo de Ciência e texto da autorização 1.0, todos com vigência 2026-10-14; rodapé só com CNPJ e os contatos novos, sem endereço (`PARTYX_ADDRESS` saiu do `env.prod.yaml`). Registro: `docs/registros/publicacao-producao-2026-10-14d.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00010-ced`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00008-gaz ./infra/producao/deploy.sh rollback`. A `00008-gaz` funciona com o banco já migrado (a 0009 só acrescenta), mas volta aos textos 1.0 e aos contatos antigos; não é preciso reverter a migração.

**Ordem que valeu para publicação com migração:** build, backup sob demanda conferido, `migrate`, `candidata`, `virar`, bateria por HTTPS no domínio. Vercel, rotinas e verificação de saúde não mudam quando só a revisão muda.

## 17. Quinta publicação: texto longo e mensagens sem "ambiente" (14/10/2026)

**Publicado:** revisão `partyx-00012-vem` (tag `release-2026-10-14e`, commit `a437388`), 100% desde 14/10 20:25 UTC, sem migração e com a mesma configuração. Texto longo digitado quebra a linha no site, nos PDFs e nos e-mails; frases ao público sem "ambiente". Registro: `docs/registros/publicacao-producao-2026-10-14e.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00012-vem`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00010-ced ./infra/producao/deploy.sh rollback`.

**Sem migração:** a conferência do backup do dia (`infra/operacao/check-backup.sh`) basta antes da candidata; backup sob demanda só quando houver migração.

## 18. Sexta publicação: termo de autorização revisto, sem autorização judicial (14 e 15/10/2026)

**Publicado:** revisão `partyx-00014-bax` (tag `release-2026-10-14f`, commit `20a82c8`), 100% desde 15/10 02:09 UTC, com a migração `0010_sem_autorizacao_judicial` (aplicada às 21:27 de 14/10, depois do backup sob demanda `partyx-backup-xsznp`). Termo com logo e CNPJ no cabeçalho e atendimento da configuração no rodapé; autorização judicial fora do sistema; mesma configuração. Registro: `docs/registros/publicacao-producao-2026-10-14f.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00014-bax`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00012-vem ./infra/producao/deploy.sh rollback`. A `00012-vem` convive com a 0010; não é preciso reverter a migração para voltar.

> Atualização de 15/10/2026 02:56 UTC: a `partyx-00016-say` (seção 19) substituiu a `00014-bax`.

## 19. Sétima publicação: excluir evento sem uso e arquivar (15/10/2026)

**Publicado:** revisão `partyx-00016-say` (tag `release-2026-10-15`, commit `3acdea3`), 100% desde 15/10 02:56 UTC, com a migração `0011_excluir_e_arquivar_evento` (aplicada às 02:49, depois do backup sob demanda `partyx-backup-whm9n`) e o papel novo `partyxBannerCleanup` no bucket dos banners (`deploy.sh banners-iam`, também chamado pelo `setup`). Mesma configuração. Registro: `docs/registros/publicacao-producao-2026-10-15.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00016-say`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00014-bax ./infra/producao/deploy.sh rollback`. A `00014-bax` convive com a 0011, mas mostraria de novo no site um evento arquivado: desarquive antes. Evento excluído não volta com rollback.

**Papel recém-criado:** a primeira ligação ao bucket pode falhar com "does not exist in the resource's hierarchy" enquanto o papel propaga; repetir `deploy.sh banners-iam` depois de alguns segundos (idempotente).

> Atualização de 15/10/2026 03:20 UTC: a `partyx-00018-guj` (seção 20) substituiu a `00016-say`.

## 20. Oitava publicação: cronômetro na página do evento (15/10/2026)

**Publicado:** revisão `partyx-00018-guj` (tag `release-2026-10-15b`, commit `023f46b`), 100% desde 15/10 03:20 UTC, com a migração `0012_cronometro_do_evento` (aplicada às 03:19, depois do backup sob demanda `partyx-backup-rnp76`). Mesma configuração. Registro: `docs/registros/publicacao-producao-2026-10-15b.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00018-guj`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00016-say ./infra/producao/deploy.sh rollback`. A `00016-say` convive com a 0012.

> Atualização de 15/10/2026 04:10 UTC: a `partyx-00020-kug` (seção 21) substituiu a `00018-guj`.

## 21. Nona publicação: lotes por tipo de ingresso (15/10/2026)

**Publicado:** revisão `partyx-00020-kug` (tag `release-2026-10-15c`, commit `b39174a`), 100% desde 15/10 04:10 UTC, com a migração `0013_lotes_por_tipo` (aplicada às 04:08, depois do backup sob demanda `partyx-backup-4gbt4`). Mudança de escopo D-86. Mesma configuração. Registro: `docs/registros/publicacao-producao-2026-10-15c.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00020-kug`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00018-guj ./infra/producao/deploy.sh rollback`. A `00018-guj` convive com a 0013 (vende pelo preço do tipo, sem virada de lote).

> Atualização de 15/10/2026 12:34 UTC: a `partyx-00022-jez` (seção 22) substituiu a `00020-kug`.

## 22. Décima publicação: cor de destaque por evento (15/10/2026)

**Publicado:** revisão `partyx-00022-jez` (tag `release-2026-10-15d`, commit `3936840`), 100% desde 15/10 12:34 UTC, com a migração `0014_cor_de_destaque` (aplicada às 12:32, depois do backup sob demanda `partyx-backup-fvmcc`). Mesma configuração. Registro: `docs/registros/publicacao-producao-2026-10-15d.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00022-jez`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00020-kug ./infra/producao/deploy.sh rollback`. A `00020-kug` convive com a 0014 (todos os eventos voltam ao roxo).

> Atualização de 15/10/2026 14:40 UTC: a `partyx-00024-kuy` (seção 23) substituiu a `00022-jez`.

## 23. Décima primeira publicação: transições do site e capa desfocada (15/10/2026)

**Publicado:** revisão `partyx-00024-kuy` (tag `release-2026-10-15e`, commit `f3c8004`), 100% desde 15/10 14:40 UTC, com a migração `0015_capa_desfocada` (aplicada às 14:00, depois do backup sob demanda `partyx-backup-74ptg`; a candidata esperou o OK da virada). Mesma configuração. Registro: `docs/registros/publicacao-producao-2026-10-15e.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00024-kuy`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00022-jez ./infra/producao/deploy.sh rollback`. A `00022-jez` convive com a 0015 (volta o movimento anterior).

> Atualização de 15/10/2026 17:40 UTC: a `partyx-00026-rim` (seção 24) substituiu a `00024-kuy`.

## 24. Décima segunda publicação: transições mais suaves (15/10/2026)

**Publicado:** revisão `partyx-00026-rim` (tag `release-2026-10-15f`, commit `915f6c6`), 100% desde 15/10 17:40 UTC, sem migração (backup sob demanda `partyx-backup-9l292` antes da candidata). Mesma configuração. Devolve o degradê da base da capa, perdido na `00024-kuy`. Registro: `docs/registros/publicacao-producao-2026-10-15f.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00026-rim`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00024-kuy ./infra/producao/deploy.sh rollback`. A `00024-kuy` usa o mesmo banco (volta a primeira versão das transições, sem o degradê da capa).

> Atualização de 15/10/2026 18:59 UTC: a `partyx-00028-vax` (seção 25) substituiu a `00026-rim`.

## 25. Décima terceira publicação: seletor de cor embutido no painel (15/10/2026)

**Publicado:** revisão `partyx-00028-vax` (tag `release-2026-10-15g`, commit `51d5a9e`), 100% desde 15/10 18:59 UTC, sem migração (backup sob demanda `partyx-backup-dxz64` antes da candidata). Dependência nova `react-colorful` 5.8.1, só no pacote do painel. Mesma configuração. Registro: `docs/registros/publicacao-producao-2026-10-15g.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00028-vax`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00026-rim ./infra/producao/deploy.sh rollback`. A `00026-rim` usa o mesmo banco (volta o seletor do sistema; cores salvas continuam valendo).

> Atualização de 15/10/2026 23:07 UTC: a `partyx-00030-jos` (seção 26) substituiu a `00028-vax`.

## 26. Décima quarta publicação: transferência de ingresso e textos novos (15/10/2026)

**Publicado:** revisão `partyx-00030-jos` (tag `release-2026-10-15h`, commit `3ad718a`), 100% desde 15/10 23:07 UTC.
- **Migração:** `0016_transferencia_e_aceite_da_politica`, aplicada às 21:16, depois do backup sob demanda `partyx-backup-kt724`.
- **Textos:** Termos 1.2, Privacidade 1.2 e Política de Cancelamento, Troca e Reembolso 1.0, com vigência em 15/10/2026 e o OK do Bernardo antes da virada.
- **Configuração:** a mesma, mais `CANCELLATION_VERSION` e `CANCELLATION_DATE`.
- **Registro:** `docs/registros/publicacao-producao-2026-10-15h.md`.

**Referência de retorno (rollback) a partir daqui: `partyx-00030-jos`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00028-vax ./infra/producao/deploy.sh rollback`.
- A `00028-vax` convive com a 0016, mas é segura **só antes da primeira transferência**: ela mostra o ingresso pelo pedido.
- Voltar também volta os Termos e a Privacidade 1.1 e tira a Política do ar.

