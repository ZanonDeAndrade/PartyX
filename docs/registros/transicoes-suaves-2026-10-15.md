# Transições mais suaves, segunda versão (15/10/2026)

Pedido do responsável (Arthur), nesta data, depois da publicação da `release-2026-10-15e`: "as transições ainda estão bruscas. Quero bem mais suaves, ao abrir o site e ao entrar em um evento", com parâmetros e correções definidos (curva, durações, cascata com sobreposição, capa sem desfoque animado, elemento compartilhado do cartão para a página, pré-carregamento, fundo escuro desde o primeiro pixel, nada escondido esperando JavaScript, sem pulos, fluidez em celular médio, painel e portaria como estavam, menos movimento com esmaecer simples) e vídeo antes e depois. Regras: testes, vídeo ou capturas, commit local, OK antes de publicar. Primeira versão: `transicoes-2026-10-15.md`.

## Como ficou

| Onde | Antes (no ar, `partyx-00024-kuy`) | Agora |
|---|---|---|
| Tokens | 400 ms, `cubic-bezier(0.22, 1, 0.36, 1)`, passo de 60 ms, desfoque de 8 px e subida de 12 px em tudo | 720 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, passo de 100 ms (o próximo começa com o anterior ainda entrando), subida de 8 px; desfoque de 4 px só em texto e blocos pequenos (`.px-in`); blocos grandes e cartões só sobem e esmaecem (`.px-in-block`, `px-lift`) |
| Capa | Miniatura de 32 px com `filter: blur(16px)` por cima, esmaecendo em 500 ms | Miniatura de 48 px **já desfocada no servidor** (sem filtro na página), trocada pela nítida em 700 ms; a capa do evento assenta de 1,04 para 1 em 1200 ms (propriedade `scale`, separada da paralaxe); `will-change` só enquanto carrega |
| Cartão para evento | Capa compartilhada; a página mostrava o esqueleto e fazia a própria cascata | Pré-carrega dados e capa (já decodificada) quando o dedo encosta, o mouse passa ou o foco chega; no clique espera até 500 ms essa busca; View Transition com capa, título e data compartilhados (600 ms), cabeçalho do evento com nome próprio (por cima da capa) e o resto em troca cruzada de 450 ms; a página não repete a cascata |
| Sem View Transitions | Esmaecer de 200 ms | Esmaecer de 350 ms (Web Animations) |
| Abrir o site | Fundo cinza-claro até o JavaScript na página do evento aberta direto | Fundo preto desde o primeiro quadro em toda a vitrine (`public/intro/gate.js` marca `data-px-vitrine` antes da pintura); o texto do destaque esmaece em 600 ms só por CSS (aparece sem JavaScript) e o React continua do mesmo ponto; cartões em cascata |
| Esqueletos | Linhas soltas, de outra altura; troca seca | Mesmas classes e medidas do conteúdo (cartão com título, data, local e rodapé; página do evento com capa, data, título, cronômetro e Quando, Onde e Classificação); o mesmo esqueleto esmaece por cima do conteúdo (420 ms) |
| Fontes | Reserva com outras medidas (o título do evento mudava de 3 para 2 linhas quando a fonte chegava) | Reserva Arial/Liberation (e Roboto no Android) ajustada: Archivo 98,5% e 99% em negrito, Big Shoulders 65%, com as alturas da fonte (medido no Chromium) |
| Cabeçalho | O "Entrar" aparecia depois da sessão e empurrava os ícones (CLS 0,0029) | Lugar guardado enquanto a sessão é conferida |
| Página do evento aberta direto | Capa pedida só depois do JavaScript e da API | `preload` da capa no HTML do servidor (prioridade normal) |
| Lista | Imagem do primeiro cartão com carregamento preguiçoso | Primeiro cartão carrega direto (é o LCP) |
| Cronômetro e número que rola | 260 ms e 180 ms | 380 ms e 260 ms, mesma curva |
| Menos movimento | Nada animava | Só esmaecer simples de 250 ms (sem subir, desfocar, crescer, cascata nem View Transition); esqueleto, indicador girando e número que rola param; a regra global de `src/index.css` vale só fora do site |
| Painel e portaria | Painel só esmaece 180 ms; portaria sem entradas | Igual (também para a classe nova) |

**Corrigido de passagem (defeito da `release-2026-10-15e`):** a camada da capa usava o `::after` da própria capa, que já desenhava o degradê escuro da base; com isso o degradê sumiu da capa do evento e do destaque. A camada agora é um elemento próprio (`.px-banner-cover`) e o degradê voltou. Também corrigido no caminho: o esqueleto do bloco da data aparecia roxo com "00 OUT".

Sem migração: a miniatura continua em `events.banner_placeholder`, só gerada de outro jeito (as capas enviadas antes continuam com a de 32 px até serem reenviadas ou o `npm run banners:versoes` rodar; em produção o `teste01-2` não tem miniatura).

## Medição

Chromium do Playwright, celular simulado (360 x 800, DPR 2, CPU 4x mais lenta, rede 4G lenta de 150 ms e 1,6 Mbps, sem cache, abertura em vídeo já vista), servidor local com o build de produção. Versão anterior (a do ar) e nova servidas na mesma porta, intercaladas, duas rodadas de 5; média das medianas.

| Página | LCP antes / depois | CLS antes / depois | TBT antes / depois | FCP antes / depois |
|---|---|---|---|---|
| Evento | 3178 / 3076 ms | 0,0029 / 0 | 0 / 0 ms | 2710 / 2812 ms |
| Vitrine (início) | 1466 / 1480 ms | 0,0029 / 0 | 24 / 28 ms | 1466 / 1480 ms |
| Lista de eventos | 3294 / 3242 ms | 0,0029 / 0 | 0 / 0 ms | 2736 / 2770 ms |

- **Evento:** o `preload` da capa melhora o LCP em cerca de 100 ms; neste servidor local (HTTP/1.1, sem prioridade entre conexões) a capa divide a banda com o JavaScript e o cabeçalho aparece cerca de 100 ms depois (FCP). Com prioridade alta, o FCP piorava mais; ficou em prioridade normal.
- **Vitrine:** igual dentro da variação. A primeira tentativa esmaecia o destaque inteiro e o LCP piorava 600 ms (o navegador conta a capa no fim do esmaecer); agora só o texto esmaece.
- **CLS a zero** nas três: lugar do "Entrar" guardado e fontes de reserva com as mesmas medidas (com as fontes atrasadas 2,5 s, o título da página do evento não muda mais de tamanho: CLS 0,036 antes, 0,0002 agora).

Fluidez, intervalo entre quadros (requestAnimationFrame) com CPU 4x mais lenta, 3 rodadas:

| Situação | Antes | Depois |
|---|---|---|
| Abrir o site (2,5 s desde a primeira pintura) | 1 quadro de 117 a 183 ms (início do React, tarefa de 73 a 91 ms) | 1 quadro de 117 a 150 ms (o mesmo) |
| Abrir o evento direto (2,5 s desde o conteúdo) | nenhum acima de 33 ms | nenhum acima de 50 ms |
| Tocar no cartão e entrar (1,5 s) | nenhum acima de 50 ms, mas com esqueleto e um segundo desenho depois | uma pausa de 83 ms antes da troca, sem esqueleto; durante a troca nenhum acima de 40 ms |

- A pausa de 83 ms ao tocar no cartão é a View Transition fotografando a página nova já completa (desenho do React em cerca de 34 ms mais a captura; o navegador mantém a página antiga parada na tela). Sem View Transition ela seria de 50 a 67 ms; com só a raiz, igual. Decodificar a capa no pré-carregamento não mudou nada.
- O quadro de 67 a 83 ms que aparece ao abrir o evento direto, no instante em que os dados chegam, existe igual na versão anterior (é o React desenhando a página, antes de qualquer animação); não entra na janela "desde o conteúdo".
- Ao abrir o evento direto com a capa já chegando, o desfoque de 4 px, o zoom e a troca da capa não geram quadros longos (testado ligando e desligando cada um).

## Premissas e decisões

- No celular, o quadro de ingressos continua sem animar, para a barra de compra estar na tela desde o primeiro quadro.
- O destaque da página inicial: a imagem não esmaece (só o texto), para não atrasar o LCP; ela aparece pela miniatura e pela capa.
- "Painel do desempenho" não foi aberto num aparelho Android de verdade: a fluidez foi medida no Chromium com CPU 4x mais lenta (renderização por software, mais pesada que a GPU de um celular).

## Verificação (local)

- `npm run lint` (0 erros, 27 avisos antigos), `npm run typecheck`, `npm run build`, `npm run check:migrations` (16 migrações), `npm run test:db` (1.090 + 4, nenhum pulado).
- `npm run e2e:transicoes` (12 de 12, três rodadas seguidas), `npm run e2e:textos` (78), `npm run e2e:cronometro` (7), `npm run e2e:cor` (6), `npm run e2e:responsivo` (597), roteiro 11.2 com gateway fictício (20 de 20).
- Vídeos de abrir o site e entrar num evento a 360 px, antes e depois (e com menos movimento), e a entrada quadro a quadro: página privada para o responsável (link no relatório da sessão).

## Publicação

Publicado em 15/10/2026 17:40 UTC, com o OK do responsável ("pode comitar e fazer deploy"): `release-2026-10-15f`, revisão `partyx-00026-rim`, sem migração. Registro: `publicacao-producao-2026-10-15f.md`; retorno para a `partyx-00024-kuy`.

Conferido no ar, a 360 e 1280 px: capa nítida com o degradê, View Transition do cartão para o evento, nada sobrando depois da entrada, sem rolagem lateral; com "reduzir movimento", só opacidade. Detalhe: nesse modo, o esqueleto, quando aparece, ainda esmaece por cima do conteúdo em 420 ms (só opacidade, sem movimento); o resto usa 250 ms.
