# Publicação em produção: lotes por tipo de ingresso (15/10/2026)

Pedido do responsável (Arthur): lotes por tipo de ingresso (D-86, mudança de escopo, `lotes-por-tipo-2026-10-15.md`); "Ao terminar e estar correto, faça commit e deploy em produção". Plano e migração mostrados antes de começar; o responsável escolheu seguir como mudança de escopo e dividir a compra entre lotes.

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15c`, commit `b39174a`; `env.prod.yaml` e `conteudo-legal/` iguais aos da `release-2026-10-15b` |
| Migração | `0013_lotes_por_tipo` (só expande; dados: cada tipo vira "Lote único"; reversão em `drizzle/rollback/0013_lotes_por_tipo.down.sql`, recusa com mais de um lote) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15c-b39174a` (Cloud Build `90e79984`, 1 min 40 s) |
| Revisão no ar | `partyx-00020-kug`, 100% |
| Revisão anterior | `partyx-00018-guj` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 04:06 a 04:08 | `deploy.sh build` da `release-2026-10-15c` | imagem pronta |
| 04:08 | Backup sob demanda | execução `partyx-backup-4gbt4` ok; cópia `partyx-20261015T040832Z.dump` conferida por `check-backup.sh` |
| 04:08 a 04:09 | `deploy.sh migrate` | execução `partyx-migrate-8qf2n` ok. Conferido só lendo: 14 migrações; dois "Lote único" à venda, iguais aos tipos (Camarote do `teste01`, R$ 150,00 e 500 unidades; Pista do `teste01-2`, R$ 140,00 e 150 unidades); nenhum item de pedido nem ingresso para converter; `partyx_app` com DELETE em `ticket_lots` e sem DELETE em `order_item_lots`. A `00018-guj` seguiu respondendo com o banco ok |
| 04:09 a 04:10 | `deploy.sh candidata` | revisão `partyx-00020-kug` sem tráfego; teste rápido 14 de 14; o Camarote do `teste01` pela candidata igual a antes (R$ 150,00, sem nome de lote, à venda) |
| 04:10 | `deploy.sh virar` | 100% na `partyx-00020-kug`; teste rápido 14 de 14 |
| 04:10 | Bateria por HTTPS em `partyx.com.br` | 21 de 21; o `teste01` pelo domínio igual a antes |

Sem mudança na Vercel, nas rotinas (a rotina diária passa a acertar as viradas de lote por data), na verificação de saúde e nas permissões da nuvem.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00020-kug`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00018-guj ./infra/producao/deploy.sh rollback`.
- A `00018-guj` funciona com o banco já migrado: não lê lotes e vende pelo preço do tipo, que a versão nova mantém igual ao do lote à venda. Enquanto ela estiver no ar, não há virada nem divisão por lote, e as vendas dela não somam no vendido de cada lote (o teto do tipo continua valendo). Reverter a 0013 só com um lote por tipo (a reversão recusa).

## Pendente

- Aprovação da PartyX para a mudança de escopo (D-86) e as premissas de `lotes-por-tipo-2026-10-15.md`.
- O `CLAUDE.md` ainda lista "lotes automáticos" entre os itens excluídos; o responsável decide se o atualiza.
- O que já estava pendente segue nos registros anteriores.
