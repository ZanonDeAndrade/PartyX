# Seletor de cor embutido no campo "Cor de destaque" (15/10/2026)

Pedido do responsável (Arthur), nesta data: trocar o seletor do sistema do campo "Cor de destaque" (cadastro e edição de evento) por um seletor embutido no formulário, no estilo da referência (quadrado de saturação e brilho, barra de matiz logo abaixo, código hexadecimal com uma amostra redonda ao lado), com biblioteca pequena e acessível carregada só no painel, cores prontas, "Voltar ao padrão", conta-gotas opcional, toque e teclado, prévia ao vivo, aviso de contraste mantido, visual do painel e 360 px sem rolagem lateral. Regras: testes, capturas, commit local, OK antes de publicar. Entra na leva de "visual e painel", junto com a cor por evento (`cor-de-destaque-2026-10-15.md`).

## Como ficou

| Parte | Comportamento |
|---|---|
| Quadrado e barra | `react-colorful` 5.8.1 (`HexColorPicker`). Quadrado 16:10 com cantos de 8 px; barra de matiz de 16 px desenhada e 28 px de área para o dedo. Arrastar com mouse ou dedo atualiza o código e a prévia **ao vivo** |
| Código | "Código da cor", com a amostra redonda à esquerda e o conta-gotas à direita. Aceita com ou sem `#` e em minúsculas (o seletor acompanha enquanto digita); ao sair do campo vira `#RRGGBB` maiúsculo; o servidor grava sempre maiúsculo (como antes) |
| Código inválido | Se não tem como virar uma cor (letra fora de 0 a 9 e A a F, `#` no meio, ou 6 dígitos que não formam `#RRGGBB`), o erro aparece enquanto digita; só incompleto (`#7C3`), o erro aparece no "Salvar", que não envia e volta o foco ao campo. Enquanto isso, o seletor e a prévia ficam na última cor válida |
| Cores prontas | Roxo da PartyX (padrão: grava o campo vazio), verde neon `#39FF14`, vermelho `#E4002B`, laranja `#FF6B00`, rosa `#FF2E93`, azul `#3B5BFF`, amarelo `#FFD60A` e ciano `#00E5FF`. Todas com texto legível sobre a própria cor sem ajuste de tom. A escolhida fica marcada (anel e `aria-pressed`). Oito numa fileira no computador, duas fileiras de quatro no celular |
| Voltar ao padrão | Logo abaixo das cores prontas; esvazia o campo (o roxo da PartyX) |
| Conta-gotas | Só onde o navegador tem a EyeDropper API (Chrome e Edge no computador); onde não tem, o botão não aparece. Esc cancela sem mudar nada |
| Toque | Arrastar no quadrado e na barra não rola a página (`touch-action: none` da biblioteca) |
| Teclado | Tab chega ao quadrado e à barra; as setas movem 5% no quadrado e 18 graus na barra; contorno de foco do painel |
| Leitor de tela | Grupo "Seletor de cor"; controles "Saturação e brilho" ("Saturação 82%, brilho 100%") e "Matiz" ("331 graus, rosa"); a biblioteca escreve em inglês e o campo troca para português (`adminColorPicker.tsx`) |
| Prévia | A mesma de antes (bloco da data, "Quando", link, "Continuar"), sem transição de cor, para acompanhar o arrasto. O aviso "Contraste insuficiente" e o botão do tom ajustado continuam |
| Visual | Cartão branco com cantos de 12 px e sombra suave (`--px-sh-1`, `--px-sh-2`), até 360 px de largura; no painel nada se move ao passar o mouse (só um anel nas cores prontas, e só com mouse) |
| Sugestão pela capa | Igual, abaixo do cartão |

- **Desempenho do arrasto:** enquanto arrasta, a cor fica só no campo (só ele redesenha); ao soltar (fim do arrasto ou da tecla, aviso `onChangeEnd` da 5.8), a cor vai para o formulário.
- **Defeito evitado:** na primeira versão o erro de formato aparecia ao sair do campo. Clicar em "Salvar" com o código errado tirava o foco, o erro surgia e empurrava o botão uma linha para baixo no meio do clique, que se perdia. Agora o erro surge enquanto digita (ou no "Salvar"), nunca na saída do campo.

## Biblioteca e peso

- `react-colorful` **5.8.1, versão fixa** (`--save-exact`), MIT, sem dependências e sem script de instalação. Depois de quatro anos parada (5.6.1, 2022), voltou a ter versões em 2026 com o mesmo mantenedor; antes de instalar, as versões 5.6.1 e 5.8.1 foram baixadas à parte e comparadas: sem acesso à rede, `eval` ou armazenamento; da 5.6.1 para a 5.8.1 mudaram o aviso de fim do arrasto, a precisão da conversão de cor e o estilo dentro de shadow DOM. O pacote instalado é idêntico ao inspecionado. Ela põe o próprio CSS num `<style>` (permitido pela CSP: `style-src 'self' 'unsafe-inline'`).
- Peso da biblioteca (`HexColorPicker`): **8,4 kB, 3,5 kB comprimidos**.
- **Site público: igual.** CSS idêntico (mesmo arquivo); JavaScript principal de 96,21 para 96,25 kB comprimidos (o nome exportado da moldura dos ícones). Cores prontas, mensagem de formato e o ícone do conta-gotas ficam em arquivos só do painel (`accentPresets.ts`, `adminAccent.tsx`).
- **Pacote do painel:** JavaScript de 39,16 para 43,74 kB comprimidos (+4,58: a biblioteca e o campo novo); CSS de 2,59 para 2,97 kB.
- **Decisão (diferente do pedido "carregada só no formulário"):** o seletor vai no pacote do painel, não num arquivo próprio pedido só no formulário. Testado: num arquivo à parte (`lazy`), como a biblioteca importa o React como padrão (`import React from 'react'`), o empacotador tira o React do JavaScript do site para um arquivo comum, e o site público passaria de 96,57 para 97,23 kB comprimidos. Com o seletor no pacote do painel, o site não muda. Trocar é só voltar o `lazy` em `adminAccent.tsx`.

## Verificação (local)

- `npm run lint` (0 erros, 27 avisos antigos), `npm run typecheck`, `npm run build`, `npm run check:migrations` (16), `npm run test:db` (1.092 + 4, nenhum pulado; novos: cores prontas sem ajuste de tom e nome da faixa de matiz).
- `npm run e2e:cor` (8 de 8, três rodadas seguidas com o código final) com o seletor no Chromium a 360 px (toque de verdade pelo protocolo do navegador, tela de densidade 2) e 1280 px (mouse): rótulos em português; cor pronta; arrastar no quadrado com o código e a prévia mudando antes de soltar e **sem rolar a página** (e o mesmo gesto fora do seletor rolando, como controle); barra de matiz; setas no quadrado e na barra; código sem `#` e em minúsculas acompanhando no seletor e virando maiúsculo; incompleto sem erro; inválido com erro ao digitar e seletor na última cor válida; aviso e ajuste de contraste; voltar ao padrão (e o roxo pronto gravando vazio); cartão dentro da tela e sem rolagem lateral; conta-gotas presente só com a API e cancelamento sem efeito; "Salvar" recusando código inválido e incompleto com foco no campo; salvar (digitado e arrastado com o dedo), reabrir com a cor salva no campo, no seletor e nas cores prontas, e a página pública com a cor.
- `npm run e2e:transicoes` (12), `npm run e2e:textos` (78), `npm run e2e:cronometro` (7), `npm run e2e:responsivo` (597), roteiro 11.2 com gateway fictício (20).
- Capturas antes e depois no computador e no celular, e o foco de teclado: página privada para o responsável (link no relatório da sessão).

## Publicação

Publicado em 15/10/2026 18:59 UTC, com o OK do responsável ("faça commit e deploy"): `release-2026-10-15g`, revisão `partyx-00028-vax`, sem migração. Registro: `publicacao-producao-2026-10-15g.md`; retorno para a `partyx-00026-rim`. Em produção, o seletor foi conferido pelo conteúdo do pacote do painel (o painel exige login de administrador, que esta sessão não tem).
