# Checklist de telas e estados

Gerado por `infra/ui/checklist.py` a partir de `antes/manifest.json` e `depois/manifest.json`. Uma linha por tela e estado.
Status **concluído** = há captura depois do refinamento em todas as larguras pedidas (360, 390, 768 e 1440 px; e-mails e PDF
em largura própria). Rotas com `:id` usam os dados fictícios de `infra/ui/seed-ui.mts` e `flows-ui.mts`.

| ID | Tela | Rota | Estado | Antes | Depois | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | Página inicial | `/` | carregado | [390](antes/P01__carregado__390.jpg) [1440](antes/P01__carregado__1440.jpg) | pendente | pendente |
| P01 | Página inicial | `/` | carregando | [390](antes/P01__carregando__390.jpg) [1440](antes/P01__carregando__1440.jpg) | pendente | pendente |
| P01 | Página inicial | `/` | erro de carregamento | [390](antes/P01__erro-de-carregamento__390.jpg) [1440](antes/P01__erro-de-carregamento__1440.jpg) | pendente | pendente |
| P01 | Página inicial | `/` | sem eventos | [390](antes/P01__sem-eventos__390.jpg) [1440](antes/P01__sem-eventos__1440.jpg) | pendente | pendente |
| P02 | Listagem e busca | `/eventos?q=noite` | busca com filtro | [390](antes/P02__busca-com-filtro__390.jpg) [1440](antes/P02__busca-com-filtro__1440.jpg) | pendente | pendente |
| P02 | Listagem e busca | `/eventos` | carregando | [390](antes/P02__carregando__390.jpg) [1440](antes/P02__carregando__1440.jpg) | pendente | pendente |
| P02 | Listagem e busca | `/eventos` | erro | [390](antes/P02__erro__390.jpg) [1440](antes/P02__erro__1440.jpg) | pendente | pendente |
| P02 | Listagem e busca | `/eventos` | lista | [390](antes/P02__lista__390.jpg) [1440](antes/P02__lista__1440.jpg) | pendente | pendente |
| P02 | Listagem e busca | `/eventos?q=inexistente&date=2030-01-01` | nenhum resultado | [390](antes/P02__nenhum-resultado__390.jpg) [1440](antes/P02__nenhum-resultado__1440.jpg) | pendente | pendente |
| P02 | Listagem e busca | `/eventos` | nenhuma venda disponivel | [390](antes/P02__nenhuma-venda-disponivel__390.jpg) [1440](antes/P02__nenhuma-venda-disponivel__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/noite-roxa-warehouse` | carregando | [390](antes/P03__carregando__390.jpg) [1440](antes/P03__carregando__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/noite-roxa-warehouse` | disponivel com tipo esgotado e desativado | [390](antes/P03__disponivel-com-tipo-esgotado-e-desativado__390.jpg) [1440](antes/P03__disponivel-com-tipo-esgotado-e-desativado__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/rosa-eletrica` | esgotado | [390](antes/P03__esgotado__390.jpg) [1440](antes/P03__esgotado__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/halloween-ficticio` | evento encerrado por link direto | [390](antes/P03__evento-encerrado-por-link-direto__390.jpg) [1440](antes/P03__evento-encerrado-por-link-direto__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/quinta-experimental` | sem banner e sem atracoes | [390](antes/P03__sem-banner-e-sem-atracoes__390.jpg) [1440](antes/P03__sem-banner-e-sem-atracoes__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/pre-estreia-lotada` | unidades reservadas | [390](antes/P03__unidades-reservadas__390.jpg) [1440](antes/P03__unidades-reservadas__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/reveillon-ficticio-2027` | vendas ainda nao iniciadas | [390](antes/P03__vendas-ainda-nao-iniciadas__390.jpg) [1440](antes/P03__vendas-ainda-nao-iniciadas__1440.jpg) | pendente | pendente |
| P03 | Página do evento | `/eventos/domingo-de-ressaca` | vendas encerradas | [390](antes/P03__vendas-encerradas__390.jpg) [1440](antes/P03__vendas-encerradas__1440.jpg) | pendente | pendente |
| P04 | Termos de Uso | `/termos-de-uso` | texto nao fornecido | [390](antes/P04__texto-nao-fornecido__390.jpg) [1440](antes/P04__texto-nao-fornecido__1440.jpg) | pendente | pendente |
| P05 | Privacidade | `/privacidade` | texto nao fornecido | [390](antes/P05__texto-nao-fornecido__390.jpg) [1440](antes/P05__texto-nao-fornecido__1440.jpg) | pendente | pendente |
| P06 | Cancelamento e meia-entrada | `/meia-entrada` | meia-entrada | [390](antes/P06__meia-entrada__390.jpg) [1440](antes/P06__meia-entrada__1440.jpg) | pendente | pendente |
| P06 | Cancelamento e meia-entrada | `/politica-de-cancelamento` | texto nao fornecido | [390](antes/P06__texto-nao-fornecido__390.jpg) [1440](antes/P06__texto-nao-fornecido__1440.jpg) | pendente | pendente |
| P07 | Não encontrada | `/eventos/evento-que-nao-existe` | evento inexistente | [390](antes/P07__evento-inexistente__390.jpg) [1440](antes/P07__evento-inexistente__1440.jpg) | pendente | pendente |
| P07 | Não encontrada | `/pagina-que-nao-existe` | pagina inexistente | [390](antes/P07__pagina-inexistente__390.jpg) [1440](antes/P07__pagina-inexistente__1440.jpg) | pendente | pendente |
| A01 | Login | `/entrar` | bloqueio temporario | [390](antes/A01__bloqueio-temporario__390.jpg) [1440](antes/A01__bloqueio-temporario__1440.jpg) | pendente | pendente |
| A01 | Login | `/entrar` | conta desativada | [390](antes/A01__conta-desativada__390.jpg) [1440](antes/A01__conta-desativada__1440.jpg) | pendente | pendente |
| A01 | Login | `/entrar` | credenciais incorretas | [390](antes/A01__credenciais-incorretas__390.jpg) [1440](antes/A01__credenciais-incorretas__1440.jpg) | pendente | pendente |
| A01 | Login | `/entrar` | padrao | [390](antes/A01__padrao__390.jpg) [1440](antes/A01__padrao__1440.jpg) | pendente | pendente |
| A01 | Login | `/entrar?voltar=/checkout/noite-roxa-warehouse` | retorno ao checkout | [390](antes/A01__retorno-ao-checkout__390.jpg) [1440](antes/A01__retorno-ao-checkout__1440.jpg) | pendente | pendente |
| A02 | Cadastro | `/criar-conta` | campos incompletos | [390](antes/A02__campos-incompletos__390.jpg) [1440](antes/A02__campos-incompletos__1440.jpg) | pendente | pendente |
| A02 | Cadastro | `/criar-conta` | cpf invalido e email ja cadastrado | [390](antes/A02__cpf-invalido-e-email-ja-cadastrado__390.jpg) [1440](antes/A02__cpf-invalido-e-email-ja-cadastrado__1440.jpg) | pendente | pendente |
| A02 | Cadastro | `/criar-conta` | padrao | [390](antes/A02__padrao__390.jpg) [1440](antes/A02__padrao__1440.jpg) | pendente | pendente |
| A02 | Cadastro | `/criar-conta?voltar=/checkout/noite-roxa-warehouse` | retorno ao checkout | [390](antes/A02__retorno-ao-checkout__390.jpg) [1440](antes/A02__retorno-ao-checkout__1440.jpg) | pendente | pendente |
| A03 | Recuperar senha | `/recuperar-senha` | padrao | [390](antes/A03__padrao__390.jpg) [1440](antes/A03__padrao__1440.jpg) | pendente | pendente |
| A04 | Confirmação da solicitação | `/recuperar-senha` | confirmacao neutra | [390](antes/A04__confirmacao-neutra__390.jpg) [1440](antes/A04__confirmacao-neutra__1440.jpg) | pendente | pendente |
| A05 | Nova senha | `/redefinir-senha?token=x` | link expirado | [390](antes/A05__link-expirado__390.jpg) [1440](antes/A05__link-expirado__1440.jpg) | pendente | pendente |
| A05 | Nova senha | `/redefinir-senha?token=invalido` | link invalido | [390](antes/A05__link-invalido__390.jpg) [1440](antes/A05__link-invalido__1440.jpg) | pendente | pendente |
| A05 | Nova senha | `/redefinir-senha?token=x` | link ja utilizado | [390](antes/A05__link-ja-utilizado__390.jpg) [1440](antes/A05__link-ja-utilizado__1440.jpg) | pendente | pendente |
| A05 | Nova senha | `/redefinir-senha?token=x` | link valido | [390](antes/A05__link-valido__390.jpg) [1440](antes/A05__link-valido__1440.jpg) | pendente | pendente |
| A05 | Nova senha | `/redefinir-senha?token=x` | senhas diferentes | [390](antes/A05__senhas-diferentes__390.jpg) [1440](antes/A05__senhas-diferentes__1440.jpg) | pendente | pendente |
| A06 | Senha alterada | `/redefinir-senha?token=x` | senha alterada | [390](antes/A06__senha-alterada__390.jpg) [1440](antes/A06__senha-alterada__1440.jpg) | pendente | pendente |
| C01 | Seleção de ingressos | `/eventos/noite-roxa-warehouse` | limite por compra atingido | [390](antes/C01__limite-por-compra-atingido__390.jpg) [1440](antes/C01__limite-por-compra-atingido__1440.jpg) | pendente | pendente |
| C01 | Seleção de ingressos | `/eventos/noite-roxa-warehouse` | selecao de ingressos | [390](antes/C01__selecao-de-ingressos__390.jpg) [1440](antes/C01__selecao-de-ingressos__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | carrinho vazio | [390](antes/C02__carrinho-vazio__390.jpg) [1440](antes/C02__carrinho-vazio__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | codigo do promoter desativado | [390](antes/C02__codigo-do-promoter-desativado__390.jpg) [1440](antes/C02__codigo-do-promoter-desativado__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | codigo do promoter invalido | [390](antes/C02__codigo-do-promoter-invalido__390.jpg) [1440](antes/C02__codigo-do-promoter-invalido__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | codigo do promoter valido | [390](antes/C02__codigo-do-promoter-valido__390.jpg) [1440](antes/C02__codigo-do-promoter-valido__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | conferindo disponibilidade | [390](antes/C02__conferindo-disponibilidade__390.jpg) [1440](antes/C02__conferindo-disponibilidade__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | estoque alterado | [390](antes/C02__estoque-alterado__390.jpg) [1440](antes/C02__estoque-alterado__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | revisao do pedido | [390](antes/C02__revisao-do-pedido__390.jpg) [1440](antes/C02__revisao-do-pedido__1440.jpg) | pendente | pendente |
| C02 | Revisão do pedido | `/checkout/noite-roxa-warehouse` | visitante vai ao login | [390](antes/C02__visitante-vai-ao-login__390.jpg) [1440](antes/C02__visitante-vai-ao-login__1440.jpg) | pendente | pendente |
| C03 | Forma de pagamento | `/pedido/867ebe8e-9aa7-483d-a92a-8aee6ae3ce21` | cartao selecionado | [390](antes/C03__cartao-selecionado__390.jpg) [1440](antes/C03__cartao-selecionado__1440.jpg) | pendente | pendente |
| C03 | Forma de pagamento | `/pedido/867ebe8e-9aa7-483d-a92a-8aee6ae3ce21` | escolha da forma de pagamento | [390](antes/C03__escolha-da-forma-de-pagamento__390.jpg) [1440](antes/C03__escolha-da-forma-de-pagamento__1440.jpg) | pendente | pendente |
| C04 | Pix | `/pedido/ae81f5d4-bd09-4605-b613-5d4048df7125` | codigo pix copiado | [390](antes/C04__codigo-pix-copiado__390.jpg) [1440](antes/C04__codigo-pix-copiado__1440.jpg) | pendente | pendente |
| C04 | Pix | `/pedido/ae81f5d4-bd09-4605-b613-5d4048df7125` | pix aguardando pagamento | [390](antes/C04__pix-aguardando-pagamento__390.jpg) [1440](antes/C04__pix-aguardando-pagamento__1440.jpg) | pendente | pendente |
| C04 | Pix | `/pedido/ae81f5d4-bd09-4605-b613-5d4048df7125` | ultimos 60 segundos da reserva | [390](antes/C04__ultimos-60-segundos-da-reserva__390.jpg) [1440](antes/C04__ultimos-60-segundos-da-reserva__1440.jpg) | pendente | pendente |
| C05 | Cartão | `/pedido/0de6faee-0fd8-40e2-8f72-39039253d4c1` | cartao em pagina segura do gateway | [390](antes/C05__cartao-em-pagina-segura-do-gateway__390.jpg) [1440](antes/C05__cartao-em-pagina-segura-do-gateway__1440.jpg) | pendente | pendente |
| C06 | Em processamento | `/pedido/d0e1df5d-d87f-4938-9ee8-94ebb3b396d6` | pagamento confirmado preparando ingressos | [390](antes/C06__pagamento-confirmado-preparando-ingressos__390.jpg) [1440](antes/C06__pagamento-confirmado-preparando-ingressos__1440.jpg) | pendente | pendente |
| C07 | Compra confirmada | `/pedido/d0e1df5d-d87f-4938-9ee8-94ebb3b396d6` | compra confirmada | [390](antes/C07__compra-confirmada__390.jpg) [1440](antes/C07__compra-confirmada__1440.jpg) | pendente | pendente |
| C08 | Reserva expirada | `/pedido/48903e73-c14a-4771-ac6f-62b50c964637` | reserva expirada | [390](antes/C08__reserva-expirada__390.jpg) [1440](antes/C08__reserva-expirada__1440.jpg) | pendente | pendente |
| C09 | Pagamento recusado | `/pedido/919ed3f5-73ea-4016-84c7-41a137893df1` | pagamento recusado | [390](antes/C09__pagamento-recusado__390.jpg) [1440](antes/C09__pagamento-recusado__1440.jpg) | pendente | pendente |
| C10 | Pago sem estoque | `e-mail pagamento_sem_estoque` | email pagamento_sem_estoque | [390](antes/C10__email-pagamento-sem-estoque__390.jpg) [1440](antes/C10__email-pagamento-sem-estoque__1440.jpg) | pendente | pendente |
| C10 | Pago sem estoque | `/pedido/cfbf3c75-65d2-4dd3-9616-7e1ec7026471` | pago sem estoque | [390](antes/C10__pago-sem-estoque__390.jpg) [1440](antes/C10__pago-sem-estoque__1440.jpg) | pendente | pendente |
| U01 | Meus ingressos | `/meus-ingressos` | carregando | [390](antes/U01__carregando__390.jpg) [1440](antes/U01__carregando__1440.jpg) | pendente | pendente |
| U01 | Meus ingressos | `/meus-ingressos` | erro | [390](antes/U01__erro__390.jpg) [1440](antes/U01__erro__1440.jpg) | pendente | pendente |
| U01 | Meus ingressos | `/meus-ingressos` | historico | [390](antes/U01__historico__390.jpg) [1440](antes/U01__historico__1440.jpg) | pendente | pendente |
| U01 | Meus ingressos | `/meus-ingressos` | proximos | [390](antes/U01__proximos__390.jpg) [1440](antes/U01__proximos__1440.jpg) | pendente | pendente |
| U01 | Meus ingressos | `/meus-ingressos` | sem ingressos | [390](antes/U01__sem-ingressos__390.jpg) [1440](antes/U01__sem-ingressos__1440.jpg) | pendente | pendente |
| U02 | Minhas compras | `/minhas-compras` | lista com todas as situacoes | [390](antes/U02__lista-com-todas-as-situacoes__390.jpg) [1440](antes/U02__lista-com-todas-as-situacoes__1440.jpg) | pendente | pendente |
| U02 | Minhas compras | `/minhas-compras` | sem compras | [390](antes/U02__sem-compras__390.jpg) [1440](antes/U02__sem-compras__1440.jpg) | pendente | pendente |
| U03 | Detalhe da compra | `/pedido/26932c7b-0af5-4aaa-aaac-d0b0f83ad2a4` | pedido cancelado | [390](antes/U03__pedido-cancelado__390.jpg) [1440](antes/U03__pedido-cancelado__1440.jpg) | pendente | pendente |
| U03 | Detalhe da compra | `/pedido/a627edde-866a-4cc0-b63e-091504de4dea` | pedido estornado | [390](antes/U03__pedido-estornado__390.jpg) [1440](antes/U03__pedido-estornado__1440.jpg) | pendente | pendente |
| U03 | Detalhe da compra | `/pedido/00000000-0000-4000-8000-000000000000` | pedido nao encontrado | [390](antes/U03__pedido-nao-encontrado__390.jpg) [1440](antes/U03__pedido-nao-encontrado__1440.jpg) | pendente | pendente |
| U04 | Ingresso | `/ingressos/4fdb9d14-eaed-49ae-9681-c9cb866ee247` | cancelado | [390](antes/U04__cancelado__390.jpg) [1440](antes/U04__cancelado__1440.jpg) | pendente | pendente |
| U04 | Ingresso | `/ingressos/00000000-0000-4000-8000-000000000000` | nao encontrado | [390](antes/U04__nao-encontrado__390.jpg) [1440](antes/U04__nao-encontrado__1440.jpg) | pendente | pendente |
| U04 | Ingresso | `/ingressos/b4b71519-8c49-4892-a9e1-e6c9c161c18c` | utilizado | [390](antes/U04__utilizado__390.jpg) [1440](antes/U04__utilizado__1440.jpg) | pendente | pendente |
| U04 | Ingresso | `/ingressos/d7814051-4f26-414c-bb80-333596a3cda8` | valido | [390](antes/U04__valido__390.jpg) [1440](antes/U04__valido__1440.jpg) | pendente | pendente |
| U05 | Tela cheia | `/ingressos/4fdb9d14-eaed-49ae-9681-c9cb866ee247/tela-cheia` | tela cheia cancelado | [390](antes/U05__tela-cheia-cancelado__390.jpg) [1440](antes/U05__tela-cheia-cancelado__1440.jpg) | pendente | pendente |
| U05 | Tela cheia | `/ingressos/d7814051-4f26-414c-bb80-333596a3cda8/tela-cheia` | tela cheia valido | [390](antes/U05__tela-cheia-valido__390.jpg) [1440](antes/U05__tela-cheia-valido__1440.jpg) | pendente | pendente |
| U06 | Minha conta | `/minha-conta` | alteracoes salvas | [390](antes/U06__alteracoes-salvas__390.jpg) [1440](antes/U06__alteracoes-salvas__1440.jpg) | pendente | pendente |
| U06 | Minha conta | `/minha-conta` | dados | [390](antes/U06__dados__390.jpg) [1440](antes/U06__dados__1440.jpg) | pendente | pendente |
| U07 | Alterar senha | `/minha-conta` | alterar senha | [390](antes/U07__alterar-senha__390.jpg) [1440](antes/U07__alterar-senha__1440.jpg) | pendente | pendente |
| U07 | Alterar senha | `/minha-conta` | alterar senha com erro | [390](antes/U07__alterar-senha-com-erro__390.jpg) [1440](antes/U07__alterar-senha-com-erro__1440.jpg) | pendente | pendente |
| V01 | Selecionar evento | `/portaria` | selecionar evento | [390](antes/V01__selecionar-evento__390.jpg) [1440](antes/V01__selecionar-evento__1440.jpg) | pendente | pendente |
| V02 | Leitor por câmera | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | camera indisponivel | [390](antes/V02__camera-indisponivel__390.jpg) [1440](antes/V02__camera-indisponivel__1440.jpg) | pendente | pendente |
| V02 | Leitor por câmera | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | camera lendo | [390](antes/V02__camera-lendo__390.jpg) [1440](antes/V02__camera-lendo__1440.jpg) | pendente | pendente |
| V02 | Leitor por câmera | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | camera parada | [390](antes/V02__camera-parada__390.jpg) [1440](antes/V02__camera-parada__1440.jpg) | pendente | pendente |
| V03 | Busca manual | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | busca manual | [390](antes/V03__busca-manual__390.jpg) [1440](antes/V03__busca-manual__1440.jpg) | pendente | pendente |
| V04 | Resultado da busca | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | nenhum resultado | [390](antes/V04__nenhum-resultado__390.jpg) [1440](antes/V04__nenhum-resultado__1440.jpg) | pendente | pendente |
| V04 | Resultado da busca | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | resultado com homonimos | [390](antes/V04__resultado-com-homonimos__390.jpg) [1440](antes/V04__resultado-com-homonimos__1440.jpg) | pendente | pendente |
| V05 | Válido | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | entrada liberada | [390](antes/V05__entrada-liberada__390.jpg) [1440](antes/V05__entrada-liberada__1440.jpg) | pendente | pendente |
| V06 | Já utilizado | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | ingresso ja utilizado | [390](antes/V06__ingresso-ja-utilizado__390.jpg) [1440](antes/V06__ingresso-ja-utilizado__1440.jpg) | pendente | pendente |
| V07 | Inválido ou cancelado | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | ingresso cancelado | [390](antes/V07__ingresso-cancelado__390.jpg) [1440](antes/V07__ingresso-cancelado__1440.jpg) | pendente | pendente |
| V07 | Inválido ou cancelado | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | ingresso invalido | [390](antes/V07__ingresso-invalido__390.jpg) [1440](antes/V07__ingresso-invalido__1440.jpg) | pendente | pendente |
| V08 | Outro evento | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | ingresso de outro evento | [390](antes/V08__ingresso-de-outro-evento__390.jpg) [1440](antes/V08__ingresso-de-outro-evento__1440.jpg) | pendente | pendente |
| V09 | Falha | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | falha ao consultar o servidor | [390](antes/V09__falha-ao-consultar-o-servidor__390.jpg) [1440](antes/V09__falha-ao-consultar-o-servidor__1440.jpg) | pendente | pendente |
| V09 | Falha | `/portaria/5d90334f-ae31-4323-bb98-17a50f015595` | sem conexao | [390](antes/V09__sem-conexao__390.jpg) [1440](antes/V09__sem-conexao__1440.jpg) | pendente | pendente |
| ADM01 | Visão geral | `/admin` | carregando | [390](antes/ADM01__carregando__390.jpg) [1440](antes/ADM01__carregando__1440.jpg) | pendente | pendente |
| ADM01 | Visão geral | `/admin` | erro | [390](antes/ADM01__erro__390.jpg) [1440](antes/ADM01__erro__1440.jpg) | pendente | pendente |
| ADM01 | Visão geral | `/admin` | visao geral | [390](antes/ADM01__visao-geral__390.jpg) [1440](antes/ADM01__visao-geral__1440.jpg) | pendente | pendente |
| ADM02 | Eventos | `/admin/eventos` | lista de eventos | [390](antes/ADM02__lista-de-eventos__390.jpg) [1440](antes/ADM02__lista-de-eventos__1440.jpg) | pendente | pendente |
| ADM03 | Criar e editar evento | `/admin/eventos/novo` | criar evento | [390](antes/ADM03__criar-evento__390.jpg) [1440](antes/ADM03__criar-evento__1440.jpg) | pendente | pendente |
| ADM03 | Criar e editar evento | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595/editar` | editar evento publicado | [390](antes/ADM03__editar-evento-publicado__390.jpg) [1440](antes/ADM03__editar-evento-publicado__1440.jpg) | pendente | pendente |
| ADM03 | Criar e editar evento | `/admin/eventos/novo` | erros do formulario | [390](antes/ADM03__erros-do-formulario__390.jpg) [1440](antes/ADM03__erros-do-formulario__1440.jpg) | pendente | pendente |
| ADM03 | Criar e editar evento | `/admin/eventos/ac791e4c-b653-4f40-9c8b-2e0b708cf285/previa` | pre-visualizacao | [390](antes/ADM03__pre-visualizacao__390.jpg) [1440](antes/ADM03__pre-visualizacao__1440.jpg) | pendente | pendente |
| ADM04 | Gestão do evento | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | confirmar encerramento | [390](antes/ADM04__confirmar-encerramento__390.jpg) [1440](antes/ADM04__confirmar-encerramento__1440.jpg) | pendente | pendente |
| ADM04 | Gestão do evento | `/admin/eventos/ac791e4c-b653-4f40-9c8b-2e0b708cf285` | confirmar publicacao | [390](antes/ADM04__confirmar-publicacao__390.jpg) [1440](antes/ADM04__confirmar-publicacao__1440.jpg) | pendente | pendente |
| ADM04 | Gestão do evento | `/admin/eventos/7a079eaf-74ef-4bd6-9903-3195c79a2ef5` | encerrado | [390](antes/ADM04__encerrado__390.jpg) [1440](antes/ADM04__encerrado__1440.jpg) | pendente | pendente |
| ADM04 | Gestão do evento | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | informacoes | [390](antes/ADM04__informacoes__390.jpg) [1440](antes/ADM04__informacoes__1440.jpg) | pendente | pendente |
| ADM04 | Gestão do evento | `/admin/eventos/ac791e4c-b653-4f40-9c8b-2e0b708cf285` | rascunho | [390](antes/ADM04__rascunho__390.jpg) [1440](antes/ADM04__rascunho__1440.jpg) | pendente | pendente |
| ADM05 | Tipos de ingresso | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | tipos de ingresso | [390](antes/ADM05__tipos-de-ingresso__390.jpg) [1440](antes/ADM05__tipos-de-ingresso__1440.jpg) | pendente | pendente |
| ADM06 | Criar tipo | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | novo tipo de ingresso | [390](antes/ADM06__novo-tipo-de-ingresso__390.jpg) [1440](antes/ADM06__novo-tipo-de-ingresso__1440.jpg) | pendente | pendente |
| ADM07 | Promoters | `/admin/promoters` | lista | [390](antes/ADM07__lista__390.jpg) [1440](antes/ADM07__lista__1440.jpg) | pendente | pendente |
| ADM08 | Criar promoter | `/admin/promoters` | codigo repetido | [390](antes/ADM08__codigo-repetido__390.jpg) [1440](antes/ADM08__codigo-repetido__1440.jpg) | pendente | pendente |
| ADM08 | Criar promoter | `/admin/promoters` | novo promoter | [390](antes/ADM08__novo-promoter__390.jpg) [1440](antes/ADM08__novo-promoter__1440.jpg) | pendente | pendente |
| ADM09 | Detalhe do promoter | `/admin/promoters` | detalhe do promoter | [390](antes/ADM09__detalhe-do-promoter__390.jpg) [1440](antes/ADM09__detalhe-do-promoter__1440.jpg) | pendente | pendente |
| ADM10 | Pedidos | `/admin/pedidos` | lista de pedidos | [390](antes/ADM10__lista-de-pedidos__390.jpg) [1440](antes/ADM10__lista-de-pedidos__1440.jpg) | pendente | pendente |
| ADM11 | Detalhe do pedido e exceções | `/admin/pedidos/d0e1df5d-d87f-4938-9ee8-94ebb3b396d6` | detalhe do pedido | [390](antes/ADM11__detalhe-do-pedido__390.jpg) [1440](antes/ADM11__detalhe-do-pedido__1440.jpg) | pendente | pendente |
| ADM11 | Detalhe do pedido e exceções | `/admin/excecoes` | excecoes de pagamento | [390](antes/ADM11__excecoes-de-pagamento__390.jpg) [1440](antes/ADM11__excecoes-de-pagamento__1440.jpg) | pendente | pendente |
| ADM11 | Detalhe do pedido e exceções | `/admin/pedidos/cfbf3c75-65d2-4dd3-9616-7e1ec7026471` | pago sem estoque | [390](antes/ADM11__pago-sem-estoque__390.jpg) [1440](antes/ADM11__pago-sem-estoque__1440.jpg) | pendente | pendente |
| ADM12 | Compradores | `/admin/compradores` | compradores | [390](antes/ADM12__compradores__390.jpg) [1440](antes/ADM12__compradores__1440.jpg) | pendente | pendente |
| ADM12 | Compradores | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | compradores do evento | [390](antes/ADM12__compradores-do-evento__390.jpg) [1440](antes/ADM12__compradores-do-evento__1440.jpg) | pendente | pendente |
| ADM13 | Detalhe do comprador | `/admin/compradores` | corrigir e-mail ou cpf | [390](antes/ADM13__corrigir-e-mail-ou-cpf__390.jpg) [1440](antes/ADM13__corrigir-e-mail-ou-cpf__1440.jpg) | pendente | pendente |
| ADM13 | Detalhe do comprador | `/admin/compradores` | detalhe do comprador | [390](antes/ADM13__detalhe-do-comprador__390.jpg) [1440](antes/ADM13__detalhe-do-comprador__1440.jpg) | pendente | pendente |
| ADM14 | Ingressos | `/admin/ingressos` | ingressos | [390](antes/ADM14__ingressos__390.jpg) [1440](antes/ADM14__ingressos__1440.jpg) | pendente | pendente |
| ADM14 | Ingressos | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | ingressos do evento | [390](antes/ADM14__ingressos-do-evento__390.jpg) [1440](antes/ADM14__ingressos-do-evento__1440.jpg) | pendente | pendente |
| ADM15 | Ingresso e cancelamento | `/admin/pedidos/d0e1df5d-d87f-4938-9ee8-94ebb3b396d6` | cancelar unidade | [390](antes/ADM15__cancelar-unidade__390.jpg) [1440](antes/ADM15__cancelar-unidade__1440.jpg) | pendente | pendente |
| ADM15 | Ingresso e cancelamento | `/admin/ingressos/d7814051-4f26-414c-bb80-333596a3cda8` | confirmar cancelamento | [390](antes/ADM15__confirmar-cancelamento__390.jpg) [1440](antes/ADM15__confirmar-cancelamento__1440.jpg) | pendente | pendente |
| ADM15 | Ingresso e cancelamento | `/admin/ingressos/d7814051-4f26-414c-bb80-333596a3cda8` | detalhe do ingresso | [390](antes/ADM15__detalhe-do-ingresso__390.jpg) [1440](antes/ADM15__detalhe-do-ingresso__1440.jpg) | pendente | pendente |
| ADM15 | Ingresso e cancelamento | `/admin/ingressos/4fdb9d14-eaed-49ae-9681-c9cb866ee247` | ingresso cancelado | [390](antes/ADM15__ingresso-cancelado__390.jpg) [1440](antes/ADM15__ingresso-cancelado__1440.jpg) | pendente | pendente |
| ADM16 | Relatório de vendas | `/admin/relatorios/vendas` | relatorio de vendas | [390](antes/ADM16__relatorio-de-vendas__390.jpg) [1440](antes/ADM16__relatorio-de-vendas__1440.jpg) | pendente | pendente |
| ADM17 | Ranking de promoters | `/admin/relatorios/promoters` | ranking de promoters | [390](antes/ADM17__ranking-de-promoters__390.jpg) [1440](antes/ADM17__ranking-de-promoters__1440.jpg) | pendente | pendente |
| ADM18 | Taxa mensal | `/admin/relatorios/taxa-mensal` | taxa mensal | [390](antes/ADM18__taxa-mensal__390.jpg) [1440](antes/ADM18__taxa-mensal__1440.jpg) | pendente | pendente |
| ADM19 | Entradas | `/admin/entradas` | acompanhamento das entradas | [390](antes/ADM19__acompanhamento-das-entradas__390.jpg) [1440](antes/ADM19__acompanhamento-das-entradas__1440.jpg) | pendente | pendente |
| ADM19 | Entradas | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | entradas ao vivo no evento | [390](antes/ADM19__entradas-ao-vivo-no-evento__390.jpg) [1440](antes/ADM19__entradas-ao-vivo-no-evento__1440.jpg) | pendente | pendente |
| ADM20 | Equipe | `/admin/equipe` | equipe | [390](antes/ADM20__equipe__390.jpg) [1440](antes/ADM20__equipe__1440.jpg) | pendente | pendente |
| ADM21 | Criar usuário | `/admin/equipe` | novo usuario | [390](antes/ADM21__novo-usuario__390.jpg) [1440](antes/ADM21__novo-usuario__1440.jpg) | pendente | pendente |
| ADM22 | Primeiro acesso | `/primeiro-acesso` | troca da senha temporaria | [390](antes/ADM22__troca-da-senha-temporaria__390.jpg) [1440](antes/ADM22__troca-da-senha-temporaria__1440.jpg) | pendente | pendente |
| ADM23 | Exportações e contingência | `/admin/eventos/5d90334f-ae31-4323-bb98-17a50f015595` | contingencia | [390](antes/ADM23__contingencia__390.jpg) [1440](antes/ADM23__contingencia__1440.jpg) | pendente | pendente |
| ADM24 | Conta do administrador | `/admin/conta` | alterar senha | [390](antes/ADM24__alterar-senha__390.jpg) [1440](antes/ADM24__alterar-senha__1440.jpg) | pendente | pendente |
| ADM24 | Conta do administrador | `/admin/conta` | conta do administrador | [390](antes/ADM24__conta-do-administrador__390.jpg) [1440](antes/ADM24__conta-do-administrador__1440.jpg) | pendente | pendente |
| G04 | Acesso negado | `/portaria` | acesso negado ao cliente | [390](antes/G04__acesso-negado-ao-cliente__390.jpg) [1440](antes/G04__acesso-negado-ao-cliente__1440.jpg) | pendente | pendente |
| G04 | Acesso negado | `/admin` | acesso negado ao validador | [390](antes/G04__acesso-negado-ao-validador__390.jpg) [1440](antes/G04__acesso-negado-ao-validador__1440.jpg) | pendente | pendente |
| G07 | Menus e gavetas | `/` | menu do celular aberto | [390](antes/G07__menu-do-celular-aberto__390.jpg) [1440](antes/G07__menu-do-celular-aberto__1440.jpg) | pendente | pendente |
| G07 | Menus e gavetas | `/admin` | menu do painel no celular | [390](antes/G07__menu-do-painel-no-celular__390.jpg) [1440](antes/G07__menu-do-painel-no-celular__1440.jpg) | pendente | pendente |
| INTRO | Abertura em vídeo | `/` | abertura em video | [390](antes/INTRO__abertura-em-video__390.jpg) [1440](antes/INTRO__abertura-em-video__1440.jpg) | pendente | pendente |
| E01 | E-mail de cadastro | `e-mail cadastro` | email cadastro | [390](antes/E01__email-cadastro__390.jpg) [1440](antes/E01__email-cadastro__1440.jpg) | pendente | pendente |
| E02 | E-mail de recuperação | `e-mail recuperacao_senha` | email recuperacao_senha | [390](antes/E02__email-recuperacao-senha__390.jpg) [1440](antes/E02__email-recuperacao-senha__1440.jpg) | pendente | pendente |
| E03 | E-mail de compra | `e-mail compra_confirmada` | email compra_confirmada | [390](antes/E03__email-compra-confirmada__390.jpg) [1440](antes/E03__email-compra-confirmada__1440.jpg) | pendente | pendente |
| E04 | PDF do ingresso | `/api/tickets/d7814051-4f26-414c-bb80-333596a3cda8/pdf` | pdf do ingresso | [pdf](antes/E04__pdf-do-ingresso-1.jpg) | pendente | pendente |
| E04 | PDF do ingresso | `/api/orders/d0e1df5d-d87f-4938-9ee8-94ebb3b396d6/tickets/pdf` | pdf do pedido | [pdf](antes/E04__pdf-do-pedido-3.jpg) | pendente | pendente |
| E05 | Compartilhamento | `/eventos/noite-roxa-warehouse` | compartilhar com pre-visualizacao | [390](antes/E05__compartilhar-com-pre-visualizacao__390.jpg) [1440](antes/E05__compartilhar-com-pre-visualizacao__1440.jpg) | pendente | pendente |

**0 de 152 estados concluídos.**

## Itens do inventário cobertos por outra captura

| ID | Onde está |
| --- | --- |
| C05, C06 | Cartão vai para a página segura do gateway (C05); "pagamento confirmado, preparando ingressos" (C06) |
| U03 | Detalhe da compra é a página do pedido (`/pedido/:id`): estados C03 a C10 e U03 |
| ADM23 | Exportações: links de CSV/XLSX nas listas e relatórios e a aba Contingência (CSV e PDF) |
| G01, G03 | Estados "carregando" e "erro" de P01, P02, P03, U01, ADM01 e checkout |
| G02 | Vazios: P01 sem eventos, P02 nenhum resultado, U01 sem ingressos, U02 sem compras, V04 nenhum resultado |
| G05 | Sessão expirada: volta ao login com retorno (A01 "retorno ao checkout"); tela própria em `sugestoes-futuras.md` |
| G06 | Manutenção: não existe no site real; registrado em `sugestoes-futuras.md` (depende de regra de servidor) |
| G08 | Exportação em andamento, concluída ou com erro: componente `ExportLink` nas telas do painel |
