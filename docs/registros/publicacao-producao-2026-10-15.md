# Publicação em produção: excluir evento sem uso e arquivar (15/10/2026)

Pedido do responsável (Arthur): opção de excluir evento em `/admin/eventos`, publicada no fluxo de sempre, com OK antes da virada. Regras e decisões: `excluir-arquivar-evento-2026-10-15.md`. A "correção do texto longo do 'Sobre o evento'" já estava no ar desde a `release-2026-10-14e` (confirmado pelo responsável). OK da virada: "a parte de excluir o evento esta em produção? se não estiver, coloque" (o relatório da candidata pedia junto o OK do `banners-iam`, sem o qual a exclusão não apaga as imagens).

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15`, commit `3acdea3`; `env.prod.yaml` e `conteudo-legal/` iguais aos da `release-2026-10-14f` |
| Migração | `0011_excluir_e_arquivar_evento` (só expande: coluna `events.archived_at`, gatilhos que recusam apagar evento com uso, DELETE em `events` e `ticket_types` para o `partyx_app`; reversão em `drizzle/rollback/0011_excluir_e_arquivar_evento.down.sql`, recusa se houver arquivado) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15-3acdea3` (Cloud Build `e3896599`, 1 min 47 s) |
| Permissão nova | papel `projects/partyx-producao/roles/partyxBannerCleanup` (`storage.objects.list`, `storage.objects.delete`), ligado só ao bucket `partyx-producao-banners` para `partyx-app` (`deploy.sh banners-iam`) |
| Revisão no ar | `partyx-00016-say`, 100% |
| Revisão anterior | `partyx-00014-bax` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| por volta de 02:20 | Conferência só leitura do `teste01` (papel `partyx_backup`) | único evento; 0 pedidos, ingressos, leituras, aceites, reservas e eventos de pagamento; pode ser excluído |
| 02:47 a 02:49 | `deploy.sh build` da `release-2026-10-15` | imagem pronta |
| 02:49 | Backup sob demanda (`gcloud run jobs execute partyx-backup --wait`) | execução `partyx-backup-whm9n` ok; cópia `partyx-20261015T024908Z.dump` conferida por `check-backup.sh` |
| 02:49 | `deploy.sh migrate` | execução `partyx-migrate-w2wm2` ok. Conferido só lendo: 12 migrações, coluna `archived_at`, gatilhos `events_delete_only_unused` e `ticket_types_delete_only_unused`, `partyx_app` com DELETE em `events` e `ticket_types` e sem DELETE em `orders`. A `00014-bax` seguiu respondendo com o banco ok. Havia 2 eventos (o segundo criado depois das 02:20), nenhum arquivado |
| 02:50 a 02:51 | `deploy.sh candidata` | revisão `partyx-00016-say` sem tráfego; teste rápido 14 de 14; o pedaço do painel (`admin-DyTGkJ5C.js`) servido pela candidata traz a tela nova |
| 02:51 | Pedido pelo domínio de `/assets/admin-DyTGkJ5C.js` antes da virada | a revisão antiga devolveu a página HTML com `cache-control: no-cache`; a Vercel não guardou (`x-vercel-cache: MISS` nas repetições), então nada ficou envenenado |
| 02:55 a 02:56 | `deploy.sh banners-iam` | papel criado; a ligação ao bucket falhou na primeira vez ("não existe na hierarquia": propagação do papel recém-criado) e passou na repetição das 02:56:26 |
| 02:56 | `deploy.sh virar` | 100% na `partyx-00016-say`; teste rápido 14 de 14 |
| 02:57 | Bateria por HTTPS em `partyx.com.br` | 21 de 21; `admin-DyTGkJ5C.js` pelo domínio é JavaScript com a tela nova; `/api/admin/events/:id/removal` sem login 401; página pública do `teste01` 200 |

Sem mudança na Vercel, nas rotinas e na verificação de saúde.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00016-say`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00014-bax ./infra/producao/deploy.sh rollback`.
- A `00014-bax` funciona com o banco já migrado (ficou no ar com a 0011 aplicada das 02:49 às 02:56): não conhece `archived_at`, então um evento arquivado voltaria a aparecer no site enquanto ela estiver no ar. Desarquive antes de voltar, ou volte e reverta a 0011 (a reversão recusa com arquivado).
- Eventos excluídos não voltam com o rollback (ficam só na trilha `evento.excluir`). A cópia `partyx-20261015T024908Z.dump` é de antes de qualquer exclusão.
- O papel `partyxBannerCleanup` pode ficar; para tirar: `gcloud storage buckets remove-iam-policy-binding gs://partyx-producao-banners --member=serviceAccount:partyx-app@partyx-producao.iam.gserviceaccount.com --role=projects/partyx-producao/roles/partyxBannerCleanup`.

## Próximo passo do responsável

- Excluir o evento "Teste01" pelo painel (`/admin/eventos`, botão "Excluir", nome digitado). Depois, conferir a trilha `evento.excluir` e a pasta `events/<id>/` vazia no bucket (só leitura).

## Pendente

- Premissas de `excluir-arquivar-evento-2026-10-15.md` a confirmar com a PartyX (portaria do arquivado, pagamento já iniciado, destaque).
- O que já estava pendente segue em `publicacao-producao-2026-10-14d.md`, `-14e.md` e `-14f.md`.
