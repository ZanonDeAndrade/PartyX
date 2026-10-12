# E-mail transacional: SMTP, DNS e teste de entrega

Atualizado em 11/10/2026 (etapa 08). Complementa `../email.md` (fila, modelos e tentativas) e o runbook `runbooks/email.md`.

> **Situação em 11/10/2026.** Não existe `docs/insumos/` e nenhum registro traz o **provedor**, o **domínio** ou o **remetente** escolhidos pela PartyX (D-08, D-09; insumos 8 e 18 "sem registro"). Por isso: nenhum registro DNS foi criado, nenhum segredo de produção foi gravado e **o teste de entrega real não foi feito** (a conta do provedor não existe). Os registros abaixo são o **modelo** a preencher com os valores que o provedor informar. Nada aqui é valor real.

## 1. Como a plataforma envia

- Um único adaptador **SMTP** (`server/src/providers/email.ts`), aceito por todos os provedores comuns. Trocar de provedor é trocar o segredo, não o código (D-46).
- Porta: **465** (`smtps://`, TLS direto) ou **587** (`smtp://`, STARTTLS). O Google Cloud **bloqueia a porta 25** de saída; não use.
- Sem `SMTP_URL`, homologação e produção **não enviam**: o item fica na fila, a 4ª tentativa marca revisão manual e o alerta `email_falhou` dispara. Nunca consta como enviado.
- Modelos com o rodapé da PartyX vindo da configuração (`PARTYX_*`): razão social, CNPJ, endereço, e-mail, WhatsApp e horário. Sem esses dados, produção mostra só "PartyX"; homologação mostra "a fornecer".

## 2. Variáveis e segredos

| Nome | Onde fica | Exemplo de formato (não é valor real) | Observação |
|---|---|---|---|
| `SMTP_URL` | **Secret Manager**, segredo `smtp-url` | `smtps://USUARIO:SENHA@HOST:465` | Segredo. Nunca em arquivo versionado, log ou relatório. Caracteres especiais da senha em percent-encoding (`@` vira `%40`) |
| `EMAIL_FROM` | variável do Cloud Run (deploy) | `PartyX <ingressos@DOMINIO-DA-PARTYX>` | Obrigatório com `SMTP_URL`. Precisa ser do domínio autenticado (SPF/DKIM/DMARC abaixo) |
| `EMAIL_REPLY_TO` | variável do Cloud Run | `atendimento@DOMINIO-DA-PARTYX` | Opcional. Vazio: usa `PARTYX_SUPPORT_EMAIL`. **Nunca** um endereço da contratada |
| `PARTYX_SUPPORT_EMAIL`, `PARTYX_SUPPORT_WHATSAPP`, `PARTYX_SUPPORT_HOURS`, `PARTYX_LEGAL_NAME`, `PARTYX_CNPJ`, `PARTYX_ADDRESS` | variáveis do Cloud Run | ver `.env.example` | Dados públicos **da PartyX**, informados por ela (D-16) |

Gravar o segredo (quem tem a credencial digita; o valor não fica no histórico do shell se vier de um arquivo temporário apagado em seguida):

```bash
# Homologação (projeto partyx-hml) e produção (partyx-producao) usam o MESMO nome de segredo, em projetos diferentes.
gcloud secrets versions add smtp-url --project=<PROJETO> --data-file=<arquivo-com-a-url>   # depois: shred -u <arquivo>
```

Os dois scripts de deploy já montam `SMTP_URL=smtp-url:latest` quando o segredo tem versão e repassam `EMAIL_FROM`, `EMAIL_REPLY_TO` e os `PARTYX_*` se estiverem definidos no ambiente de quem roda o deploy:

```bash
EMAIL_FROM='PartyX <ingressos@DOMINIO-DA-PARTYX>' PARTYX_SUPPORT_EMAIL=... PUBLIC_BASE_URL=... ./infra/homologacao/deploy.sh
```

Credencial **separada por ambiente**: a de homologação não serve para produção. Se o provedor permitir, use uma chave SMTP só para envio (sem acesso ao painel).

## 3. Registros DNS que a PartyX precisa criar

Quem controla o DNS é a PartyX (D-08). Os valores exatos (o `include:` do SPF, o seletor e a chave DKIM) **vêm do painel do provedor escolhido**; não invente nem copie de outro provedor.

Recomendação: enviar de um endereço no domínio da PartyX (ex.: `ingressos@DOMINIO`). Se a PartyX já usa e-mail corporativo nesse domínio, o SPF existente deve ser **estendido**, nunca duplicado.

| # | Tipo | Nome (host) | Valor | Observação |
|---|---|---|---|---|
| 1 | TXT | `DOMINIO` (raiz, `@`) | `v=spf1 include:<INCLUDE-DO-PROVEDOR> ~all` | **Um só** registro `v=spf1` por nome. Se já existe (ex.: e-mail corporativo), acrescente o `include:` no registro atual. Comece com `~all`; depois de conferir a entrega, passe a `-all` |
| 2 | TXT ou CNAME | `<SELETOR>._domainkey.DOMINIO` | chave pública ou CNAME informado pelo provedor | Chave de 2048 bits quando o provedor deixar escolher. Alguns provedores pedem 2 ou 3 CNAMEs (rotação de chave): crie todos |
| 3 | TXT | `_dmarc.DOMINIO` | `v=DMARC1; p=none; rua=mailto:<CAIXA-DA-PARTYX-PARA-RELATORIOS>; adkim=r; aspf=r` | Comece com `p=none` (só observa). Depois de 2 a 4 semanas de relatórios limpos: `p=quarantine`, depois `p=reject`. A caixa de relatórios é da PartyX |
| 4 | conforme o provedor | ex.: subdomínio de retorno (`bounce`, `em`, `send`) | informado pelo provedor | Domínio de retorno (*Return-Path*/MAIL FROM) alinhado ao domínio, se o provedor oferecer. Melhora o alinhamento SPF do DMARC |

Se a PartyX já tiver um DMARC, **não crie outro**: só confira se a política atual não rejeita o provedor novo antes de o DKIM dele estar publicado.

Conferência (somente leitura, não altera nada):

```bash
DOMAIN=<DOMINIO-DA-PARTYX> DKIM_SELECTOR=<SELETOR> ./infra/email-dns-check.sh
```

Passar no script **não prova entrega**. A prova é o teste da seção 4.

## 4. Teste de entrega real em homologação (CA-01, CA-04, RF-36)

**Pré-requisitos:** conta do provedor, domínio com os registros da seção 3, `smtp-url` gravado no projeto de homologação, `EMAIL_FROM` no deploy. **Nenhum deles existia em 11/10/2026: o teste não foi executado.**

Use caixas de teste controladas pela equipe (uma Gmail e uma Outlook/Hotmail). Nenhum dado de comprador real.

| Passo | Fluxo | Como provar | Resultado esperado |
|---|---|---|---|
| 1 | **Cadastro (CA-01)**: criar conta em `https://partyx-hml.web.app/criar-conta` com a caixa Gmail | E-mail "[HOMOLOGAÇÃO] Sua conta PartyX foi criada" chega; `GET /api/admin/emails` mostra `enviado` | Chega na caixa de entrada (não spam), em menos de 2 minutos |
| 2 | **Recuperação (CA-04)**: "Esqueci minha senha" com a mesma caixa | Abrir o link, trocar a senha, abrir o mesmo link de novo | Link funciona uma vez; a segunda abertura diz "já foi utilizado" |
| 3 | **Compra (RF-36)**: comprar no gateway de teste (sandbox do Mercado Pago ou fictício de homologação) | E-mail "Compra confirmada" com evento, pedido, ingressos por tipo e botão para Meus ingressos | Sem QR, sem anexo; botão leva ao login/Meus ingressos |
| 4 | Repetir 1 a 3 com a caixa Outlook | Mesmo | Mesmo |
| 5 | Cabeçalhos: no Gmail, "Mostrar original" | `SPF: PASS`, `DKIM: PASS` (domínio da PartyX), `DMARC: PASS` | Os três `PASS`, com o domínio do `From` alinhado |
| 6 | Responder ao e-mail | Para onde vai a resposta | Para `EMAIL_REPLY_TO` ou `PARTYX_SUPPORT_EMAIL`, nunca para a contratada |
| 7 | Rodapé | Conferir razão social, CNPJ e contatos | Os dados da PartyX, ou "a fornecer" enquanto ela não informar |

Evidência a registrar em `../registros/` (sem senha, token, link de recuperação, CPF ou endereço de caixa real): data, provedor, domínio, resultado de cada passo, captura do "Mostrar original" com os três `PASS` (cortando endereços), tempo de chegada.

Depois da homologação, repetir em produção só o passo 1 e o 5 com uma caixa da equipe, **antes** de abrir o cadastro (`SIGNUP_OPEN=true`).

## 5. Pendências

| Pendência | De quem | Bloqueia |
|---|---|---|
| Provedor de e-mail e plano (D-09, insumo 18) | PartyX | Toda entrega real; CA-01, CA-04 e RF-36 em ambiente real |
| Domínio e acesso ao DNS (D-08, insumo 8) | PartyX | SPF, DKIM, DMARC e o `EMAIL_FROM` definitivo |
| Endereço remetente e caixa de respostas | PartyX | `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| Caixa para os relatórios DMARC (`rua=`) | PartyX | Registro DMARC |
| Dados públicos e contatos (D-16, insumo 4) | PartyX | Rodapé dos e-mails |
| Canal do alerta `email_falhou` (D-47) | PartyX | Aviso de falha em produção |
