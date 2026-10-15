# Publicação em produção: transições do site e capa desfocada (15/10/2026)

Pedido do responsável (Arthur): transições suaves no site (`transicoes-2026-10-15.md`), "fluxo de sempre, com meu OK antes da virada". O fluxo foi até a candidata, com a migração já aplicada; o OK da virada veio às 14:40 UTC: "coloque em produção".

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15e`, commit `f3c8004`; `env.prod.yaml` e `conteudo-legal/` iguais aos da `release-2026-10-15d` |
| Migração | `0015_capa_desfocada` (só expande: `events.banner_placeholder` anulável, com a regra `events_banner_placeholder_format`; reversão em `drizzle/rollback/0015_capa_desfocada.down.sql`, perde só as miniaturas) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15e-f3c8004` (Cloud Build `50bf8e75`, 1 min 46 s) |
| Revisão no ar | `partyx-00024-kuy`, 100% |
| Revisão anterior | `partyx-00022-jez` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 13:57 a 13:59 | `deploy.sh build` da `release-2026-10-15e` | imagem pronta |
| 14:00 | Backup sob demanda | execução `partyx-backup-74ptg` ok; cópia `partyx-20261015T140002Z.dump` conferida por `check-backup.sh` |
| 14:00 | `deploy.sh migrate` | execução `partyx-migrate-rtflk` ok. Conferido só lendo: 16 migrações; `banner_placeholder` (texto, anulável) e a regra; o evento publicado de produção com capa e sem miniatura (capa anterior). A `00022-jez` seguiu respondendo pelo domínio |
| 14:01 | `deploy.sh candidata` | revisão `partyx-00024-kuy` sem tráfego; teste rápido 14 de 14. Pela candidata a 360 e 1280 px: entradas animadas na página do `teste01-2` (o quadro de ingressos parado no celular), capa revelada, botões do cabeçalho sem animação, nada sobrando nos elementos, sem rolagem lateral e sem erro; `bannerPlaceholder` nulo na API |
| 14:01 a 14:40 | Espera do OK da virada | candidata parada, sem tráfego |
| 14:40 | `deploy.sh virar` | 100% na `partyx-00024-kuy`; teste rápido 14 de 14 |
| 14:41 | Bateria por HTTPS em `partyx.com.br` | 21 de 21; pelo domínio, o pacote novo (`index-B3TtqruV.js`), entradas, capa, vitrine e lista sem rolagem lateral e sem erro |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00024-kuy`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00022-jez ./infra/producao/deploy.sh rollback`.
- A `00022-jez` funciona com o banco já migrado (a 0015 só acrescenta uma coluna que ela não lê): volta o movimento anterior, com a biblioteca `motion`.

## Para a PartyX saber

- As páginas entram com um desfoque curto que fica nítido; quem pediu "reduzir movimento" no aparelho não vê animação nenhuma.
- O `teste01-2` foi enviado antes desta versão e não tem a miniatura da capa: a capa aparece esmaecendo sobre o fundo escuro. Ao reenviar a capa pelo painel, ela ganha a miniatura (ou pelo `npm run banners:versoes`, com `--executar --producao-confirmado`, que não foi rodado).
