# Regras de trabalho do PartyX

Este arquivo vale para as próximas tarefas no repositório. Antes de implementar, leia as fontes relevantes e a auditoria; não trate o protótipo como prova de regra no servidor.

## Stack e fontes

- Front-end real: React 19, Vite e TypeScript. Servidor: Hono. Persistência: Drizzle e PostgreSQL (Neon). Infraestrutura prevista: Cloud Run, Cloud Storage, Cloud Tasks e Cloud Scheduler.
- Não migrar para Next.js nem Tailwind por causa dos prompts antigos. Uma mudança de stack exige decisão expressa do responsável.
- Precedência: contrato assinado e anexos originais > `docs/fontes/PartyX_Documentacao_Desenvolvimento.pdf` > `docs/fontes/PartyX_30_prompts_desenvolvimento.txt` e `docs/fontes/Prompt_PartyX_Claude_Design.txt`. Não presumir conteúdo do contrato/anexos que não esteja disponível.
- Estado auditado e lacunas: `docs/AUDITORIA_PartyX.md`. Requisitos e aceite: `docs/rastreabilidade/matriz-requisitos.md`. Decisões e insumos: `docs/registros/`.

## Regras invioláveis

- Compra exige login e retorno ao checkout com seleção preservada, sempre revalidando estoque no servidor.
- Estoque e reserva só em transação com `SELECT ... FOR UPDATE`. Para cada tipo, vendidos + reservas válidas não podem exceder a capacidade. Expiração e liberação devem ser idempotentes.
- Código de promoter atribui a venda; **não concede desconto** nem calcula comissão.
- Navegador nunca aprova pagamento nem emite ingresso. Webhook exige verificação de assinatura, reconsulta à API do gateway e idempotência por ID de evento.
- Emitir um registro e um QR distinto por unidade: código aleatório de 144 bits mais HMAC. Repetições de webhook não duplicam ingressos.
- Check-in por `UPDATE` condicional do ingresso válido, preservando a primeira entrada. Sem validação offline. Busca manual mostra CPF mascarado; ingresso, QR e PDF não exibem CPF sem decisão expressa do cliente.
- Taxa mensal conta `tickets` pelo mês de `orders.paid_at`, independentemente do estado atual do pedido ou ingresso. Cancelar ingresso não executa estorno financeiro; estorno é operação do gateway/cliente.
- Não implementar itens excluídos no §16 do PDF: desconto por cupom, comissão de promoter, lotes automáticos, cortesias/lista de convidados, transferência, assentos/mapa, bilheteria/POS, app nativo, notas fiscais, SMS/WhatsApp automático, múltiplos gateways, cashless, migração de outras plataformas ou atendimento ao comprador pela contratada. Lista impressa de contingência não é validação offline.

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
