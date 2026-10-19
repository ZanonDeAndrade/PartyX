# Carga da auditoria, escala 3 (2026-10-19 05:38 UTC)

Servidor local empacotado (dist-server), heap de 320 MB, `DB_POOL_MAX=5`, gateway fictício; PostgreSQL de teste em Docker. k6 1.0.0. Fase A k6 exit=0; fase B k6 exit=0 (exit 99 = algum limiar estourado, veja as tabelas).

Semente: capacidade 1500 ingressos; 2200 compradores. pedidos pagos: 1005; ingressos válidos: 1494; pendentes: 0

## Resultado das compras (fase A)

| Métrica | Valor |
|---|---|
| Compras iniciadas | 1800 |
| Compras concluídas (pagas, com ingresso) | 1005 |
| Recusadas por estoque (esperado ao esgotar) | 795 |
| Erros inesperados | 0 |
| Requisições HTTP com falha (fase A) | 0.74% |
| Compra completa, p95 | 3962 ms |
| Tempo até o primeiro byte da página do evento, p50 / p95 / p99 | 5 ms / 8 ms / 12 ms |
| Usuários virtuais máximos (fase A) | 990 |

## Webhooks e portaria (fase B)

| Métrica | Valor |
|---|---|
| Webhooks válidos (200) | 1351 |
| Webhooks com assinatura inválida (401, esperado) | 150 |
| Webhooks com erro | 0 |
| Leituras na portaria | 1504 (válidas 1370, já utilizado 134, erro 0) |
| Requisições HTTP com falha (fase B, inclui os 401 esperados) | 3.32% |

## Tempo por rota (ms)

| Fase | Rota | Requisições | p50 | p95 | p99 | máx |
|---|---|---|---|---|---|---|
| A | compra_1_login | 3600 | 13 | 43 | 60 | 271 |
| A | compra_2_pedido_reserva | 1800 | 10 | 16 | 22 | 59 |
| A | compra_3_pix | 1005 | 6 | 9 | 13 | 26 |
| A | compra_4_confirmacao | 1005 | 17 | 26 | 43 | 293 |
| A | compra_5_pedido | 1005 | 6 | 10 | 15 | 52 |
| A | compra_6_meus_ingressos | 1005 | 5 | 7 | 9 | 16 |
| A | evento_api | 48972 | 4 | 6 | 9 | 188 |
| A | evento_html | 48972 | 5 | 8 | 12 | 201 |
| B | portaria_contador | 1504 | 3 | 4 | 4 | 14 |
| B | portaria_scan | 1504 | 12 | 14 | 15 | 20 |
| B | webhook | 1351 | 5 | 7 | 8 | 12 |

![fase A](escala-3-fase-a.svg)

![fase B](escala-3-fase-b.svg)

## Recursos do servidor e do banco

| Medida | Valor |
|---|---|
| Conexões abertas no PostgreSQL, máximo (p95) | 5 (5) |
| Conexões ativas, máximo | 2 |
| CPU do processo, máximo (p95) | 72% (51%) |
| Memória RSS, máximo | 248 MB |

![conexões](escala-3-conexoes.svg)

![cpu](escala-3-cpu.svg)

![memória](escala-3-memoria.svg)

## Fila de e-mails (captura local, sem SMTP)

| E-mails | Enviados | Falhou | Tempo na fila p50 | p95 | máx |
|---|---|---|---|---|---|
| 1005 | 1005 | 0 | 0.01 s | 0.01 s | 0.05 s |

## Invariantes depois da carga

| Invariante | Violações | Tempo |
|---|---|---|
| 1. Ingressos emitidos (não cancelados) nunca acima da capacidade do tipo | nenhuma | 7 ms |
| 2. Vendidos registrados no tipo nunca acima da capacidade | nenhuma | 1 ms |
| 3. Vendidos mais reservas ativas dentro do prazo nunca acima da capacidade | nenhuma | 2 ms |
| 4. Todo pedido pago tem exatamente a quantidade de ingressos comprada | nenhuma | 6 ms |
| 5. Nenhum ingresso de pedido que nunca foi pago | nenhuma | 1 ms |
| 6. Nenhum QR, código ou código curto duplicado | nenhuma | 3 ms |
| 7. Nenhuma entrada válida duplicada por ingresso (uma primeira entrada só) | nenhuma | 2 ms |
| 8. Ingresso utilizado tem exatamente uma entrada válida; ingresso válido não tem entrada válida | nenhuma | 3 ms |
| 9. Vendidos do tipo iguais aos ingressos emitidos (inclusive cancelados, que não devolvem estoque) | nenhuma | 1 ms |
| 10. Lotes: soma das quantidades dos lotes igual à capacidade do tipo, e vendidos do lote dentro do lote | nenhuma | 2 ms |
| 11. Total do pedido igual aos itens mais a taxa de serviço | nenhuma | 1 ms |
| 12. Notificação do gateway processada só uma vez por id de evento | nenhuma | 2 ms |
| 13. Reserva ativa só em pedido pendente | nenhuma | 1 ms |
| 14. Ingresso transferido sempre com titular existente e ativo (ou anonimizado) | nenhuma | 2 ms |

Todas as invariantes conferem.
