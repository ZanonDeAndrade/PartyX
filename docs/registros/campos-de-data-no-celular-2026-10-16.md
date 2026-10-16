# Campos de data e hora no celular e revisão dos formulários do painel (16/10/2026)

Pedido do responsável (Arthur), em 16/10/2026: no iPhone (Safari), os campos de data e hora do cadastro e da edição de evento (Data, Horário de início, Data do fim, Horário do fim) passavam da borda direita da tela e ficavam com o texto centrado; os de texto estavam certos. Corrigir em todo o site, revisar os formulários do painel no celular e testar com o motor do Safari (Playwright WebKit, 390 x 844) e o Chrome do Android (360 x 800). Regras: testes, capturas, commit local, OK antes da virada; entra na próxima publicação da fila.

## Causa

No iPhone, o Safari desenha `input type=date`, `time` e `datetime-local` como um controle nativo. As regras do iOS no estilo do próprio navegador (`Source/WebCore/css/html.css` do WebKit, ramo `IOS_FAMILY`) dão a ele `display: inline-flex`, `overflow: hidden` e um valor interno (`::-webkit-date-and-time-value`) com `text-align: center` e `inline-size: 100%`. O site só dava largura e altura ao campo, sem tirar a aparência nativa: o texto ficava no meio e a largura mínima do controle nativo passava da caixa.

## O que mudou

| Onde | Mudança |
|---|---|
| Campos de data e hora, em todo o site (`base.css`) | `appearance: none` (e `-webkit-appearance`), `display: block`, `width: 100%`, `min-width: 0`, `box-sizing: border-box`, `min-height: 48px` (a dos campos de texto), texto à esquerda, fonte de 16 px (o iPhone não amplia ao tocar) |
| Valor do campo (`::-webkit-date-and-time-value`) | Texto à esquerda, sem margem, `box-sizing: border-box` e largura da caixa. Ele só existe onde o campo apenas abre o seletor do aparelho (iPhone e Android), que não têm ícone: ali entra um ícone de calendário (data) ou relógio (hora), em cinza, à direita |
| Chrome do computador | Continua com o próprio ícone de calendário e relógio (a aparência nativa sai, o ícone fica) |
| Data e horário lado a lado | Já era assim: duas colunas a partir de 640 px, uma embaixo da outra no celular. Sem mudança |
| Campo "Valor" (tipo de ingresso e lote) | O prefixo "R$" encolhia e virava "R" em cima de "$" no celular (nos dois motores), por causa da quebra de palavra geral do site. Agora não encolhe |
| Botão de escolher a capa | O botão do navegador tinha cerca de 20 px de altura no celular. Agora tem a aparência e a altura de toque (44 px) dos outros botões |

## Revisão dos formulários no celular

`e2e/painel-celular.spec.ts` (`npm run e2e:painel-celular`), 31 telas e estados × 2 motores = 62 casos: evento (novo e edição, inteiro), detalhe do evento e as abas (tipos, entradas, ingressos, compradores, contingência), tipo de ingresso (novo e edição), lote, lista de eventos, início do painel, pedidos e pedido, compradores, ingressos e ingresso, promoters e novo promoter, entradas, equipe e novo usuário, minha conta e alterar senha, exceções, os três relatórios (filtros de data), e no site o cadastro e a minha conta (data de nascimento). Em cada um, falha se houver:

- rolagem lateral da página;
- campo, seleção, área de texto, botão ou tabela que passe da borda da tela (fora de um recorte com rolagem própria);
- palavra curta partida em mais de uma linha (como o "R$");
- campo de data ou hora com texto fora da esquerda (medido nos pixels da captura), texto ou ícone encostado na borda direita, altura diferente dos campos de texto ou fonte abaixo de 16 px;
- botão da capa abaixo de 44 px.

Seleções, áreas de texto, seletor de cor, botões lado a lado e tabelas não passaram da largura em nenhuma tela. Os únicos defeitos encontrados foram os dois acima (prefixo e botão da capa), além dos campos de data.

**Limite do teste:** o WebKit do Playwright roda no Linux. Ele usa o mesmo controle de data do iPhone (o valor em `::-webkit-date-and-time-value`), mas não as regras de estilo do iOS. O teste põe essas regras numa camada de baixa prioridade, como faz o navegador (as cores do sistema viram aproximações). Com elas, o texto centrado aparece igual ao do iPhone. A largura mínima do controle nativo do iPhone não existe fora do iPhone, então o estouro em si só se confirma num aparelho de verdade: conferir no iPhone depois da virada.

**Prova de que os testes pegam o defeito:**
- no build anterior, o WebKit com as regras do iOS falha em 4 telas (texto a 136 a 148 px da borda no evento, no tipo de ingresso e nos filtros do relatório de vendas);
- sem o `box-sizing` do valor, falha com o ícone encostado na borda;
- sem a correção do prefixo, falha com "R$" partido em duas linhas.

## Verificação (local)

| Teste | Resultado |
|---|---|
| Lint | 0 erros (27 avisos antigos) |
| Tipos e build | ok |
| `test:db` | 1.107 + 4 (a primeira rodada, logo depois do build, teve 10 falhas sem a saída guardada; as duas seguintes passaram inteiras; a mudança não toca no servidor) |
| Painel no celular | 62, em duas rodadas seguidas (uma rodada intermediária teve 28 falhas só no WebKit, por um erro de teste: o login passava pelo início, o mouse parado em cima do destaque disparava o pré-carregamento do evento e a navegação seguinte o cancelava; o login agora volta direto para a tela testada) |
| Busca | 4 |
| Textos longos | 78 |
| Documentos | 3 |
| Transições | 12 |
| Cronômetro | 8 |
| Cor | 8 |
| Transferência | 6 |
| Responsivo | 593 |
| Roteiro de compra, gateway fictício | 20 (1 pulado, como antes) |

Capturas do formulário de evento inteiro, antes e depois, nos dois motores, e do "R$" do valor: página privada https://claude.ai/artifact/5B6ZuaBFqQxmLgGwb5fEXG.

## Publicação

Publicado em 16/10/2026 03:30 UTC, com o OK do responsável ("coloque em produção"), junto com os textos do painel sem meia-entrada: `release-2026-10-16b`, revisão `partyx-00037-zap` (`publicacao-producao-2026-10-16.md`). Conferido pela candidata e pelo domínio na data de nascimento do cadastro, nos dois motores. Falta a conferência num iPhone de verdade (cadastro e edição de evento).

Depois do registro acima, o caso `cadastro` do e2e foi corrigido: apontava para `/cadastro`, que não tem campo de data; agora abre `/criar-conta`, preenche a data de nascimento e mede o alinhamento (commit `d9fc445`).
