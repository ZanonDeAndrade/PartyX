# Runbook: gateway de pagamento

Gateway real **ainda não escolhido (D-01)**; o que segue vale para qualquer um que entre. **Nunca** force a aprovação de pedido à mão: só a resposta autenticada do gateway aprova.

## Webhook não processado (`webhook_falhou`)
1. `npm run ops:weekly`: quantos pendentes e desistidos (10 tentativas).
2. Em produção cada pedido tem sua verificação sob demanda (Cloud Tasks: +10, +25 e +55 min) e há uma varredura diária às 04:00. Para rodar a varredura agora: `gcloud scheduler jobs run partyx-varredura-diaria --location=<região>`. Pedido que gastou as 3 verificações aparece em `ops:weekly` como revisão manual (alerta `conciliacao_revisao_manual`).
3. Pendentes que não saem: causa costuma ser o gateway fora do ar (veja o status dele) ou segredo de webhook trocado. Confira o log (`jsonPayload.errorCode`).
4. **Desistidos:** conferir cada pedido no painel do gateway; o pedido se acerta na próxima reconsulta se o estado mudar. Se pago no gateway e pendente aqui: abra chamado técnico (não edite o banco).

## Pagamento divergente (`pagamento_divergente`)
Nada foi aprovado. Veja o motivo no log (`mismatches`: valor, conta, moeda, pedido, forma). Conta diferente da PartyX é **grave**: pare e escale. Valor diferente: pode ser parcial ou erro de integração. A PartyX decide no gateway; a plataforma não aprova.

## Pago sem estoque (`pago_sem_estoque`)
Lista em `GET /api/admin/payments/exceptions` (administrador). Avise a PartyX **no mesmo dia** para **estornar no gateway** (D-13, D-41). Depois do estorno, o pedido vira "estornado" sozinho.

## Estorno ou chargeback fora de fluxo (`estorno_fora_de_fluxo`)
Pedido nunca aprovado aqui, ou combinação sem previsão. Conferir no gateway, registrar e revisar à mão.

## Credenciais, chave ou segredo de webhook
Trocar no Secret Manager (nova versão), publicar nova revisão do serviço, **reentregar** os eventos que falharam no painel do gateway, conferir `ops:weekly`. Nunca registrar o valor em chamado, log ou chat.

## Gateway fora do ar
Compra falha com mensagem clara; reservas vencem normalmente. Pagamentos feitos durante a queda se acertam pela conciliação quando ele voltar (aprovação tardia emite se houver estoque).
