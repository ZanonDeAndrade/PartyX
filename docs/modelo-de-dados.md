# Modelo de dados

Atualizado em 01/10/2026 (Prompt 03). Código em `server/src/db/schema/`; migrações em `drizzle/`.

## Entidades

14 tabelas da seção 6.1 da documentação, mais 2 técnicas.

| Tabela | Finalidade | Observações |
|---|---|---|
| `users` | Todos os logins | E-mail minúsculo e único. CPF só dígitos, único, obrigatório para cliente. `must_change_password` cobre o primeiro acesso (ADM22). |
| `password_resets` | Recuperação de senha | Guarda só o hash do token. Uso único e validade de 1 hora. |
| `consents` | Aceite de Termos e Privacidade | Versão, data, IP e navegador. |
| `events` | Eventos | Nunca apagados. `slug` único e em minúsculas. |
| `ticket_types` | Pista, VIP, Camarote... | Preço maior que zero, `quantity_sold` entre 0 e o total, janela de vendas válida. |
| `promoters` | Promoters | Código único, maiúsculo, de 3 a 20 caracteres. Sem comissão. |
| `reservations` | Reserva temporária | Uma por tipo em cada pedido. Não é venda. |
| `orders` | Pedidos | `number` sequencial a partir de 10001. `paid_at` imutável. |
| `order_items` | Linhas do pedido | Chave composta impede tipo de outro evento. |
| `tickets` | Um registro por unidade | Emissão idempotente. Nunca apagado. |
| `checkins` | Tentativas na portaria | No máximo uma entrada válida por ingresso, garantido pelo banco. |
| `payment_events` | Webhooks do gateway | Idempotência e auditoria. |
| `email_log` | E-mails e fila de envio | Serve de outbox. |
| `audit_log` | Auditoria | Só aceita inclusão. |
| `sessions` (técnica) | Sessões no servidor | Necessária com várias instâncias e para revogar sessão ao desativar usuário (RF-08, CA-06). |
| `login_attempts` (técnica) | Tentativas de login | O limite de tentativas (RF-10) precisa valer entre instâncias. |

Nenhuma tabela de idempotência ou outbox separada foi criada: a idempotência da emissão está na chave `(order_item_id, unit_index)`, a dos webhooks em `payment_events` e a dos e-mails em `email_log.idempotency_key`.

## Regras garantidas pelo banco

| Regra | Como | Critério |
|---|---|---|
| Valores em centavos inteiros, nunca zero | Colunas `integer` e checks de valor positivo | Seção 6.2 |
| Código do ingresso com pelo menos 128 bits, único | `tickets.code`: 22 ou mais caracteres base64url, índice único | RF-39, CA-22 |
| Três ingressos, três códigos | Índice único em `(order_item_id, unit_index)` e em `code` | CA-20 |
| Reprocessar pagamento não duplica ingressos | Mesma chave | CA-P3 |
| Webhook repetido não entra de novo | Índice único parcial em `gateway_event_id` | CA-P3 |
| Webhook forjado é registrado, não processado, e não ocupa o id de um evento real | `signature_valid` e check de nunca processar | CA-P4 |
| Só uma leitura vence | Índice único parcial `checkins (ticket_id) where result = 'valido'` | CA-25 |
| `paid_at` original nunca muda | Trigger `orders_paid_at_immutable` | Cl. 6.3, CA-29 |
| Histórico não se apaga | Trigger `forbid_delete` em pedidos, itens, ingressos, entradas, webhooks, eventos, tipos, usuários e promoters | Seção 6.2 |
| Auditoria não se altera | Triggers em `audit_log` | RF-62 |
| Item de pedido e ingresso sempre do mesmo evento | Chaves estrangeiras compostas com `event_id` | RF-14 |
| Dois promoters não repetem código | Índice único | CA-10 |

## Estados que a documentação não lista

Resolvem as lacunas 1, 2, 4, 5 e 7 de `registros/divergencias.md`.

- `orders.status` acrescenta `nao_concluido` (CA-P2), `contestado` e `pago_sem_estoque` (seção 10.1).
- `checkins.result` acrescenta `cancelado` (RF-48) e `outro_evento` (RF-54). Falha de conexão não gera registro, porque não há resposta do servidor.
- `tickets.qr_key_version` permite rotacionar a chave HMAC sem invalidar ingressos emitidos.
- `tickets.cancelled_at` e `cancel_reason` guardam o cancelamento. Autor e valores anteriores ficam no `audit_log`.
- "Em emissão" é pedido pago sem ingressos, e não um estado de ingresso.

## Decisões deste prompt que mudam a documentação

1. **`tickets.short_code`** (acréscimo). A documentação pede `code` aleatório de pelo menos 128 bits e busca manual por código (RF-52). Um segredo de 22 caracteres não serve para digitar. O código curto `PX-7K4M-2Q9D` (40 bits) é só para exibir e buscar. **Não é credencial**: validar entrada exige o QR assinado. Pendente de confirmação como D-20.
2. **`payment_events.gateway_event_id`** é único só entre eventos com assinatura válida. A documentação o declara único sem ressalva, mas isso deixaria um evento forjado bloquear o evento real com o mesmo id.
3. **Peculiaridade do Drizzle**: chaves estrangeiras são criadas antes dos índices. Alvos de chave estrangeira composta precisam ser `unique()` de tabela, não `uniqueIndex()`. Os testes pegaram isso na primeira execução.

## Migrações

| Arquivo | Conteúdo |
|---|---|
| `drizzle/0000_schema_inicial.sql` | Tipos, sequência, 16 tabelas, índices e checks. Gerada por `npm run db:generate`. |
| `drizzle/0001_regras_de_integridade.sql` | Funções e triggers. SQL escrito à mão (migração custom). |
| `drizzle/rollback/*.down.sql` | Reversão de cada migração. O Drizzle não gera reversão. |

```bash
npm run db:generate                          # depois de mudar server/src/db/schema
npm run db:migrate                           # aplica o que falta, com lock; usa DATABASE_URL_DIRECT
npm run db:rollback -- 0001_regras_de_integridade   # reverte só a ÚLTIMA aplicada; bloqueado em produção
npm run db:check                             # testa a conexão pooled e a direta (sem imprimir URL)
```

- A migração usa a conexão **direta** do Neon. A aplicação usa a **pooled**.
- Em produção, aplicar com `node dist-server/migrate.js` num job de deploy, **antes** de subir a nova revisão e com backup recente. A imagem contém `drizzle/`.
- Reverter `0000` apaga todos os dados. O script recusa reverter fora de ordem.

## Testes

```bash
npm run db:test:up     # PostgreSQL 16 descartável em Docker, porta 55432, em memória
npm run test:db        # 60 testes, 38 deles contra o banco
npm test               # sem banco: os 38 testes de integração são pulados
npm run db:test:down
```

Cada arquivo de teste cria um banco novo, aplica as migrações e o remove no fim.

## O que não foi verificado

- **Neon real**: não havia conta nem URL. Conexão pooled e direta, limites do plano, SSL e janela de restauração **não foram testados**. Rodar `npm run db:check` com as URLs do Neon.
- **Backup**: nenhuma retenção foi assumida. A janela real do plano do Neon e o backup independente de 7 dias são do Prompt 25.
- **Carga e concorrência**: as garantias de estoque (CA-16) exigem `SELECT ... FOR UPDATE` e testes paralelos. Entram no Prompt 09 e no Prompt 21. Este prompt entrega só a estrutura.

## 0009: menores de idade (14/10/2026, D-85)

| Onde | O quê | Regra no banco |
|---|---|---|
| `users.birth_date` | Data de nascimento (AAAA-MM-DD) | Anulável (contas antigas); não antes de 1900. O mínimo de 16 anos é da aplicação |
| `events.ends_at`, `allows_minors`, `judicial_authorization` | Fim, "permite menores de 16 e 17" e o número da autorização judicial | Fim depois do início; permitir menores exige fim e autorização |
| `orders.buyer_minor` | Comprador com 16 ou 17 anos na data do evento (retrato da compra) | Padrão `false`; refeito se a PartyX corrigir a data |
| `minor_term_acceptances` | Aceite do Termo de Ciência: pedido, versão, idade, data, IP, navegador | Um por pedido; idade 16 ou 17; sem DELETE (prova) |
| `checkins.minor_authorization_received` | Escolha do validador num pedido de comprador menor: `true` (menor com a autorização) ou `false` (18+) | Só em entrada válida |

Reversão (`rollback/0009...down.sql`) recusa se já houver aceite de menor ou confirmação na portaria. No banco de **teste**, `users.birth_date` ganha o padrão 1990-01-01 só para as fixtures antigas (`db/testing.ts`); produção não tem padrão.
