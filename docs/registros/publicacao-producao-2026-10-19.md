# Publicação em produção: taxa de serviço com 0% inicial (19/10/2026)

Release `release-2026-10-19` (commit `4abc227`), publicada com OK do responsável (Arthur): "faça deploy em produção". Horários em UTC
(Brasília = UTC menos 3).

| Campo | Valor |
|---|---|
| Versão | tag local anotada `release-2026-10-19`, commit `4abc227` (sem push) |
| Migração | `0017_taxa_de_servico` (só expande; `service_fee_settings` nasce com 0% e mínimo 0; reversão em `drizzle/rollback/0017_taxa_de_servico.down.sql`, que recusa se houver pedido com taxa) |
| Imagem | `partyx-api:release-2026-10-19-4abc227` (Cloud Build `3fc4950b`, 1 min 49 s) |
| Backup sob demanda | execução `partyx-backup-lq58t`, cópia `partyx-20261019T125251Z.dump` (126.783 bytes), `check-backup.sh` OK, antes da migração |
| Migração aplicada | execução `partyx-migrate-jtx8r`; conferência só de leitura: 18 migrações, taxa 0% sem autor, 8 colunas novas, 3 regras novas, 8 pedidos antigos com taxa zero |
| Revisão | `partyx-00046-gul` |
| No ar desde | 19/10 12:59 UTC (09:59 BRT) |
| Revisão anterior | `partyx-00044-dil` |
| `env.prod.yaml` | `TERMS_VERSION 1.3` e `CANCELLATION_VERSION 1.1`, vigência 2026-10-19; Privacidade continua 1.2; venda aberta, cadastro aberto, e-mail ligado, Turnstile desligado, sem instância mínima |

Conteúdo da release: `docs/registros/taxa-de-servico.md` (mecanismo) e `docs/registros/taxa-de-servico-opcoes-2026-10-19.md` (página para a
PartyX escolher a porcentagem). Para o comprador **nada mudou** na virada: a taxa está em 0% e nenhuma linha de taxa aparece. O que
mudou de visível: o bloco "Formas de pagamento" (Pix, cartão de crédito ou débito) na página do evento, os Termos 1.3 e a Política de
Cancelamento 1.1 (aceite da 1.3 no próximo login ou checkout; a Política é aceita em cada compra).

## Linha do tempo

| Hora | Passo | Resultado |
|---|---|---|
| 12:50 | tag + `deploy.sh conferir` (com `GO_LIVE_CONFIRMED`, venda já aberta) | banco de produção confirmado; arquivo conferido |
| 12:52 a 12:54 | `deploy.sh build` | imagem pronta |
| 12:52 | backup sob demanda | `partyx-backup-lq58t`, cópia conferida |
| ~12:55 | `deploy.sh migrate` | `partyx-migrate-jtx8r` ok; leitura do banco: 18 migrações, taxa 0% |
| ~12:57 | `deploy.sh candidata` | `partyx-00046-gul` sem tráfego; teste rápido 15 de 15 (Termos 1.3 e Política 1.1 com vigência 19/10) |
| 12:57 a 12:59 | conferências pela candidata (abaixo) | bateria 44 de 44; Chromium e Firefox ok |
| 12:59:11 a 12:59:27 | `deploy.sh virar` | 100% na `partyx-00046-gul`; teste rápido 15 de 15 |
| 13:00 a 13:03 | conferências pelo domínio (abaixo) | bateria 45 de 45; Chromium e Firefox ok; logs sem 5xx |

## Conferências

| Verificação | Candidata | Domínio |
|---|---|---|
| Teste rápido do `deploy.sh` | 15 de 15 | 15 de 15 |
| Bateria por HTTPS (a `bateria-e` da 18b com Termos 1.3, Política 1.1, mais 7 itens da taxa: textos falam da taxa, formas de pagamento `pix`, `card`, `maxInstallments 1`, tipos do `teste01-2` com `serviceFeeCents 0`, `/admin/configuracoes` sem login redireciona, API da taxa sem login 401, `NONCE=1`) | 44 de 44 (um item meu com expectativa errada, 200 em vez de 302, corrigido) | 45 de 45 |
| Playwright 390 px, página do evento e vitrine: sem menção a taxa, bloco "Formas de pagamento" com Pix e cartão sem parcelamento, valores R$ 30,00 e R$ 25,00, sem erro de página nem 5xx | Chromium e Firefox ok | Chromium e Firefox ok |
| WebKit de teste | fecha a página do evento (ver abaixo) | idem |
| Logs do Cloud Run desde a virada | | 74 requisições: 57 de 200, 7 de 401, 4 de 403, 2 de 404, 2 de 302, 1 de 422, 1 de 301 (tudo das conferências); nenhuma 5xx, nenhum erro |

**WebKit de teste (F-09 da auditoria):** o WebKit do Playwright fecha a página do evento `teste01-2` a 360, 390 e 1280 px na captura
da janela, tanto na candidata quanto na revisão anterior `partyx-00044-dil`, conferido lado a lado antes da virada. Não é regressão
desta release (o CSS novo não tem desfoque nem animação): continua o item 3 da ordem de correção da auditoria, a confirmar em Safari
real (iPhone e Mac).

## Pontos para o responsável

- **A taxa está em 0%.** Quando a PartyX confirmar a porcentagem e o mínimo (página de opções), gravar no painel em Configurações:
  vale só para os pedidos feitos a partir daquele momento; com evento à venda o painel avisa e a trilha registra.
- **`teste01-2`:** Masculino a partir de 20/10 01:29 e Feminino a partir de 20/10 23:21 (Brasília). Se a taxa for gravada antes
  disso, nenhum pedido fica com taxa zero por ter sido feito antes.
- **Textos legais:** os Termos 1.3 dizem que cada ingresso tem uma taxa de serviço; com 0% ela é zero. Se quiser "pode ter", é
  mudança de texto com OK da PartyX.
- **Tarifa real:** a rotina diária (04:00) passa a gravar a tarifa do Mercado Pago dos pedidos pagos; conferir no relatório de vendas
  depois dos primeiros pedidos com taxa.
- Itens anteriores continuam: Vercel Hobby (O-01), alertas de webhook e fila (O-02), hml no ar (O-04), 19 commits sem push (O-05).

## Voltar atrás

- **Só código:** `PROJECT=partyx-producao REVISAO=partyx-00044-dil ./infra/producao/deploy.sh rollback`. Convive com a 0017: a
  revisão anterior grava pedidos com taxa zero e confere o pagamento pelo total. Os Termos 1.3 e a Política 1.1 voltam para 1.2 e
  1.0 (variáveis da revisão anterior).
- **Banco:** `drizzle/rollback/0017_taxa_de_servico.down.sql` só se nenhum pedido tiver taxa gravada (hoje, nenhum). Enquanto a taxa
  for 0%, nenhum pedido ganha taxa.

## Segunda publicação do dia: Termos de Uso 1.4 com a porcentagem (13:14 UTC)

Release `release-2026-10-19b` (commit `00e3adf`), com OK do responsável: "coloque em produção e faça commit". O Bernardo aprovou 7,5%,
mínimo R$ 0,00, em todos os ingressos (informado pelo responsável). Os Termos 1.4 escrevem a porcentagem, a conta sobre o total pago e
o exemplo de R$ 30,00 (taxa R$ 2,44, total R$ 32,44), e dizem que mudar a porcentagem só vale depois de publicada nos Termos.

| Campo | Valor |
|---|---|
| Migração | nenhuma (backup do dia `partyx-20261019T125251Z.dump` conferido) |
| Imagem | `partyx-api:release-2026-10-19b-00e3adf` (Termos da tag com sha256 `fe01864729e2cb57`) |
| Revisão | `partyx-00048-zik`, 100% desde 13:14 UTC (10:14 BRT); anterior `partyx-00046-gul` |
| `env.prod.yaml` | `TERMS_VERSION 1.4`, vigência 2026-10-19; Política 1.1 e Privacidade 1.2 sem mudança |
| Conferências | candidata: teste rápido 15 de 15, bateria 46 de 46; domínio: teste rápido 15 de 15, bateria 46 de 46 (com "7,5%" e "R$ 2,44" nos Termos servidos), Chromium e Firefox ok; logs desde a virada sem 5xx nem erro |
| Testes locais | lint, typecheck, build; `npm test` com banco 1170 de 1172 na rodada cheia, as 2 de tempo (`environment.integration`, `deployTextos`) passaram sozinhas, 11 de 11; e2e textos 85, roteiro 20 (1 pulado, Brick), documentos 3 |

**Falta, com o responsável:** gravar **7,5%** e mínimo **R$ 0,00** no painel, em Configurações. Até lá a taxa continua 0% e os
Termos 1.4 descrevem uma taxa que ainda não é cobrada; fazer antes de 20/10 01:29 (Brasília), quando abre a venda do Masculino.

**Voltar atrás:** `PROJECT=partyx-producao REVISAO=partyx-00046-gul ./infra/producao/deploy.sh rollback` (Termos voltam para 1.3).
Se a porcentagem já estiver gravada no painel, voltar os Termos deixa a taxa cobrada sem o número escrito: nesse caso, gravar 0% antes.

