# Limpeza dos dados de teste em produção (19/10/2026)

Pedido do administrador (Arthur), em 19/10/2026: tirar de produção os eventos de teste "Teste" (`teste`) e "Teste02" (`teste02`), com
tudo o que depende deles, mantendo o evento "PARTY X ESTÁ VOLTANDO!" (`teste01-2`, cadastrado pelo Bernardo) e as contas de comprador.
O procedimento está em `docs/operacao/runbooks/limpeza-dados-de-teste.md`.

## Devolução do dinheiro (para a contabilidade)

As compras foram feitas pela equipe para testar a abertura das vendas (18/10 à noite). O dinheiro foi **devolvido por Pix manual em
19/10/2026, fora do Mercado Pago**, informado pelo administrador; os comprovantes ficam com ele, fora do sistema. **No Mercado Pago as
compras continuam aprovadas** (não houve estorno pelo gateway; conferido no PX-10001 às 17:51 de 19/10).

| Pedido | Evento | Forma | Pago em (Brasília) | Valor | Order no Mercado Pago | Devolução |
|---|---|---|---|---|---|---|
| PX-10001 | Teste | Pix | 18/10/2026 22:28 | R$ 1,00 | `ORD01M58WBC5F48491YW1M8G51Z8Z` | Pix manual em 19/10/2026 (a tentativa de estorno pelo Mercado Pago não aparece lá; ver abaixo) |
| PX-10003 | Teste | Pix | 18/10/2026 22:46 | R$ 1,00 | `ORD01M58XD2X4YYCFT2STPVMT66C9` | Pix manual em 19/10/2026 |
| PX-10004 | Teste | Pix | 18/10/2026 22:48 | R$ 2,00 | `ORD01M58XFAH5Y2HAYKXSCCWA4FYR` | Pix manual em 19/10/2026 |
| PX-10005 | Teste02 | Pix | 18/10/2026 22:57 | R$ 1,00 | `ORD01M58Y13BB78242ZPQD9W6BDM0` | Pix manual em 19/10/2026 |
| PX-10006 | Teste02 | Pix | 18/10/2026 23:28 | R$ 1,00 | `ORD01M58ZPRKYYZVMFD7Q48X0GENV` | Pix manual em 19/10/2026 |
| PX-10008 | Teste02 | Cartão | 18/10/2026 23:32 | R$ 1,00 | `ORD01M59029GDWM6KGEKQJCZ93552` | Pix manual em 19/10/2026 |
| **Total** | | | | **R$ 7,00** | | |

- Sem dinheiro: PX-10002 (Teste, expirou em 18/10 22:47) e PX-10007 (Teste02, criado às 23:28 e expirado às 23:29 de 18/10).
- Taxa de serviço 0 e nenhum desconto de promoter nesses pedidos. A tarifa do Mercado Pago não foi gravada no sistema (a coleta das
  tarifas começou depois); conferir no extrato do Mercado Pago.
- **PX-10001 (confirmado pelo administrador em 19/10/2026):** o Pix manual incluiu esse pedido. Se o estorno pelo Mercado Pago ainda se
  concluir, fica como devolução em duplicidade de R$ 1,00, a favor do administrador (que fez a compra), **sem ação**.
- Um dos pedidos (PX-10003) é de outra conta de comprador da equipe, também de teste (confirmado pelo administrador).

## Estorno pelo Mercado Pago (teste do caminho, PX-10001)

Em 19/10/2026, pouco antes das 17:40 (Brasília), o administrador informou ter devolvido o PX-10001 pelo painel do Mercado Pago, para
testar o caminho (webhook, pedido "Estornado", ingresso válido cancelado). Acompanhado das 17:40 às 17:55, a cada 30 s (banco, só
leitura, e registros HTTP do Cloud Run):

- **Nenhuma chamada chegou ao webhook** (`/api/webhooks/payments`): nenhum aviso gravado, nenhuma requisição, nem recusa 401.
- Reconsulta só leitura da order no Mercado Pago (`GET /v1/orders/ORD01M58WBC5F48491YW1M8G51Z8Z`, a mesma da conciliação) às 17:51:
  `status: processed`, `status_detail: accredited`, **nenhum estorno**, última mudança 18/10 22:28 (a aprovação).
- Conclusão: não é o sistema descartando (nada chegou) nem tópico do aplicativo (do lado do Mercado Pago a order não mudou). **O estorno
  não se concluiu nessa order.** Hipóteses para o administrador conferir no painel do Mercado Pago: devolução recusada ou pendente por
  saldo insuficiente (a devolução de Pix sai do saldo disponível), ou feita em outra compra.
- O pedido foi apagado na limpeza das 17:48 como "Pix manual" (trilha). Se o estorno ainda se concluir no Mercado Pago, o aviso cai como
  "sem pedido": fica gravado em `payment_events`, sem mudar nada. O único ingresso do PX-10001 já estava "Utilizado"; pelo caminho
  normal ele continuaria assim (só ingresso válido é cancelado no estorno).
- O caminho do estorno pelo Mercado Pago **continua sem prova em produção**. Próximo teste: uma compra nova de R$ 1,00 num evento de
  teste, estorno pelo painel com saldo na conta, e acompanhar o aviso `order` (ação de estorno) e a reconsulta.

## O que sai do banco e o que fica

- Saem, só ligados aos dois eventos: eventos, tipos, lotes, pedidos, itens, reservas, ingressos, a transferência, as entradas (inclusive
  uma leitura de um ingresso do Teste feita por engano no evento do Bernardo em 18/10 22:46, resultado "outro evento", autorizada),
  aceites da Política de Cancelamento, avisos do gateway desses pedidos e os e-mails desses pedidos. Banners no Cloud Storage à parte.
- Ficam: a trilha de auditoria inteira (com uma linha nova `evento.limpeza_dados_de_teste` por evento), as contas de comprador, o evento
  do Bernardo (conferido igual antes e depois) e a numeração dos pedidos (o próximo pedido não volta a PX-10001).
- O relatório da taxa mensal de outubro deixa de contar os 7 ingressos de teste.

## Execução

- Backup sob demanda: `partyx-backup-vxzzv`, arquivo `partyx-20261019T204121Z.dump` (136.653 bytes, SHA-256 conferido, manifesto com
  19 migrações, 8 pedidos, 7 ingressos, 7 entradas, 3 eventos), 19/10/2026 17:41 (Brasília).
- Ensaio (ROLLBACK): a 1ª tentativa parou numa chave estrangeira (`reservations_order_item_fk`: reservas apontam para os itens) e
  desfez tudo; ordem corrigida pelo catálogo de produção; a 2ª conferiu tudo (2 eventos, 8 pedidos, 7 ingressos, evento do Bernardo
  igual antes e depois) e desfez.
- Execução: `--aceitar-pagos --executar`, **COMMIT às 17:48:23 de 19/10/2026 (Brasília)**, papel `neondb_owner`. Linhas apagadas:

  | Tabela | Linhas | Tabela | Linhas |
  |---|---|---|---|
  | events | 2 | orders | 8 |
  | ticket_types | 3 | order_items | 8 |
  | ticket_lots | 3 | order_item_lots | 8 |
  | tickets | 7 | reservations | 8 |
  | checkins | 7 (6 do Teste e 1 no evento do Bernardo) | cancellation_acceptances | 8 |
  | ticket_transfers | 1 | payment_events | 11 |
  | email_log | 8 | aceites de menor, descontos de promoter | 0 |

  Trilha: 82 para 84 linhas (2 `evento.limpeza_dados_de_teste`, em nome do administrador; nenhuma apagada; as 24 linhas antigas com os
  ids dos eventos de teste ficam). Gatilhos religados (nenhum desligado no catálogo).
- Banners: 4 arquivos por evento (`events/<id>/`, original, 640, 1080 e og), apagados com todas as versões às 17:50; o bucket guarda os
  apagados por 7 dias (exclusão reversível). Os 8 arquivos do evento do Bernardo ficam.
- Conferência (só leitura, `infra/producao/limpeza/conferencia-depois-2026-10-19.mjs`): só o evento do Bernardo; Pedidos, Ingressos,
  Entradas, reservas e transferências vazios; Visão geral de hoje e de outubro zerada, eventos em andamento só o do Bernardo com 0
  vendidos e 0 reservados; taxa mensal de outubro com 0 ingressos; nenhum aviso do gateway pendente e nenhum pedido para a conciliação
  reconsultar; nenhum pago sem estoque; evento do Bernardo igual à foto (evento, tipos, preços, capacidade, datas, lotes); 19 contas
  mantidas (2 administradores, 17 clientes). Invariantes da auditoria: 14 de 14 conferem antes e depois. Registros do Cloud Run sem
  aviso nem erro desde 17:40. Site: `/eventos/teste01-2` e `/api/public/events/teste01-2` 200; `teste` e `teste02` 404; vitrine e lista
  só com `teste01-2`.
- Fila de e-mails: ficaram só os sem pedido, de conta (2 enviados, 16 em "falhou"), não tocados pela limpeza.
