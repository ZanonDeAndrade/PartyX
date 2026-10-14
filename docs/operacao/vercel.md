# Vercel como ponte temporária para o domínio partyx.com.br

Decidido pelo responsável em 14/10/2026. Motivo: o certificado do Firebase Hosting para `partyx.com.br` ficou preso porque a zona antiga continua servida pelos servidores `a.auto.dns.br` e `b.auto.dns.br` do Registro.br (`diagnostico-dominio-2026-10-14.md`). Enquanto isso não se resolve, a Vercel fica na frente do domínio só para emitir o certificado e repassar os pedidos. **A meta é voltar ao Firebase assim que o certificado dele sair.**

## Plano: Hobby, por decisão do responsável

- **Plano Hobby, no time pessoal `zanondeandrades-projects`**, decisão do responsável em 14/10/2026. Não usar o teste do Pro nem criar time Pro.
- **Risco assumido pelo responsável:** o Hobby é só para uso pessoal e não comercial (regras de uso justo da Vercel). A Vercel pode **pausar o projeto ou a conta** por violação de política, avisando por e-mail. O projeto pausado responde `503 DEPLOYMENT_PAUSED`, e a volta é manual, projeto a projeto, seguindo as instruções do e-mail ou com o suporte. Nesse caso o site sai do ar pelo domínio, e o caminho é a volta de emergência (abaixo).
- Pausa por uso: no Hobby, "sustained usage past these limits can lead to a paused deployment"; em geral é preciso esperar 30 dias para usar o recurso de novo. A estimativa de uso está abaixo.

## Arquitetura

visitante → `partyx.com.br` → Vercel (certificado Let's Encrypt, rewrite externo) → Cloud Run `partyx` (southamerica-east1) → Neon

- **Na Vercel fica só a configuração de rewrite** (`infra/vercel/vercel.json`, projeto `partyx-dominio`). O back-end, o banco, as rotinas e os segredos continuam inteiros no Google Cloud.
- CLI da Vercel fixada na versão **64.0.2** (a atual em 14/10/2026): sempre `npx vercel@64.0.2 ... --scope zanondeandrades-projects`, rodando dentro de `infra/vercel/`. A pasta `infra/vercel/.vercel/` (vínculo local com o projeto) fica fora do Git.
- O destino do rewrite aponta primeiro para a candidata (`https://candidata---partyx-7x4xxcu3eq-rj.a.run.app`), para testar a cadeia antes da virada; na virada passa a ser o endereço principal do serviço (`https://partyx-391817439013.southamerica-east1.run.app`), com nova publicação na Vercel.
- Cache na Vercel só em `/assets/*` (arquivos com hash no nome, `immutable`); todo o resto vai sem cache (`x-vercel-enable-rewrite-caching: 0`).
- `www.partyx.com.br` redireciona para a raiz com 308, configurado no projeto da Vercel.
- O Firebase Hosting continua configurado (site, rewrites, domínios e o TXT `hosting-site=partyx-producao`), para a volta.

## Uso do Hobby e estimativa (documentação de 14/09/2026)

| Recurso | Incluso no Hobby, por mês | O que conta aqui |
|---|---|---|
| Fast Data Transfer | 100 GB | tudo entre a Vercel e o visitante, nos dois sentidos (corpo, cabeçalhos e URL) |
| CDN Requests | 1.000.000 | cada pedido que passa pela Vercel, inclusive os de cache e os redirecionamentos do `www` |
| Fast Origin Transfer | 10 GB | a documentação descreve para funções, middleware, Blob e cache de dados, não para rewrite externo; considerado aqui no pior caso (tudo que vai e volta do Cloud Run sem cache) |

Medidas do site (build de 14/10/2026): primeira visita de cerca de 250 KB comprimidos (HTML, JavaScript, CSS e fontes; visitas seguintes usam o cache do navegador) e de 15 a 25 pedidos. Consultas automáticas a cada 4 s: espera do Pix no checkout, painel do evento no admin e contador da portaria (este também com a aba escondida).

Estimativa para um mês com um evento de porte pequeno a médio (5.000 visitantes, 1.000 compras, 10 aparelhos na portaria e 2 painéis abertos por 8 horas no dia do evento):

| Origem | CDN Requests | Dados |
|---|---|---|
| Visitas (5.000 × 25) | 125.000 | cerca de 1,3 GB |
| Espera do Pix (1.000 × 40) | 40.000 | desprezível |
| Portaria (10 × 8 h × 900 por hora) e painéis (2 × 8 h × 900) | 86.000 | desprezível |
| Verificação de saúde (3 regiões a cada 5 min) | 26.000 | desprezível |
| Robôs e varreduras | cerca de 10.000 | desprezível |
| **Total** | **cerca de 290.000 (29% do incluso)** | **cerca de 2 GB (2% do Fast Data Transfer; menos de 1 GB de Fast Origin Transfer no pior caso)** |

O limite que aperta primeiro é o de **CDN Requests**, por causa das consultas a cada 4 s. Ele estoura perto de 15.000 a 20.000 visitantes no mês, ou com muitos aparelhos de portaria ligados por muitas horas. Banners: **a exibição não passa pela Vercel** (as imagens saem direto do Cloud Storage, `storage.googleapis.com`, porque `BANNER_PUBLIC_BASE_URL` não está definido); só o envio pelo admin passa, até 5,5 MB por envio, o que é desprezível. Acompanhar em Usage no painel da Vercel, sobretudo antes e depois de um evento.

## O que o servidor espera atrás da Vercel

| Cabeçalho que chega ao Cloud Run | Valor esperado | Uso no servidor |
|---|---|---|
| `Host` | o endereço `run.app` do serviço | barreira de Host (`server/src/app.ts`) |
| `X-Forwarded-Host` | `partyx.com.br` | barreira de Host: precisa ser igual ao host do `PUBLIC_BASE_URL` |
| `X-Forwarded-For` | `visitante, IP da Vercel` (a Vercel regrava com o IP do visitante; o Google acrescenta o dela) | IP do visitante com `TRUSTED_PROXY_HOPS=2`, o mesmo valor medido atrás do Firebase |
| `X-Vercel-Id` | identificador do pedido na Vercel | só diagnóstico (`/api/health/origem`) |

Conferência: `GET https://partyx.com.br/api/health/origem` devolve o host recebido, o intermediário (`vercel` ou `firebase`), o IP do visitante mascarado (`177.86.x.x`), a query string e o `x-request-id` como chegaram e um resumo SHA-256 do `x-signature` (a assinatura do webhook do Mercado Pago depende do `data.id` da URL e do `x-request-id`). No log ("origem do pedido") vão o IP mascarado e só os nomes dos parâmetros e cabeçalhos. Direto no `run.app`, sem o domínio, responde 403. O teste rápido do `deploy.sh` confere essa cadeia.

## Alerta se a Vercel parar

A verificação de saúde de `https://partyx.com.br/api/health/ready` (criada no bloco 5 com `infra/operacao/uptime.sh`, nome `partyx-saude-dominio`) exige o texto `"database":"ok"` e valida o certificado. Uma pausa do projeto (503 `DEPLOYMENT_PAUSED`), uma queda da Vercel ou um certificado inválido falham a verificação, e a política "PartyX: saúde indisponível (partyx.com.br)" avisa por e-mail quando a falha passa de 10 minutos em duas regiões ou mais.

## Como voltar ao Firebase

### Volta planejada (meta): quando o Firebase puder emitir o certificado

Enquanto o DNS aponta para a Vercel, o Firebase não recebe o tráfego e não emite certificado pelo caminho normal. Ele oferece emissão antecipada para troca sem queda: o campo `cert.verification` do domínio passa a mostrar um registro TXT (`_acme-challenge...`) para pôr no DNS. A Vercel valida pelo HTTP, então esse TXT não atrapalha.

1. Depois que o Registro.br retirar a zona antiga dos `a.auto`/`b.auto`, consultar o domínio na API do Firebase (`customDomains`) e, se aparecer `cert.verification.dns`, passar o registro ao responsável para pôr no Registro.br.
2. Esperar `cert.state = CERT_ACTIVE` no Firebase.
3. Responsável, no Registro.br: A da raiz para `199.36.158.100` e CNAME do `www` para `partyx-producao.web.app`. Manter o TXT `hosting-site=partyx-producao`. TTL de 1 hora: a troca se completa em até 1 hora.
4. **Nada muda no Cloud Run:** o Firebase também entrega `X-Forwarded-Host: partyx.com.br` e a mesma cadeia de IP, então a revisão com `PUBLIC_BASE_URL=https://partyx.com.br` continua valendo; a rotina diária e a verificação de saúde também.
5. Conferir `/api/health/origem` (intermediário `firebase`) e o cadeado; depois, com OK, retirar os domínios e o projeto da Vercel: `npx vercel@64.0.2 domains rm partyx.com.br --scope zanondeandrades-projects`, o mesmo para o `www`, e `npx vercel@64.0.2 project rm partyx-dominio --scope zanondeandrades-projects`.

### Volta de emergência: a Vercel parou e o Firebase ainda não tem certificado

O domínio fica fora do ar até o Firebase emitir; o site volta pelo `https://partyx-producao.web.app`.

1. Cloud Run, voltar para a revisão que espera o `web.app`: `PROJECT=partyx-producao REVISAO=partyx-00003-xeq ./infra/producao/deploy.sh rollback` (sempre com `REVISAO` explícita; sem ela o script escolhe a revisão mais nova que não está no ar).
2. Rotina diária com o cabeçalho do `web.app`: `CLOUDSDK_CORE_PROJECT=partyx-producao gcloud scheduler jobs update http partyx-varredura-diaria --location=southamerica-east1 --update-headers=X-Forwarded-Host=partyx-producao.web.app`, e executar uma vez (`gcloud scheduler jobs run partyx-varredura-diaria --location=southamerica-east1`), esperando 200 no log.
3. DNS como no passo 3 da volta planejada (o domínio aponta para o Firebase, ainda sem certificado).
4. Avisar quem estiver usando o domínio que o endereço provisório é `https://partyx-producao.web.app`. O webhook do Mercado Pago está cadastrado no domínio: enquanto o domínio não tiver certificado, as notificações falham e a conciliação pelo Cloud Tasks e pela rotina diária confirma os pagamentos.

## Pendência registrada: consultas automáticas com a aba escondida

Registrada pelo responsável em 14/10/2026, para fazer depois: pausar as consultas a cada 4 s quando a aba estiver escondida (`document.visibilityState`), no contador da portaria (`src/site/gatePages.tsx`, hoje consulta mesmo escondida), no painel do admin (`src/site/adminPages.tsx`) e na espera do Pix (`src/site/checkoutPages.tsx`). Reduz os CDN Requests na Vercel e a carga no Cloud Run; voltar a consultar na hora em que a aba aparecer.

## Pendência registrada: cabeçalho secreto entre a Vercel e o Cloud Run

Não implementado agora, por decisão do responsável (14/10/2026): a Vercel é temporária e a proteção fica no nível atual. Hoje, quem chama o `run.app` direto pode forjar o `X-Forwarded-Host` (passando pela barreira) e o `X-Forwarded-For` (contornando os limites por IP; os limites globais seguem valendo). A Vercel permite gravar um cabeçalho secreto em todo pedido repassado (`routes` com `transforms` do tipo `request.headers`, valor numa variável de ambiente sigilosa), e o servidor passaria a exigi-lo. Reavaliar quando a arquitetura definitiva do domínio for decidida; o Firebase Hosting não consegue enviar esse cabeçalho.
