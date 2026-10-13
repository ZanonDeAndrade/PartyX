# Carga reduzida em homologação (rodada tmvbad)

Janela: 2026-10-13T22:47:13Z a 2026-10-13T22:49:48Z. Parâmetros: 2m, 50 visitantes simultâneos (pelo Hosting), 20 compras/min (pelo run.app),
estoque de 60 unidades, 2 unidades por compra, Mercado Pago de TESTE (confirmação pela conciliação real do Cloud Tasks).
Status do k6: 0 (0 = todos os limites atendidos).

## k6

| Etapa | Requisições | Mediana | p95 | Máximo |
|---|---|---|---|---|
| evento_html | 2504 | 33 ms | 138 ms | 990 ms |
| evento_api | 2504 | 319 ms | 506 ms | 1539 ms |
| compra_1_login | 78 | 130 ms | 208 ms | 402 ms |
| compra_2_pedido_reserva | 39 | 106 ms | 173 ms | 212 ms |
| compra_3_pix | 30 | 1570 ms | 1737 ms | 2242 ms |
| compra_4_confirmacao | 360 | 108 ms | 159 ms | 255 ms |
| compra_5_meus_ingressos | 30 | 51 ms | 113 ms | 350 ms |

Compras: iniciadas 39, concluídas 30, recusadas por estoque 9, erros inesperados 0.
Compra completa (login até Meus ingressos, inclui a espera pela conciliação): mediana 63258 ms, p95 63758 ms, máximo 64920 ms.
Falhas HTTP: 0.00%.

## Cloud Run

| Métrica (Cloud Monitoring, 2026-10-13T22:47:13Z a 2026-10-13T22:49:48Z) | Valor |
|---|---|
| Latência do Cloud Run, pior minuto: p50 / p95 / p99 | 1356 / 1676 / 2223 ms |
| Memória, pior minuto (p99 das instâncias) | 35% de 512 MiB (cerca de 179 MiB) |
| CPU, pior minuto (p99 das instâncias) | 21% |
| Instâncias, máximo | 1 |
| Requisições por classe de resposta | 2xx: 2647, 3xx: 0, 4xx: 5 |

## Neon (amostras a cada 5 s, desta máquina)

| Métrica | Valor |
|---|---|
| Amostras | 31 |
| Conexões no banco, máximo | 4 |
| Conexões ativas, máximo | 1 |
| Ida e volta de select 1, média / máximo | 64 / 157 ms |

## Estoque no banco

Total 60, vendidos 60, reservados 0, ingressos emitidos 60. Pedidos: {"pago":30}. Sem venda acima do estoque: sim.

## Como ler

- Visitantes passaram pelo Firebase Hosting; compras foram direto ao `run.app`, com um IP por usuário virtual. A "compra completa" de cerca de 63 s é quase toda a espera pela primeira verificação do Cloud Tasks, 1 min depois da cobrança: no teste não há webhook do Mercado Pago (as notificações das compras de teste vêm assinadas por outra aplicação). Com o webhook real, a confirmação sai em segundos.
- A latência do Cloud Monitoring é o pior minuto da pior série (as séries são separadas por classe de resposta e rota de entrada); o número alto reflete a criação do Pix, que chama o Mercado Pago (1,6 s no k6). Não é a latência típica das páginas, que está na tabela do k6.
- O Cloud Run contou menos requisições que o k6 porque a janela das métricas é alinhada por minuto e parte das páginas é respondida pelo cache do Hosting. Não foi apurado quanto de cada.
- Neon: só conexões e tempo de ida e volta; o uso de CPU e a escala da computação do Neon não foram medidos (a API não expõe por aqui).
- Carga reduzida (50 visitantes e 20 compras por minuto, 2 min). Não substitui o teste do PDF 11.3 (200 visitantes e 50 compras por minuto), feito só no ambiente local.
