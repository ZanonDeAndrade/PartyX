# Memória do servidor no Cloud Run (12/10/2026)

Homologação e produção rodam com **1 vCPU e 512 MiB** por instância, concorrência 80 e no máximo 3 instâncias. Os scripts de deploy
(`infra/homologacao/deploy.sh` e `infra/producao/deploy.sh`) passam `NODE_OPTIONS=--max-old-space-size=320`: o heap do V8 fica em
até 320 MB e sobra cerca de 190 MB para o que não é heap (o binário do Node, código compilado, buffers, o ICU das datas e a libvips
do banner). **Os scripts foram alterados, não executados:** a configuração vale a partir do próximo deploy de cada ambiente.

## O que foi achado na carga

Na carga local de 12/10/2026 (200 visitantes e 50 compras/min, `docs/evidencias/carga/`), o processo chegou a **1,35 GB de RSS**.

| Medida | Antes da correção | Depois, sem limite de heap | Depois, heap de 320 MB |
|---|---|---|---|
| RSS (pico) | 1346 MB | 375 MB | **269 MB** |
| Heap do V8 em uso (pico) | cerca de 120 MB | 191 MB | 92 MB |
| Erros e sobrevenda | 0 e não | 0 e não | 0 e não |

Como foi isolado:

1. `process.memoryUsage()` a cada 2 s e dois heap snapshots (aos 40 s e aos 160 s): o heap em uso ficava entre 40 e 120 MB e voltava
   a cerca de 47 MB depois de cada coleta. **Não havia vazamento de objetos JS** (nem nos mapas de limite em memória, nem em cache).
2. `/proc/<pid>/smaps` no fim da carga: 1076 MB no `[heap]` do glibc, ou seja, memória **nativa** alocada pela thread principal.
3. Carga por rota no servidor empacotado: `/api/health` (sem banco) não crescia; a página do evento e a API do evento cresciam cerca
   de 50 a 70 KB por requisição, até passar de 3 GB.
4. Causa: `server/src/domain/time.ts` criava um `Intl.DateTimeFormat` a cada data formatada (várias por evento, por requisição).
   Cada um aloca cerca de 25 KB do ICU fora do heap, que o V8 quase não contabiliza: o coletor não tem pressa e o RSS só cresce.
   Num teste isolado, 20 mil formatadores levaram o processo de 50 MB a 1,1 GB com 4 MB de heap; com o formatador reaproveitado,
   ficou em 60 MB.

Correção: formatadores criados uma vez por combinação de idioma e opções (no máximo 64), também na portaria
(`server/src/gate/service.ts`) e no formatador de preço da página inicial (`server/src/vitrine/homeHtml.ts`). Depois dela, as mesmas
rotas com o dobro de requisições ficaram em 310 MB estáveis.

Outros suspeitos conferidos:

| Suspeito | Resultado |
|---|---|
| Mapas de limite em memória (`auth/limits.ts`, `payments/notifications.ts`) | Limpam as chaves vencidas acima de 10 mil e 5 mil; cada chave guarda só os instantes da janela. Sem crescimento na carga |
| Página inicial | Um único resultado em memória, por 60 s |
| Conexões com o banco | `DB_POOL_MAX=5` por instância |
| PDF do ingresso e QR | 2000 PDFs de 2 ingressos, 4 ao mesmo tempo: o RSS sobe até cerca de 400 MB sem limite de heap e para (lixo de heap, não vazamento) |
| Banner (`sharp`, libvips) | 10 banners de 3200 x 1800: cerca de 200 MB nativos a mais. Agora sem cache de operações e com uma thread por imagem: cerca de 125 MB. Não vaza, mas é o maior pico pontual; só o administrador envia banner |
| Gateway fictício | Guarda as cobranças em memória sem teto. Só no ambiente local e na homologação com o fictício ligado; nunca em produção |

## Antes de uma abertura de vendas grande

Junto da revisão de capacidade (`README.md`, seção "Revisão de capacidade"), escolha **uma** das opções e registre em
`registro-rotinas.md`. Medir antes em homologação com o número de pessoas que o cliente informar.

### Opção 1 (recomendada): subir para 1 GiB durante a janela

Por novo deploy (exige as travas de produção, como qualquer deploy):

```bash
MEMORY=1Gi NODE_HEAP_MB=768 ./infra/producao/deploy.sh deploy     # durante a janela
./infra/producao/deploy.sh deploy                                  # depois: volta para 512Mi e heap de 320 MB
```

Ou só trocando a configuração da revisão em uso (nova revisão com a mesma imagem, sem build):

```bash
gcloud run services update partyx --project=<projeto> --region=southamerica-east1 \
  --memory=1Gi --update-env-vars=NODE_OPTIONS=--max-old-space-size=768
# depois:
gcloud run services update partyx --project=<projeto> --region=southamerica-east1 \
  --memory=512Mi --update-env-vars=NODE_OPTIONS=--max-old-space-size=320
```

Os scripts recusam `MEMORY` diferente de `512Mi` sem `NODE_HEAP_MB`, para o heap não ficar maior que a instância. Nenhum destes
comandos foi executado.

**Custo estimado** (preços de catálogo do Cloud Run, Tier 2, cobrança por requisição, consultados em 12/10/2026 pela API de catálogo
do Cloud Billing: memória R$ 0,000020758 por GiB-segundo, ativa ou ociosa; CPU ativa R$ 0,000199279 por vCPU-segundo). A CPU não
muda; a diferença é só 0,5 GiB a mais por instância, enquanto ela é cobrada:

| Cenário | GiB-s a mais | Custo a mais |
|---|---|---|
| Abertura de 3 h, as 3 instâncias atendendo o tempo todo (teto) | 16.200 | cerca de R$ 0,34 |
| Um dia inteiro com as 3 instâncias ocupadas (teto) | 129.600 | cerca de R$ 2,69 |
| `evento-on` (1 instância mínima ociosa) por 24 h com 1 GiB | 43.200 | cerca de R$ 0,90 |
| Esquecer 1 GiB **com** `evento-on` ligado o mês inteiro | 1.296.000 | cerca de R$ 27 (quase todo o orçamento de R$ 30) |

Antes de descontar a franquia mensal do Cloud Run (360 mil GiB-s por conta de faturamento, `README-DEPLOY.md`, seção 8), que
provavelmente cobre os três primeiros casos. O risco de custo real é esquecer de voltar: o `status` do script de produção mostra a
revisão; confira a memória nele depois da janela.

### Opção 2: limitar a concorrência por instância

```bash
CONCURRENCY=40 ./infra/producao/deploy.sh deploy
```

Cada instância atende menos requisições ao mesmo tempo, então usa menos memória de pico, mas o total cai junto: com o teto de 3
instâncias, 120 requisições simultâneas em vez de 240, e o excedente espera ou recebe erro. Subir `MAX_INSTANCES` para compensar
multiplica as conexões com o banco (`DB_POOL_MAX=5` por instância) e precisa caber no limite do plano do Neon. Por isso a opção 1 é a
recomendada: depois da correção, a memória mal depende da concorrência (o heap em uso ficou abaixo de 200 MB com 200 visitantes).

## O que não foi verificado

- Nada disso rodou no Cloud Run: o pico medido é do processo local, com PostgreSQL na mesma máquina. Em homologação, acompanhe
  "Utilização de memória do contêiner" no painel do serviço durante a carga, antes de uma abertura grande.
- A conta de custo usa o preço de catálogo; não inclui impostos nem confirma como a franquia é descontada no Tier 2.
