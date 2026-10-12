# Teste de carga (PDF 11.3): resultado com heap do Node limitado a 320 MB

Gerado em 2026-10-12T20:41:21.175Z por `infra/carga/run-carga.sh` (k6 1.0.0 em contêiner). **Ambiente: LOCAL** (um processo Node, PostgreSQL de teste em contêiner na mesma máquina, `DB_POOL_MAX=5` como em homologação e produção), **gateway fictício**. **Não** foi executado em homologação nem em produção: os tempos não incluem rede, Cloud Run, Neon nem o gateway real. Servidor: o JS empacotado (`dist-server/index.js`), o mesmo do contêiner. Com `--max-old-space-size=320`, como no Cloud Run (512 MiB, `docs/operacao/memoria.md`).

## Configuração

- 200 usuários virtuais simultâneos na página do evento durante 3m (HTML + API do evento, pausa de 1 a 3 s entre visitas).
- 50 compras por minuto em taxa de chegada constante durante 3m: login, pedido com reserva de 2 unidades, Pix, confirmação pelo caminho do webhook (gateway fictício) e Meus ingressos.
- Estoque de propósito menor que a procura: 240 unidades para cerca de 300 pedidas, para provar que não há venda acima do estoque.

## Resultado

| Medida | Valor |
|---|---|
| Requisições HTTP | 36849 (201,6/s) |
| Requisições com falha (fora as recusas 409 esperadas) | 0,00 % |
| Erros inesperados (status ou conteúdo errado em qualquer etapa) | 0 |
| Compras iniciadas | 151 |
| Compras concluídas (2 ingressos na conta) | 120 |
| Recusadas por estoque esgotado (409, esperado) | 31 |
| p95 da compra completa | 63,0 ms |
| CPU do servidor (pico em janelas de 2 s) | 44 % de um núcleo |
| Memória do servidor (pico, RSS) | 269 MB |
| Heap do V8 (pico reservado / pico em uso) | 173 MB / 92 MB |
| Memória fora do heap (pico de RSS menos heap reservado) | 94 MB |
| Limites do k6 (thresholds) | todos aprovados (código de saída 0) |

### Tempos por etapa

| Etapa | Requisições | Mediana | p95 | p99 | Máximo |
|---|---|---|---|---|---|
| Página do evento (HTML) | 18018 | 2,5 ms | 3,7 ms | 105,3 ms | 403,2 ms |
| Página do evento (API do evento) | 18018 | 1,8 ms | 2,6 ms | 33,4 ms | 102,6 ms |
| Compra 1: login | 302 | 15,7 ms | 27,5 ms | 29,1 ms | 249,8 ms |
| Compra 2: pedido com reserva | 151 | 6,8 ms | 9,1 ms | 11,2 ms | 129,9 ms |
| Compra 3: Pix | 120 | 4,8 ms | 6,6 ms | 7,2 ms | 38,2 ms |
| Compra 4: confirmação do gateway (webhook fictício) | 120 | 12,8 ms | 19,3 ms | 26,7 ms | 28,0 ms |
| Compra 5: Meus ingressos | 120 | 2,6 ms | 3,3 ms | 4,5 ms | 4,6 ms |

### Memória ao longo da carga

Amostras do próprio processo (`process.memoryUsage()`), uma a cada 30 s. RSS que sobe sem parar com o heap estável indica memória nativa retida; RSS que estabiliza indica que não há vazamento.

| Segundos | RSS | Heap reservado | Heap em uso | Externa (buffers) |
|---|---|---|---|---|
| 30 | 262 MB | 168 MB | 72 MB | 7 MB |
| 60 | 263 MB | 170 MB | 48 MB | 6 MB |
| 90 | 262 MB | 173 MB | 71 MB | 7 MB |
| 120 | 263 MB | 172 MB | 84 MB | 7 MB |
| 150 | 264 MB | 172 MB | 92 MB | 7 MB |
| 180 | 265 MB | 173 MB | 81 MB | 7 MB |
| 184 | 265 MB | 173 MB | 69 MB | 7 MB |

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

Os arquivos `k6-resumo-heap320.json` (métricas exportadas pelo k6) e `k6-saida-heap320.txt` (saída do k6) estão nesta pasta.
