# Cronômetro regressivo na página do evento (15/10/2026)

> **Atualização de 15/10/2026 (pedido do responsável): sem a frase acima do título.**
> - **Página e prévia do painel:** "Falta pouco para", ou a frase personalizada, saiu. O cabeçalho tem só o bloco da data e o título, centrados um no outro; títulos de uma e de duas linhas ficam no meio do bloco, e o espaço até o cronômetro não muda.
> - **Painel:** o campo "Frase do cronômetro" saiu do cadastro e da edição; a API do painel ignora o campo, se um navegador antigo o mandar.
> - **Vitrine:** a API pública não leva mais `countdown.phrase`.
> - **Cronômetro:** os estados não mudam (contagem, "Acontecendo agora" e sumir depois do fim).
> - **Banco:** a coluna `events.countdown_phrase` e a regra `events_countdown_phrase_format` **ficam sem uso**, sem migração agora. Remover numa limpeza futura (anotado em `docs/modelo-de-dados.md`).
> - **Verificação:** `e2e/cronometro.spec.ts` confere, a 360 e 1280 px, nome curto e longo (duas linhas), roxo e vermelho, o centro do nome no centro do bloco (até 1,5 px de diferença) e o mesmo espaço até o cronômetro.
> - **Publicado** em 15/10/2026 23:42 UTC: `release-2026-10-15i`, revisão `partyx-00032-bag` (`publicacao-producao-2026-10-15i.md`).

Pedido do responsável (Arthur), nesta data: cronômetro até a data e o horário de início no topo da página do evento, no estilo do bloco da data ("17 OUT"); estados antes, durante e depois; "Mostrar cronômetro" e "Frase do cronômetro" no painel; hora do servidor para quem está com o relógio errado; pausa com a aba escondida; sem anunciar os segundos; movimento reduzido respeitado; testes; publicar em produção quando pronto. As outras melhorias citadas (texto longo, excluir evento, autorização judicial, cabeçalho do PDF) já estavam no ar (`release-2026-10-14e`, `-14f` e `-15`).

## Como ficou

| Situação | Página do evento |
|---|---|
| Antes do início | A frase (padrão "Falta pouco para") logo acima do nome do evento, e quatro blocos roxos abaixo do cabeçalho: DIAS, HORAS, MIN e SEG, com dois dígitos (dias acima de 99 aparecem inteiros). Mesmo roxo, mesma fonte condensada e mesmo canto cortado do bloco da data. Em 360 px os quatro cabem numa linha (78 px cada), abaixo da capa |
| Entre o início e o fim | "Acontecendo agora", num bloco roxo com um ponto que pulsa (parado com movimento reduzido). Sem a frase |
| Depois do fim, ou evento encerrado | Nada (o cronômetro some) |
| Na virada | Troca sozinha, sem recarregar; só a troca é anunciada ao leitor de tela ("O evento começou: acontecendo agora.", "O evento terminou.") |

- **Fim:** o horário de fim do evento; sem ele, 8 horas depois do início (a mesma janela em que o evento fica na vitrine).
- **Hora certa:** a resposta do evento traz `serverNow`. Na chegada da resposta, a página guarda a diferença entre a hora do servidor e o relógio do aparelho (com metade da ida e volta) e conta pelo relógio do aparelho mais essa diferença. Nenhuma chamada ao servidor durante a contagem. Datas mostradas no fuso de São Paulo; a contagem usa `starts_at` em UTC.
- **Desempenho:** atualiza na virada de cada segundo, só com `document.visibilityState` visível; com a aba escondida, para, e ao voltar recalcula na hora. Os segundos andam num componente próprio: a página inteira só se redesenha na troca de estado.
- **Acessibilidade:** os blocos ficam escondidos do leitor de tela; o cronômetro é um `role="timer"` (não fala sozinho) com o texto por extenso até os minutos ("Faltam 3 dias, 14 horas e 27 minutos."); `aria-live` só no aviso de troca de estado. Números sem animação nenhuma.
- **Painel (criar e editar evento):** "Mostrar cronômetro" (marcado por padrão) e "Frase do cronômetro (opcional)", até 40 caracteres, só texto (recusa `<` e `>`), espaços normalizados; em branco usa a padrão. As duas mudanças entram na trilha (`evento.editar`, antes e depois). A prévia do painel também mostra o cronômetro.
- **Banco:** migração `drizzle/0012_cronometro_do_evento.sql` (só expande: `events.countdown_enabled` padrão `true` e `events.countdown_phrase` anulável, com a regra da frase no banco). Reversão em `drizzle/rollback/0012_cronometro_do_evento.down.sql` (perde só a configuração do cronômetro).

## Premissas

- **Ligado por padrão também nos eventos que já existem:** ao publicar, todo evento publicado que ainda não começou passa a mostrar o cronômetro com a frase padrão. Para tirar de um evento: painel, editar, desmarcar "Mostrar cronômetro".
- A frase fica acima do nome, para "Falta pouco para" se completar com o nome do evento; uma frase personalizada aparece no mesmo lugar.
- Se o relógio do aparelho for mudado com a página aberta, a contagem só se corrige ao recarregar (a diferença é medida uma vez, na resposta).

## Verificação (local)

- `npm run lint` (0 erros, 27 avisos antigos), `npm run typecheck`, `npm run build`, `npm run test:db` (1.046 + 4, nenhum pulado), `npm run check:migrations` (13 migrações), `npm run e2e:textos` (78 de 78) e `npm run e2e:cronometro` (7 de 7).
- `src/site/eventCountdown.test.ts`: antes, virada no zero (o último mostrado é 1 s; no instante do início, "agora"), durante, depois, próxima mudança, relógio do aparelho adiantado e atrasado (7 h, 3 dias, 45 min), dois dígitos, texto por extenso, aviso só na troca.
- `server/src/api/events.integration.test.ts` (bloco "cronômetro"): ligado por padrão, frase padrão, `serverNow` igual ao relógio do servidor, fim ou 8 h, frase personalizada e em branco, 41 caracteres e marcação recusados (422), desligado pelo painel (sem cronômetro na página), trilha, prévia com cronômetro, encerrado sem cronômetro, regra da frase no banco.
- `e2e/cronometro.spec.ts` (Chromium, servidor local): contagem igual à do banco com folga de 2 s, uma linha a 360 px sem rolagem lateral, leitor de tela; relógio do aparelho com +7 h, -7 h, +3 dias e -45 min; virada no zero sem recarregar e com o aviso; durante, sem fim, depois do fim, sem fim depois de 8 h e encerrado; pausa com a aba escondida; movimento reduzido; frase e "Mostrar cronômetro" pelo formulário do painel.
