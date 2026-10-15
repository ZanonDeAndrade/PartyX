# Publicação em produção: transições mais suaves (15/10/2026)

> Atualização de 15/10/2026 18:59 UTC: a `partyx-00028-vax` (`release-2026-10-15g`, seletor de cor embutido no painel, `publicacao-producao-2026-10-15g.md`) substituiu a `00026-rim`, que fica como retorno.

Pedido do responsável (Arthur): transições mais suaves ao abrir o site e ao entrar num evento (`transicoes-suaves-2026-10-15.md`), "OK antes de publicar". O OK veio às 17:35 UTC: "pode comitar e fazer deploy". O commit já estava feito; o fluxo foi direto até a virada.

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15f`, commit `915f6c6`; `env.prod.yaml`, `conteudo-legal/` e `drizzle/` iguais aos da `release-2026-10-15e` |
| Migração | nenhuma |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15f-915f6c6` (Cloud Build `e9b4c015`, 1 min 51 s) |
| Revisão no ar | `partyx-00026-rim`, 100% |
| Revisão anterior | `partyx-00024-kuy` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 17:35 a 17:38 | `deploy.sh build` da `release-2026-10-15f` | imagem pronta |
| 17:38 | Backup sob demanda | execução `partyx-backup-9l292` ok; cópia `partyx-20261015T173816Z.dump` conferida por `check-backup.sh` |
| 17:39 | `deploy.sh candidata` | revisão `partyx-00026-rim` sem tráfego; teste rápido 14 de 14 |
| 17:39 a 17:40 | Conferência pela candidata, no navegador, a 360 e 1280 px | página do `teste01-2`: fundo escuro desde o HTML, capa nítida **com o degradê da base de volta**, nada animando nem `will-change` sobrando depois da entrada, sem rolagem lateral; lista sem rolagem lateral; tocar no cartão abre o evento por View Transition (grupo, antiga e nova); com "reduzir movimento", só opacidade (`blur(0)` e `translateY(0)` nos quadros-chave); pacote `index-RqtmdcXt.js` |
| 17:40 | `deploy.sh virar` | 100% na `partyx-00026-rim`; teste rápido 14 de 14 |
| 17:41 | Bateria por HTTPS em `partyx.com.br` | 21 de 21 |
| 17:41 a 17:42 | A mesma conferência pelo domínio | igual à da candidata. Na primeira abertura a 360 px a capa ainda carregava aos 2,5 s (primeiro acesso à revisão nova); em três aberturas seguidas ficou nítida entre 1,0 e 2,0 s, com a imagem de 1080 px chegando em 0,7 a 0,9 s; a repetição completa passou |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem.

Falsos alarmes do roteiro de conferência, sem relação com esta versão: o 401 de `/api/auth/me` (consulta da sessão sem login, igual na versão anterior) e, a 1280 px, a paralaxe da capa, que é uma animação presa à rolagem e por isso aparece sempre "em andamento".

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00026-rim`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00024-kuy ./infra/producao/deploy.sh rollback`.
- A `00024-kuy` usa o mesmo banco (sem migração): volta a primeira versão das transições, **sem o degradê da base da capa**.

## Para a PartyX saber

- Ao abrir o site e ao entrar num evento, o movimento ficou mais lento e mais suave; tocar no cartão de um evento faz a imagem crescer até virar a capa da página.
- A capa do evento e o destaque da página inicial voltaram a ter o degradê escuro na base (tinha sumido na publicação das 14:40).
- O `teste01-2` continua sem a miniatura da capa (foi enviado antes da versão das 14:40): a capa aparece esmaecendo sobre o fundo escuro. Reenviar a capa pelo painel cria a miniatura; o preenchimento pelo `npm run banners:versoes`, com `--executar --producao-confirmado`, não foi rodado.
