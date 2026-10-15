# Modelo de dados

Atualizado em 01/10/2026 (Prompt 03). Código em `server/src/db/schema/`; migrações em `drizzle/`.

## Entidades

14 tabelas da seção 6.1 da documentação, mais 2 técnicas.

| Tabela | Finalidade | Observações |
|---|---|---|
| `users` | Todos os logins | E-mail minúsculo e único. CPF só dígitos, único, obrigatório para cliente. `must_change_password` cobre o primeiro acesso (ADM22). |
| `password_resets` | Recuperação de senha | Guarda só o hash do token. Uso único e validade de 1 hora. |
| `consents` | Aceite de Termos e Privacidade | Versão, data, IP e navegador. |
| `events` | Eventos | Só o evento **sem uso** (nenhum pedido, em qualquer situação, e nenhuma leitura de portaria) pode ser apagado, com os tipos dele (0011); o evento com uso é arquivado (`archived_at`). `slug` único e em minúsculas. |
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
| Histórico não se apaga | Trigger `forbid_delete` em pedidos, itens, ingressos, entradas, webhooks, usuários e promoters. Eventos e tipos: `events_delete_only_unused` e `ticket_types_delete_only_unused` (0011) recusam a exclusão quando o evento tem pedido ou leitura de portaria; as chaves estrangeiras recusam o resto | Seção 6.2; exclusão de evento sem uso de 15/10/2026 |
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
| `events.ends_at`, `allows_minors`, `judicial_authorization` | Fim, "permite menores de 16 e 17" e o número da autorização judicial (**sem uso desde a 0010**, 14/10/2026: a coluna ficou só para não apagar dado) | Fim depois do início; permitir menores exige fim (`events_minors_need_end`; até a 0009, também a autorização) |
| `orders.buyer_minor` | Comprador com 16 ou 17 anos na data do evento (retrato da compra) | Padrão `false`; refeito se a PartyX corrigir a data |
| `events.archived_at` (0011, 15/10/2026) | Evento arquivado pelo administrador: fora da vitrine, da busca, do link público e da lista padrão do painel, sem compra nova; histórico, portaria, relatórios e exportações continuam | Anulável (nulo = não arquivado). A reversão recusa se houver evento arquivado. O `partyx_app` tem DELETE em `events` e `ticket_types` desde a 0011, contido pelos gatilhos acima |
| `events.countdown_enabled`, `countdown_phrase` (0012, 15/10/2026) | Cronômetro na página do evento até o início (ligado por padrão). **`countdown_phrase` está sem uso desde 15/10/2026** (a frase acima do nome saiu da página e do painel); a coluna e a regra `events_countdown_phrase_format` ficam até uma **limpeza futura**, com migração própria de remoção | `countdown_enabled` padrão `true`; frase nula ou de 1 a 40 caracteres, sem `<` nem `>` (`events_countdown_phrase_format`) |
| `ticket_lots` (0013, 15/10/2026) | Lotes de cada tipo, em ordem: nome, preço, quantidade, início e fim opcionais, regra da sobra (passar ou descartar), situação (aguardando, à venda, encerrado) e motivo (esgotado, data, manual); recebidos, passados adiante, descartados e vendidos | Um à venda por tipo (índice único parcial); preço e quantidade maiores que zero; encerrado com data e motivo. O partyx_app pode apagar só lote que nenhum pedido usou (chaves estrangeiras) |
| `order_item_lots` (0013) | De que lote saíram as unidades de cada item do pedido, e por qual preço (a compra se divide quando o lote à venda não basta) | Chaves compostas: o lote é do mesmo tipo do item; sem DELETE (histórico) |
| `tickets.lot_id`, `ticket_types.last_units_notice` (0013) | Lote de onde saiu cada ingresso; aviso "Últimas unidades deste lote" por tipo | `lot_id` anulável só em ingresso anterior aos lotes; chave composta com o tipo |
| `events.banner_placeholder` (0015, 15/10/2026) | Miniatura da capa (WebP de 48 px já desfocada, em `data:`) que aparece antes da capa nítida | Nula ou `data:image/webp;base64,…` com base64 válido, até 1.500 caracteres, e só com `banner_url` (`events_banner_placeholder_format`) |
| `events.accent_color` (0014, 15/10/2026) | Cor de destaque da página do evento (e do bloco da data no card da vitrine); nula: o roxo da PartyX. Os tons legíveis são calculados na página | Nula ou `#RRGGBB` em maiúsculas (`events_accent_color_format`) |
| `minor_term_acceptances` | Aceite do Termo de Ciência: pedido, versão, idade, data, IP, navegador | Um por pedido; idade 16 ou 17; sem DELETE (prova) |
| `tickets.holder_user_id`, `tickets.holder_minor` (0016, 15/10/2026) | Titular atual do ingresso (D-87): o comprador na emissão, quem recebeu depois de uma transferência; marca de menor do titular (nula: vale `orders.buyer_minor`) | `holder_user_id` NOT NULL, preenchido com o comprador pelo gatilho `tickets_holder_default` quando quem emite não informa (código anterior à 0016); o pedido continua do comprador |
| `ticket_transfers` (0016) | Cada troca de titular: de, para, quem fez, códigos curtos antigo e novo, resumo SHA-256 do código antigo (para a portaria reconhecer o QR antigo), data; o desfazer do administrador é uma linha nova com `reverts_id` e motivo | Só inclusão (gatilhos sem UPDATE e sem DELETE); contas diferentes; motivo obrigatório só no desfazer (5 a 500 caracteres) |
| `ticket_minor_acceptances` (0016) | Termo de Ciência aceito por quem recebeu o ingresso com 16 ou 17 anos | Um por transferência; sem DELETE (prova); anonimização limpa IP e navegador |
| `cancellation_acceptances` (0016) | Aceite da Política de Cancelamento, Troca e Reembolso no checkout: versão, data, IP, navegador e pedido (D-80 atualizada) | Um por pedido; sem DELETE (prova); anonimização limpa IP e navegador |
| `checkins.minor_authorization_received` | Escolha do validador num pedido de comprador menor: `true` (menor com a autorização) ou `false` (18+) | Só em entrada válida |

Reversão (`rollback/0009...down.sql`) recusa se já houver aceite de menor ou confirmação na portaria. No banco de **teste**, `users.birth_date` ganha o padrão 1990-01-01 só para as fixtures antigas (`db/testing.ts`); produção não tem padrão.
