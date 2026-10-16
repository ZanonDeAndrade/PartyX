# Publicação em produção: página do evento sem a frase acima do título (15/10/2026)

> Atualização de 16/10/2026 00:57 UTC: a `partyx-00034-hug` (`release-2026-10-15j`, sem meia-entrada e busca só no cabeçalho, `publicacao-producao-2026-10-15j.md`) substituiu a `00032-bag`, que fica como retorno.

Pedido do responsável (Arthur): tirar a frase acima do título ("Falta pouco para") da página do evento e da prévia do painel, tirar o campo "Frase do cronômetro" do cadastro e da edição, e centrar o título no bloco da data. Registro do ajuste: atualização no topo de `cronometro-evento-2026-10-15.md`. Publicação autorizada no próprio pedido: "Ao terminar, coloque em produção já. Não precisa do meu OK para essa publicação, pois é um ajuste pequeno".

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15i`, commit `f194c7f`; `env.prod.yaml`, `conteudo-legal/` e `drizzle/` iguais aos da `release-2026-10-15h` |
| Migração | nenhuma; a coluna `events.countdown_phrase` fica sem uso até uma limpeza futura |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15i-f194c7f` (Cloud Build `c560d10a`, 1 min 43 s) |
| Revisão no ar | `partyx-00032-bag`, 100% |
| Revisão anterior | `partyx-00030-jos` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 23:37 a 23:40 | `deploy.sh build` da `release-2026-10-15i` | imagem pronta |
| 23:40 | Backup sob demanda | execução `partyx-backup-tdp59` ok; cópia `partyx-20261015T234038Z.dump` conferida por `check-backup.sh` |
| 23:41 | `deploy.sh candidata` | revisão `partyx-00032-bag` sem tráfego; teste rápido 15 de 15 |
| 23:42 | Página do `teste01-2` pela candidata, 360 e 1280 px | sem a frase; centro do título no centro do bloco da data (diferença 0,0 px; duas linhas a 360 px, uma a 1280 px); cronômetro em contagem; sem erro e sem rolagem lateral |
| 23:42 | `deploy.sh virar` | 100% na `partyx-00032-bag`; teste rápido 15 de 15 |
| 23:43 | Bateria por HTTPS em `partyx.com.br` | 22 de 22; a mesma conferência da página pelo domínio, com o pacote novo (`index-ChQLzxnb.js`) |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00032-bag`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00030-jos ./infra/producao/deploy.sh rollback`.
- A `00030-jos` usa o mesmo banco: volta a frase acima do título (a padrão, porque a coluna continua lá) e o campo no painel.
