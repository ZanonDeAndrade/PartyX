# Verificação do refinamento de UI (11/10/2026)

Ambiente: servidor **local** com banco de teste descartável (PostgreSQL em Docker, nunca o Neon), gateway **fictício** e
dados fictícios de `infra/ui/seed-ui.mts` e `infra/ui/flows-ui.mts`. Navegador: Chromium do Playwright 1.62 (sem aparelho
real, sem WebKit nesta medição; ver "Não verificado").

## Capturas

| Item | Resultado |
| --- | --- |
| Estados capturados | 152 telas e estados (`checklist-telas.md`), todos concluídos |
| Antes | 304 capturas em 390 e 1440 px, com e-mails e páginas do PDF (`antes/`) |
| Depois | 604 capturas em 360, 390, 768 e 1440 px, com e-mails e páginas do PDF (`depois/`) |
| Falhas de captura | 0 |
| Como repetir | `infra/ui/up-ui.sh <pasta> <build>` e `python3 infra/ui/capture.py <pasta> docs/ui/depois <largura>` |

## Rolagem horizontal em 360 px (CA-32)

- Todas as 150 capturas de página inteira em 360 px têm exatamente 360 px de largura (a captura de página inteira cresce se
  houver rolagem lateral).
- `python3 infra/ui/checks.py <pasta>`: `scrollWidth - clientWidth = 0` em 24 rotas (vitrine, acesso, compra, cliente,
  painel e portaria).

## Movimento reduzido

`infra/ui/checks.py`, com `prefers-reduced-motion: reduce`:

| Verificação | Resultado |
| --- | --- |
| Animações rodando depois do carregamento, 24 rotas | 0 em todas |
| Abertura em vídeo na página inicial | não aparece (aparece sem a preferência) |
| Abertura em vídeo fora da vitrine (pedido) | não aparece |
| View Transitions na navegação | 0 iniciadas |

Além disso, os tokens de duração vão a zero, a `motion` usa `reducedMotion="user"` e o CSS global já desliga animações e
transições nessa preferência.

## Contraste (WCAG 2.1 AA)

`node infra/ui/contrast.mjs`: 26 pares de cor dos tokens, todos em AA (tabela em `design-system.md`).

## Lighthouse (celular, simulado, mediana de 3 execuções)

Lighthouse 12.8.2, perfil móvel padrão, mesmo banco e mesmos dados para antes e depois; a abertura em vídeo toca nas duas
versões (primeira visita). Checkout medido na página de pagamento Pix (`/pedido/:id`, comprador conectado).

| Página | Desempenho antes | Desempenho depois | Acessibilidade antes / depois | FCP antes / depois | LCP antes / depois | CLS antes / depois |
| --- | --- | --- | --- | --- | --- | --- |
| Início | 49 (71, 49, 48) | 70 (69, 70, 70) | 100 / 100 | 4,55 s / 3,13 s | 4,93 s / 7,96 s | 0,506 / 0,003 |
| Evento | 70 | 79 | 100 / 100 | 4,51 s / 3,24 s | 4,98 s / 4,23 s | 0 / 0,002 |
| Checkout (Pix) | 70 | 77 | 100 / 100 | 4,66 s / 3,32 s | 4,96 s / 4,49 s | 0 / 0 |

**Piora conhecida:** o LCP da página inicial subiu porque o maior elemento passou a ser a foto do evento em destaque, que só
é conhecida depois da resposta da API. Antes, o maior elemento era o vídeo da abertura. Sugestões 13 e 14 em
`sugestoes-futuras.md` (pré-carregar o banner pelo servidor e versões menores da imagem).

Correções feitas durante a medição: o destaque da página inicial entrava depois dos dados e empurrava a página (CLS 0,72);
o rodapé aparecia na primeira tela e era empurrado ao carregar (CLS 0,40); a fonte condensada chegava tarde e mudava a
quebra dos títulos; e, no Pix, a página mostrava por um instante a mensagem do cartão ("Você será levado ao pagamento
seguro") antes do QR. Agora: esqueleto do destaque, conteúdo com altura mínima da tela, pré-carga das duas fontes da
primeira tela e esqueleto próprio do Pix.

## Pacotes (build de produção, sem protótipo)

| Pacote | Antes | Depois | gzip antes | gzip depois |
| --- | --- | --- | --- | --- |
| JavaScript da primeira visita | 615,99 kB (um pacote só) | 334,50 kB (principal 295,23 + núcleo da `motion` 39,27) | 182,94 kB | 103,70 kB |
| Recursos de animação (carregados depois) | | 38,15 kB (14,54 + 23,61) | | 15,13 kB |
| Compra | (no pacote único) | 23,98 kB | | 7,40 kB |
| Cliente | (no pacote único) | 18,75 kB (0,51 + 18,24 da conta) | | 5,72 kB |
| Gerador de QR (compra e cliente) | (no pacote único) | 23,47 kB | | 8,77 kB |
| Painel | (no pacote único) | 143,84 kB | | 34,83 kB |
| Portaria (com jsQR) | (no pacote único) | 143,71 kB | | 50,76 kB |
| CSS da primeira visita | 58,53 kB | 50,40 kB | 10,95 kB | 10,21 kB |
| CSS por área | | compra 11,56; cliente 9,20; painel 8,41; portaria 8,15 kB | | 2,60; 2,17; 2,06; 1,95 kB |

Build de homologação com o protótipo: antes 617,64 kB no principal mais 467,48 kB do protótipo (já carregado à parte);
depois 372,83 kB no principal, o protótipo igual.

### Bibliotecas adicionadas

| Pacote | Versão | Peso |
| --- | --- | --- |
| `motion` | 14.1.0 | núcleo (`m`, `LazyMotion`, `AnimatePresence`, `MotionConfig`) cerca de 7,8 kB gzip no pacote principal; recursos de animação (`domAnimation`) cerca de 15 kB gzip, carregados depois da primeira pintura; `animate` só no pacote do painel |
| `@fontsource-variable/big-shoulders-display` | 5.3.0 | 35,5 kB (woff2 latino) |
| `@fontsource-variable/archivo` | 5.3.0 | 34,9 kB (woff2 latino) |
| `@fontsource/big-shoulders-stencil-display` | 5.3.0 | 14,7 kB (só o 404) |
| `@fontsource/ibm-plex-mono` | 5.3.0 | 14,7 kB + 14,9 kB (400 e 500) |

As fontes substituem o Google Fonts (mesmas Archivo e IBM Plex Mono, agora servidas pelo site). Os arquivos `latin-ext` e
`vietnamese` entram no build, mas o navegador só os baixa se a página tiver esses caracteres (`unicode-range`).

## Testes e verificações de código

| Comando | Resultado |
| --- | --- |
| `npm run lint` | sem erro; nenhum aviso nos arquivos alterados (avisos antigos do protótipo e de `server/src/exports/csv.ts`) |
| `npm run typecheck` | sem erro |
| `npm run test:db` | 808 de 808 e 4 de 4 (cluster), nenhum teste pulado |
| `npm run build` | sem erro; o aviso de pacote acima de 500 kB deixou de aparecer |
| `infra/testes/round.mjs` (ponta a ponta pela API, banco novo) | 28 de 28 |
| `infra/testes/compat.py` (Chromium, Firefox e WebKit em 1366, 360 e 768 px; Pixel 7 e iPhone 14 emulados) | 275 de 275 páginas sem rolagem horizontal, com `h1`, sem tela de erro e sem erro de console |

Na primeira rodada do `compat.py` apareceram dois achados, corrigidos: (1) as View Transitions puladas (duas navegações
seguidas, como entrar e ser redirecionado) rejeitavam promessas não tratadas, registradas como erro de página nos três
motores; (2) no WebKit, o texto interno de um `<select>` alargava o ranking de promoters em 360 e 768 px (proteção que já
existia no CSS antigo e foi restaurada).

## Não verificado

Aparelhos reais (iPhone e Android; WebKit e Firefox foram verificados só em emulação, pelo `compat.py`), movimento e
Lighthouse fora do Chromium, leitores de tela
reais, clientes de e-mail reais (Gmail, Outlook, Apple Mail) e impressão física do PDF. A aprovação escrita do cliente
(CA-33) continua pendente.
