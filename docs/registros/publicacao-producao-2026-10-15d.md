# Publicação em produção: cor de destaque por evento (15/10/2026)

Pedido do responsável (Arthur): cor de destaque por evento (`cor-de-destaque-2026-10-15.md`), com plano e migração mostrados antes, testes, commit local e OK antes de publicar. OK dado nesta data: "ok, pode publicar em produção".

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15d`, commit `3936840`; `env.prod.yaml` e `conteudo-legal/` iguais aos da `release-2026-10-15c` |
| Migração | `0014_cor_de_destaque` (só expande: `events.accent_color` anulável, com a regra `events_accent_color_format`; reversão em `drizzle/rollback/0014_cor_de_destaque.down.sql`, perde só a cor escolhida) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15d-3936840` (Cloud Build `5d6837b7`, 2 min 4 s) |
| Revisão no ar | `partyx-00022-jez`, 100% |
| Revisão anterior | `partyx-00020-kug` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 12:29 a 12:31 | `deploy.sh build` da `release-2026-10-15d` | imagem pronta |
| 12:31 | Backup sob demanda | execução `partyx-backup-fvmcc` ok; cópia `partyx-20261015T123151Z.dump` conferida por `check-backup.sh` |
| 12:32 | `deploy.sh migrate` | execução `partyx-migrate-vpds2` ok. Conferido só lendo: 15 migrações; `accent_color` (texto, anulável) com a regra `^#[0-9A-F]{6}$`; o evento publicado de produção sem cor (continua roxo). A `00020-kug` seguiu respondendo pelo domínio |
| 12:32 a 12:33 | `deploy.sh candidata` | revisão `partyx-00022-jez` sem tráfego; teste rápido 14 de 14. Pela candidata: `accentColor` nulo no card e na página do `teste01-2`; página a 360 e 1280 px com o bloco da data e as linhas no roxo de sempre, sem rolagem lateral e sem erro (só o 401 esperado de `/api/auth/me` sem sessão, igual à revisão anterior); sugestão pela capa sem sessão recusada (403) |
| 12:34 | `deploy.sh virar` | 100% na `partyx-00022-jez`; teste rápido 14 de 14 |
| 12:34 | Bateria por HTTPS em `partyx.com.br` | 21 de 21; o `teste01-2` pelo domínio com `accentColor` nulo e o cronômetro |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem. A sugestão pela capa só lê o bucket dos banners, com a permissão que a conta do serviço já tinha.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00022-jez`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00020-kug ./infra/producao/deploy.sh rollback`.
- A `00020-kug` funciona com o banco já migrado (a 0014 só acrescenta uma coluna que ela não lê): todos os eventos voltam ao roxo, e uma cor escolhida enquanto isso fica guardada para quando a versão nova voltar.

## Para a PartyX saber

- Nada muda nos eventos que já existem: sem cor escolhida, a página continua roxa.
- Para escolher: painel, editar o evento, "Cor de destaque" (seletor, código hexadecimal ou "Sugerir pela imagem de capa", que usa a capa já salva), e salvar. "Voltar ao padrão" devolve o roxo. Se a cor não der leitura com texto branco nem preto, o painel avisa e mostra o tom ajustado.

## Pendente

- O que já estava pendente segue nos registros anteriores (administrador do Bernardo, aprovação da D-86).
