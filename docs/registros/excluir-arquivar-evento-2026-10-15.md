# Excluir e arquivar evento no painel (15/10/2026)

Pedido do responsável (Arthur), nesta data: opção de **excluir** evento em `/admin/eventos`, só para evento sem nenhum registro; com registro, **arquivar** (com "Desarquivar"); só administrador; nome digitado para confirmar; trilha de auditoria; conferência no servidor, na mesma transação; migração só de expansão; publicar no fluxo de sempre, com OK antes da virada. Sobre "publicar junto com a correção do texto longo do 'Sobre o evento'", o responsável confirmou que é a correção já publicada na `release-2026-10-14e`: nada novo nessa parte.

## Regras implementadas

| Situação do evento | O que o painel oferece | O que acontece |
|---|---|---|
| Nenhum pedido (em qualquer situação: pendente, expirado, pago, estornado, contestado, pago sem estoque), nenhum ingresso, nenhuma leitura de portaria e nenhum aceite de termo de menor | **Excluir**, com o nome do evento digitado (e "Arquivar em vez de excluir") | Saem o evento, os tipos de ingresso e todas as imagens da pasta `events/<id>/` no Cloud Storage (todas as versões: o bucket tem versionamento). O link público passa a 404. Trilha `evento.excluir`: quem, quando, id, nome, endereço, situação, data, tipos e banner. Não há dado de comprador (não há comprador) |
| Qualquer um desses registros | Explica o motivo (contagem de pedidos, ingressos, leituras e aceites) e oferece **Arquivar** | `events.archived_at` gravado: some da página inicial, da busca, do link público (404, sem nada do evento na prévia das redes sociais) e do PDF em branco da autorização; sai da lista padrão do painel (filtro "Arquivados" em Situação); nenhum pedido novo nem cobrança nova. Pedidos, ingressos, portaria, compradores, relatórios, exportações e o PDF da autorização de quem já comprou continuam. Trilha `evento.arquivar` (id, nome, data) |
| Arquivado | **Desarquivar** (e Excluir, se não tiver uso) | `archived_at` volta a nulo; o evento volta como estava. Trilha `evento.desarquivar` |

- **Só administrador:** rotas sob `/admin` (`GET /admin/events/:id/removal`, `POST /admin/events/:id/delete`, `POST /admin/events/:id/archive` e `/unarchive`); validador e cliente recebem 403, sem sessão 401.
- **Na mesma transação:** a exclusão trava os tipos do evento (na ordem do checkout) e o evento, conta pedidos, ingressos, leituras e aceites, confere o nome e só então apaga. Um pedido que esteja entrando termina antes (e a exclusão é recusada com 409) ou espera e falha como "evento indisponível", sem deixar pedido nem reserva. O banco confere de novo: os gatilhos `events_delete_only_unused` e `ticket_types_delete_only_unused` recusam apagar evento ou tipo de evento com pedido ou leitura, e as chaves estrangeiras recusam o resto.
- **Imagens depois do banco:** se o Cloud Storage falhar depois de o evento sair, o evento já foi apagado (está na trilha), as imagens ficam, o erro vai para o log (`evento excluído, mas as imagens dele não saíram do armazenamento`) e a tela avisa.

## Decisões de implementação (premissas a confirmar com a PartyX)

- **Portaria:** arquivar não cancela ingressos. A portaria continua abrindo o evento arquivado pelas regras de sempre (publicado; encerrado dentro da janela), para quem já tem ingresso entrar. Se a PartyX quiser o arquivado fora da portaria também, é uma mudança pequena.
- **Pedido pendente de evento arquivado:** sem cobrança nova. Quem já tinha escolhido a forma de pagamento (cobrança criada no gateway) segue com ela, e o webhook e a conciliação continuam valendo, como em qualquer pedido.
- **Destaque:** arquivar tira o destaque da página inicial; desarquivar não o devolve sozinho (como reabrir evento encerrado).
- **Confirmação do nome:** espaços nas pontas e repetidos não contam; maiúsculas e acentos contam.
- **Excluir vale em qualquer situação do evento** (rascunho, publicado, encerrado ou arquivado), desde que sem uso.
- **Seletores de evento** em relatórios, compradores, pedidos e entradas continuam listando os arquivados (o histórico continua consultável).

## Banco e nuvem

- Migração `drizzle/0011_excluir_e_arquivar_evento.sql` (só expande: coluna anulável `events.archived_at`; troca dos gatilhos `forbid_delete` de `events` e `ticket_types` por gatilhos que recusam só evento com uso; `GRANT DELETE` nessas duas tabelas ao `partyx_app`). Reversão em `drizzle/rollback/0011_excluir_e_arquivar_evento.down.sql`: recusa se houver evento arquivado; devolve os gatilhos que recusam qualquer exclusão e tira o DELETE. Eventos já excluídos não voltam.
- **Permissão nova no Cloud Storage:** a conta do serviço (`partyx-app`) só tinha `storage.objectCreator` no bucket dos banners. A exclusão precisa listar e apagar: papel próprio `partyxBannerCleanup` (`storage.objects.list`, `storage.objects.delete`), ligado **só** ao bucket `partyx-producao-banners`, pelo comando novo `deploy.sh banners-iam` (também chamado pelo `setup`). Sem ele, a exclusão em produção apaga o evento, mas não as imagens.

## Verificação (local)

- `npm run lint` (0 erros, 27 avisos antigos), `npm run typecheck`, `npm run build`, `npm run test:db` (1.034 + 4, nenhum pulado), `npm run e2e:textos` (78 de 78) e `npm run check:migrations` (12 migrações aplicadas, revertidas e reaplicadas).
- Testes novos em `server/src/api/eventRemoval.integration.test.ts`: exclusão com tipos e imagens (e só as deste evento), nome errado, link 404, trilha; pedido só expirado e leitura sem pedido recusam; arquivado fora da vitrine, da busca, do link e do PDF em branco, sem pedido nem cobrança nova, com painel, compradores, exportação e relatório; desarquivar; validador e cliente 403; banco recusa por fora do serviço; três corridas (pedido primeiro, exclusão primeiro e rajada de 12 rodadas, sem impasse nem pedido órfão). Mais `schema.integration.test.ts` (regras do banco, `partyx_app`, reversão da 0011) e `appRole.cluster.test.ts`.
- Navegador (Chromium, 360 px, servidor local com banco descartável): botão Excluir na lista, confirmação com o nome (botão desligado até o nome certo), recusa com "Arquivar", filtro "Arquivados", detalhe do arquivado e exclusão concluída; sem rolagem lateral e sem erro na página.
- De passagem: o banco de teste descartável (`server/src/db/testing.ts`) agora espera as sessões do pool fecharem antes de apagar o banco; o apagar imediato derrubava uma sessão ainda fechando e a bateria saía com "erro sem tratamento" mesmo com todos os testes aprovados.

## Evento "Teste01" em produção, conferido só lendo (15/10/2026, por volta de 02:20 UTC, papel `partyx_backup`, transação só leitura)

Único evento de produção: `teste01`, **publicado** (foi encerrado e reaberto; a trilha tem as duas ações), permite menores, banner em 3 larguras. **0 pedidos** (em qualquer situação), 0 itens, 0 reservas, 0 eventos de pagamento, **0 ingressos**, **0 leituras de portaria**, **0 aceites de termo de menor**; 1 tipo de ingresso, 0 vendidos. Pode ser excluído de vez pelo painel depois da publicação (e da permissão `banners-iam`, para as imagens saírem também).
