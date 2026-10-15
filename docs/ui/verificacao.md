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

Além disso, os tokens de duração vão a zero (desde 15/10/2026 sem a `motion`: tudo é CSS) e o CSS global já desliga animações e
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

**Piora corrigida depois:** o LCP da página inicial tinha subido porque a foto do destaque só era conhecida depois da resposta
da API. A correção e a nova medição estão na seção "LCP da página inicial" abaixo.

Correções feitas durante a medição: o destaque da página inicial entrava depois dos dados e empurrava a página (CLS 0,72);
o rodapé aparecia na primeira tela e era empurrado ao carregar (CLS 0,40); a fonte condensada chegava tarde e mudava a
quebra dos títulos; e, no Pix, a página mostrava por um instante a mensagem do cartão ("Você será levado ao pagamento
seguro") antes do QR. Agora: esqueleto do destaque, conteúdo com altura mínima da tela, pré-carga das duas fontes da
primeira tela e esqueleto próprio do Pix.

## LCP da página inicial (correção de 11/10/2026)

O que mudou:

1. **Vitrine no HTML:** ao servir `/`, o servidor embute os dados da vitrine (`<script type="application/json">`), o
   `preload` do banner do destaque com `fetchpriority="high"` e uma cópia estática do cabeçalho e do destaque, que o React
   troca pelo mesmo conteúdo ao montar. A consulta fica 60 s em memória. O front-end não chama a API na primeira visita.
2. **Banners responsivos:** versões de 640 e 1080 px (WebP) no envio, `srcset` e `sizes` nas imagens; migração `0007` com
   reversão; banners antigos por `npm run banners:versoes` (só confere sem `--executar`; não executado em produção).
3. **Abertura em vídeo:** o conteúdo carrega por baixo dela normalmente. Medido: sem a abertura, o LCP da inicial caía de
   4,90 s para 4,22 s (simulado), porque a camada da abertura só aparecia depois do JavaScript. Agora o primeiro quadro da
   abertura é desenhado já com o HTML (camada estática que o vídeo substitui), e a página por baixo também.
4. **CSP:** `fonts.googleapis.com` e `fonts.gstatic.com` saíram (fontes servidas pelo site).
5. **G05 sessão expirada:** um 401 numa ação encerra a sessão na tela, o login mostra "Sua sessão terminou" e, depois de
   entrar, a pessoa volta para a mesma página (carrinho preservado no sessionStorage; alterações não salvas continuam pedindo
   confirmação antes de sair). Conferido com expiração real da sessão no banco.

Medição: Lighthouse 12.8.2, celular, mediana de 3 execuções por página, as três versões no **mesmo banco e na mesma rodada**:
"original" é a interface antes do refinamento, "redesenho" é o refinamento antes desta correção e "agora" é esta versão.
Duas formas de limitar rede e processador: **simulada** (padrão do Lighthouse, a usada nas medições anteriores) e
**real** (`--throttling-method=devtools`, que de fato limita o navegador; é a que mostra o efeito de desenhar o destaque antes
do JavaScript, porque a simulação reaproveita a ordem de pintura de uma carga sem limite).

| Página | Versão | Desempenho (simulada) | LCP (simulada) | Desempenho (real) | LCP (real) | CLS (real) | Acessibilidade |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Início | original | 69 | 5,02 s | 43 | 5,79 s | 0,751 | 100 |
| Início | redesenho | 79 | 4,23 s | 73 | 4,69 s | 0,003 | 100 |
| Início | **agora** | 79 | **4,53 s** | **90** | **2,60 s** | **0,002** | 100 |
| Evento | original | 70 | 4,98 s | 46 | 5,75 s | 0,453 | 96 a 100 |
| Evento | redesenho | 79 | 4,23 s | 74 | 4,67 s | 0,002 | 100 |
| Evento | **agora** | 80 | 4,22 s | **87** | **3,18 s** | 0,002 | 100 |
| Checkout (Pix) | original | 70 | 4,96 s | 56 | 6,22 s | 0,171 | 100 |
| Checkout (Pix) | redesenho | 78 | 4,26 s | 49 | 6,07 s | 0,287 | 96 |
| Checkout (Pix) | **agora** | 77 | 4,49 s | 66 | 6,18 s | **0** | 100 |

Meta "LCP da inicial abaixo de 4,9 s, sem CLS": **atingida** nas duas formas de medir (4,53 s simulada, com execuções de
3,73 a 4,56 s; 2,60 s real; CLS 0,002).

Observações honestas:

- O valor de 7,96 s medido antes (seção anterior) **não se repetiu** nesta rodada: aqui o "redesenho" ficou em 4,23 s
  simulado. A rodada anterior usou outra semente de dados e, nesta, as versões antigas carregam os banners de outra porta do
  mesmo servidor; por isso a comparação válida é a desta tabela, com as três versões lado a lado.
- No checkout, o maior elemento é o QR do Pix, gerado no navegador depois dos dados do pedido: o LCP real continua perto de
  6,2 s nas três versões. Não fazia parte desta correção.

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
| `motion` | 14.1.0 | **Removida em 15/10/2026** (`docs/registros/transicoes-2026-10-15.md`): o movimento passou a ser CSS e Web Animations API. A primeira visita caiu de 109,8 kB para 94,2 kB de JavaScript comprimido (saíram o pacote principal da `motion` e o núcleo pré-carregado); os recursos carregados depois (5,8 kB) e o pacote do painel (de 43,6 para 38,8 kB) também diminuíram |
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
