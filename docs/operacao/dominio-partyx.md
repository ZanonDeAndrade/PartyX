# Domínio partyx.com.br: roteiro de DNS, Hosting e e-mail (não executado)

Preparado em 13/10/2026 para o responsável aplicar. **Nada aqui foi executado:** nenhum registro DNS, conta, domínio no Firebase, segredo ou deploy. As consultas feitas foram só de leitura (DNS público e o cadastro público do Registro.br). Produção só muda com autorização expressa; o provedor de e-mail de **produção** continua sendo decisão da PartyX (D-09) e aparece aqui como proposta.

## 0. O que existe hoje (consultado em 13/10/2026)

| Consulta | Resultado |
|---|---|
| Cadastro no Registro.br (RDAP) | domínio **ativo**, registrado em 24/04/2025, vence em 24/04/2027, sem DNSSEC |
| Servidores de nomes delegados no `.br` | `daphne.ns.cloudflare.com` e `sean.ns.cloudflare.com` (**Cloudflare**, não o DNS do Registro.br) |
| Resposta desses servidores | **REFUSED** para SOA, NS, A, MX e TXT: a zona `partyx.com.br` não existe mais na conta da Cloudflare |
| Verificação de delegação do Registro.br | última correta em 29/05/2026; em 12/10/2026, "ns query refused" |
| `partyx.com.br`, `www`, `_dmarc`, `hml` (NS, A, AAAA, MX, TXT, CNAME) pelos resolvedores 8.8.8.8 e 1.1.1.1 | **SERVFAIL**, nenhum registro |

Conclusão: **hoje o domínio não resolve nada**. Não há site, MX, SPF, DMARC nem registro de verificação publicado, então não há o que sobrescrever. Consequências:

- Nenhum endereço `@partyx.com.br` recebe e-mail agora (não existe MX). O item `*@partyx.com.br` da lista de permitidos só terá efeito quando a PartyX tiver caixas nesse domínio.
- Se a PartyX tinha e-mail ou verificações nessa zona antes de junho, eles já estão fora do ar. **Antes do passo 1, confirmar com a PartyX** se existe cópia dos registros antigos (painel da Cloudflare) ou algum serviço que dependa do domínio.

## 1. Primeiro passo obrigatório: trocar os servidores DNS para os do Registro.br

Decisão do responsável em 13/10/2026: usar o DNS do próprio Registro.br (ele faz a troca). Sem isso, nenhum registro abaixo é visto por ninguém.

Antes de começar: só o titular do domínio, ou um contato com permissão no painel, consegue alterar. Confirmar com a PartyX se alguém guarda os registros antigos da Cloudflare; hoje nada resolve, então a troca não derruba nada que esteja funcionando.

1. Entrar em https://registro.br com o usuário titular (ou o contato administrativo ou técnico) do domínio.
2. Em **Domínios**, abrir `partyx.com.br`.
3. Na seção **DNS**, clicar em **Alterar servidores DNS**.
4. Escolher **Utilizar os servidores DNS do Registro.br** e salvar. Os servidores passam a ser `a.auto.dns.br` e `b.auto.dns.br`, e os dois da Cloudflare (`daphne.ns.cloudflare.com` e `sean.ns.cloudflare.com`) saem.
5. Aguardar a publicação. A opção de editar a zona pode demorar alguns minutos (o painel avisa quando a zona está ativa).
6. Na mesma seção, clicar em **Configurar zona DNS** (ou **Editar zona**) e ativar o **modo avançado**, que permite TXT, MX e registros em subdomínios.
7. Criar os registros da tabela do item 5, um por vez, com **Adicionar registro** (tipo, nome e valor). No Registro.br o nome é só o prefixo (`hml`, `send.hml`, `_dmarc`); para o próprio domínio, deixar o nome vazio. Salvar a zona ao final.
8. DNSSEC: o DNS do Registro.br assina a zona sozinho. Não é preciso configurar nada.

Os nomes dos botões podem variar um pouco no painel; se algum passo estiver diferente, anote e corrija este roteiro.

Conferir depois da troca:

```bash
dig +short NS partyx.com.br          # esperado: a.sec.dns.br. e b.sec.dns.br. (modo avançado; no modo simples eram a.auto e b.auto)
dig +noall +comments SOA partyx.com.br | grep status     # esperado: NOERROR (hoje: SERVFAIL)
dig +norecurse +short NS partyx.com.br @a.dns.br          # a delegação no .br já com os servidores novos
```

Prazo: o Registro.br publica alterações em ciclos de cerca de 30 minutos; a delegação antiga pode ficar em cache por até 1 hora (TTL de 3600 s no `.br`). Se depois de 2 horas ainda vier SERVFAIL, conferir no painel se a troca foi salva.

Alternativa não escolhida: recriar a zona numa conta da Cloudflare. Nesse caso os registros do Firebase e do Resend ficam sem proxy ("DNS only").

## 2. Resend (e-mail)

Plano gratuito conferido na página oficial em 13/10/2026 (https://resend.com/pricing): **3 domínios**, 3.000 e-mails por mês, **100 por dia**, SMTP incluído. Cabem os dois:

| Domínio no Resend | Ambiente | Remetente |
|---|---|---|
| `hml.partyx.com.br` | homologação | `PartyX Homologação <ingressos@hml.partyx.com.br>` |
| `partyx.com.br` | produção (proposta, D-09) | `PartyX <ingressos@partyx.com.br>` |

Atenção para produção: 100 e-mails por dia não bastam para uma abertura de vendas (cada compra gera um e-mail). O plano pago (Pro, US$ 20 por mês, 50.000 e-mails, sem teto diário) ou outro provedor é decisão da PartyX antes do go-live.

Passos (responsável): criar a conta; **Domains > Add Domain** para cada domínio, região **São Paulo (sa-east-1)**; criar os registros do item 5; **Verify**; criar **uma chave de API por ambiente**, só de envio e restrita ao domínio do ambiente. As chaves não vão para chat nem arquivo: entram por `scripts/setup-smtp-homologacao.sh` (homologação). O script de produção ainda não existe e fica para quando a D-09 for confirmada. Detalhes da homologação: `email-homologacao-smtp-real.md`.

## 3. Firebase Hosting de PRODUÇÃO (`partyx-producao`)

No console do Firebase, projeto `partyx-producao` > **Hosting** > **Adicionar domínio personalizado**:

1. `partyx.com.br` (domínio principal). O console mostra um **TXT de verificação** e os registros de apontamento (**A**; nos exemplos da documentação, `199.36.158.100`, mas vale o que o console mostrar). O TXT precisa **ficar publicado para sempre**.
2. `www.partyx.com.br`, marcando a opção de **redirecionar** para `partyx.com.br`. O console mostra o registro do `www` (A ou CNAME).
3. Não criar AAAA (a documentação manda remover os que existirem). Se um dia houver registro CAA, ele precisa permitir `letsencrypt.org` e `pki.goog`.
4. HTTPS é automático: o estado passa por "Needs setup", "Pending" e "Minting certificate" até **Connected**. Costuma levar de minutos a poucas horas; a documentação fala em até 24 horas.

Fonte: https://firebase.google.com/docs/hosting/custom-domain

## 4. Opcional: `hml.partyx.com.br` no Hosting da homologação

Mesmo procedimento no projeto `partyx-hml`. Convive com o uso do mesmo nome no Resend (o Resend só usa `send.hml` e `resend._domainkey.hml`). **Custo de adotar:** a regra de Host aceita um endereço só; ao trocar a homologação para `hml.partyx.com.br`, o endereço `partyx-hml.web.app` passa a responder 403, e é preciso atualizar o webhook de teste do Mercado Pago e os scripts que travam o endereço da homologação (`infra/testes/roteiro-hml.sh`, `e2e/support/roteiro-setup.ts`, `infra/carga/run-carga-hml.sh`, `infra/carga/carga.k6.js`, `infra/testes/alertas-hml.mjs`, `infra/homologacao/scheduler.sh`). Recomendação: deixar para depois do aceite, ou não fazer.

## 5. Tabela final de registros (zona `partyx.com.br`, no DNS do Registro.br)

"Console" = o valor exato só aparece no painel do serviço; não copiar de exemplo. Nomes relativos à zona (`@` é o próprio `partyx.com.br`).

| # | Tipo | Nome | Valor | Origem | Depende do console? |
|---|---|---|---|---|---|
| 1 | TXT | `@` | verificação do Hosting (formato `hosting-site=partyx-producao`) | Firebase produção | **sim** |
| 2 | A | `@` | IP do Hosting (exemplo da documentação: `199.36.158.100`) | Firebase produção | **sim** |
| 3 | A ou CNAME | `www` | o que o console indicar para o redirecionamento | Firebase produção | **sim** |
| 4 | TXT | `resend._domainkey` | chave DKIM (`p=...`) | Resend produção | **sim** |
| 5 | TXT | `send` | `v=spf1 include:amazonses.com ~all` | Resend produção | confirmar |
| 6 | MX (prioridade 10) | `send` | `feedback-smtp.sa-east-1.amazonses.com` | Resend produção | confirmar a região |
| 7 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<caixa da PartyX para relatórios>` | DMARC da PartyX | não (falta o endereço) |
| 8 | TXT | `resend._domainkey.hml` | chave DKIM (`p=...`) | Resend homologação | **sim** |
| 9 | TXT | `send.hml` | `v=spf1 include:amazonses.com ~all` | Resend homologação | confirmar |
| 10 | MX (prioridade 10) | `send.hml` | `feedback-smtp.sa-east-1.amazonses.com` | Resend homologação | confirmar a região |
| 11 | TXT | `_dmarc.hml` | `v=DMARC1; p=none; rua=mailto:<caixa para relatórios>` | DMARC da homologação | não (falta o endereço) |
| 12 (opcional) | TXT e A | `hml` | verificação e IP do Hosting | Firebase homologação | **sim** |

Não entram nesta tabela, de propósito: MX e SPF do **próprio** `@` (caixas de e-mail `@partyx.com.br`). O Resend só envia; se a PartyX quiser receber e-mail no domínio (Google Workspace, Zoho ou outro), o provedor escolhido informa o MX e o SPF da raiz, que convivem com os registros acima. Sem isso, respostas para `ingressos@partyx.com.br` não chegam a ninguém: definir `EMAIL_REPLY_TO` ou o atendimento da PartyX.

Ordem sugerida: 8 a 11 primeiro (homologação recebe e-mail real sem tocar na produção), depois 1 a 3, depois 4 a 7.

## 6. Depois do DNS: configuração de cada ambiente

A variável do endereço público chama-se `PUBLIC_BASE_URL` (não existe `PUBLIC_DOMAIN`). Dela saem a regra de Host, a conferência de origem, os links absolutos dos e-mails, o Open Graph e o `X-Forwarded-Host` das tarefas; não há outro lugar para trocar no código.

**Homologação** (`infra/homologacao/env.hml.yaml`, depois `./infra/homologacao/deploy.sh`):

- `EMAIL_FROM: "PartyX Homologação <ingressos@hml.partyx.com.br>"`
- `EMAIL_ALLOWLIST: "zanondea@gmail.com,*@partyx.com.br,bbittencourt085@gmail.com"` (definida em 13/10/2026). A lista só existe no código a partir da próxima release; a homologação de hoje (`release-2026-10-13`) ainda não a conhece
- `smtp-url` novo por `bash scripts/setup-smtp-homologacao.sh`, antes do deploy
- `PUBLIC_BASE_URL` continua `https://partyx-hml.web.app`, a não ser que o item 4 seja adotado
- Mercado Pago, modo de **teste**: continua `https://partyx-hml.web.app/api/webhooks/payments`

**Produção** (só com autorização expressa; hoje o `deploy.sh` de produção recebe as variáveis pela linha de comando, e `infra/producao/env.prod.yaml` é o modelo a ligar no próximo deploy):

- `PUBLIC_BASE_URL=https://partyx.com.br`. Efeito: `partyx-producao.web.app` e o `run.app` passam a responder 403 (menos a saúde); é o esperado.
- `./infra/producao/deploy.sh varredura` de novo, com o mesmo `PUBLIC_BASE_URL`: a rotina das 04:00 envia o `X-Forwarded-Host` e seria recusada com o valor antigo. As tarefas do Cloud Tasks pegam o valor novo sozinhas. `JOBS_AUDIENCE` **não** muda (continua a URL `run.app`).
- Mercado Pago, modo **produtivo**: `https://partyx.com.br/api/webhooks/payments`, evento Order. Salvar pode trocar a assinatura secreta: regravar com `scripts/setup-mp-credentials-producao.sh --so-webhook`, publicar e usar "Simular notificação" (esperado: 200).
- `EMAIL_FROM` de produção e o segredo `smtp-url` de produção, quando a D-09 fechar. Produção **não** aceita `EMAIL_ALLOWLIST`.
- Conferir depois: links dos e-mails e `og:url` e `og:image` com `https://partyx.com.br`; runbooks e `README-DEPLOY.md` (seções 8f e 13) com o endereço novo; D-08 e D-09 em `registros/decisoes-pendentes.md`.

## 7. Como verificar cada passo

| Passo | Comando | Esperado | Prazo usual |
|---|---|---|---|
| Delegação | `dig +short NS partyx.com.br` e `dig SOA partyx.com.br` | `a.sec.dns.br` e `b.sec.dns.br`, `NOERROR` | 30 min a 1 h |
| Hosting, verificação | `dig +short TXT partyx.com.br` | o TXT do console | minutos; até 24 h |
| Hosting, apontamento | `dig +short A partyx.com.br` e `dig +short www.partyx.com.br` | IP do console | minutos; até 24 h |
| Hosting, certificado | console: estado **Connected**; `curl -sI https://partyx.com.br/api/health` | 200 com certificado válido | minutos a horas; até 24 h |
| Redirecionamento | `curl -sI https://www.partyx.com.br/` | 301 para `https://partyx.com.br/` | junto com o certificado |
| Resend, DKIM | `dig +short TXT resend._domainkey.hml.partyx.com.br` | a chave do painel | minutos |
| Resend, SPF e retorno | `dig +short TXT send.hml.partyx.com.br` e `dig +short MX send.hml.partyx.com.br` | SPF e MX da tabela | minutos |
| DMARC | `dig +short TXT _dmarc.hml.partyx.com.br` | `v=DMARC1; ...` | minutos |
| Resend, painel | **Domains**: estado **Verified** | os três registros verdes | 15 min; até algumas horas |
| Regra de Host (depois do deploy) | `curl -s -o /dev/null -w '%{http_code}' https://partyx.com.br/` e o mesmo em `https://partyx-producao.web.app/` | 200 e 403 | imediato |
| E-mail real | compra de teste para um endereço da lista; cabeçalho da mensagem | `spf=pass`, `dkim=pass`, `dmarc=pass`, fora do spam | imediato |

Há também `infra/email-dns-check.sh` para os registros de e-mail (`email.md`, seção 3). Para a produção, trocar `hml.` pelos nomes sem o prefixo nos comandos acima.
