-- Invariantes do PartyX que nunca podem quebrar, como consultas SÓ LEITURA (sem INSERT, UPDATE, DELETE).
-- Cada consulta devolve as linhas que VIOLAM a regra: o resultado esperado é sempre vazio (0 linhas).
-- Uso em produção: node auditoria/ferramentas/invariantes.mjs "<URL do papel partyx_backup, só leitura>"
-- Uso local:        node auditoria/ferramentas/invariantes.mjs "$TEST_DATABASE_URL"

-- @nome 1. Ingressos emitidos (não cancelados) nunca acima da capacidade do tipo
select tt.id as ticket_type_id, tt.name, tt.quantity_total, count(t.id) as emitidos_validos
  from ticket_types tt join tickets t on t.ticket_type_id = tt.id and t.status <> 'cancelado'
 group by tt.id, tt.name, tt.quantity_total
having count(t.id) > tt.quantity_total;

-- @nome 2. Vendidos registrados no tipo nunca acima da capacidade
select id as ticket_type_id, name, quantity_total, quantity_sold
  from ticket_types
 where quantity_sold > quantity_total or quantity_sold < 0;

-- @nome 3. Vendidos mais reservas ativas dentro do prazo nunca acima da capacidade
select tt.id as ticket_type_id, tt.name, tt.quantity_total, tt.quantity_sold,
       coalesce(sum(r.quantity) filter (where r.status = 'ativa' and r.expires_at > now()), 0) as reservados
  from ticket_types tt left join reservations r on r.ticket_type_id = tt.id
 group by tt.id, tt.name, tt.quantity_total, tt.quantity_sold
having tt.quantity_sold + coalesce(sum(r.quantity) filter (where r.status = 'ativa' and r.expires_at > now()), 0) > tt.quantity_total;

-- @nome 4. Todo pedido pago tem exatamente a quantidade de ingressos comprada
select o.id as order_id, o.number, o.status, sum(oi.quantity) as comprados, (select count(*) from tickets t where t.order_id = o.id) as emitidos
  from orders o join order_items oi on oi.order_id = o.id
 where o.status in ('pago', 'estornado', 'contestado')
 group by o.id, o.number, o.status
having sum(oi.quantity) <> (select count(*) from tickets t where t.order_id = o.id);

-- @nome 5. Nenhum ingresso de pedido que nunca foi pago
select t.id as ticket_id, o.number, o.status
  from tickets t join orders o on o.id = t.order_id
 where o.paid_at is null or o.status in ('pendente', 'expirado', 'nao_concluido', 'cancelado');

-- @nome 6. Nenhum QR, código ou código curto duplicado
select 'qr_payload' as campo, qr_payload as valor, count(*) from tickets group by qr_payload having count(*) > 1
union all
select 'code', code, count(*) from tickets group by code having count(*) > 1
union all
select 'short_code', short_code, count(*) from tickets group by short_code having count(*) > 1;

-- @nome 7. Nenhuma entrada válida duplicada por ingresso (uma primeira entrada só)
select ticket_id, count(*) as entradas_validas
  from checkins
 where result = 'valido'
 group by ticket_id
having count(*) > 1;

-- @nome 8. Ingresso utilizado tem exatamente uma entrada válida; ingresso válido não tem entrada válida
select t.id as ticket_id, t.status, t.used_at, (select count(*) from checkins c where c.ticket_id = t.id and c.result = 'valido') as entradas_validas
  from tickets t
 where (t.status = 'utilizado' and (select count(*) from checkins c where c.ticket_id = t.id and c.result = 'valido') <> 1)
    or (t.status = 'valido' and (select count(*) from checkins c where c.ticket_id = t.id and c.result = 'valido') > 0);

-- @nome 9. Vendidos do tipo iguais aos ingressos emitidos (inclusive cancelados, que não devolvem estoque)
select tt.id as ticket_type_id, tt.name, tt.quantity_sold, (select count(*) from tickets t where t.ticket_type_id = tt.id) as emitidos
  from ticket_types tt
 where tt.quantity_sold <> (select count(*) from tickets t where t.ticket_type_id = tt.id);

-- @nome 10. Lotes: soma das quantidades dos lotes igual à capacidade do tipo, e vendidos do lote dentro do lote
select tt.id as ticket_type_id, tt.name, tt.quantity_total, sum(l.quantity) as soma_lotes, max(case when l.quantity_sold > l.quantity then 1 else 0 end) as lote_estourado
  from ticket_types tt join ticket_lots l on l.ticket_type_id = tt.id
 group by tt.id, tt.name, tt.quantity_total
having sum(l.quantity) <> tt.quantity_total or max(case when l.quantity_sold > l.quantity then 1 else 0 end) = 1;

-- @nome 11. Total do pedido igual aos itens mais a taxa de serviço
select o.id as order_id, o.number, o.total_cents, o.service_fee_cents, sum(oi.quantity * oi.unit_price_cents) as itens
  from orders o join order_items oi on oi.order_id = o.id
 group by o.id, o.number, o.total_cents, o.service_fee_cents
having o.total_cents <> sum(oi.quantity * oi.unit_price_cents) + o.service_fee_cents;

-- @nome 12. Notificação do gateway processada só uma vez por id de evento
select gateway_event_id, count(*) from payment_events where gateway_event_id is not null group by gateway_event_id having count(*) > 1;

-- @nome 13. Reserva ativa só em pedido pendente
select r.id as reservation_id, o.number, o.status
  from reservations r join orders o on o.id = r.order_id
 where r.status = 'ativa' and o.status <> 'pendente';

-- @nome 14. Ingresso transferido sempre com titular existente e ativo (ou anonimizado)
select t.id as ticket_id, t.holder_user_id
  from tickets t left join users u on u.id = t.holder_user_id
 where u.id is null;
