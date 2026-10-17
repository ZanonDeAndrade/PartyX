# Abertura em toda carga de página (16/10/2026)

Pedido do responsável (Arthur), em 16/10/2026: a abertura em vídeo (logo PartyX, cerca de 3 s) deve aparecer sempre que a pessoa abrir o site; hoje aparece só às vezes. Diagnóstico primeiro, sem mudar nada; depois as regras novas, com a lista de rotas excluídas aprovada antes. Regras: testes, capturas, commit local, candidato montado com `SALES_OPEN=false`, comandos mostrados antes, sem virada e sem push sem OK.

## Diagnóstico (antes da mudança)

Quem decidia era `public/intro/gate.js`, antes da primeira pintura; o vídeo ficava em `src/site/IntroSplash.tsx`.

1. **Marca de "já viu":** `partyx_intro_seen` no sessionStorage, gravada na primeira página aberta na aba (qualquer página, até as que não tocavam). Recarregar, voltar ou abrir outra página na mesma aba não tocava. Sem sessionStorage, nunca tocava. Nada em localStorage nem em cookie.
2. **Só três rotas** (`/`, `/eventos`, `/eventos/<evento>`) e só na primeira carga; links internos nunca tocavam.
3. **Nunca tocava** com "reduzir movimento" ou com economia de dados.
4. **Autoplay bloqueado:** `play()` recusado fechava a abertura na hora (iPhone em Pouca Energia, navegadores internos que exigem toque).
5. **Prazo de 5 s contado com o carregamento do site:** o vídeo só começava a baixar depois do JavaScript do site; em rede lenta a abertura era cortada, e com o JavaScript acima de 4,6 s fechava ao aparecer.
6. **Voltar:** restaurada do cache do navegador, a página não roda script de novo; sem cache, a marca da sessão impedia.

Não era o formato: o site servia MP4 H.264 (1080 x 1080, 80 KB, faststart) e WebM VP9 (99 KB), sem áudio; o `.MOV` HEVC fica só em `assets-originais/`. O servidor responde em partes (206), como o iPhone exige.

## Decisões do responsável

- Rotas excluídas: as pedidas (painel, portaria, checkout, pagamento, ingresso com QR, recuperação de senha; confirmação de e-mail não existe no sistema) e as quatro sugeridas: `/meus-ingressos`, `/autorizacao-menor/pedido/<id>`, `/primeiro-acesso`, `/entrar` e `/criar-conta`.
- Vídeo: o MP4 quadrado que o site já usava (1080 x 1080, H.264, fundo `#0B0B10`); sai só o WebM. O MP4 em retrato gerado pelo comando do pedido (`assets-originais/partyx-abertura-1080.mp4`, fora do Git) foi apagado.
- Economia de dados: direto para a animação em CSS, sem baixar o vídeo.
- Limite de **4 s** (em vez de 3,5 s), contados da abertura do site ou da volta à aba, com o fade.

## Regras novas

| Situação | Abertura |
|---|---|
| Carga de página (primeira visita, recarregar, nova aba, link do Instagram ou do WhatsApp) | Toca |
| Voltar restaurada do cache do navegador (`pageshow` com `persisted`) | Toca |
| Voltar com recarga | Toca (é carga de página) |
| Volta para a aba depois de 1 minuto ou mais fora | Toca de novo |
| Volta para a aba com menos de 1 minuto | Não toca |
| Aba escondida com a abertura na tela | A abertura sai na hora |
| Aba aberta em segundo plano | Toca quando a aba aparecer |
| Link dentro do site (sem recarregar) | Não toca (não é carga de página) |
| Rotas de tarefa (abaixo) | Nunca, nem na volta para a aba; o vídeo não é baixado |

**Rotas de tarefa:** `/admin` e `/admin/...`; `/portaria` e `/portaria/...`; `/checkout/...`; `/pedido/...`; `/ingressos/...` (QR, tela cheia, transferir); `/meus-ingressos`; `/autorizacao-menor/...`; `/entrar`; `/criar-conta`; `/primeiro-acesso`; `/recuperar-senha`; `/redefinir-senha`. Barra no fim não muda nada.

**Modos:** vídeo MP4 sem som; se o `play()` for recusado ou o vídeo não começar em 1 s, o logo PartyX em SVG com uma animação em CSS de cerca de 1,5 s (o X aparece no meio e vai para o lado, o PARTY sai de trás dele), o logo parado um instante e o fade; com economia de dados, direto nessa animação; com "reduzir movimento", o logo parado com um fade curto (cerca de 1,5 s no total).

**Tempo:** some em no máximo 4 s com o fade. O vídeo tem 2,94 s e se mexe até o último quadro; o fade (300 ms) começa no fim dele e encurta quando sobra pouco até os 4 s, para o vídeo terminar inteiro mesmo começando com até 1 s de atraso. Se a página só chegar depois de 2,5 s, a abertura não começa (seria só um piscar).

**Pular:** um toque em qualquer lugar, o Esc ou o botão "Pular". O pulo usa o clique (fim do toque), e a camada continua por cima durante o fade: nada passa para o link de baixo. A página fica inerte até a camada sair; no teclado, o primeiro Tab chega ao "Pular".

## O que mudou

| Arquivo | Mudança |
|---|---|
| `index.html` | Camada `#px-abertura` no HTML inicial: vídeo sem endereço (`muted`, `playsinline`, `autoplay`, `preload="auto"`, poster preto de 1 pixel em `data:`), logo em SVG (X e PARTY separados, para a animação) e "Pular". Script `/intro/abertura.js` no `<head>` |
| `public/intro/abertura.js` (novo) | Decide e controla a abertura, sem React. Nome novo porque o estático fica 1 hora em cache nos aparelhos. Qualquer erro inesperado tira a camada |
| `src/site/styles/abertura.css` (novo) | Estilos da camada e das animações, no CSS de entrada (`src/main.tsx`) |
| `src/index.css` | Fundo preto desde o primeiro quadro com a marca nova (`data-px-abertura`) |
| Removidos | `public/intro/gate.js`, `public/intro/partyx-intro.webm`, `public/intro/partyx-intro-poster.jpg`, `src/site/IntroSplash.tsx` e o CSS `.px-intro*` de `public.css` |
| `src/site/SiteApp.tsx` | Sem o componente da abertura |
| Testes | `e2e/abertura.spec.ts` e `e2e/abertura.config.ts` (novos, `npm run e2e:abertura`); os e2e que pulavam a abertura pela marca do sessionStorage passam a usar o aviso só de teste `window.__partyxSemAbertura = true`; `server/src/app.cache.test.ts` sem o WebM; `infra/ui/checks.py` com as regras novas |

O logo em SVG foi vetorizado do original (`assets-originais/IMG_3404.PNG`) com potrace, fora do projeto: 99,87% de sobreposição com a imagem original e cerca de 2,7 KB no HTML.

## Verificação (local)

`e2e/abertura.spec.ts`, 15 testes em 3 aparelhos (computador Chromium 1280 x 800, Chrome do Android 360 x 800, WebKit com viewport do iPhone 390 x 844) = 45 casos. Os 14 primeiros passaram em quatro rodadas seguidas; o da aba aberta em segundo plano entrou na última (45 de 45):

- primeira carga: a camada vem no HTML, a marca é posta antes de existir o `<body>` (nada aparece antes dela), o vídeo começa antes de 1 s e termina inteiro, e a camada sai em até 4 s;
- a página carrega por baixo durante a abertura (montada, inerte, com as chamadas à API saindo, sem rolagem);
- recarregar, nova aba, link vindo do Instagram e do WhatsApp;
- Voltar com recarga e Voltar restaurada do cache (`pagehide`, aba escondida e visível, `pageshow` com `persisted`);
- volta para a aba com 59 s (não aparece) e com 60 s (aparece); aba escondida com a abertura na tela (sai na hora); aba aberta em segundo plano (toca quando aparece);
- cada rota de tarefa (19 endereços, com barra no fim e com `?voltar=`): não aparece, nem na volta para a aba, e o vídeo não é baixado;
- páginas do site fora da lista (início, eventos, evento, documentos, minha conta, minhas compras, 404): aparece;
- `play()` recusado: logo em SVG animado, sem pular a abertura, vídeo solto;
- vídeo que não começa em 1 s: troca para o CSS em 1 s;
- vídeo com meio segundo de atraso: termina inteiro dentro dos 4 s;
- economia de dados: direto para o CSS, sem pedir o vídeo;
- "reduzir movimento": logo parado, só o fade, sem pedir o vídeo;
- toque (celular) e clique (computador) em cima de um link: a abertura sai e o link não abre; depois dela, o mesmo ponto abre o link;
- Esc pula; no Chromium, o Tab chega direto ao "Pular".


**Limites do teste:**
- **bfcache:** o Chromium e o WebKit do Playwright não restauram páginas do cache no Voltar (recarregam), e o Firefox com o cache ligado trava o próprio Playwright; a volta do cache foi conferida com a mesma sequência de eventos do navegador. Conferir num aparelho.
- **Vídeo no WebKit do Linux:** o MP4 H.264 toca (o tempo avança e o fim chega), mas sai branco na captura; o WebM antigo saía certo. É o decodificador do WebKit desta máquina sem GPU; no iPhone, o H.264 é o formato nativo. Conferir no aparelho.
- **Página do evento no WebKit do Linux:** o processo da página cai com frequência ao abri-la, com ou sem a abertura e também no build publicado (`release-2026-10-16b`: 15 de 18 aberturas; build novo: 9 de 18). Não é desta mudança; no e2e da abertura, o WebKit usa a lista de eventos no lugar dela, e a página do evento fica coberta no Chromium. Achado separado, a investigar.
- **Autoplay real** (Pouca Energia, navegador interno do Instagram, economia de dados do Android) só se confirma no aparelho; os testes forçam a recusa do `play()` e a economia de dados.

**Conferir no aparelho, depois da publicação:** iPhone (Safari normal e em Pouca Energia), Android (Chrome e com economia de dados), link aberto pelo Instagram e pelo WhatsApp, Voltar depois de abrir um link de fora, e volta para a aba depois de 1 minuto.

## Resultados da bateria (local, 16/10/2026)

| Teste | Resultado |
|---|---|
| Lint | 0 erros (27 avisos antigos) |
| Tipos e build | ok |
| `test:db` | 1.107 + 4 |
| `check:migrations` | ok (17 migrações; nenhuma nova) |
| Abertura | 45 |
| Painel no celular | 62 |
| Busca | 4 |
| Textos longos | 78 |
| Documentos | 3 |
| Transições | 12 |
| Cronômetro | 8 |
| Cor | 8 |
| Transferência | 6 |
| Turnstile | 6 |
| Responsivo | 593 |
| Roteiro de compra, gateway fictício | 20 (1 pulado, como antes) |

Capturas a 360, 390 e 1280 px (vídeo, plano B em CSS no meio e no fim, logo parado): página privada https://claude.ai/artifact/QcHK25s8tsa7YtztGkKzfL.
