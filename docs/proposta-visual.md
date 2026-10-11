# Proposta visual para aprovação escrita (CA-33, Cláusula 4.3)

**Status: preparada, NÃO enviada.** O envio ao cliente é decisão da CONTRATADA; este documento não foi encaminhado a ninguém. Depois de enviar, registre o envio em `registros/aprovacao-visual.md`. O cliente tem **5 dias úteis** para responder (Cl. 4.3); sem resposta nesse prazo, conta como atraso do cliente.

## O que está sendo proposto

Identidade **provisória**, derivada do protótipo, aplicada ao site, aos e-mails e (nas próximas etapas) à portaria e ao painel. O logotipo já é o original enviado pela PartyX; cores e fonte definitivas ainda dependem do material da PartyX (D-10).

### Cores

| Papel | Valor | Onde aparece |
| --- | --- | --- |
| Preto de marca | `#0B0B10` | Cabeçalho, rodapé, vitrine (início, eventos, evento), cabeçalho do ingresso |
| Superfície escura | `#15151E` com linha `#2C2C3A` | Cartões de evento, busca e blocos de informação sobre o preto |
| Roxo de ação | `#7C3AED` (hover `#6D28D9`) | Botão principal ("Comprar ingressos", "Continuar", "Entrar") |
| Roxo de marca | `#8B5CF6` | Foco de teclado |
| Lilás | `#C4B5FD` | Datas, links e destaques sobre fundo escuro |
| Fundo claro | `#F7F7FA` | Páginas de conta, compra e área do cliente |
| Branco | `#FFFFFF` | Cartões e formulários sobre o fundo claro, painel de ingressos |
| Texto | `#0B0B10`, `#3F3F50`, `#5B5B6E` | Principal, secundário, apoio |
| Linhas | `#E4E4EC` e `#EEEEF3` | Bordas e divisores no tema claro |

**Estados** (sempre com texto, nunca só cor): verde `#DCFCE7`/`#14532D` (aprovado, válido, à venda), amarelo `#FEF3C7`/`#854D0E` (atenção, aguardando), vermelho `#FEE2E2`/`#991B1B` (recusado, esgotado, cancelado), lilás `#EDE9FE`/`#5B21B6` (informação), cinza `#EEEEF3`/`#3F3F50` (neutro).

### Tipografia

| Papel | Fonte | Uso |
| --- | --- | --- |
| Texto e títulos | **Archivo** (variável, pesos 100 a 900, larguras 62 a 125%) | Todo o texto. Títulos em peso 800 a 900, alargados (110 a 118%) e com espaçamento de letras levemente negativo |
| Códigos e números de referência | **IBM Plex Mono** (400, 500, 600) | Código do ingresso, número do pedido, Pix copia e cola, código do promoter |

**E-mails** usam Arial/Helvetica, porque a maioria dos aplicativos de e-mail não carrega fontes externas; as cores e o logotipo são os mesmos do site.

Escala principal: destaque da página inicial de 40 a 84 px; título de página de 28 a 48 px; seção de 18 a 28 px; texto de 15 a 16 px; apoio de 12 a 14 px. Os campos de formulário usam 16 px para o iPhone não ampliar a tela. As duas fontes são livres (licença OFL) e carregadas pelo Google Fonts; com a fonte final da marca, a troca é só de arquivo.

### Forma e movimento

- Cantos: 20 px nos blocos grandes (destaque, ingresso, painel de ingressos), 16 px nos cartões, 10 a 12 px nos botões e campos, 6 px nas etiquetas de estado.
- Botões principais com 52 px de altura; demais alvos de toque com no mínimo 44 px.
- Banner do evento: a imagem enviada pelo cliente; sem imagem, listras discretas em tons de roxo e cinza.
- Movimento só onde informa: contagem da reserva, indicador de espera do Pix e carregamento. Respeita "reduzir movimento" do aparelho.
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
   - **Ainda no desenho anterior, serão restilizadas depois da sua aprovação:** portaria e painel administrativo.
3. As capturas são geradas do ambiente de homologação (`docs/visual-e-legal.md`, seção "Como gerar as capturas").

## O que o cliente precisa decidir ou fornecer

- Aprovar, ajustar ou substituir cada elemento da tabela acima, **por escrito**.
- Enviar o logotipo em vetor (SVG ou PDF), se houver, cores oficiais e fontes com licença de uso web.
- Com o material final, a troca é de tema e de modelos de e-mail; as telas não mudam de estrutura.

## Modelo de resposta

> Aprovo a proposta visual enviada em _**/**_/______ (versão ___), com as seguintes alterações: ______.
> Nome, cargo, data e canal da resposta.

Enquanto não houver aprovação registrada, a variável `VISUAL_APPROVED` fica `false`: o site mantém a faixa de tema provisório e **a venda real em produção permanece bloqueada**.
