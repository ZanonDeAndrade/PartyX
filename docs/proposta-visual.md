# Proposta visual para aprovação escrita (CA-33, Cláusula 4.3)

**Status: preparada, NÃO enviada.** O envio ao cliente é decisão da CONTRATADA; este documento não foi encaminhado a ninguém. Depois de enviar, registre o envio em `registros/aprovacao-visual.md`. O cliente tem **5 dias úteis** para responder (Cl. 4.3); sem resposta nesse prazo, conta como atraso do cliente.

## O que está sendo proposto

Identidade **provisória**, derivada do protótipo, aplicada ao site, aos e-mails e (nas próximas etapas) à portaria e ao painel. O logotipo já é o original enviado pela PartyX; cores e fonte definitivas ainda dependem do material da PartyX (D-10).

### Cores

| Papel | Valor | Onde aparece |
| --- | --- | --- |
| Preto de marca | `#0B0B10` | Cabeçalho, rodapé, vitrine (início, eventos, evento), portaria, menu do painel, cabeçalho do ingresso |
| Superfície escura | `#15151E` com linha `#2C2C3A` | Cartões de evento, busca e blocos de informação sobre o preto |
| Roxo de ação | `#7C3AED` (hover `#6D28D9`) | Botão principal ("Comprar ingressos", "Continuar", "Entrar") e bloco de data |
| Roxo de marca | `#8B5CF6` | Foco de teclado |
| Lilás | `#C4B5FD` | Links e destaques sobre fundo escuro |
| Textos no escuro | `#B9B9C9`, `#8B8BA0` | Secundário e apoio sobre o preto (contraste AA medido) |
| Fundo claro | `#F7F7FA` | Páginas de conta, compra e área do cliente |
| Branco | `#FFFFFF` | Cartões e formulários sobre o fundo claro, painel de ingressos |
| Texto | `#0B0B10`, `#3F3F50`, `#5B5B6E` | Principal, secundário, apoio |
| Linhas | `#E4E4EC` e `#EEEEF3` | Bordas e divisores no tema claro |

**Estados** (sempre com texto, nunca só cor): verde `#DCFCE7`/`#14532D` (aprovado, válido, à venda), amarelo `#FEF3C7`/`#854D0E` (atenção, aguardando), vermelho `#FEE2E2`/`#991B1B` (recusado, esgotado, cancelado), lilás `#EDE9FE`/`#5B21B6` (informação), cinza `#EEEEF3`/`#3F3F50` (neutro).

### Tipografia

Atualizada no refinamento de UI de 11/10/2026 (detalhes em `ui/design-system.md`).

| Papel | Fonte | Uso |
| --- | --- | --- |
| Nomes de evento e títulos | **Big Shoulders Display** (variável) | Nome do evento, títulos de página, datas e números grandes, em peso 800 e caixa-alta, como num cartaz |
| Texto | **Archivo** (variável) | Todo o texto de leitura, botões, campos e tabelas |
| Códigos | **IBM Plex Mono** (400 e 500) | Código do ingresso, Pix copia e cola, senha temporária |
| 404 | Big Shoulders **Stencil** Display | Só o numeral da página inexistente, parente dos cortes do logotipo |

As fontes são livres (licença OFL) e **servidas pelo próprio site**, sem Google Fonts nem outra CDN. **E-mails** usam Arial/Helvetica e o **PDF** usa as fontes padrão do PDF (compatibilidade e impressão); as cores e o logotipo são os mesmos do site. Campos de formulário em 16 px para o iPhone não ampliar a tela. Com a fonte final da marca, a troca é só de arquivo e de token.

### Forma e movimento

- **Elemento de marca:** o corte diagonal do X do logotipo, no canto do bloco de data (cartões, evento, compra, carteira, portaria, PDF), no separador das etapas da compra e no marcador do menu do painel.
- Cantos por hierarquia: 2 px no cartaz do evento e no bloco de data, 8 px em botões e campos, 12 px em cartões, 18 px em janelas, painel de ingressos e ingresso.
- Botões principais com 52 px de altura; demais alvos com no mínimo 44 px; "Próxima leitura" da portaria com 72 px.
- Banner do evento: a imagem enviada pelo cliente, em destaque na página inicial e no topo da página do evento; sem imagem, listras discretas em tons de roxo e cinza.
- Movimento só onde informa ou responde a um toque: entrada dos cartões na primeira visita, banner que passa do cartão para a página do evento, quantidade e total que rolam, prazo da reserva que muda de cor nos últimos 60 s, ingressos que "entram na carteira" na confirmação. O QR do ingresso nunca é animado. Na portaria, o resultado aparece de imediato. Com "reduzir movimento" do aparelho, nada se move.
- Abertura com o vídeo do logotipo (3 s): só na primeira página da vitrine aberta na sessão (início, eventos ou evento), com botão "Pular" e tecla Esc. Não aparece na compra, na conta, no painel, na portaria, nos links de e-mail nem com "reduzir movimento".

### Logotipo e aviso

| Elemento | Proposta |
| --- | --- |
| Logotipo | Original da PartyX (PNG em alta resolução, branco sobre preto), usado em branco com fundo transparente no cabeçalho, rodapé, e-mails e PDF do ingresso. Ícone do site com o símbolo X redesenhado em vetor a partir do original |

## Como conferir

1. Larguras: 360, 390, 768 e 1440 px, sem rolagem horizontal em nenhuma tela.
2. Telas para avaliar:
   - **Vitrine:** início, lista de eventos, evento (com tipo esgotado e com vendas ainda não iniciadas), compartilhar, página inexistente e documentos legais.
   - **Conta:** entrar, criar conta (com erros e com sucesso), recuperar senha e nova senha.
   - **Compra:** revisão do pedido, forma de pagamento, Pix, compra confirmada, prazo vencido, pagamento recusado e "pago sem estoque".
   - **Cliente:** meus ingressos (próximos e histórico), minhas compras, ingresso com QR Code, tela cheia e minha conta.
   - **E-mails:** confirmação de compra, ingresso e recuperação de senha.
   - **Portaria:** seleção do evento, câmera, busca manual e resultados verde, amarelo e vermelho.
   - **Painel administrativo:** visão geral, eventos, pedidos, compradores, ingressos, promoters, relatórios, entradas e equipe.
   - Capturas de todas as telas e estados em 360, 390, 768 e 1440 px: `ui/depois/` (antes e depois lado a lado em `ui/comparativo.md`).
3. As capturas são geradas do ambiente de homologação (`docs/visual-e-legal.md`, seção "Como gerar as capturas").

## O que o cliente precisa decidir ou fornecer

- Aprovar, ajustar ou substituir cada elemento da tabela acima, **por escrito**.
- Enviar o logotipo em vetor (SVG ou PDF), se houver, cores oficiais e fontes com licença de uso web.
- Com o material final, a troca é de tema e de modelos de e-mail; as telas não mudam de estrutura.

## Modelo de resposta

> Aprovo a proposta visual enviada em _**/**_/______ (versão ___), com as seguintes alterações: ______.
> Nome, cargo, data e canal da resposta.

Enquanto não houver aprovação registrada, a variável `VISUAL_APPROVED` fica `false`: o site mantém a faixa de tema provisório e **a venda real em produção permanece bloqueada**.
