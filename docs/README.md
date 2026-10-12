# Documentação de projeto do PartyX

Preparação do plano de desenvolvimento (Prompt 01). Tudo aqui é registro e rastreabilidade. **Nenhum código de produção foi escrito** nesta etapa.

| Arquivo | Para que serve |
|---|---|
| `rastreabilidade/matriz-requisitos.md` | RF-01 a RF-68, CA-01 a CA-33 e CA-P1 a CA-P5, com módulo, prompt de implementação e de teste, telas do design, situação e evidência |
| `rastreabilidade/exclusoes-e-entregaveis.md` | Os 15 itens excluídos do escopo, os entregáveis e o roteiro de testes essenciais |
| `registros/insumos-etapa-0.md` | Os 19 insumos da Etapa 0, separando os itens 1 a 14 dos itens 15 a 19 |
| `registros/decisoes-pendentes.md` | Decisões do cliente e da CONTRATADA ainda abertas, com o que cada uma bloqueia |
| `registros/divergencias.md` | Conflitos entre documentação e orçamento, lacunas do modelo de dados e observações sobre o plano |
| `autenticacao.md` | Rotas, garantias, premissas e limitações de cadastro, login, equipe e permissões |
| `infraestrutura.md` | Recursos do Google Cloud e do Neon em homologação, acessos, como publicar, o que foi verificado e o que falta |
| `eventos.md` | Rotas, regras, banner, capacidade e decisões de eventos, tipos e promoters |
| `relatorios.md` | Vendas, promoters e taxa mensal: bases, regras, conciliação e o que falta confirmar |
| `painel.md` | Visão geral, pedidos, compradores, ingressos, entradas ao vivo e cancelamento de ingresso |
| `operacao/README.md` | Rotinas, suporte, alertas, cobrança sem automação, capacidade, encerramento e 9 runbooks |
| `../README-DEPLOY.md` | Roteiro de produção de custo mínimo: decisões e medições, passo a passo, deploy, rollback, dias de evento, custo e checklist manual |
| `backup.md` | Backup diário, restauração em banco isolado, RPO, plano do Neon, alertas e o que não foi verificado |
| `producao.md` | Preparação de produção com vendas fechadas: o que existe, o que falta e o efeito contratual |
| `fechamento-interno.md` | Veredito de prontidão, roteiro 11.2 reexecutado e matriz final classificada |
| `homologacao/` | Rascunhos para o cliente: roteiro de testes, guia de portaria, orientação remota, minuta de comunicação (não enviados) |
| `carga-compatibilidade-seguranca.md` | Rodada integrada, carga, compatibilidade e segurança locais, e o que não foi executado |
| `portaria.md` | Leitura do QR, resultados, concorrência, busca manual, contador, contingência sem internet e o que falta testar em campo |
| `email.md` | Fila de e-mails, modelos, entrega SMTP, SPF/DKIM/DMARC, alertas e o que falta provar |
| `ingressos.md` | Emissão, QR assinado, rotação de chave, Meus ingressos, PDF, tela cheia e o que falta |
| `webhook-e-conciliacao.md` | Webhook, reconsulta, confirmação, pagamento tardio, estorno, rotina agendada e o que falta |
| `pagamento.md` | Checkout, contrato interno do gateway, adaptador fictício, regras de cartão e o que depende da escolha do cliente |
| `reserva.md` | Pedido, reserva, estoque, expiração, estados do pedido e tudo que foi provado e o que falta |
| `vitrine.md` | API pública, páginas, Open Graph, busca, o que foi testado e o que falta |
| `ui/` | Refinamento de UI: design system (`design-system.md`), checklist de 152 telas e estados, capturas antes e depois, comparativo, diagnóstico, referências, verificação e sugestões futuras |
| `modelo-de-dados.md` | Tabelas, regras garantidas pelo banco, migrações, testes e o que não foi verificado |
| `arquitetura.md` | Estrutura front-end e API, convenções, por que Drizzle e transações, desvios do Prompt 02 |
| `registros/logs-contratuais.md` | Logs de assinatura, recebimentos, validações em 5 dias úteis, suspensões, prorrogações e comunicações formais |

## Regras de uso

1. **Atualize no mesmo commit** em que o fato ocorrer: ao implementar um requisito, mude a coluna `Implementação real` e preencha `Evidência`. Sem evidência, a situação não passa de `Em andamento`.
2. **Não invente respostas.** Se o cliente não respondeu, a decisão fica `Pendente`.
3. **Segredos fora do Git.** Registre só data, canal e responsável. Nunca chaves, senhas ou segredos de webhook.
4. **O contrato prevalece** sobre a documentação e o orçamento. O contrato não está no repositório: ver `registros/divergencias.md`.
5. **Alteração de banco** só por migração versionada (a partir do Prompt 03).

## Andamento do plano de 30 prompts

| Prompt | Etapa | Situação |
|---|---|---|
| 01 | Insumos, rastreabilidade e decisões | Concluído em 01/10/2026 (esta pasta) |
| 02 | Base do repositório e arquitetura | Concluído em 01/10/2026, adaptado a Vite (`arquitetura.md`) |
| 03 | Neon, modelo e migrações | Concluído em 01/10/2026 em PostgreSQL local; Neon real não testado |
| 04 | Ambientes e homologação | Concluído em 01/10/2026, com pendências (CI sem repositório, domínio, backup diário) |
| 05 | Cadastro e autenticação | Concluído em 01/10/2026 (API); e-mail real e integração com as telas pendentes |
| 06 | Equipe e permissões | Concluído em 01/10/2026 (API); telas de equipe e primeiro administrador em homologação pendentes |
| 07 | Eventos, tipos e promoters | Concluído em 01/10/2026 (API); telas e vitrine pendentes; banner não testado no Cloud Storage real |
| 08 | Vitrine pública | Concluído em 01/10/2026 (API, Open Graph e páginas); WhatsApp real e aparelhos reais pendentes |
| 09 | Carrinho, reserva e estoque | Concluído em 01/10/2026 (API); telas, pagamento e rotina agendada pendentes |
| 10 | Checkout e interface do gateway | Concluído em 01/10/2026 (checkout, contrato do gateway e adaptador fictício); gateway real depende da escolha do cliente |
| 11 | Pix e cartão no gateway escolhido | Feito com o Mercado Pago em 11/10/2026 (etapa 06), **premissa: Mercado Pago, aguardando confirmação escrita da PartyX** (D-01); webhook, estorno e contestação no ambiente de teste em 12/10/2026 (etapa 07). Falta a compra real de baixo valor (13.1) |
| 12 | Webhook e reconciliação | Concluído em 01/10/2026 com o gateway fictício; falta o gateway real e a emissão dos ingressos (Prompt 13) |
| 13 | Ingresso, QR e PDF | Concluído em 01/10/2026; aparelhos reais, fonte Unicode no PDF e envio por e-mail pendentes |
| 14 | E-mails transacionais | Concluído em 01/10/2026 (fila, modelos, SMTP e telas de recuperação); **entrega real, SPF/DKIM/DMARC e identidade final pendentes do cliente** |
| 15 | Portaria | Concluído em 01/10/2026 (API e telas); **Android e iPhone reais não testados (CA-26)** |
| 16 | Painel e cancelamento | Concluído em 01/10/2026 (API e telas); a reposição de estoque segue pendente do cliente (D-14) |
| 17 | Relatórios e taxa de R$ 1,00 | Concluído em 02/10/2026 (API e telas); regra do "pago sem estoque" na taxa a confirmar com a PartyX |
| 18 | Exportações e contingência | Concluído em 03/10/2026 (CSV, PDF e CSV de portaria, telas); **abertura no Excel real e impressão em papel não conferidas por pessoa** |
| 19 | Visual, responsividade e legal | Concluído em 04/10/2026 no que não depende do cliente; **textos legais, identidade final e aprovação escrita (CA-33) pendentes**; proposta preparada e não enviada |
| 20 | Segurança e LGPD | Concluído em 04/10/2026 (cabeçalhos, mascaramento de logs, direitos do titular, retenção, dependências); **sem teste externo; prazos e bases legais são do cliente**; agendamento da limpeza pendente |
| 21 | Disputa de estoque e pagamento tardio | Concluído em 05/10/2026 (12 testes de concorrência; **corrigido um impasse entre novo pedido e aprovação**); gateway real e carga pendentes |
| 22 | Webhook, estorno e chargeback | Concluído em 05/10/2026 contra o gateway **fictício** (8 testes novos, 623 no total); sandbox real pendente de D-01; estorno parcial cai em divergência |
| 23 | QR concorrente e falha de internet | Testes automáticos e ensaio em navegador concluídos em 05/10/2026 (628 testes); **ensaio com dois aparelhos reais e 4G real NÃO executado** (CA-26 pendente) |
| 24 | Carga, compatibilidade e segurança | Concluído em 05/10/2026 **só no ambiente local** (rodada integrada 28/28, carga na meta e no dobro sem erro, 275 páginas em 3 navegadores, 45 verificações de segurança; 1 correção de CSS no WebKit); **homologação, gateway, aparelhos reais e varredura externa NÃO executados** (`carga-compatibilidade-seguranca.md`) |
| 25 | Backup e restauração | Executado em 06/10/2026 **na homologação**: job diário às 03:00, bucket privado, 35 dias, alertas, restauração real em banco isolado (20 verificações OK, 3 s). **Produção ainda sem backup** (pré-requisito do go-live); RPO de até 24 h; cópias no mesmo projeto do banco (`backup.md`) |
| 26 | Fechamento interno para homologação | Executado em 05/10/2026: **NÃO PRONTO** para a comunicação formal (`fechamento-interno.md`); rascunhos para o cliente em `homologacao/`; nada enviado |
| 28 | Preparação de produção | **Só preparação**: scripts `infra/producao/` prontos e testados nas recusas; **nenhum recurso criado, nada publicado**; faltam projeto, faturamento, orçamento, Neon, gateway, textos legais, domínio, backup (`producao.md`) |
| 27, 29 | Homologação formal e go-live | **Não executados**: dependem de homologação atualizada, aceite e produção real (ver `fechamento-interno.md` e `producao.md`) |
| 30 | Operação continuada | Preparada em 05/10/2026, **antes de existir produção**: comandos `ops:fee`, `ops:weekly`, `ops:export-closure` testados (9 testes + execução local), `check-backup.sh` testado em leitura contra a homologação (acusou que o backup diário não existe), 9 runbooks; **alertas não executados, restauração não ensaiada** (`operacao/README.md`) |
