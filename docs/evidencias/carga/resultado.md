# Teste de carga (PDF 11.3): resultado

Gerado em 2026-10-12T16:28:56.980Z por `infra/carga/run-carga.sh` (k6 1.0.0 em contêiner). **Ambiente: LOCAL** (um processo Node, PostgreSQL de teste em contêiner na mesma máquina, `DB_POOL_MAX=5` como em homologação e produção), **gateway fictício**. **Não** foi executado em homologação nem em produção: os tempos não incluem rede, Cloud Run, Neon nem o gateway real.

## Configuração

- 200 usuários virtuais simultâneos na página do evento durante 3m (HTML + API do evento, pausa de 1 a 3 s entre visitas).
- 50 compras por minuto em taxa de chegada constante durante 3m: login, pedido com reserva de 2 unidades, Pix, confirmação pelo caminho do webhook (gateway fictício) e Meus ingressos.
- Estoque de propósito menor que a procura: 240 unidades para cerca de 300 pedidas, para provar que não há venda acima do estoque.

## Resultado

| Medida | Valor |
|---|---|
| Requisições HTTP | 36771 (201,0/s) |
| Requisições com falha (fora as recusas 409 esperadas) | 0,00 % |
| Erros inesperados (status ou conteúdo errado em qualquer etapa) | 0 |
| Compras iniciadas | 151 |
| Compras concluídas (2 ingressos na conta) | 120 |
| Recusadas por estoque esgotado (409, esperado) | 31 |
| p95 da compra completa | 65,0 ms |
| CPU do servidor (pico em janelas de 2 s) | 50 % de um núcleo |
| Memória do servidor (pico, RSS) | 1346 MB |
| Limites do k6 (thresholds) | todos aprovados (código de saída 0) |

### Tempos por etapa

| Etapa | Requisições | Mediana | p95 | p99 | Máximo |
|---|---|---|---|---|---|
| Página do evento (HTML) | 17979 | 2,9 ms | 4,4 ms | 118,8 ms | 391,8 ms |
| Página do evento (API do evento) | 17979 | 2,0 ms | 3,1 ms | 44,2 ms | 130,5 ms |
| Compra 1: login | 302 | 16,0 ms | 28,3 ms | 32,3 ms | 261,2 ms |
| Compra 2: pedido com reserva | 151 | 7,2 ms | 10,4 ms | 12,2 ms | 137,0 ms |
| Compra 3: Pix | 120 | 5,0 ms | 7,2 ms | 14,2 ms | 19,4 ms |
| Compra 4: confirmação do gateway (webhook fictício) | 120 | 13,8 ms | 18,7 ms | 25,3 ms | 25,7 ms |
| Compra 5: Meus ingressos | 120 | 2,4 ms | 3,2 ms | 4,0 ms | 4,9 ms |

## Sobrevenda (conferida no banco depois da carga)

| Conferência | Valor |
|---|---|
| Capacidade do tipo | 240 |
| Vendidos (quantity_sold) | 240 |
| Ingressos emitidos | 240 |
| Reservas ativas restantes | 0 |
| Pedidos por situação | pago: 120 |
| Ingressos = 2 × pedidos pagos | sim |
| Códigos de ingresso repetidos | 0 |
| Itens com mais ingressos que a quantidade | 0 |
| **Houve sobrevenda?** | **Não** |

Os arquivos `k6-resumo.json` (métricas exportadas pelo k6) e `k6-saida.txt` (saída do k6) estão nesta pasta.
