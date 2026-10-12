# Teste de carga (PDF 11.3): resultado

Gerado em 2026-10-12T20:38:04.525Z por `infra/carga/run-carga.sh` (k6 1.0.0 em contêiner). **Ambiente: LOCAL** (um processo Node, PostgreSQL de teste em contêiner na mesma máquina, `DB_POOL_MAX=5` como em homologação e produção), **gateway fictício**. **Não** foi executado em homologação nem em produção: os tempos não incluem rede, Cloud Run, Neon nem o gateway real. Servidor: o JS empacotado (`dist-server/index.js`), o mesmo do contêiner.

## Configuração

- 200 usuários virtuais simultâneos na página do evento durante 3m (HTML + API do evento, pausa de 1 a 3 s entre visitas).
- 50 compras por minuto em taxa de chegada constante durante 3m: login, pedido com reserva de 2 unidades, Pix, confirmação pelo caminho do webhook (gateway fictício) e Meus ingressos.
- Estoque de propósito menor que a procura: 240 unidades para cerca de 300 pedidas, para provar que não há venda acima do estoque.

## Resultado

| Medida | Valor |
|---|---|
| Requisições HTTP | 36938 (202,1/s) |
| Requisições com falha (fora as recusas 409 esperadas) | 0,00 % |
| Erros inesperados (status ou conteúdo errado em qualquer etapa) | 0 |
| Compras iniciadas | 150 |
| Compras concluídas (2 ingressos na conta) | 120 |
| Recusadas por estoque esgotado (409, esperado) | 30 |
| p95 da compra completa | 62,0 ms |
| CPU do servidor (pico em janelas de 2 s) | 32 % de um núcleo |
| Memória do servidor (pico, RSS) | 375 MB |
| Heap do V8 (pico reservado / pico em uso) | 275 MB / 191 MB |
| Memória fora do heap (pico de RSS menos heap reservado) | 201 MB |
| Limites do k6 (thresholds) | todos aprovados (código de saída 0) |

### Tempos por etapa

| Etapa | Requisições | Mediana | p95 | p99 | Máximo |
|---|---|---|---|---|---|
| Página do evento (HTML) | 18064 | 2,5 ms | 3,8 ms | 125,5 ms | 265,9 ms |
| Página do evento (API do evento) | 18064 | 1,8 ms | 2,7 ms | 57,5 ms | 132,5 ms |
| Compra 1: login | 300 | 14,6 ms | 27,8 ms | 29,5 ms | 296,7 ms |
| Compra 2: pedido com reserva | 150 | 6,6 ms | 9,5 ms | 11,4 ms | 18,5 ms |
| Compra 3: Pix | 120 | 4,8 ms | 6,5 ms | 8,2 ms | 9,0 ms |
| Compra 4: confirmação do gateway (webhook fictício) | 120 | 11,7 ms | 17,5 ms | 26,8 ms | 28,9 ms |
| Compra 5: Meus ingressos | 120 | 2,2 ms | 3,1 ms | 5,1 ms | 7,2 ms |

### Memória ao longo da carga

Amostras do próprio processo (`process.memoryUsage()`), uma a cada 30 s. RSS que sobe sem parar com o heap estável indica memória nativa retida; RSS que estabiliza indica que não há vazamento.

| Segundos | RSS | Heap reservado | Heap em uso | Externa (buffers) |
|---|---|---|---|---|
| 30 | 325 MB | 216 MB | 81 MB | 7 MB |
| 60 | 355 MB | 260 MB | 163 MB | 7 MB |
| 90 | 372 MB | 256 MB | 146 MB | 6 MB |
| 120 | 373 MB | 232 MB | 137 MB | 7 MB |
| 150 | 372 MB | 190 MB | 80 MB | 7 MB |
| 180 | 373 MB | 189 MB | 51 MB | 6 MB |
| 184 | 373 MB | 189 MB | 84 MB | 7 MB |

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
