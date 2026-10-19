## Alvos de toque menores que 44 px (390 px, iPhone simulado)

| Página | Menores que 44 px | Menores que 24 px | Exemplos |
|---|---|---|---|
| início | 1 | 0 | Entrar (81×40) |
| evento | 2 | 1 | Entrar (81×40); Política de cancelamento, troc (253×14) |
| criar conta | 4 | 2 | Entrar (81×40); aceite (24×24); Termos de Uso (108×17); Política de Privacidade (166×17) |
| entrar | 0 | 0 |  |
| checkout (revisão) | 1 | 1 | Política de cancelamento, troc (253×14) |
| pedido | 0 | 0 |  |
| meus ingressos | 0 | 0 |  |
| ingresso | 0 | 0 |  |
| portaria | 1 | 0 | Portaria (94×40) |
| admin: evento | 1 | 0 | Painel (81×40) |
| admin: pedidos | 6 | 5 | Painel (81×40); PX-10005 (69×23); PX-10004 (69×23); PX-10003 (69×23); PX-10002 (69×23); PX-10001 (69×23) |

## Alcance do polegar (botão principal na primeira tela a 390 × 844)

- evento (após escolher): botão principal "button:has-text("Continuar")" em y=763 (na primeira tela; metade inferior, ao alcance do polegar), 318×52 px
- entrar: botão principal "button:has-text("Entrar")" em y=465 (na primeira tela; metade inferior, ao alcance do polegar), 316×52 px
- criar conta: botão principal "button:has-text("Criar conta")" em y=1226 (abaixo da primeira tela; metade inferior, ao alcance do polegar), 316×52 px

## Campos de CPF, telefone e data (teclado e máscara)

- CPF: type=text, inputmode=numeric, autocomplete=null; digitado 12345678909 mostra "123.456.789-09" (máscara aplicada)
- Telefone: type=text, inputmode=tel, autocomplete=tel; digitado 11987654321 mostra "(11) 98765-4321" (máscara aplicada)
- Data de nascimento: type=date (teclado e seletor nativos do iPhone), min=null, max=null, appearance=none
- E-mail: type=email, inputmode=email, autocomplete=email

## Estados vazios, de carregamento e de erro

- Busca sem resultado: "Nenhum evento encontrado para “nadaexiste”" com link "Limpar busca"
- Meus ingressos sem compras: "Meus ingressos Minhas compras Minha conta MEUS INGRESSOS Próximos Histórico Você ainda não tem ingressos Quando um pagamento for confirmado, os ingressos aparecem aqui. Ver eventos"
- Minhas compras sem pedidos: "Meus ingressos Minhas compras Minha conta MINHAS COMPRAS Você ainda não fez nenhuma compra Ver eventos"
- Login com dados errados: mensagem "E-mail ou senha incorretos."; foco depois do erro em: BODY
- Cadastro vazio enviado: 1 mensagens de campo; foco depois do erro em: BODY; primeira mensagem "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade."
- Estado de carregamento: esqueleto com aria-busy presente durante a carga
