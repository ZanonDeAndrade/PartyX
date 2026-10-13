# Dados fictícios criados na homologação (etapa 10)

Registro pedido pelo responsável em 13/10/2026. **Antes da comunicação formal ao cliente (etapa 11), limpar tudo e deixar só um evento de demonstração bem montado.** Cada rodada usa um sufixo próprio, o que permite achar e apagar os dados dela. Contagens lidas do banco de homologação com o papel de leitura (sem CPF nem senha neste registro).

Padrões de nome por rodada `<r>` (`<R>` em maiúsculas):

| Origem | Usuários | Promoters | Eventos | Outros |
|---|---|---|---|---|
| Roteiro 11.2 (`infra/testes/roteiro-hml.sh`) | `*.roteiro.<r>@exemplo.com`, `admin.<r>@`, `validador.<r>@`, `validador2.<r>@exemplo.com` | `DUDA<R>`, `LEO<R>` | `outro-evento-e2e-<r>`, `festival-roteiro-e2e-<r>` (criado pela interface) | pedidos, reservas, ingressos, entradas, trilha e `email_log` desses usuários e eventos; orders no Mercado Pago de **teste** |
| Carga (`infra/carga/run-carga-hml.sh`) | `carga<i>.<r>@exemplo.com` | | `carga-hml-<r>` (fora da vitrine) | idem |
| Disparo de alertas (`infra/testes/alertas-hml.sh`) | `alerta.<r>@exemplo.com` | | `alertas-hml-<r>` (fora da vitrine) | idem, mais uma order em dobro e um estorno parcial no Mercado Pago de teste |

A partir da rodada seguinte à `tmv8vl`, os endereços usam `@partyx.test` no lugar de `@exemplo.com` (decisão de 13/10/2026); as rodadas `tmuvkr`, `tmuwx6` e `tmv8vl` ficaram com `@exemplo.com`.

As mensagens também ficam na caixa de captura Ethereal (`smtp-url`), que não entrega a ninguém.

## Rodadas

| Data (UTC) | Rodada | Origem | Usuários | Promoters | Eventos | Pedidos | Ingressos | E-mails | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| 13/10 17:07 | `tmuvkr` | roteiro 11.2 | 4 | 2 | `outro-evento-e2e-tmuvkr` | 0 | 0 | 1 | parou no item 2 (clique antes do token do Turnstile) |
| 13/10 17:36 | `tmuwx6` | roteiro 11.2 | 9 | 2 | `outro-evento-e2e-tmuwx6`, `festival-roteiro-e2e-tmuwx6` | 6 | 6 | 10 | itens 1 a 11 aprovados; parou no item 12 (busca do e-mail ancorada; o e-mail foi enviado) |
| 13/10 21:55 | `tmv8vl` | roteiro 11.2 | 4 | 2 | `outro-evento-e2e-tmv8vl`, `festival-roteiro-e2e-tmv8vl` | 1 | 1 | 3 | itens 1 a 3 aprovados; parou no item 4 (o Mercado Pago de teste levou 3 min 54 s para aprovar o Pix; prazo do teste era 3 min; a conciliação emitiu o ingresso sozinha) |
| 13/10 22:13 | `tmv9wk` | roteiro 11.2 | 9 | 2 | `outro-evento-e2e-tmv9wk`, `festival-roteiro-e2e-tmv9wk` | 8 | 7 | 11 | **21 de 21 aprovados** (endereços `@partyx.test`) |
| 13/10 22:25 | `tmva9i` | carga | 60 | 0 | `carga-hml-tmva9i` (fora da vitrine) | 0 | 0 | 0 | só a semente; o k6 recusou a URL (erro na trava do script) e nenhuma carga rodou |
| 13/10 22:47 | `tmvbad` | carga | 60 | 0 | `carga-hml-tmvbad` (fora da vitrine) | 30 pagos (mais 9 tentativas recusadas por estoque, sem pedido) | 60 | 30 | carga concluída: 0 erros, sem venda acima do estoque |

Dados anteriores a esta etapa (01/10 a 06/10, gateway fictício): 12 usuários, 2 eventos, 9 pedidos e 10 ingressos (inventário, `../operacao/inventario-homologacao.md`). Também entram na limpeza.
