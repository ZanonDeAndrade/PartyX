# Publicação em produção: cronômetro na página do evento (15/10/2026)

Pedido do responsável (Arthur): cronômetro regressivo na página do evento; "Faça isso e após estar pronto, faça commit e faça deploy em produção". Regras e decisões: `cronometro-evento-2026-10-15.md`. As outras melhorias citadas no pedido já estavam no ar.

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15b`, commit `023f46b`; `env.prod.yaml` e `conteudo-legal/` iguais aos da `release-2026-10-15` |
| Migração | `0012_cronometro_do_evento` (só expande: `events.countdown_enabled` padrão true e `events.countdown_phrase` anulável, com a regra da frase; reversão em `drizzle/rollback/0012_cronometro_do_evento.down.sql`) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15b-023f46b` (Cloud Build `d01ddcb1`, 1 min 47 s) |
| Revisão no ar | `partyx-00018-guj`, 100% |
| Revisão anterior | `partyx-00016-say` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 03:16 a 03:18 | `deploy.sh build` da `release-2026-10-15b` | imagem pronta |
| 03:18 | Backup sob demanda | execução `partyx-backup-rnp76` ok; cópia `partyx-20261015T031810Z.dump` conferida por `check-backup.sh` |
| 03:18 a 03:19 | `deploy.sh migrate` | execução `partyx-migrate-lz27q` ok. Conferido só lendo: 13 migrações; `countdown_enabled` (padrão true) e `countdown_phrase`; os 2 eventos de produção publicados, futuros, com o cronômetro ligado e a frase padrão. A `00016-say` seguiu respondendo com o banco ok |
| 03:19 | `deploy.sh candidata` | revisão `partyx-00018-guj` sem tráfego; teste rápido 14 de 14. Pela candidata: `/api/public/events/teste01` com `countdown` (frase padrão, até 21/10 07:00 UTC, o fim) e `serverNow` a 0,1 s do relógio de quem conferiu; página a 360 px com os quatro blocos numa linha, sem rolagem lateral e sem erro |
| 03:20 | `deploy.sh virar` | 100% na `partyx-00018-guj`; teste rápido 14 de 14 |
| 03:20 | Bateria por HTTPS em `partyx.com.br` | 21 de 21; o cronômetro do Teste01 aparece pelo domínio ("antes", 5 dias e 22 horas), sem rolagem lateral e sem erro |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00018-guj`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00016-say ./infra/producao/deploy.sh rollback`.
- A `00016-say` funciona com o banco já migrado (a 0012 só acrescenta colunas que ela não lê): volta a página sem o cronômetro. Não é preciso reverter a migração para voltar.

## Para a PartyX saber

- Todo evento publicado que ainda não começou passou a mostrar o cronômetro com "Falta pouco para". Para tirar de um evento: painel, editar o evento, desmarcar "Mostrar cronômetro".
- Capturas em 360, 768 e 1280 px na página publicada para o responsável (link no relatório da sessão).
