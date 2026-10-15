# Publicação em produção: termo de autorização revisto e sem autorização judicial (14/10/2026)

Pedido do responsável (Arthur) nesta sessão: ajustar cabeçalho e rodapé do PDF de autorização de menor pelo modelo revisto e "publique junto com a remoção da autorização judicial, no mesmo fluxo e com o meu OK antes da virada". OK da virada, depois do relatório da candidata: "coloque em produção isso aqui". Detalhes da mudança: seção "Revisão de 14/10/2026 (noite)" de `decisao-menores-2026-10-14.md`.

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-14f`, commit `20a82c8`; `env.prod.yaml` e `conteudo-legal/` iguais aos da `release-2026-10-14e` |
| Migração | `0010_sem_autorizacao_judicial` (troca a regra `events_minors_need_authorization` por `events_minors_need_end`; a coluna `events.judicial_authorization` fica, sem uso; reversão em `drizzle/rollback/0010_sem_autorizacao_judicial.down.sql`, recusa se houver evento com menores sem o número) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-14f-20a82c8` (Cloud Build `d2674417`), digest `sha256:870fb77e3b92...` |
| Revisão no ar | `partyx-00014-bax`, 100% |
| Revisão anterior | `partyx-00012-vem` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada**, Termos e Privacidade 1.1, Termo de Ciência e autorização 1.0 |

## Antes de publicar (local)

- `npm run lint` (0 erros), `npm run typecheck`, `npm run test:db` (1.024 + 4 testes, nenhum pulado) e `npm run build`: ok.
- `npm run e2e:textos`: 78 de 78. `npm run check:migrations`: 11 migrações aplicadas, revertidas e reaplicadas.
- PDF conferido preenchido, em branco e com texto no limite: uma página nos três.

## Linha do tempo (UTC)

| Hora | Passo | Resultado |
|---|---|---|
| 14/10 21:24 a 21:26 | `deploy.sh build` da `release-2026-10-14f` | imagem pronta |
| 14/10 21:26 | Backup sob demanda (`gcloud run jobs execute partyx-backup --wait`) | execução `partyx-backup-xsznp` ok; cópia `partyx-20261014T212642Z.dump` conferida |
| 14/10 21:27 | `deploy.sh migrate` | execução `partyx-migrate-49m2x` ok. Conferido só lendo (papel `partyx_backup`): regra `events_minors_need_end` no lugar e 11 migrações registradas. A `partyx-00012-vem` seguiu respondendo com o banco ok |
| 14/10 21:28 | `deploy.sh candidata` | revisão `partyx-00014-bax` sem tráfego; teste rápido 14 de 14. Termo em branco do `teste01` pela candidata: 1 página, logo 652 x 360, CNPJ, rodapé da configuração de produção, sem "judicial" e sem nome empresarial |
| 14/10 21:30 a 15/10 02:09 | Parada antes da virada, aguardando o OK do responsável | público na `partyx-00012-vem`, já com a 0010 aplicada |
| 15/10 02:09:43 a 02:09:54 | `deploy.sh virar` | 100% na `partyx-00014-bax`; teste rápido 14 de 14 |
| 15/10 02:10 | Bateria por HTTPS em `partyx.com.br` | 21 de 21 (saúde com banco ok, textos 1.1 e 1.0, contatos, venda fechada, páginas 200, cadastro vazio 422, webhook inválido 401, autorização de evento inexistente 404, HSTS, CSP, `www` 308, `run.app` direto 403) |
| 15/10 02:10 | Termo em branco do `teste01` baixado por `https://partyx.com.br/api/public/events/teste01/autorizacao-menor.pdf` | 200, A4, 1 página; logo 652 x 360 embutido; "CNPJ 58.471.403/0001-07" no cabeçalho, sem nome empresarial nem endereço da empresa; local na linha inteira; nenhuma ocorrência de "judicial"; rodapé "Atendimento PartyX: partyx992@gmail.com · WhatsApp +55 55 99156-6900 · de segunda a sexta-feira, em horário comercial." e, abaixo, "Termo versão 1.0, vigente desde 14/10/2026." |

Sem mudança na Vercel, nas rotinas e na verificação de saúde.

## Voltar atrás

> Atualização de 15/10/2026 02:56 UTC: a `partyx-00016-say` (excluir e arquivar evento, migração 0011) substituiu a `00014-bax`. A referência de retorno atual está em `publicacao-producao-2026-10-15.md`.

- **Referência de retorno a partir daqui: `partyx-00014-bax`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00012-vem ./infra/producao/deploy.sh rollback`.
- A `00012-vem` funciona com o banco já migrado: ela ficou quase cinco horas no ar com a 0010 aplicada (21:27 a 02:09). Volta o termo antigo, com nome empresarial e endereço, e o painel volta a pedir a autorização judicial em evento com menores (a regra do banco não a exige mais). Não é preciso reverter a migração para voltar.
- Reverter a 0010 só depois de voltar a revisão, e só se nenhum evento com menores tiver sido gravado sem o número (a reversão recusa).

## Pendente

- **Premissa a confirmar com a PartyX:** a dispensa da autorização judicial é decisão de negócio e jurídica dela; foi aplicada a pedido do responsável da contratada.
- O item "evento real que permite menores" de `publicacao-producao-2026-10-14d.md` muda: não há mais autorização judicial a cadastrar; basta o horário de fim e conferir o PDF baixado (checklist 1.9).
- O que já estava pendente segue em `publicacao-producao-2026-10-14d.md` e `publicacao-producao-2026-10-14e.md` (e-mail sem SMTP, prova da aprovação do Bernardo, Política de Cancelamento, telas de compra com evento real).
