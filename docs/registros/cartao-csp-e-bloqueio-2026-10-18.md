# Pagamento com cartão: CSP do Mercado Pago e bloqueio do navegador (18/10/2026)

Pedido do responsável (Arthur), 18/10/2026, depois da primeira compra Pix em produção (pedido PX-10001, revisão `partyx-00042-ten`):
na tela "Pague com cartão", pelo domínio, no Firefox, o Brick do Mercado Pago não carregava (área cinza). O console mostrava um
script em linha bloqueado pela CSP, `api.mercadolibre.com/tracks` bloqueado pela CSP, CORS com status nulo no arquivo de textos do
Brick (`http2.mlstatic.com/.../i18n/pt/cardPayment/index.json`), "recurso bloqueado pela proteção aprimorada contra rastreamento"
(2 recursos), "Bricks.create: Bricks component initialization failed" e "/checkout/api_integration Could not send event". Pedidos:
conferir a CSP contra a lista oficial do Mercado Pago (nonce em vez de `unsafe-inline`; `api.mercadolibre.com` só se a documentação
pedir), reproduzir no Playwright (Chromium e WebKit), tratar o bloqueio do navegador com aviso e troca para Pix (prazo de 10 s),
testes, build, lint, bateria e candidata com a venda aberta, mostrando os comandos antes. Sem virada e sem push sem OK.

## Lista oficial de domínios

Não existe. As páginas de segurança do Checkout Transparente (Orders) e do Checkout Bricks tratam de OAuth, OWASP e PCI; nenhuma
fala de CSP. Nas discussões do repositório `mercadopago/sdk-js` (#16, #75, #188) só há respostas pontuais (liberar
`*.mercadopago.com` em `frame-src`), sem lista. O repositório já registrava isso em 11/10/2026. Os domínios continuam medidos no
navegador (`docs/pagamento-mercadopago.md`, seção CSP).

## Diagnóstico (Playwright pelo domínio, CSP e JavaScript reais; só sessão, pedido e opções de pagamento simulados no navegador)

Nenhum pedido foi criado no banco: a tela de cartão foi aberta em `https://partyx.com.br/pedido/<id fictício>` com a sessão, o pedido
e `/api/payments/options` respondidos pelo próprio Playwright, e a chave pública de produção (pública: vai para todo navegador que
abre a tela).

| Situação | Chromium | WebKit | Firefox |
|---|---|---|---|
| CSP atual, sem bloqueio do navegador | carregou (1,5 a 9,6 s; 1ª rodada fria) | carregou (1,5 a 5,6 s) | carregou (3,1 s) |
| Arquivo de textos do Brick cortado (como a proteção contra rastreamento) | **área cinza por 30 s** | não medido | **área cinza por 30 s**, com as mesmas mensagens do responsável |

Conclusão: a área cinza vem do **bloqueio do próprio navegador**, não da CSP. Os dois bloqueios de CSP aparecem nos três navegadores,
mas o Brick carrega com eles. O Firefox do Playwright não baixa a lista de rastreadores da Mozilla, então a proteção foi simulada
cortando o arquivo de textos (o "CORS status null" do console do responsável).

Sinais do Brick com o arquivo cortado (Chromium, Firefox e WebKit): `create` **resolve sem controlador** e não chama `onError` nem
`onReady`. O código de 18/10 esperava `onError` ou a rejeição da promessa, por isso o esqueleto cinza ficava para sempre.

O script em linha bloqueado é o **perfil do aparelho do antifraude**: o SDK busca o código em `/devices/widgets` e o põe na página. O
conteúdo muda a cada vez (os hashes medidos foram diferentes), então hash não serve. O SDK aceita `deviceProfileCspNonce` e põe o
nonce no script. O SDK junta esse perfil ao token do cartão (`createCardToken` usa `getDeviceProfile`): com o script bloqueado, o
token ia sem o perfil do aparelho.

Com o nonce liberado, o perfil do aparelho pediu mais três destinos, liberados um por vez: `connect-src https://www.mercadolibre.com`,
`img-src https://www.mercadopago.com.br`, `https://www.mercadolibre.com` e `https://www.mercadolivre.com`. Depois disso, o único
bloqueio que sobra é a telemetria `https://api.mercadolibre.com/tracks`.

## O que mudou

- `server/src/security/headers.ts`: `script-src` com nonce por resposta (`NONCE` do `hono/secure-headers`) só com o Mercado Pago;
  `connect-src` e `img-src` com os destinos do antifraude; `injectCspNonce` põe `<meta property="csp-nonce" nonce="…">` antes de
  `</head>`. Sem `unsafe-inline` nem `unsafe-eval`.
- `server/src/app.ts`: todo HTML do app (`/`, `/eventos/:slug` e as demais rotas) sai com o nonce da própria resposta.
- `src/site/cardBrickMount.ts` (novo): monta o Brick com o nonce e decide o estado da tela (pronto ou falha: SDK com erro, `create`
  sem controlador, `onError` antes de pronto, nada em 10 s; pronto depois do prazo volta ao formulário).
- `src/site/cardBrick.tsx`: usa a montagem; aviso "Não foi possível carregar o pagamento com cartão. Desative o bloqueio de
  rastreamento para este site ou pague por Pix." e botão "Pagar com Pix". Sem Pix disponível (D-03): "... e recarregue a página.",
  sem botão.
- `src/site/checkoutPages.tsx`: o botão fecha o cartão e gera o Pix do pedido na hora (o mesmo `POST /orders/:id/payment` do
  "Gerar Pix").

## Decisões e premissas

- `api.mercadolibre.com` **não** entrou: a condição do responsável era a documentação pedir, e ela não pede. É telemetria do SDK;
  sem ela o pagamento funciona (medido em 11/10 e 18/10). Os avisos "Could not send event" continuam no console.
- Prazo de 10 s contado da abertura da tela até `onReady`, não só até o SDK chegar, porque o `create` pode ficar sem sinal. Medido:
  o Brick fica pronto em 1,5 a 5,6 s pelo domínio; se passar de 10 s, o aviso aparece e some quando o Brick fica pronto.
- O botão "Pagar com Pix" gera o Pix direto (um clique a menos); "Escolher outra forma" continua levando à escolha.

## Verificações

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 erros (27 avisos antigos, nenhum nos arquivos alterados) |
| `npm run typecheck` | sem erros |
| `npm run test:db` | 75 arquivos, 1128 testes, e 1 arquivo, 4 testes; nenhum pulado |
| `npm run build` | sem erros |
| Playwright, build local com a CSP nova (Chromium, WebKit, Firefox) | Brick carregou nos 3 (2,1 a 4,7 s, duas rodadas); bloqueios de CSP: só `api.mercadolibre.com/tracks`; arquivo de textos cortado: aviso em 0,2 a 1,3 s com o botão; SDK sem resposta: aviso aos 10,3 s; botão gera o Pix e abre "Pague com Pix" (Chromium e WebKit, 390 px) |
| Bateria pública no domínio (`partyx-00042-ten`, antes da candidata) | 28 de 28 dos itens anteriores (agora `salesOpen=true`); os 8 itens novos da CSP falham, como esperado na revisão antiga |

Testes novos: `server/src/security/headers.test.ts` (nonce novo por página, igual no cabeçalho e no `<meta>`, depois do `charset`;
domínios; sem nonce sem o Mercado Pago) e `src/site/cardBrickMount.test.ts` (pronto com nonce, sem nonce, `create` sem controlador,
SDK com erro, SDK sem resposta aos 10 s e não antes, `onError` antes e depois de pronto, pronto depois do prazo, desmontagem).

## Cronômetro da reserva a 390 px (mesma tag, pedido do responsável)

Achado durante o diagnóstico, já em produção antes: a 360 e 390 px o relógio da reserva quebrava em duas linhas ("25:0" e "0"), no
Chromium e no WebKit. Causa: a regra do site inteiro `overflow-wrap: anywhere` (texto digitado quebra em qualquer ponto) e o relógio
como item flexível que encolhia ao lado do rótulo. Correção: o relógio leva `px-nowrap` (valor curto que não parte no meio), e quem
quebra é o rótulo. Teste: `e2e/textos-longos.spec.ts` ganhou a tela do pedido pendente (360, 768 e 1280 px, com o detector de palavra
partida) e o cronômetro numa linha só a 360 e 390 px, também no último minuto (rótulo "Menos de um minuto para pagar"); o preparo
(`e2e/support/seed-textos-longos.mts`) grava um pedido pendente com reserva ativa. Sem a correção, os 5 testes novos falham; com ela,
`npm run e2e:textos` 85 de 85.

| Comando (com o cronômetro) | Resultado |
|---|---|
| `npm run lint` | 0 erros (27 avisos antigos) |
| `npm run typecheck` | sem erros |
| `npm run test:db` | 1ª rodada: 1 falha em 1128, `environment.integration.test.ts` (o processo real do servidor não terminou na janela do teste, carga 15; falha intermitente já registrada); 2ª rodada completa: 1128 e 4, nenhum pulado |
| `npm run build` | sem erros |
| `npm run e2e:textos` | 85 de 85 |

## Candidata (OK do responsável para os três comandos, 18/10/2026 ~23:10 BRT)

| Passo | Resultado |
|---|---|
| Tag | `release-2026-10-18b` em `5fbfdab` (cartão `8233481` e cronômetro `5fbfdab`; a tag foi refeita no commit do cronômetro antes do build, nunca enviada) |
| `deploy.sh build` | Cloud Build `c966b7ef`, 1 min 50 s, imagem `partyx-api:release-2026-10-18b-5fbfdab`; textos legais da tag com os mesmos hashes |
| Backup sob demanda | `partyx-backup-dxdsf`, 02:11:39 UTC, 124.560 bytes, `check-backup.sh` OK |
| `deploy.sh candidata` | revisão **`partyx-00044-dil`**, sem tráfego, mesmo `env.prod.yaml` (venda e cadastro abertos); teste rápido 15 de 15. Público em `partyx-00042-ten` |
| Bateria pela candidata (cabeçalho do domínio) | 39 de 39: os 28 de antes e os 11 da CSP nova (nonce igual no cabeçalho e no HTML, novo a cada página, domínios, telemetria fora). A 1ª rodada teve 3 falhas da própria bateria (origem do cadastro e chamadas ao run.app levando o cabeçalho do domínio), corrigidas no script |
| Playwright pela candidata, 1280 px, duas rodadas | Brick carregou no Chromium, WebKit e Firefox (2,1 a 3,8 s); único bloqueio de CSP: `api.mercadolibre.com/tracks` |
| Antifraude, 12 a 15 s de observação | script do perfil do aparelho com o nonce; `api.mercadopago.com/v1/devices/widgets` 200 e impressão do aparelho em `www.mercadolibre.com` e `www.mercadolivre.com` 200 nos 3 navegadores; nenhum outro bloqueio de CSP |
| 390 px | cronômetro numa linha só nos 3; arquivo de textos cortado: aviso em 0,3 a 2,3 s e "Pagar com Pix" abre a tela do Pix nos 3 |
| SDK sem resposta | aviso aos 10,3 a 10,4 s nos 3 |

## Pendente

- Virada para `partyx-00044-dil` com OK do responsável (retorno: `REVISAO=partyx-00042-ten`).
- Conferir num Firefox real com a proteção estrita ligada (o Playwright não tem a lista de rastreadores): o aviso deve aparecer em
  vez da área cinza.
