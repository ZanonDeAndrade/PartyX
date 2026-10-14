# Vercel como ponte temporária para o domínio partyx.com.br

Decidido pelo responsável em 14/10/2026. Motivo: o certificado do Firebase Hosting para `partyx.com.br` ficou preso porque a zona antiga continua servida pelos servidores `a.auto.dns.br` e `b.auto.dns.br` do Registro.br (`diagnostico-dominio-2026-10-14.md`). Enquanto o Registro.br não retira essa zona, a Vercel fica na frente do domínio só para emitir o certificado e repassar os pedidos.

## Arquitetura

visitante → `partyx.com.br` → Vercel (certificado Let's Encrypt, rewrite externo) → Cloud Run `partyx` (southamerica-east1) → Neon

- **Na Vercel fica só a configuração de rewrite** (`infra/vercel/vercel.json`). O back-end, o banco, as rotinas e os segredos continuam inteiros no Google Cloud.
- Cache na Vercel só em `/assets/*` (arquivos com hash no nome, `immutable`); todo o resto vai sem cache.
- `www.partyx.com.br` redireciona para a raiz com 308, configurado no projeto da Vercel.
- O Firebase Hosting continua configurado (site, rewrites, domínios e o TXT `hosting-site=partyx-producao`), para a volta.

## Plano da Vercel e prazos

| Item | Valor |
|---|---|
| Plano | teste gratuito do Pro, **sem forma de pagamento cadastrada** (o Hobby proíbe uso comercial) |
| Início | na criação do time na Vercel (previsto para 14/10/2026) |
| Fim | 14 dias depois: **por volta de 28/10/2026** |
| Lembrete | **25/10/2026**, 3 dias antes do fim |
| Sem forma de pagamento | ao fim do teste o time volta para Hobby e não há cobrança; o Hobby não serve para este uso. Até lá, decidir entre pagar o Pro (US$ 20 por mês, 1 membro) ou voltar ao Firebase |
| Limites do teste que importam | 50 domínios por projeto; o teste só pausa por uso de funções, e este projeto não usa função nenhuma |

Confirmar a data exata de fim no painel da Vercel (Settings > Billing) assim que o time for criado e corrigir esta tabela.

## O que o servidor espera atrás da Vercel

| Cabeçalho que chega ao Cloud Run | Valor esperado | Uso no servidor |
|---|---|---|
| `Host` | o endereço `run.app` do serviço | barreira de Host (`server/src/app.ts`) |
| `X-Forwarded-Host` | `partyx.com.br` | barreira de Host: precisa ser igual ao host do `PUBLIC_BASE_URL` |
| `X-Forwarded-For` | `visitante, IP da Vercel` (a Vercel regrava com o IP do visitante; o Google acrescenta o dela) | IP do visitante com `TRUSTED_PROXY_HOPS=2`, o mesmo valor medido atrás do Firebase |
| `X-Vercel-Id` | identificador do pedido na Vercel | só diagnóstico (`/api/health/origem`) |

Conferência: `GET https://partyx.com.br/api/health/origem` devolve o host recebido, o intermediário (`vercel` ou `firebase`), o IP do visitante mascarado (`177.86.x.x`) e grava a mesma linha no log ("origem do pedido"). Direto no `run.app`, sem o domínio, responde 403. O teste rápido do `deploy.sh` confere essa cadeia.

## Pendência registrada: cabeçalho secreto entre a Vercel e o Cloud Run

Não implementado agora, por decisão do responsável (14/10/2026): a Vercel é temporária e a proteção fica no nível atual. Hoje, quem chama o `run.app` direto pode forjar o `X-Forwarded-Host` (passando pela barreira) e o `X-Forwarded-For` (contornando os limites por IP; os limites globais seguem valendo). A Vercel permite gravar um cabeçalho secreto em todo pedido repassado (`routes` com `transforms` do tipo `request.headers`, valor numa variável de ambiente sigilosa), e o servidor passaria a exigi-lo. Reavaliar quando a arquitetura definitiva do domínio for decidida; o Firebase Hosting não consegue enviar esse cabeçalho.

## Como voltar

Preenchido nos blocos seguintes da publicação (DNS de volta ao Firebase, revisão anterior e rotina diária).
