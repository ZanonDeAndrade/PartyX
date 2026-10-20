# Regras de trabalho do PartyX

Este arquivo vale para as próximas tarefas no repositório. Antes de implementar, leia as fontes relevantes e a auditoria; não trate o protótipo como prova de regra no servidor.

## Stack e fontes

- Front-end real: React 19, Vite e TypeScript. Servidor: Hono. Persistência: Drizzle e PostgreSQL (Neon). Infraestrutura prevista: Cloud Run, Cloud Storage, Cloud Tasks e Cloud Scheduler.
- Não migrar para Next.js nem Tailwind por causa dos prompts antigos. Uma mudança de stack exige decisão expressa do responsável.
- Precedência: contrato assinado e anexos originais > `docs/fontes/PartyX_Documentacao_Desenvolvimento.pdf` > `docs/fontes/PartyX_30_prompts_desenvolvimento.txt` e `docs/fontes/Prompt_PartyX_Claude_Design.txt`. Não presumir conteúdo do contrato/anexos que não esteja disponível.
- Sequência de fechamento: 00 preparação, 01 banco de teste, 02 segurança, 03 conciliação, 04 admin eventos/tipos, 05 admin promoters/equipe/compradores, 06 gateway real, 07 webhook/estorno sandbox, 08 e-mail/legal, 09 E2E/carga, 10 infra homologação/backup, 11 fechamento; mais um prompt separado de UI/UX.
- Estado auditado e lacunas: `docs/AUDITORIA_PartyX.md`. Requisitos e aceite: `docs/rastreabilidade/matriz-requisitos.md`. Decisões e insumos: `docs/registros/`.

## Regras invioláveis

- Compra exige login e retorno ao checkout com seleção preservada, sempre revalidando estoque no servidor.
- Estoque e reserva só em transação com `SELECT ... FOR UPDATE`. Para cada tipo, vendidos + reservas válidas não podem exceder a capacidade. Expiração e liberação devem ser idempotentes.
- Código de promoter atribui a venda e não calcula comissão. Desconto só o configurado no promoter (exceção D-91, abaixo).
- Navegador nunca aprova pagamento nem emite ingresso. Webhook exige verificação de assinatura, reconsulta à API do gateway e idempotência por ID de evento.
- Emitir um registro e um QR distinto por unidade: código aleatório de 144 bits mais HMAC. Repetições de webhook não duplicam ingressos.
- Check-in por `UPDATE` condicional do ingresso válido, preservando a primeira entrada. Sem validação offline. Busca manual mostra CPF mascarado; ingresso, QR e PDF não exibem CPF sem decisão expressa do cliente.
- Taxa mensal conta `tickets` pelo mês de `orders.paid_at`, independentemente do estado atual do pedido ou ingresso. Cancelar ingresso não executa estorno financeiro; estorno é operação do gateway/cliente.
- Não implementar itens excluídos no §16 do PDF: desconto por cupom (salvo o desconto do promoter da D-91, abaixo), comissão de promoter, lotes automáticos, cortesias/lista de convidados (a lista de autorizados a comprar da D-92, abaixo, não é cortesia), assentos/mapa, bilheteria/POS, app nativo, notas fiscais, SMS/WhatsApp automático, múltiplos gateways, cashless, migração de outras plataformas ou atendimento ao comprador pela contratada. Lista impressa de contingência não é validação offline.
- Exceção decidida: a transferência de ingresso entre contas foi incluída como mudança de escopo (D-87, 15/10/2026, `docs/registros/transferencia-e-cancelamento-2026-10-15.md`). O pedido, o pagamento e o reembolso continuam do comprador; a transferência troca o titular e o QR na mesma linha do ingresso, numa transação.
- Exceção decidida: desconto por promoter, mudança de escopo aprovada pela PartyX (D-91, 19/10/2026, `docs/registros/desconto-por-promoter.md`). O desconto é por ingresso, sobre o preço do lote, conferido e calculado no servidor; nunca zera o pedido (o código é recusado); a taxa de serviço é calculada sobre o valor já com desconto; o pedido guarda o desconto que recebeu.
- Exceção decidida: evento privado com lista de autorizados a comprar, mudança de escopo aprovada pela PartyX (D-92, 20/10/2026, `docs/registros/evento-privado.md`). Não é cortesia nem lista de convidados na portaria: quem está na lista paga normalmente e a entrada continua só pelo ingresso. Compra e transferência em evento privado só para conta autorizada, conferido no servidor; a página só recebe a situação da própria conta; a lista é apagada 6 meses depois do evento.

## Convenções e segurança

- Dinheiro em centavos inteiros; datas e textos da interface em pt-BR, sem caractere de travessão.
- Migrações Drizzle versionadas com reversão. Não reescrever migrações aplicadas nem assumir que uma migração local já está no Neon.
- Segredos fora do Git e das imagens. Nunca registrar CPF completo, senha, token, PAN/CVV ou segredo em logs, commits ou relatórios.
- Regras de perfil, estoque, pagamento, ingresso e portaria precisam ser conferidas no servidor, não apenas na tela.
- Pendências da PartyX não são decisões técnicas. Registrar premissas como provisórias e não inventar respostas do cliente.

## Definição de pronto e operação

- Para uma etapa de implementação, exigir `npm run lint`, `npm run typecheck`, `npm test` **com banco de teste configurado** e `npm run build` passando. Teste pulado não é teste aprovado.
- Atualizar `docs/rastreabilidade/matriz-requisitos.md` com requisitos/CA afetados. O relatório final deve indicar arquivos alterados, comandos e resultados, CA verificados, pendências e bloqueios.
- Commit local por etapa é permitido, com mensagem clara.
- Sem autorização expressa do usuário: **não** fazer push, deploy, criar recursos com custo no GCP/Neon ou enviar mensagem ao cliente.
