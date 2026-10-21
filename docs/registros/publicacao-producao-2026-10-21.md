# Publicações em produção de 21/10/2026: conta nova do Mercado Pago e taxa só sobre pedidos pagos por Pix (D-93)

Duas publicações no mesmo dia, cada uma com OK do responsável (Arthur) para a virada. Horários em UTC (Brasília = UTC menos 3).
Nenhum pedido nem reserva em produção durante as duas, e nada à venda: o `teste01-2` abre em 22/10 às 01:29 de Brasília e o
`teste02` está encerrado.

## 1. Conta nova do Mercado Pago (revisão `partyx-00058-qaq`)

O Bernardo passou a receber numa conta nova do Mercado Pago (informado pelo responsável). O responsável gravou as credenciais dela no
próprio terminal com `bash infra/producao/trocar-credenciais-mp.sh --nova-conta` (digitação oculta; nenhum valor passou por aqui):
`mp-access-token` versão 2, `mp-public-key` versão 2 e `mp-webhook-secret` versão 5, às 19:06. As versões antigas (1, 1 e 4)
continuam ativas. Webhook da aplicação da conta nova, em Modo produtivo: `https://partyx.com.br/api/webhooks/payments`, evento Order
(configurado pelo responsável).

| Campo | Valor |
|---|---|
| Código | a mesma imagem da `release-2026-10-20` (`partyx-api:release-2026-10-20-f312704`); `env.prod.yaml` e `deploy.sh` do commit `4bb8e41` |
| Mudanças | `MP_COLLECTOR_ID` 433226424 (BBITTENCOURT085); `deploy.sh candidata` com as versões dos segredos do Mercado Pago fixas (`4d9b21b`); `conferir` lendo as formas de pagamento ativas na conta (`d8353c5`) |
| Migração | nenhuma; backup do dia conferido (`partyx-20261021T060016Z.dump`, 141.706 bytes) |
| `conferir` | token da conta 433226424; formas ativas: Pix, crédito (amex, elo, master, mp_card, visa), débito (debelo) |
| Candidata | `partyx-00058-qaq` criada às 19:10, segredos `mp-access-token:2`, `mp-public-key:2`, `mp-webhook-secret:5`; teste rápido 15 de 15; "gateway de pagamento: conta conferida" às 19:10:20 |
| Virada | 19:24 (16:24 BRT), teste rápido 15 de 15; anterior `partyx-00056-lac` |
| Logs de 19:24 a 19:55 | 137 requisições, nenhuma 5xx, nenhum erro; webhook só as chamadas `curl` dos testes (401) |
| Notificação da conta nova | Em vez da "Simular notificação", chegou às 20:09:54 uma notificação real da conta nova (agente "MercadoPago WebHook v1.0 order", `order.action_required`), do Pix de teste do pedido PX-10009 (abaixo): assinatura aceita (versão 5), resposta 200, evento gravado e processado, ligado ao pedido |

**Por que a `partyx-00056-lac` deixou de ser retorno:** ela lê os segredos como `latest` (as credenciais novas) com o
`MP_COLLECTOR_ID` antigo; nenhum pagamento seria aprovado nela (conta diferente). As revisões a partir da `partyx-00058-qaq` têm as
versões fixas.

## 2. Taxa da contratada só sobre pedidos pagos por Pix (D-93, revisão `partyx-00060-rox`)

Release `release-2026-10-21` (commit `9306d2c`, a `main` com a troca de conta e a D-93 juntas, sem conflito).

| Campo | Valor |
|---|---|
| Bateria na `main` | lint, typecheck e build; `test:db` 1.275 + 4 do cluster, nenhum pulado; `check:migrations` com 21 migrações aplicadas, revertidas e reaplicadas; 16 suítes e2e (roteiro fictício 20 com 1 pulado, o do sandbox; responsivo 593; turnstile 6; textos 85; cronômetro 8; cor 8; transferência 6; documentos 3; busca 4; painel no celular 64; transições 19; abertura 51; desconto 4; formas de pagamento 6; acesso 9; taxa por Pix 1) |
| Imagem | `partyx-api:release-2026-10-21-9306d2c` (Cloud Build `cc0e2116`, 2 min 54 s), digest `sha256:6917bfc1…` |
| Backup sob demanda | `partyx-backup-5225d` (19:46:41 a 19:46:49), cópia `partyx-20261021T194644Z.dump` (142.740 bytes), `check-backup.sh` OK |
| Banco antes | 20 migrações, sem `contract_fee_rules`, nenhum pedido nem reserva ativa |
| Migração | `0020_regra_taxa_contratada`, execução `partyx-migrate-btvg2` (19:47:27 a 19:47:37) |
| Banco depois | 21 migrações; duas regras (original desde 1970, qualquer forma; D-93 desde 2026-10-21 03:00 UTC, só Pix, R$ 1,00); 4 gatilhos ativos; `partyx_app` só lê |
| Candidata | `partyx-00060-rox` criada às 19:48, versões fixas 2, 2 e 5, `MP_COLLECTOR_ID` 433226424; teste rápido 15 de 15; bateria HTTPS 58 de 58; "conta conferida" às 19:48:24 |
| Taxa de outubro | Pelo código do relatório (`feeReport` da tag) contra o banco de produção numa conexão só leitura: "De 01/10/2026 a 20/10/2026", qualquer forma, e "De 21/10/2026 a 31/10/2026", só Pix; zero ingressos, conciliação confere. Pela candidata: as rotas do relatório e do CSV recusam sem login (401) e o painel publicado tem a tela nova. A tela logada não foi vista (sem conta de administrador em produção) |
| Virada | 20:04 (17:04 BRT), teste rápido 15 de 15; anterior `partyx-00058-qaq` |
| Pelo domínio | bateria 58 de 58; Chromium e Firefox a 390 px 18 de 18 |
| Logs de 20:04 a 20:35 | 372 requisições, todas na `partyx-00060-rox`: 332 de 200, 5 de 201, 23 de 401, 4 de 403, 3 de 302, 2 de 404, 1 de 422, 1 de 301, 1 de 206; nenhuma 5xx, nenhum erro; webhook: 3 notificações do Mercado Pago com 200 (abaixo) e 2 chamadas `curl` dos testes com 401 |

## Uso real depois das viradas

Às 20:09, com login de administrador no painel: taxa de serviço alterada de 7,5% para **5%** (mínimo R$ 0,00; trilha
`taxa_servico.alterar`); `teste02` reaberto (`evento.reabrir`) e com a chave de privado desligada (`evento.privado`); às 20:09:48 o
pedido **PX-10009** no `teste02`, por Pix, 1 Pista, R$ 1,17 com a taxa. Depois:

| Hora | Fato |
|---|---|
| 20:09:54 | Notificação `order.action_required` do PX-10009: 200, processada |
| 20:12:25 | Notificação `order.processed`: **PX-10009 pago por Pix** às 20:12:26, 1 ingresso emitido, e-mail "compra confirmada" enviado |
| 20:13:53 | Notificação `order.processed`: **PX-10010 pago por cartão** às 20:13:52 (R$ 1,17), 1 ingresso emitido, e-mail enviado. O Brick do cartão carregou e a cobrança passou pela conta nova |

É a conferência de ponta a ponta da conta nova (cobrança, webhook, reconsulta, aprovação, ingresso e e-mail) por Pix e por cartão,
com dinheiro de verdade e valor mínimo. A Taxa mensal de outubro, pelo código do relatório contra o banco (conexão só leitura), ficou:
período de 01/10 a 20/10 sem ingressos; período de 21/10 a 31/10 com 1 ingresso por Pix (no repasse, R$ 1,00) e 1 por cartão (só
informação); total a repassar R$ 1,00; conciliação confere. Os Termos de Uso 1.6 não fixam a porcentagem da taxa (a vigente aparece na página do
evento e na compra), então 5% não contradiz texto publicado.

## Voltar atrás

- **Só o código da D-93:** `PROJECT=partyx-producao REVISAO=partyx-00058-qaq ./infra/producao/deploy.sh rollback`. Mesma conta e
  versões fixas; convive com a 0020 (ignora a tabela) e o relatório volta a contar todo ingresso, inclusive os pagos por cartão.
- **Banco:** `drizzle/rollback/0020_regra_taxa_contratada.down.sql` (recusa se houver regra além das duas da 0020).
- **Voltar à conta antiga:** não é um rollback; seria uma candidata nova com as versões antigas fixadas (1, 1 e 4, enquanto ativas) e
  o `MP_COLLECTOR_ID` antigo.

## Pontos para o responsável

- Primeiras vendas do `teste01-2` a partir de 22/10 01:29: o primeiro Pix e o primeiro cartão aprovados confirmam a conta nova de
  ponta a ponta (cobrança, webhook e aprovação).
- Desativar as versões antigas dos segredos (token 1, chave pública 1, assinatura 4) só depois de 24 horas sem erro: o comando vem
  para o seu OK.
- Na aplicação da conta antiga, a URL do webhook pode ser retirada, para ela não mandar notificações assinadas com a assinatura antiga.
- Abrir a Taxa mensal no painel logado e conferir os dois períodos de outubro.
- **`teste02` está publicado, aberto a todos e à venda** (Pista a R$ 1,11, até 25/10 23:00 de Brasília) desde a reabertura das 20:09.
  Se foi só para o Pix de teste, encerre de novo depois. Se o PX-10009 for pago, ele entra na taxa de outubro pela regra da D-93
  (Pix depois de 21/10, R$ 1,00 por ingresso).
- **Taxa de serviço em 5%** desde 21/10 20:09 (era 7,5%, aprovada pelo Bernardo em 19/10): confirmar que a mudança foi decidida pela
  PartyX.
