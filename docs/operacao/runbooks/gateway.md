# Runbook: gateway de pagamento (Mercado Pago)

**Gateway: premissa Mercado Pago, aguardando confirmação escrita da PartyX (D-01).** Integração pela API de Orders (`/v1/orders`), Pix e cartão à vista (D-02). Detalhes técnicos e provas: `../../pagamento-mercadopago.md`; painel e segredos: `../../../README-DEPLOY.md`, seção 8f.

Regras que valem sempre:

- **Nunca** aprove pedido à mão nem edite o banco: só a reconsulta autenticada ao Mercado Pago aprova (webhook, verificação do Cloud Tasks ou rotina diária).
- **A plataforma não estorna.** Todo estorno é feito pela PartyX no painel do Mercado Pago. Cancelar ingresso no painel da plataforma (ADM15) invalida o acesso e **não** devolve dinheiro.
- Atendimento ao comprador é da PartyX. A contratada orienta a equipe da PartyX; não fala com o comprador.

> **O que ainda não foi conferido com clique no painel real:** as compras feitas com as credenciais de teste não aparecem no painel da conta da PartyX, então o caminho de tela para achar uma venda e o botão de devolução **não foram clicados** (o estorno foi provado pela API equivalente, `POST /v1/orders/{id}/refund`). Os nomes de menu abaixo vêm da documentação do Mercado Pago e podem mudar: confira na primeira operação real (compra de baixo valor, 13.1) e corrija este runbook.

## Como achar um pedido no Mercado Pago

Cada pedido da plataforma tem duas referências, as duas no painel da plataforma (**Pedidos > pedido**, tela `/admin/pedidos/<id>`):

| Na plataforma | No Mercado Pago | Para que serve |
|---|---|---|
| **Id no gateway** (começa com `ORD`) | Id da order (API de Orders) | É o que a plataforma reconsulta. Identifica a cobrança |
| Id do pedido (o código longo no endereço `/admin/pedidos/<id>`) | Referência externa (`external_reference`) da order | Liga a venda do Mercado Pago ao pedido da plataforma |
| Número `PX-<n>`, valor e data/hora do pagamento | Valor e data da venda | Para localizar a venda na lista do painel |

No painel do Mercado Pago da conta da PartyX: abrir a lista de vendas/atividade, localizar a venda pelo valor e pela data/hora (ou buscar pela referência externa, se o painel oferecer a busca) e abrir o detalhe. Confira que o valor e a referência batem com o pedido antes de qualquer ação.

Pela API, para a equipe técnica (somente leitura, token só no Secret Manager, nunca colado em chat ou chamado): `GET https://api.mercadopago.com/v1/orders/<ORD...>`.

## Como a PartyX faz um estorno

1. Confirmar **qual cobrança** estornar (seções abaixo). Na cobrança em dobro, estornar a **outra** cobrança, nunca a do pedido.
2. No detalhe da venda no painel do Mercado Pago, usar a opção de devolução do dinheiro (total ou parcial). O prazo para o dinheiro voltar ao comprador é regra do Mercado Pago.
3. O Mercado Pago avisa a plataforma (notificação `order.refunded`). O que acontece aqui:
   - **Estorno total** da cobrança do pedido: pedido `estornado`, ingressos ainda válidos viram `cancelado` (motivo estorno), portaria vermelha, `paid_at` não muda e o ingresso continua contando na taxa mensal (CA-29).
   - **Estorno parcial** (D-82, proposta a confirmar com a PartyX): **nada é cancelado sozinho**. A trilha `pagamento.estorno_parcial` e o alerta `estorno_parcial` orientam o administrador a **cancelar manualmente, no ADM15 (Ingressos > detalhe do ingresso), o ingresso correspondente** ao valor devolvido. Qual unidade cancelar é decisão da PartyX. Sem esse passo, o ingresso continua entrando na portaria.
4. Se a notificação não chegar, a **rotina diária (04:00)** reconsulta pedidos pagos de eventos futuros e aplica o estorno. Para não esperar: `gcloud scheduler jobs run partyx-varredura-diaria --location=<região>`.

## Alerta "pago sem estoque" (`pago_sem_estoque`)

O Mercado Pago aprovou depois do fim da reserva e os ingressos já tinham sido vendidos: **nenhum ingresso foi emitido**. Os administradores ativos recebem e-mail e o painel mostra um alerta em todas as páginas.

1. Painel da plataforma: **Exceções** (`/admin/excecoes`), seção de pagamentos sem ingresso. Anote o pedido, o comprador, o valor e a **Referência no gateway**.
2. A PartyX faz o **estorno total** dessa cobrança no Mercado Pago (procedimento acima), no mesmo dia (D-13, D-41: canal, responsável e prazo ainda pendentes da PartyX). O contato com o comprador é da PartyX.
3. Quando a notificação chega, o pedido vira `estornado` sozinho.
4. No painel, **Marcar como tratado** com o motivo (ex.: "Estornado no Mercado Pago em 12/10, comprador avisado"). A marcação só registra; não estorna nem muda a taxa (D-54).

## Alerta "cobrança em dobro" (`cobranca_duplicada`)

Um mesmo pedido foi cobrado duas vezes. A plataforma emitiu os ingressos uma vez só, pela cobrança que vale para o pedido; a outra não gera nada (D-83).

1. Painel: **Exceções**, seção **Cobranças em dobro**. Cada linha mostra a **Cobrança em dobro (estornar)** e a **Cobrança do pedido**.
2. **Estornar só a cobrança em dobro.** Estornar a cobrança do pedido cancelaria os ingressos do comprador. Na dúvida, confira no Mercado Pago qual das duas é a referência da coluna "estornar".
3. A notificação desse estorno faz o alerta `cobranca_duplicada` aparecer **de novo** no log para a mesma cobrança. É esperado: o pedido e os ingressos não mudam e a trilha não se repete.
4. No painel, **Marcar como tratada** com o motivo. Não estorna nem muda pedido, ingressos ou taxa.

Se a mesma situação se repetir, abra chamado técnico: o caminho conhecido (resposta da criação perdida e nova tentativa) foi fechado na etapa 07.

## Os webhooks estão chegando?

Endereço configurado no Mercado Pago (Suas integrações > aplicação da PartyX > **Webhooks > Configurar notificações**, modo produtivo): `https://<domínio>/api/webhooks/payments`, evento **Order (Mercado Pago)**. Hoje `https://partyx-producao.web.app/api/webhooks/payments` (trocar quando houver domínio, D-08).

1. **No painel do Mercado Pago:** na mesma tela, **Simular notificação**. Com a assinatura certa a plataforma responde **200** (o id fictício `123456` é ignorado). Resposta **401**: a assinatura secreta mudou; regrave com `bash scripts/setup-mp-credentials-producao.sh --so-webhook` e publique nova revisão.
2. **Por pedido, no painel da plataforma:** Pedidos > pedido > **Histórico**. Cada notificação recebida aparece como `gateway: <tipo>` com "processado" ou "pendente".
3. **Na semana:** `npm run ops:weekly` mostra notificações pendentes, desistidas e com assinatura inválida.
4. **No log (Cloud Logging):**
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="partyx" AND httpRequest.requestUrl:"/api/webhooks/payments"' \
     --project=partyx-producao --limit=20 --format='table(timestamp,httpRequest.status)'
   ```
   200 é o esperado. 401 com a mensagem `notificação de pagamento recusada`: assinatura (item 1). 5xx com `falha ao processar notificação de pagamento` ou `falha ao reconsultar pagamento`: ver "Webhook não processado".
5. **Nada chega:** conferir o endereço e o evento no painel, se o modo produtivo está salvo (não o de teste) e se o serviço está no ar (`/api/health`). Mesmo sem webhook, cada pedido tem verificações no Cloud Tasks (1, 2, 4 e 8 min e no fim da reserva) e a rotina diária: o pedido se acerta, só mais devagar.

## Webhook não processado (`webhook_falhou`)
1. `npm run ops:weekly`: quantos pendentes e desistidos.
2. Cada pedido tem verificações sob demanda no Cloud Tasks (1, 2, 4 e 8 min e no fim da reserva; tardias de 15 min a 24 h) e há a rotina diária às 04:00 (D-78). Para rodar a rotina agora: `gcloud scheduler jobs run partyx-varredura-diaria --location=<região>`. Pedido sem estado conclusivo depois da última verificação aparece como revisão manual (alerta `conciliacao_revisao_manual`).
3. Pendentes que não saem: Mercado Pago fora do ar (status dele) ou assinatura secreta trocada. Confira o log (`jsonPayload.errorCode`).
4. **Desistidos:** conferir cada pedido no painel do Mercado Pago; o pedido se acerta na próxima reconsulta se o estado mudar. Se pago no Mercado Pago e pendente aqui: abra chamado técnico (não edite o banco).

## Pagamento divergente (`pagamento_divergente`)
Nada foi aprovado. Veja o motivo no log (`mismatches`: valor, conta, moeda, pedido, forma). Conta diferente da PartyX (`collector_id`) é **grave**: pare e escale. Valor diferente: pode ser erro de integração ou cobrança criada fora da plataforma. A PartyX decide no Mercado Pago; a plataforma não aprova.

## Estorno ou contestação fora de fluxo (`estorno_fora_de_fluxo`)
Pedido nunca aprovado aqui, ou combinação sem previsão (ex.: estorno chegou antes da aprovação). Conferir no Mercado Pago, registrar e revisar à mão.

## Contestação (chargeback)
Chega como `order.charged_back`: pedido `contestado`, ingressos cancelados, portaria vermelha, taxa continua contando. A defesa da contestação é feita pela PartyX no Mercado Pago. Contestação ganha pela PartyX (D-40) não reativa ingressos sozinha: pendente de decisão.

## Credenciais ou assinatura secreta
Trocar no Secret Manager pelos scripts (`scripts/setup-mp-credentials-producao.sh`, ou `--so-webhook` só para a assinatura), publicar nova revisão do serviço, **Simular notificação** no painel e conferir `ops:weekly`. Nunca registrar o valor em chamado, log ou chat.

## Mercado Pago fora do ar
Compra falha com mensagem clara; reservas vencem normalmente. Pagamentos feitos durante a queda se acertam pela conciliação quando ele voltar (aprovação tardia emite se houver estoque; sem estoque vira "pago sem estoque").
