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
| `public/intro/abertura.js` (novo; em 17/10/2026 passou para `src/intro/`, ver o ajuste abaixo) | Decide e controla a abertura, sem React. Nome novo porque o estático ficava 1 hora em cache nos aparelhos. Qualquer erro inesperado tira a camada |
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

## Ajuste de 17/10/2026: prazos desde a camada e arquivos com hash

**O que a candidata mostrou.** A `release-2026-10-16c` foi montada como candidata sem tráfego (`partyx-00039-faz`, 17/10/2026 00:30 UTC, com o SMTP). Conferida pela internet, a abertura apareceu, mas o vídeo não tocou em nenhum dos três aparelhos: o 1 s para o vídeo começar contava desde o clique, e o HTML chega de 0,4 a 1,2 s depois dele (pelo domínio; o vídeo leva mais 1,1 a 1,2 s para baixar). Nos testes locais o servidor responde em milissegundos, por isso não apareceu antes. Medido no navegador local, sem mexer na candidata, trocando só o script: contando do clique, o vídeo tocou em 2 de 8 primeiras visitas (numa delas a abertura nem apareceu, porque o HTML chegou depois de 2,5 s); contando de quando a camada aparece, em 6 de 8, sempre com no máximo 4 s na tela. Um vídeo a 30 fps ficaria com 61 a 71 KB (contra 80 KB): não compensa.

**Decisão do responsável:** contar o 1 s e os 4 s desde que a camada aparece; vídeo e script com nome com hash, cache longo e imutável, guardados na Vercel, para quem volta ao site já ter o vídeo no aparelho. A `00039-faz` não será virada.

**O que mudou:**

| Arquivo | Mudança |
|---|---|
| `src/intro/abertura.js` (antes `public/intro/`) | Os prazos (1 s para o vídeo começar, 4 s na tela, a animação em CSS e o logo parado) contam do primeiro quadro desenhado com a camada (`requestAnimationFrame`; o CSS do site segura a pintura até chegar). O vídeo continua começando a baixar assim que o HTML chega. Saiu a regra que pulava a abertura quando o HTML chegava depois de 2,5 s. Se a página nunca pintar, a camada sai em 15 s |
| `vite.config.ts` (plugin `px-intro-assets`) | No build, copia o script (sem as linhas de comentário, 7,4 KB; 2,5 KB comprimido) e o vídeo para `/assets` com hash do conteúdo no nome, troca o endereço do vídeo no script e aponta o `index.html` para ele. No desenvolvimento, o Vite serve os dois direto de `src/intro` |
| `src/intro/partyx-intro.mp4` (antes `public/intro/`) | O mesmo arquivo, sem mudança |
| Cache | `/assets/*`: 1 ano, imutável (o servidor já fazia, também nos pedaços do vídeo), e a Vercel guarda esses arquivos (`infra/vercel/vercel.json`, sem mudança; conferido pelo domínio: os `/assets` atuais dão `x-vercel-cache: HIT`, e o vídeo antigo em `/intro` dava `MISS` com 1 hora de cache) |
| Testes | `e2e/abertura.spec.ts` mede os prazos a partir do primeiro quadro e ganha dois testes (HTML que chega depois de 3 s: a abertura aparece inteira; script e vídeo com hash, cache imutável e 206 no vídeo, endereço antigo fora); `server/src/app.cache.test.ts` confere o vídeo em `/assets` com cache imutável e Range |

**E-mails de cadastro parados desde 14/10 (15 em `falhou`):** ficam como estão, por decisão do responsável. Conferido no código que nenhuma rotina os envia depois da virada: o envio (na hora, pelas novas tentativas do Cloud Tasks e pela varredura diária) só pega e-mails `pendente`; uma tarefa antiga que chegue para um e-mail em `falhou` responde "já resolvido"; reabrir só existe em `POST /api/admin/emails/:id/retry`, à mão, e nenhuma tela do painel chama essa rota; o e-mail de cadastro tem chave única por pessoa e nunca é gerado de novo. A fila do Cloud Tasks (`partyx-conciliacao`) estava vazia em 17/10/2026.

**Bateria (local, 17/10/2026):** lint 0 erros (27 avisos antigos), tipos e build ok, `test:db` 1.107 + 4, abertura 51 (17 testes x 3 aparelhos), painel no celular 62, busca 4, textos longos 78, documentos 3, transições 12, cronômetro 8, cor 8, transferência 6, Turnstile 6, responsivo 593, roteiro de compra com gateway fictício 20 (1 pulado, como antes).

**Candidata `partyx-00040-dow` (`release-2026-10-16d`, 18/10/2026 20:09 UTC, sem tráfego, com o SMTP):** build `30a41554`, backup `partyx-backup-jsg9j`, teste rápido 15 de 15 com `salesOpen=false`. Script e vídeo com hash (`/assets/abertura-H5co4uFN.js`, `/assets/partyx-intro-HuldccPs.mp4`) com cache de 1 ano, imutável; o vídeo responde em partes (206). Os endereços antigos em `/intro` respondem com o HTML do site, como qualquer endereço inexistente. A Vercel não guarda o HTML (`x-vercel-cache: MISS` em todas as páginas; `no-cache` no HTML, menos a página do evento, com `max-age=60` só no navegador): por isso `/intro` não precisa continuar no ar.

Medição pela internet na candidata (8 primeiras visitas por aparelho, cada uma num navegador novo, e 3 voltas com recarregar):

| Aparelho | 1ª visita com vídeo | Vídeo começa, depois da camada | Mais tempo na tela | Volta (recarregar) |
|---|---|---|---|---|
| Chromium, computador 1280 | 7 de 8, todos inteiros | 73 a 298 ms | 3,54 s | 3 de 3 com vídeo (31 a 173 ms) |
| Chrome do Android 360 | 6 de 8, todos inteiros | 252 a 431 ms | 3,67 s | 2 de 3 com vídeo (21 e 31 ms) |
| WebKit, viewport de iPhone 390 | 8 de 8, todos inteiros | 5 a 324 ms | 3,57 s | 3 de 3 com vídeo |

As outras visitas caíram no logo em CSS. Na `00039-faz` (prazo contado do clique), o vídeo não tinha tocado em nenhum dos três. Pelo domínio (ainda na `00037-zap`): HTML em 0,13 a 0,24 s (3,5 s na primeira, com o serviço acordando); arquivo de `/assets` pela Vercel em 0,12 s com `HIT` depois da primeira vez; o vídeo antigo em `/intro` sempre `MISS`. O vídeo com hash só chega à Vercel depois da virada.

## Publicação

Publicado em 18/10/2026 20:20 UTC, com o OK do responsável: `release-2026-10-16d`, revisão `partyx-00040-dow` (`publicacao-producao-2026-10-18.md`), junto com o e-mail ligado. Pelo domínio, depois da virada: script e vídeo novos com `x-vercel-cache: HIT` (o vídeo a partir do segundo pedido); vídeo em 20 de 24 primeiras visitas (computador 7 de 8, Android 5 de 8, WebKit 8 de 8), as outras no logo em CSS, no máximo 4,0 s na tela; sem rolagem lateral nem erro. Falta conferir num iPhone e num Android de verdade: Safari normal e em Pouca Energia, Chrome com economia de dados, links do Instagram e do WhatsApp, Voltar depois de um link de fora e volta para a aba depois de 1 minuto.

