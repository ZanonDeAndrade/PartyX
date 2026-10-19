# Publicações em produção: abertura das vendas e pagamento com cartão (18/10/2026)

Duas publicações na mesma noite (horário de Brasília; 19/10 em UTC), as duas com OK do responsável (Arthur).

1. **Abertura das vendas** (`release-2026-10-18`, commit `433d829`): `SALES_OPEN=true` e `VISUAL_APPROVED=true` (CA-33 aprovado pelo
   Bernardo por WhatsApp, `aprovacao-visual.md`), cadastro com 50 por hora por IP (`SIGNUPS_PER_IP_PER_HOUR`), e a correção do pool
   do banco (`184da3c`, ouvinte do evento `error`; `neon-dormindo-2026-10-18.md`). OK: "Coloque em produção a abertura dos ingressos".
2. **Pagamento com cartão** (`release-2026-10-18b`, commit `5fbfdab`): CSP do Mercado Pago com nonce para o script do antifraude,
   aviso e troca para Pix quando o navegador bloqueia o Brick, e o cronômetro da reserva numa linha só no celular
   (`cartao-csp-e-bloqueio-2026-10-18.md`). OK: "ok, coloque em produção e faça commit".

| Campo | Abertura das vendas | Pagamento com cartão |
|---|---|---|
| Versão | tag local `release-2026-10-18`, `433d829` | tag local `release-2026-10-18b`, `5fbfdab` |
| Migração | nenhuma | nenhuma |
| Imagem | `partyx-api:release-2026-10-18-433d829` (Cloud Build `cec6003e`) | `partyx-api:release-2026-10-18b-5fbfdab` (Cloud Build `c966b7ef`, 1 min 50 s) |
| Backup sob demanda | `partyx-backup-5g6dc`, conferido | `partyx-backup-dxdsf` (02:11:39 UTC, 124.560 bytes), `check-backup.sh` OK |
| Revisão | `partyx-00042-ten` | `partyx-00044-dil` |
| No ar desde | 19/10 01:25 UTC (18/10 22:25 BRT) | 19/10 02:20 UTC (18/10 23:20 BRT) |
| Revisão anterior | `partyx-00040-dow` | `partyx-00042-ten` |
| Estado | **venda aberta**, cadastro aberto, e-mail ligado, Turnstile desligado, sem instância mínima (checklist 5.6) | igual |

`env.prod.yaml` igual nas duas (o da `release-2026-10-18`). Sem mudança na Vercel, nas rotinas, nas permissões da nuvem e na
verificação de saúde (continua em `/api/health/ready`; o item 2 do `neon-dormindo-2026-10-18.md` aguarda OK).

## Linha do tempo (UTC)

| Hora | Passo | Resultado |
|---|---|---|
| 18/10 ~22:00 | `deploy.sh build`, backup e `deploy.sh candidata` da `release-2026-10-18` (com `GO_LIVE_CONFIRMED`) | `partyx-00042-ten` sem tráfego; teste rápido 15 de 15 com `salesOpen=true` |
| 19/10 01:25 | `deploy.sh virar` | 100% na `partyx-00042-ten`; teste rápido 15 de 15. Os tipos do `teste01-2` continuaram "Em breve" (início das vendas cadastrado pelo Bernardo: 20/10) |
| 01:27 a 01:28 | **Primeira compra** (PX-10001, evento de teste "teste", 1 ingresso de R$ 1,00, Pix) | abaixo |
| 01:45 a 01:58 | Mais compras de teste | PX-10003, PX-10004 (2 ingressos) e PX-10005 pagos; PX-10002 vencido, reserva liberada |
| 02:09 a 02:11 | `deploy.sh build` da `release-2026-10-18b` (depois do relato do responsável: Brick do cartão em área cinza no Firefox; diagnóstico no registro do cartão) | imagem pronta |
| 02:11 | Backup sob demanda | `partyx-backup-dxdsf` conferido |
| 02:12 | `deploy.sh candidata` | `partyx-00044-dil` sem tráfego; teste rápido 15 de 15 |
| 02:13 a 02:18 | Conferência pela candidata | bateria 39 de 39; Playwright nos 3 navegadores (registro do cartão) |
| 02:20 | `deploy.sh virar` | 100% na `partyx-00044-dil`; teste rápido 15 de 15 |
| 02:20 a 02:24 | Conferência pelo domínio | abaixo |

## Primeira compra (PX-10001), conferida nos logs e no banco (só leitura)

| Hora (UTC) | O que aconteceu |
|---|---|
| 01:27:21 | Pedido criado (201), reserva até 01:57:21 |
| 01:27:52 | Pix iniciado (201, 1,95 s) |
| 01:27:55 | Webhook `order.action_required`, assinatura válida |
| 01:28:32.5 | Webhook `order.processed`, assinatura válida (1,94 s, compatível com a reconsulta ao gateway, que não é registrada quando dá certo) |
| 01:28:32.96 | Pedido pago; 1 ingresso emitido 0,44 s depois da notificação; reserva convertida |
| 01:28:34 | E-mail `compra_confirmada` enviado na 1ª tentativa |
| 01:28:33 a 01:29:06 | Meus ingressos, PDF e detalhe do ingresso: 200 |

Do Pix ao ingresso: 40,7 s. Nos outros três pedidos pagos, o mesmo: assinatura válida, ingresso no instante do pagamento, e-mail na
1ª tentativa; o ingresso do PX-10005 foi transferido para outra conta, com os e-mails da transferência.

**30 minutos depois** (01:25 a 01:59): 947 requisições na `partyx-00042-ten`, 914 2xx, 4 3xx, 29 4xx (visitante sem login, teste
rápido, bateria, tentativas de compra antes do login) e **nenhuma 5xx**; avisos só das recusas de assinatura inválida dos testes;
nenhum aviso de conexão do banco; nenhuma queda de instância; nenhum incidente.

## Conferência pelo domínio, depois da 2ª virada

| Verificação | Resultado |
|---|---|
| Bateria por HTTPS em `partyx.com.br` (`NONCE=1`) | 39 de 39 (os 28 de antes, agora com `salesOpen=true`, e os 11 da CSP nova) |
| Playwright, tela "Pague com cartão", 1280 px | Brick carregou no Chromium, WebKit e Firefox (1,8 a 4,7 s); antifraude: `devices/widgets` e impressão do aparelho (`www.mercadolibre.com`, `www.mercadopago.com.br`) todos 200; único bloqueio de CSP: `api.mercadolibre.com/tracks` |
| Playwright, 390 px, arquivo de textos do Brick cortado | cronômetro numa linha só; aviso em 0,2 a 0,8 s com "Pagar com Pix" nos 3 |
| Logs desde a candidata (02:11 a 02:21) | avisos só do teste rápido e das baterias (403, 401, 404, 422 esperados); nenhuma 5xx |

## Pontos para o responsável

- **Ingressos validados na portaria:** o do PX-10001, o do PX-10003 e uma unidade do PX-10004, de 01:45 a 01:50 UTC, por alguém que
  entrou em `/portaria` às 01:44:59 (não pelo Claude). A primeira entrada fica gravada.
- **Evento "teste02" publicado na vitrine pública**, com ingresso de R$ 1,00: encerrar ou despublicar pelo painel antes da entrega.
  O evento "teste" está encerrado desde 01:52:45.
- **`teste01-2`:** nenhum tipo à venda ainda (Masculino a partir de 20/10 01:29 e Feminino a partir de 20/10 23:21, horário de
  Brasília, como cadastrado pelo Bernardo).
- Conferir num Firefox real, com a proteção estrita contra rastreamento, que aparece o aviso no lugar da área cinza.
- Itens 2 e 4 do `neon-dormindo-2026-10-18.md`: comando do item 2 mostrado de novo, aguardando OK.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00044-dil`.** Para desfazer o pagamento com cartão:
  `PROJECT=partyx-producao REVISAO=partyx-00042-ten ./infra/producao/deploy.sh rollback`. Mesmo banco e mesma configuração (venda
  aberta, com a correção do pool); volta a CSP antiga (antifraude bloqueado e área cinza quando o navegador bloqueia o Brick) e o
  cronômetro que quebra no celular.
- Para fechar as vendas: `REVISAO=partyx-00040-dow` (venda fechada, sem a correção do pool). Se a verificação de saúde já estiver em
  `/api/health`, ela volta para `/api/health/ready` **antes** (README-DEPLOY, seção 6). Pedidos já criados continuam podendo ser
  pagos dentro da reserva; webhook, conciliação e emissão não dependem da venda aberta.
