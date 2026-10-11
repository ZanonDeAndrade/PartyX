# Portaria

Implementado em 01/10/2026 (Prompt 15): RF-44 a RF-54 e CA-23 a CA-27. Código em `server/src/gate/service.ts`, `server/src/api/gate.ts` e `src/site/gatePages.tsx`. **Sem migração**: usa `checkins` e `tickets`.

> **O que NÃO está provado:** leitura em **Chrome Android e Safari iPhone reais** (CA-26). A câmera foi testada com uma câmera simulada (um arquivo de vídeo com o QR) no Chromium, e o Safari/WebKit só teve a tela e o tratamento de câmera indisponível conferidos. Isso precisa de aparelhos de verdade (Prompts 23 e 24).

## Regra de ouro

**O aparelho nunca decide.** Ele lê o texto do QR e o envia; o servidor confere a assinatura, procura o ingresso, marca o uso e devolve o resultado. Sem internet **não há validação local**: a tela avisa para não confirmar a entrada e usar a **lista impressa de contingência** (seção 15).

## Rotas (todas sob `/api/gate`, só validador e administrador)

Toda a árvore `/gate` exige o perfil (inclusive caminhos que nem existem): visitante 401, cliente 403, senha temporária ainda não trocada 403. Respostas `no-store`.

| Rota | O que faz |
|---|---|
| `GET /gate/events` | Eventos publicados e, dentro da janela operacional, encerrados (com `salesClosed` e `gateClosesAt`), com entradas e total de cada um (RF-45) |
| `GET /gate/events/:id/counter` | Contador de entradas e por tipo (RF-53, CA-27) |
| `POST /gate/scan` `{ eventId, qr }` | Lê um QR |
| `POST /gate/search` `{ eventId, q }` | Busca manual |
| `POST /gate/admit` `{ eventId, ticketId }` | Confirma a entrada de um ingresso achado na busca |

## Que eventos a portaria abre (10/10/2026, D-79)

- **Publicado:** sempre.
- **Encerrado:** só dentro da **janela operacional**, de `GATE_CLOSED_WINDOW_BEFORE_HOURS` (padrão 12) horas antes do início até `GATE_CLOSED_WINDOW_AFTER_HOURS` (padrão 24) horas depois, **e só se tiver sido encerrado já dentro dela** (a partir de 12 h antes do início). Encerrado antes disso é cancelamento antecipado: fica fechado, com a mensagem "Este evento foi encerrado antes da data e não está disponível para validação.", e não aparece na seleção. O momento vem de `events.closed_at` (migração 0006, preenchida a partir da trilha `evento.encerrar`; linha sem a coluna usa `updated_at`, porque evento encerrado não muda mais). Encerrar o evento tira do site e para as vendas, mas não pode travar a entrada de quem já tem ingresso. Dentro da janela, tudo funciona igual (verde, amarelo, vermelho, busca e entrada manual). Na seleção (V01) e na tela da câmera aparece o selo **"Vendas encerradas"** e até quando a validação está disponível.
- **Encerrado fora da janela:** 409 `portaria_fechada` com o horário: "Este evento foi encerrado e a portaria funcionou até 13/12 às 22:00. Não é mais possível validar ingressos dele." (depois) ou "A portaria só abre para ele a partir de ..." (antes).
- **Rascunho:** nunca (409 `evento_indisponivel`).
- No painel, **"Encerrar vendas agora"** (`POST /api/admin/events/:id/stop-sales`) para as vendas sem encerrar o evento: a portaria continua normal, sem janela. É o indicado no dia do evento.
- Evento encerrado por engano (inclusive antes da data) pode ser **reaberto** pelo administrador no painel: volta a publicado e a portaria volta a validar (motivo na trilha `evento.reabrir`).
- A janela de 12 h antes e 24 h depois é **premissa** a confirmar com a PartyX (D-79).

## Resultados (RF-48, RF-54)

| Resultado | Tela | Quando | Registrado em `checkins` |
|---|---|---|---|
| `valido` | Verde | Primeira leitura de um ingresso válido deste evento | `valido`, validador, horário, método |
| `ja_utilizado` | Amarelo | Já entrou; mostra horário e validador da **primeira** entrada | `ja_utilizado` |
| `cancelado` | Vermelho | Ingresso estornado ou contestado | `cancelado` |
| `outro_evento` | Vermelho, mensagem específica com o nome do evento do ingresso | Ingresso válido de outro evento. **Não é consumido** | `outro_evento` |
| `invalido` | Vermelho | Assinatura errada, formato errado, código inexistente, texto qualquer | `invalido`, só os 24 primeiros caracteres lidos |

Cada tela mostra o resultado por **cor, símbolo e texto** (nunca só cor), o **tipo** do ingresso em letras grandes (RF-49), o nome do titular e o código curto, e emite som (tons diferentes por resultado) e vibração.

## Concorrência (RF-50, RF-51, CA-25)

A marcação é um único `UPDATE tickets SET status='utilizado' ... WHERE id = ? AND status = 'valido' AND event_id = ?` numa transação com o registro da entrada. Duas leituras ao mesmo tempo: a segunda espera a primeira, já não encontra "valido" e volta "já utilizado", apontando o **primeiro** validador e horário. Como último recurso, o índice único parcial de `checkins` (uma entrada válida por ingresso) impede a segunda no banco.

Provado com 2 aparelhos em **20 rodadas** (sempre um verde e um amarelo), com **10 aparelhos** no mesmo ingresso (1 verde, 9 amarelos, todos apontando o mesmo primeiro validador, contador +1), e com **câmera e entrada manual ao mesmo tempo**. Sem o `status = 'valido'` no `UPDATE`, 6 testes falham.

## Contador (RF-53, CA-27)

"Entradas" = ingressos usados no evento; "total" = ingressos que ainda valem ou já entraram (cancelados ficam de fora). Também por tipo (Pista, VIP, Camarote). A tela consulta a cada 4 s. Sobe uma unidade por entrada válida e **não muda** com amarelo, vermelho, tentativa inválida ou ingresso de outro evento. Eventos diferentes não se misturam.

## Busca manual (RF-52, D-48, D-49)

Por **código** (`PX-...`, inteiro ou começo), **nome** (3 letras ou mais, sem diferenciar acento), **CPF completo** ou **e-mail completo**. Acesso limitado: no máximo 20 resultados; CPF e e-mail nunca por pedaço (evita varredura); só ingressos do evento selecionado; resposta com **CPF mascarado** (`***.982.247-**`) e e-mail parcialmente oculto; 40 buscas por minuto por pessoa. A trilha (`portaria.busca`) guarda **só o tipo e o número de resultados**, nunca o CPF digitado (testado também no log). A entrada por busca é registrada como `manual`.

## Telas (`/portaria`)

Seleção do evento (V01); câmera com contador (V02); busca manual (V03). A câmera usa `getUserMedia` com a câmera traseira e decodifica os quadros com **jsQR** no próprio navegador, o que também funciona onde `BarcodeDetector` não existe (Safari). Exige **HTTPS** (ou `localhost`); sem isso, e se a permissão for negada, a tela explica e oferece a busca manual. O botão "Iniciar leitura" é o toque que libera câmera e áudio no iPhone. O mesmo QR parado à frente da câmera só é reenviado depois de 4 s. Aviso permanente de "sem conexão" com orientação de lista impressa. Também foi criada a tela de **primeiro acesso** (`/primeiro-acesso`), que a equipe com senha temporária precisa para chegar à portaria.

## O que foi verificado

- 35 testes novos (499 passam, contra PostgreSQL real): acesso por perfil, escolha do evento, CA-23 a CA-27, outro evento, QR adulterado (amostra de posições), código curto e secreto recusados como QR, busca (nome, código, CPF, e-mail, limites, mascaramento, escopo, trilha, limite por minuto), entrada manual, limites. **Mutações:** sem `status='valido'` no `UPDATE`, 6 falham; sem checar o evento do ingresso, 1; sem restrição de perfil, 4.
- **Navegador real** (Chromium com **câmera simulada** por um vídeo com o QR, servidor local): senha temporária → primeiro acesso → portaria; câmera lê o QR e mostra **VÁLIDO** (Pista, nome); sozinho volta; a mesma leitura contínua dá **JÁ UTILIZADO** com "primeira entrada às 21:37 por Carlos Portaria"; contador 1 de 3 (Pista 1/3); busca manual com CPF mascarado e entrada manual; **sem conexão** mostra a orientação de lista impressa; QR forjado dá **INVÁLIDO**. Sem rolagem horizontal a 360 e a 320 px (o teste achou o menu estourando a 360 px com o nome do validador; corrigido).
- WebKit: tela, contador e mensagem de câmera indisponível sem erro de JavaScript.

## O que **não** foi verificado

- **Chrome Android e Safari iPhone reais** (CA-26): permissão de câmera, foco, leitura sob luz de pista e a distância, desempenho do jsQR em aparelho de entrada. Ensaio de campo no Prompt 23.
- Som e vibração em aparelhos reais (o iPhone não vibra pelo navegador).
- Fila real com vários validadores e rede 4G instável; leitura em lote.
- Lista impressa de contingência (exportação em PDF é do Prompt 18) e o registro posterior das entradas.
- HTTPS público (a câmera exige); a homologação já tem, mas a portaria nunca rodou nela.
- Ingresso cancelado **depois** de já ter entrado continua "utilizado" (a entrada aconteceu); a decisão de reverter é do cliente.

## Decisões abertas

D-48 (entrada manual por código curto), D-49 (limites da busca), D-50 (tempos da tela de resultado), D-79 (janela operacional da portaria para evento encerrado).


## Casos difíceis e ensaio (Prompt 23, 05/10/2026)

Só testes e verificação; **nenhuma correção de código foi necessária**.

**Testes de servidor** (`gate.integration.test.ts`, bloco "casos difíceis de leitura", 5 testes novos, repetidos 3 vezes sem falha; arquivo com 40):

| Cenário | Resultado |
|---|---|
| Validador desativado ou sessão revogada no meio do evento | Leitura e entrada manual seguintes: 401; nada marcado; ingresso segue válido |
| Perfil rebaixado para cliente no meio do evento | 401/403; nada marcado |
| Leitura (2 aparelhos) e cancelamento ao mesmo tempo, 15 rodadas | Estado final sempre `utilizado` ou `cancelado`; entrada válida registrada se, e somente se, ficou `utilizado` |
| 24 ingressos lidos por 3 aparelhos, cada um duas vezes, em paralelo | 24 verdes, 24 amarelos, contador 24 |
| Inexistente, adulterado, de outro evento e válido ao mesmo tempo | Cada um com o seu resultado; o ingresso do outro evento não é consumido |

Já cobertos antes: duas sessões no mesmo QR (20 rodadas), 10 aparelhos, câmera e manual juntos, primeiro horário e validador preservados, cancelado, HMAC adulterado, outro evento, busca manual.

**Navegador real (Chromium, câmera simulada por vídeo com o QR, 360 px, servidor local, banco descartável com 30 ingressos fictícios):**

- Câmera bloqueada ou ausente: mensagem clara ("Não foi possível usar a câmera…") e botão "Tentar de novo"; a **busca manual funciona** (achou 5 ingressos do comprador).
- **API de leitura indisponível** (requisição abortada) com o QR à frente da câmera: aviso "Sem conexão com o servidor… use a lista impressa de contingência"; **nenhuma tela de resultado, 0 entradas e 0 ingressos usados no banco**.
- Quando a rede volta, a mesma leitura dá VÁLIDO (1 entrada).
- Rede do navegador caída: o aviso permanece. Sem rolagem horizontal a 360 px.
- Tempo da leitura até o resultado, com a rede **emulada** (latência 150 ms, ~1,5 Mbps): **2,8 s**, incluindo a janela de reenvio do mesmo QR. **É emulação do Chromium, não medição em 4G real nem em aparelho real.**

**Exportação de contingência com 30 ingressos fictícios:** CSV e PDF (4 páginas) trazem os 30 códigos; nenhum CPF inteiro; 2 downloads auditados.

**Não executado (depende de pessoas e aparelhos):** ensaio com **dois aparelhos reais no local** e medição em **4G real** (CA-26 segue pendente); leitura sob a luz do evento; impressão em papel da lista. Roteiro sugerido: abrir `/portaria` em dois celulares (Chrome Android e Safari iPhone) em homologação com HTTPS, ler o mesmo QR nos dois ao mesmo tempo (esperado: um verde, um amarelo), ler QR cancelado e de outro evento, desligar os dados móveis e conferir o aviso, imprimir o PDF de contingência e anotar tempos.
