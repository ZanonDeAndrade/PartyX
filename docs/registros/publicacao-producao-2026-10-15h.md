# Publicação em produção: transferência de ingresso e textos novos (15/10/2026)

> Atualização de 15/10/2026 23:42 UTC: a `partyx-00032-bag` (`release-2026-10-15i`, página do evento sem a frase acima do título, `publicacao-producao-2026-10-15i.md`) substituiu a `00030-jos`, que fica como retorno.

Pedido do responsável (Arthur): transferência de ingresso (D-87), Política de Cancelamento, Troca e Reembolso 1.0, Termos e Privacidade 1.2 e aceite da Política no checkout (`transferencia-e-cancelamento-2026-10-15.md`), com a regra "pare antes da virada e me mostre os três textos como aparecem na candidata, para eu confirmar o OK do Bernardo".

- **OK para a nuvem:** por volta das 21:14 UTC: "ok, coloque em prod". O fluxo foi até a candidata e parou antes da virada.
- **Textos mostrados:** como a candidata os servia, numa página privada para o responsável, com os trechos novos marcados.
- **OK do Bernardo:** por volta das 23:06 UTC, informado pelo responsável: "sim, ele aprovou".

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15h`, commit `3ad718a` |
| Migração | `0016_transferencia_e_aceite_da_politica` (só expande; reversão em `drizzle/rollback/0016_transferencia_e_aceite_da_politica.down.sql`, que recusa com transferência ou aceite gravado) |
| Textos | Termos de Uso 1.2 e Política de Privacidade 1.2 (vigência 15/10/2026, novo aceite para quem aceitou a 1.1); Política de Cancelamento, Troca e Reembolso 1.0 (vigência 15/10/2026, texto da PartyX sem alteração) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15h-3ad718a` (Cloud Build `e49ef312`, 1 min 44 s) |
| Revisão no ar | `partyx-00030-jos`, 100% |
| Revisão anterior | `partyx-00028-vax` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 21:14 a 21:16 | `deploy.sh build` da `release-2026-10-15h` | imagem pronta (a tag leva `conteudo-legal/cancelamento.txt`) |
| 21:16 | Backup sob demanda | execução `partyx-backup-kt724` ok; cópia `partyx-20261015T211622Z.dump` conferida por `check-backup.sh` |
| 21:16 | `deploy.sh migrate` | execução `partyx-migrate-s4fht` ok |
| 21:16 | Conferência só de leitura no banco | 17 migrações; `ticket_transfers`, `ticket_minor_acceptances` e `cancellation_acceptances` criadas; `tickets.holder_user_id` NOT NULL e `holder_minor` anulável; os cinco gatilhos novos; os três valores do tipo de e-mail; 0 ingressos em produção (venda fechada). A `00028-vax` seguiu respondendo pelo domínio |
| 21:17 | `deploy.sh candidata` | revisão `partyx-00030-jos` sem tráfego; teste rápido 15 de 15, com os textos oficiais: Termos 1.2 (59 blocos), Privacidade 1.2 (66) e Política 1.0 (27) |
| 21:18 a 21:20 | Os três textos na candidata | lidos da API e fotografados a 360 e 1280 px, sem erro e sem rolagem lateral; página para o OK do Bernardo |
| 21:20 a 23:07 | Espera do OK do Bernardo | candidata parada, sem tráfego |
| 23:07 a 23:09 | `deploy.sh virar` | 100% na `partyx-00030-jos`. O teste rápido depois da virada passou nos 14 primeiros itens e **falhou no 15º** (texto da autorização de menores) |
| 23:09 a 23:12 | Diagnóstico da falha | **rede do lado de quem publicou, não o serviço:** a chamada do teste não aparece nos registros do Cloud Run, todas as que chegaram responderam 200 em menos de 10 ms, e desta máquina até `/api/health` levava de 2 a 11 s. Repetida, a rota respondeu 200 com o texto oficial (1.0, 11 blocos), e o `/api/health` com `Cache-Control: private, no-store`. Sem retorno: a revisão estava saudável |
| 23:12 a 23:15 | Bateria por HTTPS em `partyx.com.br` | 22 de 22. A bateria foi atualizada para os textos novos (1.2 e 1.0, vigência 15/10/2026) e passou a conferir também a Política; a primeira rodada acusou 3 itens só porque ainda esperava a 1.1 |
| 23:15 | Páginas pelo domínio no navegador, a 360 e 1280 px | início, evento, Termos, Privacidade, Política e "Entrar" sem erro e sem rolagem lateral; Termos e Privacidade mostram "Versão 1.2"; o pacote é `index-DCiUDCXC.js` |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00030-jos`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00028-vax ./infra/producao/deploy.sh rollback`.
- **Seguro só antes da primeira transferência.** A `00028-vax` funciona com o banco migrado, porque o gatilho põe o titular quando ela emite ingresso. Mas ela mostra o ingresso pelo pedido: depois de uma transferência, o comprador veria o ingresso transferido, com o QR novo, e quem recebeu não o veria. Nesse caso, corrigir para a frente, ou desfazer as transferências pelo painel antes de voltar.
- **Hoje:** a venda está fechada e não há ingresso em produção.
- **O que volta:** os Termos e a Privacidade 1.1 (versão e texto andam juntos na imagem), e a Política deixa de estar publicada.

## Para a PartyX saber

- **Novo aceite:** quem aceitou os Termos e a Privacidade 1.1 vê a tela do novo aceite no próximo login e só compra depois de aceitar a 1.2.
- **Política publicada:** está em "Cancelamento, troca e reembolso", no rodapé, e deixa de ser pendência para abrir as vendas. As vendas continuam fechadas até o checklist de abertura.
- **Transferência:** com a venda aberta, quem tiver ingresso pode transferir em "Meus ingressos" até 2 horas antes do evento. O administrador desfaz no detalhe do ingresso, em caso de fraude comprovada, com motivo.
- **E-mails:** os de transferência saem quando o SMTP estiver configurado (hoje não está; falham como os outros).
- **Termo de Ciência para Menores (1.0):** ainda cita o nome antigo da Política ("Política de Cancelamento e Reembolso"). Ajustar numa versão 1.1, se a PartyX quiser.
