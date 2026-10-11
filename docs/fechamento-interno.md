# Fechamento interno para homologação (Prompt 26)

**Versão candidata:** `0.26-interna`, 05/10/2026. Identificação do código: `201fcc7add32` (SHA-256 curto de todos os arquivos de `server/` e `src/`) e migrações `d67c9bd9c0bd` (4 arquivos em `drizzle/`). Não há repositório Git; este hash é o que permite saber depois qual código foi avaliado.

> **Adendo de 06/10/2026 (leia junto com o veredito abaixo).** Depois do fechamento: (1) a homologação foi **atualizada** e agora roda a versão atual atrás do Firebase Hosting (`partyx-hml.web.app`), então o motivo 1 do veredito mudou (ver `README-DEPLOY.md`, seção 11); (2) o Prompt 25 foi executado **na homologação** (backup diário e restauração testada: `backup.md`), mas **não em produção**; (3) gateway sandbox, insumos do cliente e aparelhos reais continuam pendentes. **O veredito "NÃO PRONTO" para a comunicação formal permanece**, porque o roteiro 11.2 ainda não pode ser rodado com Pix e cartão em sandbox (D-01).

## Veredito de prontidão

**NÃO PRONTO para a comunicação formal de entrega.** Nada foi enviado ao cliente e **os 10 dias corridos de homologação não começaram**. Motivos, em ordem de gravidade:

1. **A homologação publicada está desatualizada.** O serviço `partyx-hml` serve a revisão `partyx-hml-00003-6sg`, de 01/10/2026 (Prompt 04). Nela, `/api/public/site`, `/api/gate/events`, `/api/admin/reports/fee`, `/api/webhooks/payments`, as rotinas internas, as exportações e `/api/privacy/requests` devolvem **404** (conferido em 05/10/2026). Tudo o que foi construído a partir do Prompt 05 só existe local. A seção 12.1 exige "publicar a versão final em homologação e rodar de novo o roteiro 11.2": **isso não foi feito**. Publicar exige rodar migrações no Neon de homologação, trocar a revisão e configurar rotinas e segredos novos; não fiz sem autorização.
2. **Não existe gateway sandbox (D-01).** Sem ele, Pix e cartão não podem ser aprovados em homologação (o adaptador fictício é bloqueado fora do local), então os itens 4 e 5 do roteiro e CA-P1, CA-P2 e CA-P5 não podem ser provados lá.
3. **Backup e restauração (Prompt 25) não foram executados** (pulado a pedido do responsável). O critério "backup/restauração" do fechamento está **não executado**: existe só o primeiro `pg_dump` manual de 01/10 (60 KB, lido com `pg_restore --list`); não há cópia diária, retenção verificada nem restauração testada.
4. Insumos do cliente pendentes que bloqueiam itens obrigatórios: identidade visual e textos legais (D-10, D-11), domínio e remetente de e-mail (D-08, D-09).
5. Aparelhos reais (CA-26) e leitura de câmera real não testados.

**Defeitos críticos abertos conhecidos: nenhum.** Nenhum requisito está **Falho**. Isso vale para o que foi executado localmente; não substitui a rodada em homologação.

## Resumo da matriz (RF-01 a RF-68, CA-01 a CA-33, CA-P1 a CA-P5: 106 itens)

| Situação | Quantidade | Significado |
|---|---|---|
| **Aprovado** | 90 | Provado por teste automatizado em PostgreSQL real e/ou ensaio em navegador, **em ambiente local** e, onde há pagamento, **com o gateway fictício**. A coluna de ressalvas diz o que ainda falta. |
| **Falho** | 0 | — |
| **Não executado** | 6 | Falta aparelho real, pessoa ou homologação atualizada (RF-26, CA-13, RF-43, RF-46, CA-26, CA-31) |
| **Bloqueado por cliente** | 10 | Falta insumo ou decisão do cliente (RF-34, CA-P1, CA-P2, CA-P5, RF-36, CA-01, RF-66, RF-67, RF-68, CA-33) |

"Aprovado" **não** significa aprovado em homologação nem com gateway real. Decisão de classificação: um item é "Bloqueado" quando o que o critério exige (e-mail entregue, sandbox, texto do cliente) depende de terceiros; é "Não executado" quando só faltou alguém ou algo executar.

## Verificações obrigatórias do fechamento (seção 11.5)

| Verificação | Situação | Evidência ou motivo |
|---|---|---|
| Nenhum defeito crítico aberto | Aprovado (local) | 628 testes, 0 falhas; tipos limpos; rodada integrada 28/28; segurança 44/45 com 1 observação sem dado exposto |
| Suíte do repositório | Aprovado | 36 arquivos, 628 testes, 05/10/2026 |
| HTTPS | Aprovado na revisão antiga | Homologação em HTTPS com HSTS (`strict-transport-security`), conferido em 05/10/2026; a versão nova não foi publicada |
| Três perfis (cliente, validador, administrador) | Aprovado (local) | Matriz de acesso nos testes e na rodada integrada: 403/403/401 |
| Gateway sandbox | **Bloqueado por cliente** | D-01 |
| E-mails | **Bloqueado por cliente** (entrega real) / Aprovado (fila, modelos, captura local) | D-08, D-09 |
| QR, portaria, relatórios, contingência | Aprovado (local) | `gate`, `reports`, `exports` e rodada integrada; aparelhos reais **não executado** |
| **Backup e restauração** | **Não executado** | Prompt 25 pulado; ver motivo 3 acima |
| Publicar a versão final em homologação e reexecutar o roteiro 11.2 | **Não executado** | Ver motivo 1 |
| Carga e compatibilidade | Aprovado (local) | `carga-compatibilidade-seguranca.md` |
| Ensaio de portaria com 2 celulares reais, 30 ingressos, 4G | **Não executado** | `portaria.md` |

## Roteiro 11.2 reexecutado em 05/10/2026 (local, gateway fictício)

Reexecutado por: suíte completa (628 testes) e `infra/testes/round.mjs` (28/28) contra servidor local limpo. **Não foi reexecutado em homologação.**

| # | Item do roteiro | Resultado local | Onde está provado |
|---|---|---|---|
| 1 | Cadastro com CPF válido, inválido e repetido | Aprovado | `auth.integration.test.ts`; rodada (CPF repetido recusado com mensagem clara) |
| 2 | Login, logout e recuperação de senha | Aprovado | `auth.integration.test.ts`, `mail.integration.test.ts` |
| 3 | Evento com três tipos e períodos de venda diferentes | Aprovado | `events.integration.test.ts`, `public.integration.test.ts` |
| 4 | 1 ingresso por Pix aprovado em sandbox | **Bloqueado (D-01)**; aprovado com o fictício | `reconcile.integration.test.ts`, rodada |
| 5 | 3 ingressos por cartão aprovado em sandbox | **Bloqueado (D-01)**; 3 ingressos aprovados com o fictício | `reconcile.integration.test.ts`, `tickets.integration.test.ts` |
| 6 | Cartão recusado: pedido não pago e estoque liberado | Aprovado (fictício) | `reconcile.integration.test.ts`, rodada |
| 7 | Pix não pago até expirar: estoque liberado | Aprovado (fictício) | `checkout.integration.test.ts`, `stock.integration.test.ts`, rodada |
| 8 | Cupom de promoter válido e inválido | Aprovado | `checkout.integration.test.ts`, `reports.integration.test.ts` |
| 9 | Acima do limite por compra | Aprovado | `checkout.integration.test.ts` |
| 10 | Última unidade disputada | Aprovado | `stock.integration.test.ts`; 80 compradores para 20 unidades: 20 vendas |
| 11 | Webhook duas vezes: sem duplicar | Aprovado | `reconcile.integration.test.ts` (inclui 6 entregas simultâneas) |
| 12 | E-mail de confirmação com link para os ingressos | **Bloqueado (D-08, D-09)**; fila e modelo aprovados na captura local | `mail.integration.test.ts` |
| 13 | PDF e exibição no celular | PDF aprovado; **celular real não executado** | `tickets.integration.test.ts`, rodada |
| 14 | Validação: válido, usado, cancelado, outro evento, adulterado | Aprovado | `gate.integration.test.ts` (40 testes) |
| 15 | Busca manual por nome e código | Aprovado | `gate.integration.test.ts` |
| 16 | Contador e tempo real no painel | Aprovado | `gate`, `panel.integration.test.ts` |
| 17 | Cancelamento pelo administrador e leitura vermelha | Aprovado | `panel.integration.test.ts`, rodada |
| 18 | Relatórios: evento, tipo, promoter, taxa mensal | Aprovado | `reports.integration.test.ts`, rodada |
| 19 | Exportação de planilhas | Aprovado; **abertura no Excel por pessoa não executada** | `exports.integration.test.ts` |
| 20 | Validador tentando acessar o painel administrativo | Aprovado | `team.integration.test.ts`, rodada (403) |

## Matriz final por requisito

Evidência resumida; o detalhe está em `rastreabilidade/matriz-requisitos.md` (que passa a refletir este fechamento: seis linhas antigas marcadas "Em andamento" foram atualizadas porque os testes já as comprovavam).

| ID | Situação | Ressalva ou motivo | Evidência |
|---|---|---|---|
| RF-01 | Aprovado |  | `server/src/api/auth.integration.test.ts`; homologação 01/10/2026 |
| RF-02 | Aprovado |  | `server/src/api/auth.integration.test.ts`, `server/src/domain/identity.test.ts` |
| RF-03 | Aprovado |  | `server/src/api/auth.integration.test.ts`; textos legais do cliente pendentes (D-11) |
| RF-04 | Aprovado |  | `server/src/api/auth.integration.test.ts` |
| RF-05 | Aprovado | entrega real do link depende de D-08/D-09 | `server/src/api/auth.integration.test.ts`, `server/src/api/mail.integration.test.ts`, `server/src/mail/templates.test.ts` |
| RF-06 | Aprovado |  | `server/src/api/auth.integration.test.ts`, `server/src/api/team.integration.test.ts` |
| RF-07 | Aprovado |  | `server/src/api/team.integration.test.ts` |
| RF-08 | Aprovado |  | `server/src/api/team.integration.test.ts` |
| RF-09 | Aprovado |  | `server/src/api/team.integration.test.ts` |
| RF-10 | Aprovado |  | `server/src/api/auth.integration.test.ts` |
| RF-11 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-12 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-13 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-14 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-15 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-16 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-17 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/domain/checkout.test.ts` |
| RF-18 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-19 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| RF-20 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-21 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-22 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-23 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-24 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-25 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-26 | Não executado | link no WhatsApp real, em HTTPS público (homologação desatualizada e sem domínio) | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-27 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| RF-28 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/api/payment.integration.test.ts` |
| RF-29 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/api/payment.integration.test.ts`, `src/site/session.test.ts` |
| RF-30 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/domain/checkout.test.ts` |
| RF-31 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/domain/checkout.test.ts` |
| RF-32 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/api/payment.integration.test.ts` |
| RF-33 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/api/payment.integration.test.ts` |
| RF-34 | Bloqueado por cliente | D-01: gateway não escolhido; só o adaptador fictício existe | `server/src/api/checkout.integration.test.ts`, `server/src/api/payment.integration.test.ts`, `server/src/payments/mockGateway.test.ts` |
| RF-35 | Aprovado | provado com o gateway fictício; assinatura e eventos do real a conferir | `server/src/api/reconcile.integration.test.ts`, `server/src/api/tickets.integration.test.ts` |
| RF-36 | Bloqueado por cliente | D-08, D-09: sem domínio, remetente e provedor de e-mail; só a captura local | `server/src/api/mail.integration.test.ts`, `server/src/mail/templates.test.ts` |
| RF-37 | Aprovado | estados do gateway real a conferir | `server/src/api/reconcile.integration.test.ts`, `docs/webhook-e-conciliacao.md` |
| RF-38 | Aprovado |  | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| RF-39 | Aprovado |  | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| RF-40 | Aprovado | sem CPF no ingresso (D-07 aguarda decisão) | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| RF-41 | Aprovado |  | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| RF-42 | Aprovado |  | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| RF-43 | Não executado | tela cheia em celular real (brilho, tamanho do QR sob luz de pista) | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts`, `docs/ingressos.md` |
| RF-44 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-45 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-46 | Não executado | câmera em Chrome Android e Safari iPhone reais | `server/src/api/gate.integration.test.ts`, `docs/portaria.md` |
| RF-47 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-48 | Aprovado | som e vibração só conferidos em navegador de desktop; iPhone não vibra pelo navegador | `server/src/api/gate.integration.test.ts`, `docs/portaria.md` |
| RF-49 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-50 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-51 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-52 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-53 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-54 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| RF-55 | Aprovado |  | `server/src/api/panel.integration.test.ts` |
| RF-56 | Aprovado |  | `server/src/api/panel.integration.test.ts` |
| RF-57 | Aprovado |  | `server/src/api/panel.integration.test.ts` |
| RF-58 | Aprovado |  | `server/src/api/reports.integration.test.ts` |
| RF-59 | Aprovado |  | `server/src/api/reports.integration.test.ts` |
| RF-60 | Aprovado | regra de "pago sem estoque" na taxa é premissa a confirmar com a PartyX (D-54) | `server/src/api/reports.integration.test.ts`, `docs/relatorios.md` |
| RF-61 | Aprovado |  | `server/src/api/panel.integration.test.ts`, `docs/painel.md` |
| RF-62 | Aprovado | reposição de estoque após cancelamento sem decisão (D-14) | `server/src/api/panel.integration.test.ts` |
| RF-63 | Aprovado | XLSX não oferecido (D-57); só CSV | `server/src/api/exports.integration.test.ts`, `server/src/exports/csv.test.ts`, `docs/exportacoes.md` |
| RF-64 | Aprovado | impressão em papel não conferida por pessoa | `server/src/api/exports.integration.test.ts`, `server/src/exports/csv.test.ts`, `docs/contingencia.md` |
| RF-65 | Aprovado | verificado em Chromium, Firefox e WebKit e dispositivos emulados; aparelhos reais não | `docs/visual-e-legal.md`, `server/src/legal/documents.test.ts` |
| RF-66 | Bloqueado por cliente | D-10: identidade final e aprovação escrita não recebidas | `docs/proposta-visual.md`, `docs/visual-e-legal.md`, `server/src/legal/documents.test.ts` |
| RF-67 | Bloqueado por cliente | D-10, D-09: e-mails com a identidade final e remetente autenticado não recebidos | `server/src/mail/templates.test.ts`, `docs/visual-e-legal.md` |
| RF-68 | Bloqueado por cliente | D-11: textos legais do cliente não recebidos; produção bloqueada sem eles | `docs/visual-e-legal.md`, `server/src/legal/documents.test.ts` |
| CA-01 | Bloqueado por cliente | D-08, D-09: "recebe confirmação" exige e-mail entregue de verdade | `server/src/api/mail.integration.test.ts`, `server/src/mail/templates.test.ts` |
| CA-02 | Aprovado |  | `server/src/api/auth.integration.test.ts` |
| CA-03 | Aprovado |  | `server/src/api/auth.integration.test.ts` |
| CA-04 | Aprovado | entrega real do link depende de D-08/D-09 | `server/src/api/auth.integration.test.ts`, `server/src/api/mail.integration.test.ts` |
| CA-05 | Aprovado |  | `server/src/api/team.integration.test.ts` |
| CA-06 | Aprovado |  | `server/src/api/team.integration.test.ts` |
| CA-07 | Aprovado |  | `server/src/api/events.integration.test.ts`, `server/src/api/public.integration.test.ts` |
| CA-08 | Aprovado |  | `server/src/api/events.integration.test.ts`, `server/src/domain/events.test.ts`, `server/src/api/public.integration.test.ts` |
| CA-09 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/api/stock.integration.test.ts` |
| CA-10 | Aprovado |  | `server/src/api/events.integration.test.ts` |
| CA-11 | Aprovado |  | `server/src/api/events.integration.test.ts`, `server/src/api/public.integration.test.ts` |
| CA-12 | Aprovado |  | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| CA-13 | Não executado | idem: ver banner e nome no WhatsApp real | `server/src/api/public.integration.test.ts`, `server/src/domain/vitrine.test.ts` |
| CA-14 | Aprovado | emulação e 3 motores; aparelhos reais não | `docs/visual-e-legal.md`, `server/src/legal/documents.test.ts` |
| CA-15 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/domain/checkout.test.ts` |
| CA-16 | Aprovado |  | `server/src/api/checkout.integration.test.ts`, `server/src/domain/checkout.test.ts`, `server/src/api/stock.integration.test.ts`, `docs/estoque-e-concorrencia.md` |
| CA-17 | Aprovado | prazo do Pix do gateway real (D-03) a conferir na sandbox | `server/src/api/checkout.integration.test.ts`, `server/src/domain/checkout.test.ts`, `server/src/api/stock.integration.test.ts`, `docs/estoque-e-concorrencia.md` |
| CA-18 | Aprovado | provado com o fictício; tempo com o gateway real não medido | `server/src/api/reconcile.integration.test.ts`, `server/src/api/tickets.integration.test.ts` |
| CA-19 | Aprovado |  | `server/src/api/reports.integration.test.ts` |
| CA-20 | Aprovado |  | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| CA-21 | Aprovado |  | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| CA-22 | Aprovado |  | `server/src/api/tickets.integration.test.ts`, `server/src/domain/ticketCode.test.ts` |
| CA-23 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| CA-24 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| CA-25 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| CA-26 | Não executado | leitura em Chrome Android e Safari iPhone reais | `server/src/api/gate.integration.test.ts`, `docs/portaria.md` |
| CA-27 | Aprovado |  | `server/src/api/gate.integration.test.ts` |
| CA-28 | Aprovado |  | `server/src/api/reports.integration.test.ts` |
| CA-29 | Aprovado | idem D-54; reteste com gateway real pendente | `server/src/api/reports.integration.test.ts` |
| CA-30 | Aprovado |  | `server/src/api/reports.integration.test.ts` |
| CA-31 | Não executado | abrir o CSV no Excel real, por pessoa | `server/src/api/exports.integration.test.ts`, `server/src/exports/csv.test.ts`, `docs/exportacoes.md` |
| CA-32 | Aprovado | 360 px em 3 motores e emulados; aparelho real não | `docs/visual-e-legal.md`, `server/src/legal/documents.test.ts` |
| CA-33 | Bloqueado por cliente | D-10: proposta visual preparada e **não enviada**; sem aprovação escrita | `docs/proposta-visual.md`, `docs/registros/aprovacao-visual.md` |
| CA-P1 | Bloqueado por cliente | D-01: exige Pix e cartão em sandbox do gateway escolhido | `server/src/api/reconcile.integration.test.ts` |
| CA-P2 | Bloqueado por cliente | D-01: exige cartão recusado em sandbox do gateway escolhido | `server/src/api/reconcile.integration.test.ts` |
| CA-P3 | Aprovado | provado com o fictício | `server/src/api/reconcile.integration.test.ts` |
| CA-P4 | Aprovado | assinatura do fictício; a do gateway real a conferir | `server/src/api/reconcile.integration.test.ts` |
| CA-P5 | Bloqueado por cliente | D-01: exige estorno feito no painel de um gateway real | `server/src/api/reconcile.integration.test.ts` |

## Defeitos e achados desta etapa

- A homologação publicada está desatualizada (item 1 do veredito). **É o principal bloqueio técnico.**
- Matriz com seis linhas desatualizadas (RF-06, CA-04, CA-07, CA-09, CA-11, CA-17): corrigidas.
- Observações de segurança de baixa gravidade já registradas em `carga-compatibilidade-seguranca.md` (caminho com ponto codificado devolve o HTML do site; 2 avisos moderados de `uuid` em dependência indireta).

## Para ficar pronto (ordem sugerida)

1. **Decidir se posso publicar a versão atual em homologação** (migrações no Neon de homologação, nova revisão, rotinas do Scheduler, segredos `jobs`). Sem isso, nada do roteiro pode ser provado lá.
2. Cliente escolher o gateway (D-01) e fornecer a conta sandbox, para Prompt 11.
3. Cliente enviar identidade visual, textos legais, domínio e remetente (D-08 a D-11) e aprovar por escrito a proposta visual (CA-33).
4. Executar o Prompt 25 (backup diário e restauração testada).
5. Ensaio de portaria com aparelhos reais e conferência do CSV no Excel.
6. Reexecutar este fechamento e só então usar a minuta de `homologacao/minuta-comunicacao-entrega.md`.

## Material preparado para o cliente (rascunhos, nada enviado)

| Arquivo | Para quê |
|---|---|
| `homologacao/roteiro-de-testes-do-cliente.md` | Roteiro em linguagem simples, com o que esperar em cada passo e como reportar |
| `homologacao/guia-de-portaria.md` | Guia para a equipe da portaria |
| `homologacao/orientacao-remota.md` | Roteiro da videochamada de cerca de 1 hora (Anexo I, item 11) |
| `homologacao/minuta-comunicacao-entrega.md` | Minuta da seção 12.3, com campos a preencher e condições para enviar |

**Acessos de teste:** serão criados em homologação (administrador, validador, cliente) e enviados ao cliente **por canal seguro, nunca por este repositório**. Senhas temporárias exigem troca no primeiro acesso.
