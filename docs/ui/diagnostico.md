# Diagnóstico da UI antes do refinamento (11/10/2026)

Base: 152 telas e estados (306 capturas) capturados em 390 e 1440 px (`docs/ui/antes/`, lista em `checklist-telas.md`), com dados fictícios do servidor local e o gateway fictício. Nada aqui é opinião do cliente; a identidade continua provisória (CA-33).

## O que parece genérico ("cara de IA")

- **Tipografia sem voz.** Archivo larga em peso 900 em todos os títulos, do nome do evento ao "Visão geral" do painel. O nome do evento, que é o produto, tem o mesmo tratamento de um título de formulário.
- **Kit de cartões SaaS.** Cartões de evento, filtros, fatos do evento, painéis e avisos usam a mesma caixa com raio de 14 a 16 px, borda cinza e fundo `#15151E`. Na página do evento, data, local e classificação viram três caixas empilhadas no celular, com rótulos em caixa-alta espaçada ("DATA E HORÁRIO").
- **Rótulos em caixa-alta espaçada** em todo lugar ("EM DESTAQUE", cabeçalhos de tabela, grupo "RELATÓRIOS"), o tique mais comum de página gerada.
- **Metadados com ponto médio** ("SEX, 23 OUT · 23:00", "dom, 11 out 09:17 · Pago · R$ 180,00"): data, hora e local viram uma linha de texto pouco escaneável.
- **Ícones de texto** improvisados: `⌕`, `≡`, `▣`, `○`, `‹`, `×` e "QR" escrito num quadrado. Variam de tamanho conforme a fonte e não têm traço consistente.
- **Herói centralizado em caixa arredondada** com o banner como fundo: parece um modelo, não um cartaz de festa.

## Inconsistências

- Duas camadas de CSS se sobrepondo (`site.css` com a base antiga e o "tema do protótipo" por cima): o mesmo botão tem regras em três lugares, e o painel herdava cores do tema escuro (houve correção pontual para os fatos do evento).
- Raio, sombra e borda iguais para coisas de hierarquias diferentes (botão, cartão, aviso, janela).
- Botões de compartilhar e copiar com o mesmo peso visual do "Comprar"; "Ver evento" e "Comprar" nos cartões disputam atenção.
- Avisos de uma linha com texto e link em `display: flex` em coluna quebravam a frase em pedaços (alerta de exceção do painel: "1" numa linha, o resto em outra).
- Link de meia-entrada em lilás dentro do painel branco de ingressos (contraste insuficiente, cor do tema escuro vazando).
- Portaria e painel ainda no desenho anterior (a proposta visual já registrava isso): portaria clara, num ambiente escuro.

## Hierarquia, espaçamento e contraste

- Na página do evento no celular, os ingressos ficam **depois** da descrição e das atrações; a barra fixa mostra "Continuar" desabilitado com R$ 0,00, sem levar até a escolha.
- Preço "a partir de" pequeno e cinza; o valor some no cartão.
- Espaçamento uniforme de 16 a 24 px em tudo, sem ritmo entre seções.
- Painel: KPIs com o mesmo tamanho do texto de apoio; tabela de eventos em andamento repete cabeçalhos em caixa-alta a cada evento; menu lateral claro (o pedido era navegação preta).
- Contraste: textos de apoio `#5B5B70` sobre `#15151E` ficam abaixo de AA em vários cartões escuros.

## Estados ausentes ou fracos

- **G05 sessão expirada** não tem tela própria: a pessoa volta ao login sem aviso de que a sessão terminou (o retorno ao contexto existe).
- **G06 manutenção/indisponibilidade** só existe no protótipo; no site real não há tela (registrado em `sugestoes-futuras.md`, pois exige regra de servidor).
- Carregamento do painel e de várias listas é só o texto "Carregando…" (sem esqueleto); a tela muda de altura quando os dados chegam.
- Pix: o QR aparece de uma vez; "Código copiado" é um texto pequeno abaixo do botão, fácil de não ver.
- Prazo da reserva: fica amarelo nos últimos 2 minutos, sem mudar o texto.
- Confirmação de compra: lista simples de links, sem o "momento" de receber os ingressos.
- Portaria: resultado ocupa a tela, mas o botão de seguir é só "Toque para continuar" em texto pequeno; não há botão grande de próxima leitura.

## Fricções nos fluxos

- Comprador no celular precisa rolar além da descrição para escolher ingressos.
- Carteira de ingressos é uma lista plana; com vários ingressos do mesmo evento, cada um ocupa uma linha igual, sem agrupamento visual forte nem forma de ingresso.
- Tela cheia do ingresso abre sem relação visual com o ingresso de origem.
- Cadastro sem máscara visual de CPF e telefone (o servidor aceita com ou sem pontuação); não mudamos a validação, só a orientação.
- Painel no celular: botão "☰ Menu do painel" ocupa a largura e repete o nome da página ao lado.

## Bundle (antes)

Build de produção sem protótipo: um único pacote de **615,98 kB** de JavaScript (185,39 kB gzip) e 58,52 kB de CSS (11,06 kB gzip). Tudo, do painel à portaria com o jsQR, é baixado na primeira visita à vitrine. Fontes por CDN do Google (Archivo e IBM Plex Mono).
