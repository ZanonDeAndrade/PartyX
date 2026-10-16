# Publicação em produção: sem meia-entrada e busca só no cabeçalho (15/10/2026)

> Atualização de 16/10/2026 03:30 UTC: a `partyx-00037-zap` (`release-2026-10-16b`, campos de data no celular e painel sem meia-entrada, `publicacao-producao-2026-10-16.md`) substituiu a `00034-hug`, que fica como retorno.

Pedido do responsável (Arthur): "coloque em produção essas últimas atualizações", que valeu como o OK da virada. Entram as duas mudanças prontas no local:

- **Sem meia-entrada** (`e3b4fe6`, D-06): o documento sai do menu de Documentos e da página do evento; `/meia-entrada` vai para `/termos-de-uso` com 301; a API do documento dá 404. Registro: `sem-meia-entrada-2026-10-16.md`.
- **Busca só no cabeçalho** (`8486ce6`, D-89): a vitrine e o início sem o formulário "Nome do evento", "Data" e "Buscar"; no celular a lupa abre o campo; a data de links antigos é ignorada. Desvio do RF-22 na parte da data, com a aprovação da PartyX a registrar. Registro: `busca-so-no-cabecalho-2026-10-16.md`.

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15j`, commit `8486ce6`; `env.prod.yaml`, `conteudo-legal/` e `drizzle/` iguais aos da `release-2026-10-15i` |
| Migração | nenhuma |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15j-8486ce6` (Cloud Build `420b4c0f`, 1 min 54 s) |
| Revisão no ar | `partyx-00034-hug`, 100% |
| Revisão anterior | `partyx-00032-bag` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 16/10/2026; 15/10 à noite em São Paulo)

| Hora | Passo | Resultado |
|---|---|---|
| 00:50 a 00:52 | `deploy.sh build` da `release-2026-10-15j` | imagem pronta |
| 00:52 | Backup sob demanda | execução `partyx-backup-7mhfb` ok; cópia `partyx-20261016T005226Z.dump` conferida por `check-backup.sh` |
| 00:53 | `deploy.sh candidata` | revisão `partyx-00034-hug` sem tráfego; teste rápido 15 de 15 |
| 00:54 a 00:57 | Conferência pela candidata (com `X-Forwarded-Host: partyx.com.br`) | `/meia-entrada` e `/meia-entrada/` com 301 para `/termos-de-uso`; API da meia-entrada 404; `/api/public/events` com `?date=ontem` igual à lista sem filtro; `?q=voltando` e `?q=VOLTANDO&date=2030-01-01` acham o `teste01-2`; busca inexistente vazia. No navegador, a 360 e 1280 px: vitrine e início sem formulário, busca pelo cabeçalho (pela lupa no celular) com e sem resultado, Documentos e página do evento sem link de meia-entrada, sem rolagem lateral e sem erro (20 de 20) |
| 00:57 | `deploy.sh virar` | 100% na `partyx-00034-hug`; teste rápido 15 de 15 |
| 00:59 | Bateria por HTTPS em `partyx.com.br` | 28 de 28 (as 22 de antes e 6 novas: 301 da meia-entrada, 404 da API, data ignorada, busca vazia, `/eventos` com e sem busca) |
| 01:00 | A mesma conferência no navegador pelo domínio | 20 de 20, com o pacote novo (`index-BnAdeGwd.js`, igual ao build local testado) |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00034-hug`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00032-bag ./infra/producao/deploy.sh rollback`.
- A `00032-bag` usa o mesmo banco: volta o documento de meia-entrada (como aviso de homologação, porque não há texto oficial dele) e o formulário de busca com a data.
