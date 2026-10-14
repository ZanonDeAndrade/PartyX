# DNS de partyx.com.br no Registro.br

Gerado em 14/10/2026 (UTC) para o responsável digitar na zona. **Todos os valores do Firebase e do Resend vieram das APIs**, sem dedução: Firebase Hosting (`customDomains`, campo `requiredDnsUpdates`, consultado em 14/10/2026 00:27 UTC) e Resend (`GET /domains/{id}`, gravado em `resend-registros.json` pelo `scripts/resend-dominios.sh`). O DMARC é definição do responsável (política `none`, relatórios para o e-mail dele). Nada foi criado no DNS por aqui.

## 1. Trocar os servidores DNS para os do Registro.br (feito pelo responsável em 13/10/2026)

1. Entrar em https://registro.br com o titular ou um contato administrativo ou técnico do domínio.
2. **Domínios** > `partyx.com.br` > seção **DNS** > **Alterar servidores DNS**.
3. Escolher **Utilizar os servidores DNS do Registro.br** e salvar. Saem `daphne.ns.cloudflare.com` e `sean.ns.cloudflare.com`; entram `a.auto.dns.br` e `b.auto.dns.br`.
4. Na mesma seção, **Configurar zona DNS** (ou **Editar zona**), no **modo avançado**, que aceita TXT, MX e CNAME em subdomínios.
5. Criar cada linha da tabela do item 2 com **Adicionar registro** e **salvar a zona** ao final (registro digitado e não salvo não é publicado).

Ajuda oficial: https://registro.br/ajuda/gerenciamento-de-conta/redirecionamento-dns-avancado/ e https://registro.br/tecnologia/caracteristicas-tecnicas. Os nomes dos botões podem variar um pouco no painel.

Prazos, pela ajuda do Registro.br: a zona `.br` é publicada a cada 5 minutos; a internet toda costuma ver em até 1 hora; a troca de servidores tem um período de transição de 24 horas; trocar entre os modos básico e avançado pode levar até 3 horas.

Situação conferida em 14/10/2026 00:27 UTC: a delegação no `.br` já aponta para `a.auto.dns.br` e `b.auto.dns.br` e os resolvedores públicos respondem `NOERROR`. A zona tinha só os dois registros padrão do Registro.br para domínio sem e-mail, `TXT "v=spf1 -all"` e `MX 0 .`, ambos na raiz. **Os 4 registros do Firebase ainda não estavam publicados** (conferir se a zona foi salva).

## 2. Tabela final (digitar exatamente assim)

Nome no formato do editor do Registro.br: só o prefixo; **vazio** para a raiz (`partyx.com.br`). Valores sem aspas no campo; se o editor pedir, ele mesmo coloca.

| # | Tipo | Nome | Valor | Prioridade | Origem |
|---|---|---|---|---|---|
| 1 | A | `(vazio)` | `199.36.158.100` |  | Firebase produção |
| 2 | TXT | `(vazio)` | `hosting-site=partyx-producao` |  | Firebase produção |
| 3 | CNAME | `www` | `partyx-producao.web.app` |  | Firebase produção |
| 4 | CNAME | `hml` | `partyx-hml.web.app` |  | Firebase homologação |
| 5 | TXT | `resend._domainkey.hml` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQChfLoZyqAsBtJ5duir2ikkQD2tpuW9GokcnKsl2e7Vs/nJXVJao0zBqJUOCjRh6/WQnlKpWhWv4A/q1yYE3N3qb2ictLYeBGW26aUPVEY9QKaaNlF2NC/PqaCkwcNC3rzHnfFpQpTkftJvrZyY9RdNXtFYcdMeCaRMVbopzv6ZuwIDAQAB` |  | Resend homologação (DKIM) |
| 6 | MX | `send.hml` | `feedback-smtp.sa-east-1.amazonses.com` | 10 | Resend homologação (SPF) |
| 7 | TXT | `send.hml` | `v=spf1 include:amazonses.com ~all` |  | Resend homologação (SPF) |
| 8 | CNAME | `rsend.hml` | `send.forge.rmta.net` |  | Resend homologação (SPF) |
| 9 | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCqFvQnDDxNDEJOzg4SLv5mhpx+aVf0ZzXPlHzaqsrOeCITnrvBj5Bx2Ow281UgidGZko2seEvy3bbeFPN6YV1g1aqoXqRkNczBI66pLZWO4m/SrCw6RFcXb1IhWEB2u5sGsRzy4CxWKChymllOLk0MDS9Dg8btGfw1VfIFNcoQ2wIDAQAB` |  | Resend produção (DKIM) |
| 10 | MX | `send` | `feedback-smtp.sa-east-1.amazonses.com` | 10 | Resend produção (SPF) |
| 11 | TXT | `send` | `v=spf1 include:amazonses.com ~all` |  | Resend produção (SPF) |
| 12 | CNAME | `rsend` | `send.forge.rmta.net` |  | Resend produção (SPF) |
| 13 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:zanondea@gmail.com` |  | DMARC produção |
| 14 | TXT | `_dmarc.hml` | `v=DMARC1; p=none; rua=mailto:zanondea@gmail.com` |  | DMARC homologação |

Observações sobre a tabela:

- As linhas 1 a 4 são as que o Firebase exige hoje. Depois que elas propagarem, o Firebase pode pedir mais um registro para emitir o certificado; reconferir pela API.
- O Resend devolveu **quatro** registros por domínio, e não três: além do DKIM e do par MX e TXT de `send`, um **CNAME `rsend`** para `send.forge.rmta.net`. Entram como a API mandou.
- O TXT da linha 2 é **mais um** TXT na raiz: não apagar o `v=spf1 -all` que já está lá.
- DMARC (linhas 13 e 14): `rua` aponta para um endereço do Gmail. Para endereço em outro domínio, a norma do DMARC pede uma autorização publicada pelo domínio de destino, que o Gmail não publica para terceiros; por isso alguns provedores podem não enviar os relatórios. A política `p=none` vale do mesmo jeito. Quando a PartyX tiver uma caixa no próprio domínio, trocar o endereço.

## 3. Avisos

- **Sem CNAME na raiz:** o Registro.br (como qualquer DNS) não aceita CNAME no próprio `partyx.com.br`; por isso a raiz usa o registro A do Firebase (linha 1). `www` e `hml` são CNAME.
- **Não criar MX na raiz.** A PartyX não tem e-mail no domínio hoje. Os registros do Resend ficam em `send` e `send.hml` e não conflitam com um e-mail futuro na raiz.
- **`MX 0 .` na raiz (padrão do Registro.br):** é o "MX nulo", que declara que o domínio não recebe e-mail. Para a homologação não atrapalha (o remetente é `@hml.partyx.com.br`, que não tem esse registro). **Para a produção atrapalha:** alguns provedores recusam mensagens cujo remetente é de um domínio com MX nulo, e o remetente de produção será `ingressos@partyx.com.br`. Antes de ligar o e-mail de produção, decidir com a PartyX: remover o MX nulo (e manter o `v=spf1 -all`, que o Resend não usa, pois o retorno sai de `send.partyx.com.br`) ou contratar caixas de e-mail, cujo provedor informa o MX e o SPF da raiz. Não foi alterado.
- **CAA:** não há e não é preciso. Se um dia for criado, precisa permitir `letsencrypt.org` e `pki.goog` para o Firebase emitir o certificado.
- **AAAA:** não criar; o Firebase não pediu.
- `hml` como CNAME convive com `send.hml`, `rsend.hml`, `resend._domainkey.hml` e `_dmarc.hml`, que são nomes diferentes. Só não pode existir outro registro no próprio `hml`.

## 4. Como conferir depois

Direto nos servidores do Registro.br (sem esperar cache):

```bash
NS=a.auto.dns.br
dig +short A partyx.com.br @$NS                       # 199.36.158.100
dig +short TXT partyx.com.br @$NS                     # "hosting-site=partyx-producao" e "v=spf1 -all"
dig +short CNAME www.partyx.com.br @$NS               # partyx-producao.web.app.
dig +short CNAME hml.partyx.com.br @$NS               # partyx-hml.web.app.
for p in "" ".hml"; do
  dig +short TXT resend._domainkey$p.partyx.com.br @$NS   # p=MIG...
  dig +short MX send$p.partyx.com.br @$NS                 # 10 feedback-smtp.sa-east-1.amazonses.com.
  dig +short TXT send$p.partyx.com.br @$NS                # "v=spf1 include:amazonses.com ~all"
  dig +short CNAME rsend$p.partyx.com.br @$NS             # send.forge.rmta.net.
  dig +short TXT _dmarc$p.partyx.com.br @$NS              # "v=DMARC1; p=none; rua=mailto:..."
done
```

Repetir sem `@$NS` para ver o que os resolvedores públicos já enxergam.

- **Firebase:** no console (Hosting > domínios) ou pela API, o estado sai de "Needs setup" para "Pending", "Minting certificate" e **Connected**. O HTTPS é emitido sozinho depois que o TXT e o A (ou CNAME) estiverem visíveis: de minutos a poucas horas; a documentação fala em até 24 horas. Conferir com `curl -sI https://partyx.com.br/api/health`.
- **Resend:** no painel, **Domains** > **Verify** em cada domínio; o estado vai de `not_started` a `verified` (costuma levar minutos; pode levar horas).
- **Atenção à regra de Host:** enquanto `PUBLIC_BASE_URL` de produção for `https://partyx-producao.web.app`, o servidor responde **403** a quem chega por `partyx.com.br`, mesmo com o DNS e o certificado prontos. Isso inclui o webhook do Mercado Pago, se a URL do modo produtivo já estiver em `https://partyx.com.br/api/webhooks/payments`. A troca é o passo seguinte (`dominio-partyx.md`, item 6).
