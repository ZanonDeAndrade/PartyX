# Divergências e lacunas encontradas na leitura

Data da leitura: 01/10/2026. Material lido: documentação de desenvolvimento versão 1.0 (32 páginas, `reference/docs/documentacao.txt`) e orçamento comercial de 30/09/2026 (`reference/docs/orcamento.txt`).

**Regra de precedência** (documentação, seção 1.1): em caso de divergência prevalece o texto do contrato e dos Anexos I e II. **O contrato assinado e os anexos originais não estão no repositório**, então nenhuma das divergências abaixo pôde ser resolvida. Nenhuma resolução comercial foi inventada. Cada item precisa de confirmação com o contrato antes de virar regra no sistema.

## 1. Documentação x orçamento

| # | Tema | Documentação | Orçamento | Efeito no desenvolvimento | Ação |
|---|---|---|---|---|---|
| 1 | Prazo de entrega | Entrega para testes até 20/10/2026, com 10 dias corridos de homologação (Cl. 4.1 e 5.2). | "Até 60 dias após a assinatura e o recebimento de todos os materiais". | Define o caminho crítico e o marco. Não muda funcionalidade. | Confirmar no contrato qual prazo vale. Até lá, planejar para 20/10/2026 e registrar suspensões por escrito. |
| 2 | Vencimento e início da mensalidade | Vencimento no dia 10. Primeira mensalidade em 10/10/2026 (Cl. 6.1 e 6.6). Boleto emitido até o dia 5. | Mensalidade "a partir da disponibilização em produção", boleto com vencimento no dia 05. | Nenhum: a cobrança é externa ao sistema. O relatório da taxa não mostra vencimento. | Confirmar no contrato. A documentação (17.2, itens 1 e 2) já alerta sobre a primeira mensalidade vencer antes da entrega. |
| 3 | Definição de ingresso vendido para a taxa | Ingresso com pagamento aprovado, mesmo se depois cancelado, reembolsado ou estornado (Cl. 6.2 e 6.3). | "Cada ingresso emitido com pagamento aprovado". | A consulta conta tickets de pedidos com `paid_at` no mês, ignorando o status atual. Um pagamento aprovado sem estoque não gera ticket e, portanto, não entra na contagem. | Confirmar no contrato se o pagamento aprovado sem ingresso emitido entra na taxa. Tratar como exceção para análise até lá (Prompt 17). Desde 21/10/2026 (D-93, aditivo), só entram os ingressos de pedidos pagos por Pix; antes disso, todas as formas. |
| 4 | Quem acessa a validação | Perfil validador **e administrador** (RF-44). | "Acesso exclusivo para funcionários com perfil de validação". | O protótipo permite ao administrador abrir a portaria, conforme a documentação. | Confirmar com o cliente. |
| 5 | Contato de suporte do prestador | WhatsApp +55 55 9958-7217, segunda a sexta, 9h às 17h (seção 2.3). | WhatsApp (55) 9 9906-1027. | Não aparece nas telas: o suporte é da equipe, não do comprador. | Confirmar o número oficial antes de entregar o guia de portaria e os runbooks. |
| 6 | Backups | Diário, retenção mínima de 7 dias (Anexo II, 2). | "Backups periódicos". | O plano segue a documentação. | Nenhuma. |
| 7 | Prazo mínimo de 12 meses | 12 meses da publicação (Cl. 19.1). | Não menciona. | Registrar a data de publicação em produção. | Confirmar no contrato. |
| 8 | Validade da proposta | Não aplicável. | Válida até **05/10/2026**. | Se o contrato não for assinado até essa data, a proposta perde a validade. | Registrar a data de assinatura em `logs-contratuais.md`. |

## 2. Lacunas do modelo de dados (seção 6.1), tratadas no Prompt 03

Lacunas 1 a 5 e 7 resolvidas em 01/10/2026: ver `../modelo-de-dados.md`. As lacunas 6 (fonte da verdade da disponibilidade, Prompt 09) e 8 (reposição de estoque, D-14) seguem abertas.

A tabela da documentação tem 14 tabelas e cobre a regra central (um registro em `tickets` por unidade). Os requisitos pedem estados e campos que ela não lista:

| # | Lacuna | Origem | Proposta para o Prompt 03 |
|---|---|---|---|
| 1 | `orders.status` lista pendente, pago, expirado, cancelado, estornado. Faltam **contestado** (chargeback, seção 10.1), **não concluído/recusado** (CA-P2) e **pago sem estoque** (seção 10.1). | Seções 6.1 e 10.1 | Estender os estados, com migração versionada. Os estados do protótipo servem de referência. |
| 2 | `checkins.result` lista válido, já utilizado, inválido. Faltam **cancelado** (RF-48, CA-24) e **outro evento** (RF-54). | RF-48, RF-54 | Estender o enum. A falha de conexão (V09) não gera registro, porque não há resposta do servidor. |
| 3 | Não há tabela para sessões, tentativas de login (RF-10), chaves de idempotência ou outbox de e-mail. | RF-10, RF-35, RF-36 | O Prompt 03 permite tabelas técnicas se necessárias. Justificar cada uma. |
| 4 | `tickets.qr_payload` guarda o QR assinado, mas não há campo para a versão da chave HMAC. | RF-39 | Adicionar versão de chave para permitir rotação sem invalidar ingressos emitidos. |
| 5 | Cancelamento de ingresso: não há campos de autor, motivo e momento em `tickets`. | RF-62 | `audit_log` (before/after) cobre. Decidir se motivo e momento também ficam no ticket. |
| 6 | `quantity_sold` e `reservations` coexistem. A disponibilidade é vendidos mais reservas válidas. | RF-17, CA-16 | Definir uma única fonte da verdade e o bloqueio de linha em ordem determinística (Prompt 09). |
| 7 | "Em emissão" aparece no design (pedido pago cujos ingressos ainda estão sendo gerados), mas não é estado de `tickets` na documentação. | RF-35, C07 | Tratar como estado do pedido ou como ausência de tickets, sem QR utilizável antes da emissão. |
| 8 | Reposição de estoque após cancelamento não é definida. | D-14 | Aguardar decisão. Ver `decisoes-pendentes.md`. |
| 9 | O código de 128 bits do ingresso não serve para digitar na busca manual (RF-52), e o design exibe um código curto de 40 bits. | RF-39, RF-52 | Acrescentado `tickets.short_code`, que não é credencial. Ver D-20. |

## 3. Observações sobre o plano de 30 prompts

- A documentação sugere "Prisma ou Drizzle" e "provedor de nuvem". O plano escolhe Drizzle, Next.js, Cloud Run e Neon. A documentação diz que a escolha final de ferramentas é da CONTRATADA (seção 5.1), então não há conflito. Qualquer custo extra acima do previsto exige autorização do cliente (Cl. 8.3).
- O front-end já existente neste repositório usa Vite + React + TypeScript e **não** Next.js. **Decidido em 01/10/2026 (D-19): permanece em Vite**, com API em Hono no mesmo contêiner. Consequência para o Open Graph em `../arquitetura.md`.
- O front-end atual é um protótipo com dados simulados. Ele **não comprova** nenhum requisito de segurança, estoque, pagamento ou validação.
