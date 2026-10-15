# Transições suaves no site (15/10/2026)

Pedido do responsável (Arthur), nesta data: transições no estilo do vídeo de referência da página do evento (a capa começa desfocada e fica nítida; os elementos entram com desfoque e esmaecer, em cascata, subindo um pouco), com um padrão único de tokens, versão discreta no painel, nada na portaria, menos movimento respeitado, nenhuma animação contínua, nada segurando "Continuar" ou o pagamento, e LCP, CLS e TBT medidos antes e depois no celular, sem piorar. Regras do pedido: testes, capturas, commit local, OK antes da virada.

## Como ficou

| Onde | Movimento |
|---|---|
| Padrão (todo o site) | Classe `.px-in`: de `opacity 0`, `blur(8px)` e 12 px abaixo até o lugar, em 400 ms, curva `cubic-bezier(0.22, 1, 0.36, 1)`; em cascata, 60 ms por posição (`--i`). Só `opacity`, `transform` e `filter`, com preenchimento "backwards": no fim nada sobra no elemento |
| Página do evento | Capa: a miniatura de 32 px (embutida em `data:`) aparece desfocada na hora; quando a capa nítida termina de carregar, a camada desfocada esmaece em 500 ms. Data e título entram primeiro, depois o cronômetro, depois Quando, Onde e Classificação; o resto acompanha a última posição. **A primeira tela fica completa em 640 ms** (4 x 60 + 400) |
| Cronômetro | Só o número que muda desce 34% e assenta em 260 ms, já visível desde o começo (sem piscar); os outros blocos ficam parados. O ponto de "Acontecendo agora" pulsa três vezes e para |
| Vitrine | Cartões ficam transparentes até aparecer na tela (IntersectionObserver) e entram com o padrão, em cascata com os que apareceram junto; só na primeira vez em cada visita |
| Botões e cartões | Passar o mouse: botão sobe 1 px (o principal ganha uma sombra da própria cor), cartão sobe 3 px e a imagem cresce até 1,02, em 150 ms. Tocar: afunda um pouco. Só no site e na compra |
| Troca de página | View Transitions: a página antiga some em 160 ms, a nova aparece em 260 ms com a própria entrada, a capa do cartão vira a capa da página em 360 ms; durante a troca os cliques passam para a página nova. Sem suporte: a página nova esmaece em 200 ms (Web Animations) |
| Esqueletos | O conteúdo entra com o padrão no lugar do esqueleto, que tem as mesmas medidas da capa (sem pulo) |
| Painel | Só esmaece em 180 ms ao trocar de página (inclusive a pré-visualização do evento), sem desfoque nem cascata, sem View Transition; indicadores mostram o valor direto (não contam mais de zero); barras e janelas também só esmaecem |
| Portaria | Nenhuma entrada animada (janelas, avisos e listas aparecem na hora); o destaque por baixo do resultado caiu de 200 para 150 ms |
| Menos movimento | Nada anima: a regra global de `src/index.css` desliga animações e transições dos elementos, e `base.css` para os pseudoelementos (esqueleto e camada da capa). Cartões nascem visíveis; sem View Transitions e sem rolagem suave |

- **Sem biblioteca:** a `motion` saiu do projeto (o movimento todo é CSS, com Web Animations API só na alternativa da troca de página). `src/site/motion.tsx` ficou com `useReducedMotion`, `cascade`, `useReveal` e `Roll`. JavaScript da primeira visita: de 109,8 kB para 94,2 kB comprimidos; CSS: +0,6 kB; pacote do painel: de 43,6 para 38,8 kB.
- **Miniatura da capa:** migração `drizzle/0015_capa_desfocada.sql` (só expande: `events.banner_placeholder` anulável, com a regra `events_banner_placeholder_format`; o ";" do prefixo vai como `chr(59)` porque o gerador do Drizzle cortava o texto nele). Gerada no envio da capa (`bannerPlaceholder`, `server/src/media/banner.ts`), apagada ao remover a capa, fora da trilha. Vai no card, na página e no HTML do destaque. Capas antigas: `npm run banners:versoes` agora preenche também as miniaturas (mesmas travas). Reversão em `drizzle/rollback/0015_capa_desfocada.down.sql`.

## Medição (LCP, CLS e TBT no celular)

Lighthouse não está instalado; medido com o Chromium do Playwright e as APIs de desempenho do navegador (`largest-contentful-paint`, `layout-shift`, `longtask`): 360 x 800, DPR 2, CPU 4x mais lenta, rede 4G lenta (150 ms, 1,6 Mbps), sem cache, abertura em vídeo já vista. TBT: soma do que passa de 50 ms nas tarefas longas depois da primeira pintura. Servidor local com o build de produção, mesmo banco, três capas reais enviadas pela API. A versão anterior (`853abe9`) e a nova servidas na mesma porta, **intercaladas** (antes, depois, antes, depois), 5 rodadas cada; mediana de cada rodada, média das duas.

| Página | LCP antes / depois | CLS antes / depois | TBT antes / depois | FCP antes / depois |
|---|---|---|---|---|
| Evento | 3390 / 3190 ms | 0,0029 / 0,0029 | 2 / 0 ms | 2908 / 2710 ms |
| Vitrine (início) | 1618 / 1464 ms | 0,0029 / 0,0029 | 28 / 28 ms | 1618 / 1464 ms |
| Lista de eventos | 3516 / 3298 ms | 0,0029 / 0,0029 | 0 / 0 ms | 2936 / 2738 ms |

Nada piorou; LCP e FCP melhoraram cerca de 150 a 220 ms (o pacote menor). Dois problemas apareceram na medição e foram corrigidos antes do resultado acima:

- **LCP +320 ms** na primeira versão: a capa nítida nascia transparente e o navegador só conta o LCP quando ela aparece. Agora a capa pinta opaca assim que chega e o efeito é uma camada desfocada por cima que esmaece.
- **CLS 0,017** no evento: com a troca de fonte, o número "03" do cronômetro chegava a quebrar em duas linhas por um segundo (regra geral de quebra de texto longo). O número nunca quebra (`white-space: nowrap`).

## Premissas e decisões

- "Menos movimento" ficou em **nada anima** (o pedido aceitava esmaecer de 100 ms ou nada): já era a regra global do site.
- No celular, o quadro de ingressos não anima, para a barra fixa de compra (com o "Continuar") estar na tela desde o primeiro quadro sem esmaecer e sem mudar de referência de posição.
- Esqueleto e indicador de carregamento continuam animados enquanto carregam (indicam trabalho em andamento); o ponto de "Acontecendo agora" parou de pulsar sem fim.
- A capa enviada antes desta versão não tem miniatura até o preenchimento rodar (ou a capa ser reenviada): nesse caso a camada é a cor de fundo, que esmaece revelando a capa.
- A classe `.px-enter` já existia (botões "Entrar" e "Painel" do cabeçalho); a entrada usa `.px-in`.

## Verificação (local)

- `npm run lint` (0 erros, 27 avisos antigos), `npm run typecheck`, `npm run build`, `npm run check:migrations` (16 migrações), `npm run test:db` (1.090 + 4, nenhum pulado).
- `npm run e2e:transicoes` (9 de 9, três rodadas seguidas): cascata e tempos lidos do navegador (400 ms cada; início em 0, 60, 120, 180 e 240 ms; animações da primeira tela dentro de 640 ms e começando no primeiro quadro), ponto de partida (`blur(8px)`, 12 px), capa desfocada que esmaece, nada sobrando nos elementos, sem rolagem lateral, barra de compra na tela desde o início, "Continuar" logo na entrada levando à próxima tela em menos de 700 ms, menos movimento sem nenhuma animação, cartões ao aparecer só na primeira vez, passar o mouse (3 px, 1 px, nada no painel), View Transition no site e esmaecer sem suporte, painel só com esmaecer de 180 ms, portaria sem entradas e destaque de 150 ms; sequência de capturas e vídeos a 360 px.
- `npm run e2e:textos` (78), `npm run e2e:cronometro` (7, com o teste de movimento atualizado), `npm run e2e:cor` (6), `npm run e2e:responsivo` (597 de 597), roteiro 11.2 com gateway fictício (20 de 20; o cartão do Mercado Pago fica para o sandbox). Dois testes antigos estavam quebrados desde a regra de menores (14/10) e foram corrigidos só no teste: o cadastro do responsivo e do roteiro não mandava a data de nascimento, e o responsivo procurava o botão pelo nome antigo ("Corrigir e-mail ou CPF").
- Capturas e vídeos publicados para o responsável (página privada, link no relatório da sessão).

## Publicação

Não publicado. Pelo fluxo de sempre, com OK do responsável antes da virada: `release-2026-10-15e`, com a migração 0015. A revisão no ar convive com o banco migrado (a 0015 só acrescenta uma coluna que ela não lê).
