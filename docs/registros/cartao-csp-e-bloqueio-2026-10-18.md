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

## Pendente

- Candidata com a mesma configuração de venda aberta (comandos mostrados ao responsável antes) e, com OK, a virada.
- Conferir num Firefox real com a proteção estrita ligada (o Playwright não tem a lista de rastreadores): o aviso deve aparecer em
  vez da área cinza.
- Achado fora do pedido, já em produção antes desta mudança: a 390 px, o cronômetro da reserva quebra em duas linhas ("25:0" e "0"),
  no Chromium e no WebKit.
