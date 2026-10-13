# Homologação com entrega real de e-mail: plano (não executado)

Preparado em 13/10/2026 a pedido do responsável, para o cliente receber os e-mails ao testar a homologação. **Nada aqui foi executado:** não há conta, registro DNS nem segredo novo. Hoje o `smtp-url` da homologação é a caixa de captura Ethereal, que não entrega a ninguém. A escolha do provedor de **produção** continua sendo a D-09 (PartyX); este plano vale só para a homologação e usa um subdomínio do responsável.

## Provedor proposto: Resend (plano gratuito)

| | Resend (proposto) | Brevo (alternativa) |
|---|---|---|
| Plano gratuito | 3.000 e-mails por mês, **100 por dia**, até 3 domínios, SMTP incluído, registros por 30 dias | cerca de 300 e-mails por dia, segundo análises de terceiros; **a página oficial não pôde ser lida nesta conferência** |
| Marca do provedor no e-mail | não | análises citam rodapé com a marca no plano gratuito (conferir) |
| SMTP | `smtp.resend.com`, usuário `resend`, senha = chave de API | host e credenciais no painel |
| Preços (conferir antes de criar a conta) | https://resend.com/pricing | https://www.brevo.com/pricing/ |

Motivo: limites lidos na página oficial em 13/10/2026, sem marca no e-mail, região de envio em São Paulo (`sa-east-1`) e SMTP comum, que é o que a plataforma usa (`SMTP_URL`). Os 100 e-mails por dia bastam para os testes do cliente, mas **não** para a carga nem para várias rodadas do roteiro no mesmo dia (ver "Cuidados").

## Remetente

`PartyX Homologação <ingressos@hml.[SEU DOMÍNIO]>`, com o domínio verificado no provedor sendo o subdomínio `hml.[SEU DOMÍNIO]`. Um subdomínio isola a reputação do domínio principal. O prefixo **[HOMOLOGAÇÃO]** no assunto é do código (`server/src/mail/templates.ts`, por `APP_ENV=homologacao`) e não muda com o provedor.

## Passo a passo da conta (responsável)

1. Criar a conta em https://resend.com com um e-mail seu.
2. **Domains > Add Domain**: `hml.[SEU DOMÍNIO]`, região **São Paulo (sa-east-1)**.
3. Criar no DNS os registros que o painel mostrar (tabela abaixo) e clicar em **Verify**. Costuma verificar em minutos; pode levar horas.
4. **API Keys > Create API Key**: permissão **Sending access**, restrita ao domínio `hml.[SEU DOMÍNIO]`. A chave aparece uma vez só. Não cole em chat, chamado nem arquivo.
5. Avisar no chat que a conta e o DNS estão prontos. A chave entra só no passo "Gravação do segredo", por digitação oculta.

## Registros DNS

Os valores exatos **vêm do painel do Resend**; a chave DKIM é única por domínio. Formato esperado para o domínio `hml.[SEU DOMÍNIO]` (o nome completo fica `...hml.[SEU DOMÍNIO]`; muitos painéis de DNS pedem só o prefixo):

| Função | Tipo | Nome | Valor |
|---|---|---|---|
| DKIM | TXT | `resend._domainkey.hml` | `p=...` (chave pública do painel) |
| SPF do retorno | TXT | `send.hml` | `v=spf1 include:amazonses.com ~all` |
| Retorno (bounces) | MX, prioridade 10 | `send.hml` | `feedback-smtp.sa-east-1.amazonses.com` (o painel confirma a região) |
| DMARC | TXT | `_dmarc.hml` | `v=DMARC1; p=none; rua=mailto:<caixa sua para relatórios>` |

Observações: o DMARC não é exigido para verificar, mas sem ele Gmail e Outlook tendem a desconfiar; `p=none` só observa, sem rejeitar. Se o domínio principal já tem DMARC, o subdomínio herda a política dele quando não houver registro próprio. Conferência depois de criar: `bash infra/email-dns-check.sh` (ver `email.md`, seção 3).

## Gravação do segredo e deploy (depois da conta e do DNS, com o seu OK)

1. `bash scripts/setup-smtp-homologacao.sh` num terminal: pede a chave com digitação oculta, monta `smtps://resend:<chave>@smtp.resend.com:465`, testa a autenticação no SMTP e grava uma versão nova de `smtp-url` no `partyx-hml` (a anterior, do Ethereal, fica desativada e pode voltar). Nada é impresso.
2. Trocar `EMAIL_FROM` em `infra/homologacao/env.hml.yaml` para o remetente novo e rodar `./infra/homologacao/deploy.sh`.
3. Refazer **só o item 12** com um destinatário real (um endereço seu de teste): conferir a chegada, a **pasta de spam**, o assunto com [HOMOLOGAÇÃO], o link para os ingressos e, no cabeçalho da mensagem, `spf=pass`, `dkim=pass` e `dmarc=pass`.
4. Registrar o resultado em `registro-rotinas.md` e na matriz (CA-01, CA-04, RF-36). Se cair no spam ou falhar, fica registrado como pendência e o CA-01 **não** é marcado como aprovado.

Custo: plano gratuito do provedor; no Google Cloud, uma versão a mais de segredo (a antiga desativada não é cobrada) e um build.

## Cuidados antes de ligar a entrega real

- **Destinatários fictícios.** O roteiro 11.2, a carga e o disparo de alertas usam endereços `@exemplo.com`, que é um domínio real de terceiros. Com entrega real, essas mensagens sairiam de verdade, voltariam como erro e gastariam a cota e a reputação do subdomínio. Antes da troca, é preciso uma destas saídas (decisão do responsável): (a) lista de domínios permitidos em homologação, com o resto apenas registrado e não enviado; ou (b) trocar os endereços dos testes por variações de uma caixa sua (`voce+rodada@...`).
- **Cota de 100 por dia.** Uma rodada do roteiro envia cerca de 10 e-mails; a carga, um por compra concluída.
- **Dados antigos.** A fila de e-mails pendentes e os usuários fictícios existentes devem ser limpos antes (ver `../registros/dados-ficticios-homologacao.md`), para nada antigo ser reenviado pela rotina diária.
- **Voltar ao Ethereal:** reativar a versão anterior de `smtp-url`, desativar a nova e publicar de novo.
