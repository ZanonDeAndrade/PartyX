# Runbook: estoque, reserva e pedidos parados

O estoque nunca passa da capacidade (travas no banco; provado em `docs/estoque-e-concorrencia.md`). Este runbook cobre **sintomas**, não correção de venda.

| Sintoma | Causa provável | Ação |
|---|---|---|
| Cliente diz "esgotado" mas a PartyX acha que há ingressos | Unidades **reservadas** (10 min) ou vendidas; ingresso cancelado **não repõe** estoque (D-14 sem decisão) | Painel: vendidos e reservas por tipo. Explicar a regra; decisão de repor é da PartyX |
| Pedidos pendentes há mais de 24 h, reservas vencidas ainda ativas (`ops:weekly`) | Rotina de expiração/conciliação parada | `gcloud scheduler jobs run partyx-varredura-diaria --location=<região>`; conferir a fila do Cloud Tasks (`deploy.sh status`) e o `audience` (é a URL `run.app`, não o domínio) |
| Pago sem estoque | Pagamento aprovado depois de vencer, estoque já vendido | `gateway.md`, seção "Pago sem estoque" |
| Vendido maior que a capacidade | **Nunca deve ocorrer** (o banco recusa). Se ocorrer: incidente | `incidente.md`; **não** editar à mão; preservar evidência |

**Nunca** edite `quantity_sold`, reservas ou ingressos no banco para "consertar". Qualquer correção passa por migração ou ação auditada da aplicação.
