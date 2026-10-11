# Roteiro de testes da PartyX (rascunho, versão 0.26-interna, 05/10/2026)

> **Rascunho.** Só deve ser enviado junto com a comunicação formal, depois que a versão estiver publicada em homologação e os itens marcados com ⚠ puderem ser feitos. Ver `../fechamento-interno.md`.

**Endereço de homologação:** [preencher na publicação] · **Prazo:** 10 dias corridos a partir da mensagem de entrega, até [data].
**Acessos de teste** (administrador, validador e cliente): enviados à parte, por canal seguro. No primeiro acesso a senha temporária precisa ser trocada.
**Aviso:** homologação usa dados fictícios. **Nenhum pagamento é real.** ⚠ Cartões e Pix de teste dependem do gateway que a PartyX escolher; os números de teste serão informados na entrega.

Como reportar qualquer problema: mensagem escrita para [canal], com **o que você fez, o que esperava, o que aconteceu** e, se puder, uma foto ou vídeo da tela. Cada apontamento é respondido e classificado em até 2 dias úteis.

## Parte 1: como cliente (use o celular e o computador)

| # | Faça | Deve acontecer |
|---|---|---|
| 1 | Crie uma conta com CPF válido. Tente de novo com um CPF inválido e com o mesmo CPF | A conta é criada. CPF inválido ou repetido é recusado com mensagem clara. Sem marcar o aceite dos termos, não conclui |
| 2 | Saia, entre de novo e peça a recuperação de senha. Abra o link, troque a senha, tente abrir o link outra vez ⚠ | Troca funciona; o segundo uso do link não funciona. O e-mail só chega se o remetente já estiver configurado |
| 3 | Abra a página inicial, a lista de eventos, busque por parte do nome e abra um evento | O evento aparece com banner, data, local e tipos de ingresso. Tipos fora do período aparecem como "em breve" ou "vendas encerradas"; esgotado aparece "Esgotado" |
| 4 | Compartilhe o link do evento pelo WhatsApp ⚠ | A prévia mostra nome e banner (exige endereço público com HTTPS) |
| 5 | Escolha 1 ingresso e pague com Pix de teste ⚠ | Contador da reserva visível; depois do pagamento, a tela muda para "Pago" sozinha e o ingresso aparece em Meus ingressos |
| 6 | Compre 3 ingressos com cartão de teste aprovado ⚠ | Três ingressos, cada um com QR diferente |
| 7 | Compre com cartão de teste recusado ⚠ | Pedido não pago, nenhum ingresso, as unidades voltam ao estoque |
| 8 | Inicie um Pix e não pague até vencer ⚠ | O pedido expira e as unidades voltam |
| 9 | Use um cupom de promoter válido e um inválido | Cupom válido registra a venda para o promoter, **sem desconto**; inválido é recusado |
| 10 | Tente comprar mais ingressos do que o limite por compra | É recusado com a explicação do limite |
| 11 | Em dois aparelhos, tente comprar a última unidade ao mesmo tempo | Só um consegue reservar; o outro vê "esgotado" |
| 12 | Confira o e-mail de confirmação ⚠ | Chega com link para Meus ingressos |
| 13 | Baixe o PDF de um ingresso e abra o ingresso em tela cheia no celular | PDF com evento, data, hora, local, tipo, comprador e código; QR grande e legível |

## Parte 2: como validador (celular, na portaria)

Ver o `guia-de-portaria.md`. Teste: ingresso válido (verde), o mesmo de novo (amarelo, com horário e quem validou), ingresso cancelado (vermelho), ingresso de outro evento (mensagem específica), QR adulterado (vermelho), busca manual por nome e por código. Tente também abrir o painel do administrador digitando o endereço: deve ser negado.

## Parte 3: como administrador

| # | Faça | Deve acontecer |
|---|---|---|
| 14 | Crie um evento com três tipos de ingresso e períodos diferentes; publique e depois encerre | Rascunho não aparece no site; publicado aparece; encerrado sai da lista de vendas |
| 15 | Cadastre dois promoters; tente repetir um código | Código repetido é recusado |
| 16 | Acompanhe o contador de entradas durante a leitura | Atualiza sozinho a cada poucos segundos |
| 17 | Cancele um ingresso (com motivo) e peça para o validador ler | Leitura vermelha; a ação fica registrada com autor, hora e motivo. O **estorno do dinheiro é feito por você no gateway** |
| 18 | Veja os relatórios: vendas por evento e tipo, promoters (ranking) e a taxa mensal | Totais batem com os pedidos pagos. O mês da taxa conta ingressos cancelados e estornados |
| 19 | Exporte uma planilha e abra no Excel ⚠ | Acentos corretos, colunas separadas por ponto e vírgula |
| 20 | Gere a lista de contingência do evento, em PDF | Lista com código, tipo, comprador e CPF mascarado; imprima e guarde em local fechado |
| 21 | Cadastre um validador, desative-o e tente entrar com ele | Usuário desativado não entra |

## O que este roteiro não cobre

Cobrança do gateway, repasses, comissão de promoter, transferência de ingresso, venda presencial, lista de espera e demais itens da seção 16 da documentação.
