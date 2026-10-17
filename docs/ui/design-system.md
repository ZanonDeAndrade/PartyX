# Design system do PartyX (provisório)

Identidade **provisória** até a aprovação escrita do cliente (CA-33, Cl. 4.3). Os tokens ficam num único arquivo,
`src/site/styles/tokens.css`; nenhum outro CSS do site define cor, fonte, raio, sombra, camada ou duração fora dele.
O movimento é CSS com os tokens de `tokens.css`; `src/site/motion.tsx` só põe classes e índices (sem biblioteca, desde 15/10/2026).

## Ideia

**O cartaz da festa, não o painel de SaaS.** Na vitrine, o nome do evento é o maior elemento da tela, em tipo condensado e
caixa-alta, como num cartaz colado na rua; a data vira um bloco de cartaz com o canto cortado. Na compra, na conta e no
painel, a mesma marca fica quieta: superfícies claras, uma decisão por vez, números grandes e legíveis.

**Um único elemento de marca: o corte do X.** O X do logotipo tem a perna quebrada numa diagonal de cerca de 54 graus, e as
letras de "PARTY" têm cortes de estêncil. Esse corte aparece, sempre um por bloco:

| Onde | Como |
| --- | --- |
| Bloco de data (cartões, evento, carteira, compra, portaria, PDF) | canto inferior direito cortado (`--px-cut-x`, `--px-cut-y`) |
| Etapas da compra | separador em barra inclinada a 54 graus |
| Menu do painel | marcador da página atual com pontas cortadas |
| Cartão de acesso | faixa roxa curta no alto, com a ponta cortada |
| Etiqueta "Em destaque" | ponta direita cortada |
| 404 | numeral em Big Shoulders **Stencil**, parente direto dos cortes do logotipo |

## Revisão contra o padrão genérico

Antes de construir, o plano foi comparado com o que sairia de um pedido parecido "por padrão":

- **Preto quase puro com um único roxo** é um dos padrões de página gerada; aqui é exigência do briefing (preto, branco e
  roxo). Para não ficar no padrão: o roxo não vira brilho nem gradiente, só ação e o bloco de data; a cor de cada evento
  vem da **foto** do evento, não da interface.
- **Cartões iguais com o mesmo raio e sombra** foram trocados: o evento na vitrine não tem caixa (imagem, bloco de data e
  texto direto no preto); raio por hierarquia (2 px no cartaz, 8 px em botão e campo, 12 px em cartão operacional, 18 px
  em folha e ingresso).
- **Rótulo em caixa-alta espaçada acima de tudo** e **metadados com ponto médio** saíram da área do comprador. Data, hora e
  local viram estrutura (bloco de data, dia da semana com hora, local), não uma linha "A · B · C". O ponto médio ficou só
  no painel, em linhas densas de dados, onde separa campos.
- **Herói centralizado em caixa** virou o evento em destaque em tela cheia, título no canto inferior esquerdo sobre a foto.
- **Fonte monoespaçada para rótulos** ficou só onde ajuda: códigos de ingresso, Pix copia e cola e senha temporária.
- **Ícones aleatórios e glifos de texto** (`⌕`, `≡`, `▣`, `‹`) viraram um conjunto pequeno de ícones de traço reto
  (`src/site/icons.tsx`), só onde nomeiam uma ação.

## Cores

| Token | Valor | Papel |
| --- | --- | --- |
| `--px-ink` | `#0B0B10` | Preto de marca: cabeçalho, vitrine, portaria, navegação do painel |
| `--px-ink-2` / `--px-ink-3` | `#15151E` / `#1F1F2B` | Superfícies sobre o preto e hover |
| `--px-ink-line` | `#2C2C3A` | Linhas no escuro |
| `--px-on-ink` / `-2` / `-3` | `#FFFFFF` / `#B9B9C9` / `#8B8BA0` | Texto no escuro: principal, secundário, apoio |
| `--px-paper` / `--px-ops` | `#FFFFFF` / `#F7F7FA` | Cartões / fundo das áreas operacionais |
| `--px-text` / `-2` / `-3` | `#0B0B10` / `#3F3F50` / `#5B5B6E` | Texto no claro |
| `--px-line` / `--px-line-2` | `#E4E4EC` / `#EEEEF3` | Bordas e divisórias no claro |
| `--px-violet` | `#7C3AED` | Ação principal e bloco de data |
| `--px-violet-hover` / `-press` | `#6D28D9` / `#5B21B6` | Estados do botão |
| `--px-violet-bright` | `#8B5CF6` | Anel de foco |
| `--px-violet-soft` / `--px-violet-ink` | `#EDE9FE` / `#5B21B6` | Informação |
| `--px-lilac` | `#C4B5FD` | Links e destaques no preto |
| Semânticas | verde `#DCFCE7`/`#14532D` (sólido `#15803D`), amarelo `#FEF3C7`/`#854D0E` (sólido `#FACC15` com `#1C1500`), vermelho `#FEE2E2`/`#991B1B` (sólido `#B91C1C`), neutro `#EEEEF3`/`#3F3F50` | Só estado, sempre com texto e símbolo |

### Contraste (WCAG 2.1, medido por `node infra/ui/contrast.mjs`)

| Texto | Fundo | Uso | Contraste | Mínimo | Resultado |
| --- | --- | --- | --- | --- | --- |
| `px-text` #0b0b10 | `px-ops` #f7f7fa | texto principal no fundo claro | 18.36:1 | 4.5:1 | AA |
| `px-text-2` #3f3f50 | `px-ops` #f7f7fa | texto secundário no claro | 9.64:1 | 4.5:1 | AA |
| `px-text-3` #5b5b6e | `px-ops` #f7f7fa | texto de apoio no claro | 6.20:1 | 4.5:1 | AA |
| `px-text-3` #5b5b6e | `px-paper` #ffffff | texto de apoio no cartão branco | 6.63:1 | 4.5:1 | AA |
| `px-on-ink` #ffffff | `px-ink` #0b0b10 | texto no preto | 19.63:1 | 4.5:1 | AA |
| `px-on-ink-2` #b9b9c9 | `px-ink` #0b0b10 | secundário no preto | 10.14:1 | 4.5:1 | AA |
| `px-on-ink-3` #8b8ba0 | `px-ink` #0b0b10 | apoio no preto | 5.89:1 | 4.5:1 | AA |
| `px-on-ink-2` #b9b9c9 | `px-ink-2` #15151e | secundário na superfície escura | 9.37:1 | 4.5:1 | AA |
| `px-on-ink-3` #8b8ba0 | `px-ink-2` #15151e | apoio na superfície escura | 5.44:1 | 4.5:1 | AA |
| `px-lilac` #c4b5fd | `px-ink` #0b0b10 | links e destaques no preto | 10.64:1 | 4.5:1 | AA |
| `#ffffff` #ffffff | `px-violet` #7c3aed | botão principal | 5.70:1 | 4.5:1 | AA |
| `#ffffff` #ffffff | `px-violet-hover` #6d28d9 | botão principal (hover) | 7.10:1 | 4.5:1 | AA |
| `px-violet` #7c3aed | `px-paper` #ffffff | link no branco | 5.70:1 | 4.5:1 | AA |
| `px-violet` #7c3aed | `px-ops` #f7f7fa | link no fundo claro | 5.33:1 | 4.5:1 | AA |
| `px-violet-ink` #5b21b6 | `px-violet-soft` #ede9fe | informação (lilás) | 7.57:1 | 4.5:1 | AA |
| `px-ok-fg` #14532d | `px-ok-bg` #dcfce7 | estado verde | 8.30:1 | 4.5:1 | AA |
| `px-warn-fg` #854d0e | `px-warn-bg` #fef3c7 | estado amarelo | 6.15:1 | 4.5:1 | AA |
| `px-err-fg` #991b1b | `px-err-bg` #fee2e2 | estado vermelho | 6.80:1 | 4.5:1 | AA |
| `px-neu-fg` #3f3f50 | `px-neu-bg` #eeeef3 | estado neutro | 8.91:1 | 4.5:1 | AA |
| `#ffffff` #ffffff | `px-ok-solid` #15803d | portaria: válido | 5.02:1 | 4.5:1 | AA |
| `px-warn-on` #1c1500 | `px-warn-solid` #facc15 | portaria: já utilizado | 11.86:1 | 4.5:1 | AA |
| `#ffffff` #ffffff | `px-err-solid` #b91c1c | portaria: recusado | 6.47:1 | 4.5:1 | AA |
| `#ffffff` #ffffff | `px-err-fg` #991b1b | aviso rápido de erro | 8.31:1 | 4.5:1 | AA |
| `px-violet-bright` #8b5cf6 | `px-ink` #0b0b10 | anel de foco no preto | 4.64:1 | 3:1 | AA |
| `px-violet-bright` #8b5cf6 | `px-paper` #ffffff | anel de foco no branco | 4.23:1 | 3:1 | AA |
| `#8a8a9e` #8a8a9e | `px-paper` #ffffff | borda de campo | 3.38:1 | 3:1 | AA |

Texto comum exige 4,5:1; anel de foco e borda de campo, 3:1 (elemento de interface). Todos os pares passam. O script sai com
erro se um token novo derrubar algum par.

## Tipografia

| Papel | Fonte | Uso |
| --- | --- | --- |
| Display | **Big Shoulders Display** (variável, 100 a 900) | Nome do evento, títulos de página, números grandes (data, total, contador da portaria, KPIs). Peso 800, caixa-alta, entrelinha 0,86 a 0,95 |
| Estêncil | **Big Shoulders Stencil Display** 800 | Só o numeral do 404 |
| Interface | **Archivo** (variável, 100 a 900) | Todo o texto de leitura, botões, campos e tabelas. Números tabulares em valores |
| Código | **IBM Plex Mono** 400 e 500 | Código do ingresso, Pix copia e cola, senha temporária |

Servidas pelo próprio site (`@fontsource`, licença OFL), sem CDN, só o subconjunto latino (cerca de 104 kB no total; o
navegador baixa só as que a página usa). Os e-mails usam Arial/Helvetica e o PDF usa as fontes padrão do PDF: são os únicos
lugares sem as fontes da marca, de propósito (compatibilidade e impressão).

| Token | Tamanho | Uso |
| --- | --- | --- |
| `--px-t-xs` a `--px-t-2xl` | 12, 13, 15, 16, 18, 22 e 28 px | Interface (terça maior a partir de 16 px; campos sempre 16 px) |
| `--px-d-sm` | 26 px | Display pequeno (nome no resumo, seções do evento) |
| `--px-d-md` | 32 a 44 px | Títulos de página |
| `--px-d-lg` | 40 a 68 px | Nome do evento na página do evento, Meus ingressos |
| `--px-d-xl` | 52 a 120 px | Evento em destaque na página inicial |

## Espaço, raio, sombra e camadas

- Espaço em base 4: `--px-s-1` (4) a `--px-s-11` (96). Margem lateral `--px-gutter`: 16, 24 e 32 px por largura.
- Raio por hierarquia: `--px-r-poster` 2, `--px-r-xs` 4 (etiquetas), `--px-r-sm` 8 (botões, campos), `--px-r-md` 12 (cartões),
  `--px-r-lg` 18 (folhas, janelas, ingresso), `--px-r-pill`.
- Sombra só com papel: `--px-sh-1` (separação mínima), `--px-sh-2` (aviso rápido), `--px-sh-3` (janela, gaveta, painel de
  ingressos sobre o preto).
- Camadas: cabeçalho 30, barras fixas 40, gaveta 60, janela 70, aviso rápido 80, resultado da portaria 90, abertura 100,
  atalho "Ir para o conteúdo" 110.
- Alvo de toque mínimo `--px-touch` 44 px; ação principal 52 px; botão da portaria 72 px.

## Movimento

Padrão único desde 15/10/2026 (`docs/registros/transicoes-2026-10-15.md` e a segunda versão, mais suave,
`docs/registros/transicoes-suaves-2026-10-15.md`), em CSS e Web Animations API, sem biblioteca: `src/site/motion.tsx` só põe classes
e índices.

| Token | Valor | Uso |
| --- | --- | --- |
| `--px-enter-dur` | 720 ms | Entrada de texto e cartões (`.px-in`, `.px-in-block`, cartões da vitrine) |
| `--px-enter-ease` | `cubic-bezier(0.16, 1, 0.3, 1)` | Saída longa e macia |
| `--px-enter-step` | 100 ms | Intervalo da cascata (`--i`): o seguinte começa com o anterior ainda entrando |
| `--px-enter-blur`, `--px-enter-rise` | 4 px, 8 px | Ponto de partida; desfoque só em texto e blocos pequenos (`.px-in`) |
| `--px-cover-fade`, `--px-cover-zoom`, `--px-cover-scale` | 700 ms, 1200 ms, 1,04 | Capa: troca da miniatura pela nítida e zoom de 1,04 para 1, sem desfoque |
| `--px-page-fade`, `--px-page-fade-alt` | 450 ms, 350 ms | Troca de página com e sem View Transitions |
| `--px-home-fade` | 600 ms | Texto do destaque ao abrir o site |
| `--px-hover-dur` | 150 ms | Passar o mouse e tocar em botões e cartões |
| `--px-admin-fade` | 180 ms | Painel: só esmaecer |
| `--px-gate-flash` | 150 ms | Portaria: destaque do resultado |
| `--px-dur-1` a `--px-dur-5` | 120 a 460 ms | Janelas, gavetas, avisos rápidos, prazo da reserva |

| Onde | O que se move | Por quê |
| --- | --- | --- |
| Abrir o site | Fundo preto desde o primeiro quadro na vitrine (`public/intro/abertura.js`); texto do destaque esmaece 600 ms só por CSS (o React continua do mesmo ponto); cartões em cascata | Nada pisca e nada espera o JavaScript |
| Evento | Capa: miniatura de 48 px (já desfocada no servidor) troca pela nítida em 700 ms e a capa assenta de 1,04 para 1 em 1200 ms; data e título, cronômetro e Quando, Onde e Classificação entram em cascata com sobreposição (1120 ms no total) | O momento de abertura da página, um só |
| Cartão para evento | Pré-carrega no toque, foco ou mouse; View Transition: capa, título e data compartilhados (600 ms), cabeçalho do evento por cima da capa, o resto em troca cruzada de 450 ms; a página não repete a cascata. Sem suporte: esmaecer de 350 ms | O evento escolhido "vira" a página, já com o conteúdo |
| Esqueletos | Mesmas classes e medidas do conteúdo; quando o conteúdo chega, o esqueleto esmaece por cima (420 ms) | Sem pulo nem piscada |
| Cronômetro | Só o número que muda desce um pouco e assenta (380 ms), já visível | Mostra a passagem sem piscar |
| Botões e cartões | Botão sobe 1 px; cartão sobe 3 px e a imagem cresce até 1,02 (150 ms); o toque afunda um pouco | Resposta ao gesto, só no site e na compra |
| Evento (computador) | Paralaxe leve do banner guiada pela rolagem (CSS, a partir de 768 px) | Profundidade sem JavaScript |
| Quantidade e total | Número rola na direção da mudança (260 ms) | Confirma o toque |
| Compra | Etapa nova e QR do Pix sobem e esmaecem (sem desfoque); ingressos da confirmação com o padrão | Sentido de avanço; nada segura um clique |
| Carteira | Ingressos extras entram ao abrir a pilha | Mostra o que foi aberto |
| Tela cheia | A folha branca sobe; o QR só é desenhado depois que ela para | O QR nunca é animado |
| Painel | Só esmaece (180 ms) ao trocar de página, inclusive a pré-visualização do evento; indicadores mostram o valor direto | Ferramenta de trabalho: parecer rápido |
| Portaria | Nenhuma entrada animada; destaque de 150 ms por baixo do resultado | Resultado imediato |

Regras: animações grandes só com `opacity` e `transform` (capa: `scale`); desfoque só em texto e blocos pequenos; `will-change` só
enquanto a capa carrega. As entradas usam preenchimento "backwards": no fim nada sobra no elemento. No celular o quadro de ingressos
não anima, para a barra de compra estar na tela desde o primeiro quadro. Durante uma View Transition os cliques passam para a página
nova. Nada anima continuamente em segundo plano. Fontes de reserva (`fonts.css`) com as medidas da Archivo e da Big Shoulders: nada
muda de tamanho quando a fonte chega. Com "reduzir movimento" do aparelho: só esmaecer simples de 250 ms (sem subir, desfocar,
crescer, cascata nem View Transition), o que se move de lugar para (esqueleto, indicador girando, número que rola) e a abertura em
vídeo não toca. O QR do ingresso nunca recebe animação, filtro, transparência ou recorte: as páginas de ingresso ficam fora das View
Transitions.

## Componentes

| Componente | Onde | Arquivo |
| --- | --- | --- |
| Cabeçalho, menu do celular, rodapé, `Layout` | todas | `components.tsx`, `styles/public.css` |
| `DateStub` (bloco de data) | cartões, evento, compra, carteira, portaria | `components.tsx` |
| `EventCardView`, `Banner`, `CardSkeletons` | vitrine | `components.tsx` |
| Botões (`px-btn`, `-pri`, `-dark`, `-light`, `-outline`, `-ghost`, `-danger`, `-lg`, `-block`) | todas | `styles/base.css` |
| Campos, senha, máscaras de CPF e telefone, aceite | acesso, conta, painel | `authPages.tsx`, `format.ts` |
| Etiquetas de estado (`px-badge-*`, sempre com ponto e texto) | todas | `styles/base.css` |
| Avisos (`px-notice-*`), caixas de vazio e erro (`px-box`) | todas | `styles/base.css` |
| Janela (folha no celular), gaveta, aviso rápido | todas | `styles/base.css` |
| Tabela que vira cartões abaixo de 640 px, esqueleto de tabela | painel, relatórios | `adminPages.tsx`, `styles/base.css` |
| `Roll` (número que rola), `useReveal` (entrada ao aparecer na tela), `cascade` (posição na cascata) | vitrine, evento, compra | `motion.tsx` |
| Ícones | ações nomeadas | `icons.tsx` |
| Seletor de cor (`px-color`: quadrado de saturação e brilho, barra de matiz, código com amostra redonda, conta-gotas onde houver, cores prontas; `react-colorful` 5.8.1) | painel, cor de destaque do evento | `adminAccent.tsx`, `adminColorPicker.tsx`, `accentPresets.ts`, `styles/admin.css` |

## Áreas e pacotes

Cada área tem JavaScript e CSS próprios, carregados sob demanda (`React.lazy`): vitrine e acesso no pacote principal;
compra (`areas/checkout.tsx`), cliente (`areas/client.tsx`), painel (`areas/admin.tsx`, com o seletor de cor `react-colorful`) e
portaria (`areas/gate.tsx`, com o leitor jsQR). Tamanhos em `comparativo.md` e no relatório final. O seletor de cor fica no
pacote do painel, não num arquivo só do formulário: a biblioteca importa o React como padrão e, separada, levava o React do pacote
principal para um arquivo comum (o site público cresceria 0,66 kB comprimidos).

## Pendências de marca

Logotipo em vetor (SVG ou PDF), fontes oficiais com licença web e cores oficiais dependem da PartyX (D-10). Com o material
final, a troca é de tokens e de arquivos de fonte; a estrutura das telas não muda. A aprovação escrita (CA-33) continua
pendente e nada foi enviado ao cliente.
