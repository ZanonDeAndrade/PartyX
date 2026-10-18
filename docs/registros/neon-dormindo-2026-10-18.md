# Neon dormindo em produção: conferência do código, verificação de saúde e alerta de 5xx (18/10/2026)

Decisões do responsável (Arthur), 18/10/2026:

- **Item 2, aprovado:** a verificação `partyx-saude-dominio` passa de `/api/health/ready` (consulta o banco) para `/api/health` (sem banco), para o Neon voltar a dormir depois de 5 minutos sem uso. **Condição:** antes de aplicar, confirmar no código que o site aguenta o Neon dormir; se faltar algo, mostrar a correção primeiro.
- **Item 3, aprovado:** alerta de respostas 5xx do Cloud Run, no mesmo canal de e-mail dos outros alertas. O comando final é mostrado ao responsável antes de aplicar.
- **Item 4:** teste real depois de pelo menos 10 minutos sem uso (roteiro abaixo).
- **Recusado:** job do Cloud Scheduler a cada 6 horas.

**Estado em 18/10/2026, 21:45 UTC:**

- Correção do pool aprovada pelo responsável e no commit local `184da3c`; vai ao ar na release que abre as vendas (uma candidata só).
- **Item 3 aplicado** (OK do responsável ao comando abaixo): política `projects/partyx-producao/alertPolicies/6717708805677157372`, criada às 21:42:56 UTC e conferida com `describe` (ligada, canal `14538766248334527110`, filtro, maior que 0 em 5 minutos, fechamento em 24 h). Produção passa a ter 17 políticas.
- **Itens 2 e 4: só depois** que a release com a correção estiver no ar e a primeira compra tiver dado certo (decisão do responsável). Nessa hora, mostrar o comando do item 2 de novo e esperar o OK.
- Rollback para uma revisão sem a correção (a `partyx-00040-dow` e anteriores): se a verificação já estiver em `/api/health`, ela volta para `/api/health/ready` **antes** (README-DEPLOY, seção 6; `docs/operacao/runbooks/rollback.md`).

## Por que o caminho nunca rodou em produção

O compute do Neon de produção (`ep-wispy-band-b6v5koh6`, ramo `main`) está ativo desde 14/10/2026 15:14:14 UTC e nunca dormiu (`suspended_at` vazio; espera padrão de 5 minutos, `suspend_timeout_seconds: 0`). A verificação de saúde chama `/api/health/ready` a cada 5 minutos de 3 regiões, e o `select 1` de cada chamada mantém o banco acordado.

Segundo o Neon, conexões abertas e paradas **não** impedem o banco de dormir, e dormir **corta** as conexões existentes; ao acordar, a conexão seguinte religa o banco ([blog do Neon sobre o desligamento automático](https://neon.com/blog/using-neons-auto-suspend-with-long-running-applications)). A reativação leva "algumas centenas de milissegundos" ([documentação do Neon](https://neon.com/docs/introduction/scale-to-zero)).

## Conferência do código

Versão no ar: `release-2026-10-16d` (`9a1cd31`), revisão `partyx-00040-dow`. Pool em `server/src/db/client.ts`; `pg` 8.23.1.

| Ponto | O que o código no ar faz | Resultado |
|---|---|---|
| 1. Evento `error` do pool | **Não há ouvinte.** Quando o servidor encerra uma conexão parada, o `pg-pool` (`makeIdleListener`) tira a conexão do pool e emite `error` no próprio pool; sem ouvinte, o Node lança a exceção e **o processo cai** (o Cloud Run sobe outra instância, mas as requisições em andamento nessa instância se perdem) | **faltava**: correção abaixo |
| 2. Conexões paradas fecham antes de 5 minutos | `idleTimeoutMillis: 30_000`: a conexão parada sai do pool em 30 s | atendido no código. Ressalva: o serviço só tem CPU durante requisições (`run.googleapis.com/cpu-throttling: true`), então o prazo de 30 s pode correr com atraso enquanto ninguém chama. Com a verificação em `/api/health` (um pedido a cada 2 a 2,5 minutos), a instância recebe CPU e fecha a conexão antes de o Neon dormir. Se uma conexão ainda estiver aberta quando ele dormir, o ponto 1 corrigido cobre o encerramento |
| 3. Primeira consulta depois de o banco acordar | Com o pool vazio, a consulta abre uma conexão nova pelo pooler e o Neon acorda durante a conexão. Espera máxima: `connectionTimeoutMillis: 5_000` | atendido no código, se o banco acordar em menos de 5 s (o Neon fala em centenas de milissegundos). Se passar disso, aquela requisição falha com 500 (a página do evento, `GET /eventos/:slug`, lança o erro do banco) e a seguinte já encontra o banco acordado. O item 4 mede |

Risco que sobra, pequeno: uma conexão cortada pelo Neon enquanto o processo ainda não percebeu (o aviso está na fila de eventos) pode ser entregue a uma requisição, que falha uma vez com 500. Só acontece se a conexão ficou parada mais de 5 minutos. A consulta **não** é repetida automaticamente: repetir dentro de uma transação com `SELECT ... FOR UPDATE` não é seguro em geral. O alerta de 5xx (item 3) mostra se acontecer.

Partida de uma instância nova com o banco dormindo: a conferência da marca de ambiente (`server/src/index.ts`) acorda o banco. Se a conexão passar de 5 s, o servidor registra "banco de outro ambiente: o servidor não vai subir" (mensagem enganosa nesse caso) e sai; o Cloud Run tenta de novo. Não mudado agora.

Logs de produção de 14 a 18/10/2026: nenhuma queda do processo. Os reinícios são as publicações e uma segunda instância em 16/10 (13:02 a 13:06 UTC), encerrada normalmente (`encerrando`, SIGTERM).

## Correção (pronta; sem commit, sem publicação)

`server/src/db/client.ts`: ouvinte do evento `error` no pool. A conexão já foi descartada pelo `pg-pool`; o ouvinte só registra um aviso, com o nome e o código do erro (nada de URL, usuário ou consulta), e a próxima consulta abre outra conexão.

```ts
pool.on('error', error => {
  logger.warn('conexão parada com o banco encerrada; a próxima consulta abre outra', {
    error: error.name,
    code: (error as { code?: string }).code ?? null,
  });
});
```

`server/src/db/client.integration.test.ts`: abre uma conexão, deixa-a parada no pool, encerra-a pelo servidor (`pg_terminate_backend`, como o Neon ao dormir) e confere que não há exceção sem tratamento, que o aviso sai no log e que a consulta seguinte funciona com uma conexão nova.

| Comando (18/10/2026, com a correção no diretório de trabalho) | Resultado |
|---|---|
| `npm run lint` | 0 erros (avisos antigos de `src/logic` e `server/src/exports/csv.ts`) |
| `npm run typecheck` | sem erros |
| `npm run test:db` (banco de teste configurado) | 73 arquivos, 1113 testes, e 1 arquivo, 4 testes; nenhum pulado |
| `npm run build` | sem erros |

Para valer em produção, a correção precisa de uma publicação nova (`deploy.sh`), com o OK do responsável. **O item 2 só é aplicado depois dela e da primeira compra que der certo.**

## Item 2: comando (aprovado; aplicar só depois da correção no ar e da primeira compra)

```bash
gcloud monitoring uptime update partyx-saude-dominio-0ER-9xn7ICU --project=partyx-producao \
  --path=/api/health --matcher-content='"status":"ok"' --matcher-type=contains-string
gcloud alpha monitoring policies update projects/partyx-producao/alertPolicies/13199506588677763966 \
  --documentation='O endereço público https://partyx.com.br/api/health falhou em duas ou mais regiões por 10 minutos. Ver docs/operacao/runbooks/indisponibilidade.md.' \
  --documentation-format=text/markdown
```

`/api/health` pelo domínio, conferido em 18/10/2026: 200 `{"status":"ok","env":"producao",...}` em 0,57 s. Retorno: o mesmo `update` com `--path=/api/health/ready --matcher-content='"database":"ok"'`. Junto, o padrão de `infra/operacao/uptime.sh` passa para `/api/health`.

O que muda: a verificação deixa de testar o banco. Uma falha do banco passa a aparecer pelo alerta de 5xx (quando alguém usa o site), pelo backup das 03:00 (alertas `backup_falhou` e "backup ausente") e pela rotina diária das 04:00. Sem visitas de madrugada, um banco fora do ar só é notado no backup.

## Item 3: comando (aplicado em 18/10/2026 21:42 UTC)

Canal: `projects/partyx-producao/notificationChannels/14538766248334527110` ("PartyX operação", o mesmo das outras 16 políticas). Abre um incidente quando o serviço `partyx` (todas as revisões) responde qualquer 5xx numa janela de 5 minutos; fecha sozinho em 24 h.

```bash
cat > "${TMPDIR:-/tmp}/policy-5xx.json" <<'JSON'
{"displayName":"PartyX: respostas 5xx (partyx)","combiner":"OR",
 "notificationChannels":["projects/partyx-producao/notificationChannels/14538766248334527110"],
 "documentation":{"content":"O serviço partyx respondeu com erro 5xx nos últimos 5 minutos. Ver os logs do serviço (severidade WARNING ou maior) e docs/operacao/runbooks/indisponibilidade.md.","mimeType":"text/markdown"},
 "conditions":[{"displayName":"5xx no Cloud Run partyx","conditionThreshold":{
   "filter":"metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"partyx\" AND metric.label.response_code_class=\"5xx\"",
   "comparison":"COMPARISON_GT","thresholdValue":0,"duration":"0s",
   "aggregations":[{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_SUM","crossSeriesReducer":"REDUCE_SUM","groupByFields":["resource.label.service_name"]}],
   "trigger":{"count":1}}}],
 "alertStrategy":{"autoClose":"86400s"}}
JSON
gcloud alpha monitoring policies create --project=partyx-producao --policy-from-file="${TMPDIR:-/tmp}/policy-5xx.json"
```

Conferido só lendo (API do Cloud Monitoring, mesmo filtro e mesma agregação, 11 a 18/10/2026): o alerta teria aberto **uma vez**, em 14/10 15:15 UTC (um 503 da `partyx-00003-xeq`, durante uma publicação). Limites: conta só o que chega ao Cloud Run (um erro da própria Vercel fica com a verificação de saúde); uma candidata que responda 5xx numa publicação também dispara.

## Item 4: teste real (depois do item 2)

1. **Banco dormindo de fato:** pelo menos 10 minutos sem uso; a API do Neon mostra o compute `ep-wispy-band-b6v5koh6` com `current_state: idle` e `suspended_at` preenchido; os logs de requisição do Cloud Run nos 10 minutos anteriores só têm `/api/health`.
2. **Página do evento pelo domínio:** `curl` em `https://partyx.com.br/eventos/teste01-2` (o HTML passa pela Vercel sem cache e consulta o banco), anotando código, tempo até o primeiro byte e tempo total; logo depois, a mesma página e `/api/public/events/teste01-2`, para comparar com o banco acordado.
3. **Navegador:** a mesma página aberta pelo domínio, com o tempo de carga e o código de cada chamada à API.
4. **Logs desde o início do teste:** severidade WARNING ou maior, contagem de 5xx, avisos "conexão parada com o banco encerrada" e o novo `started_at` do compute no Neon.
5. Resultado registrado neste arquivo.

**Resultado: pendente** (depende da correção publicada, da primeira compra e do item 2).
