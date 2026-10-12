# Respostas do Mercado Pago para os testes

Formato copiado dos exemplos da documentação oficial (API de Orders, consultada em 11/10/2026) e das respostas observadas no
ambiente de teste, com **todos os identificadores trocados por valores fictícios**. Nenhum dado real: sem token, sem conta, sem
CPF, sem e-mail de pessoa.

- `order-pix-pendente.json`: Pix criado, aguardando pagamento (exemplo de "Pix", payment-integration/websites/pix).
- `order-cartao-aprovado.json`: cartão aprovado (`processed` / `accredited`).
- `order-cartao-recusado-402.json`: resposta HTTP 402 da criação, "a order foi criada, mas a transação falhou", com a order em `data`.
- `notificacao-order.json`: corpo de uma notificação do tópico `order` (exemplo de "Notificações").
