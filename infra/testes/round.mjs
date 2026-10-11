import { Client, BASE, seed } from './lib.mjs';
const out = []; const ok = (name, cond, info = '') => { out.push({ name, ok: !!cond, info }); console.log(cond ? 'OK  ' : 'FALHA', name, info); };
const ev = (await new Client().get(`/api/public/events/${seed.slug}`)).json;
const types = (ev.event ?? ev).ticketTypes; const pista = types.find(t => t.name === 'Pista');
ok('vitrine mostra evento e tipos', pista?.canBuy);
const buyer = new Client(); await buyer.signup(1); ok('cadastro + sessão', true);
const quote = await buyer.post('/api/checkout/quote', { eventSlug: seed.slug, items: [{ ticketTypeId: pista.id, quantity: 3 }] });
ok('cotação 3 x R$ 80', quote.status === 200 && quote.json.summary.totalCents === 24000, JSON.stringify(quote.json?.summary?.totalCents));
const forged = await buyer.post('/api/orders', { eventSlug: seed.slug, items: [{ ticketTypeId: pista.id, quantity: 3 }], expectedTotalCents: 100 });
ok('total adulterado é recusado ou ignorado, nunca aceito a R$ 1', forged.status !== 201 || forged.json.order.totalCents === 24000, forged.status);
let order = forged.status === 201 ? forged.json.order : (await buyer.post('/api/orders', { eventSlug: seed.slug, items: [{ ticketTypeId: pista.id, quantity: 3 }] })).json.order;
ok('pedido pendente com total do servidor', order.totalCents === 24000 && order.status === 'pendente');
const pay = await buyer.post(`/api/orders/${order.id}/payment`, { method: 'pix' }); ok('Pix criado', pay.status === 201);
const card = await buyer.post(`/api/orders/${order.id}/payment`, { method: 'cartao', number: '4111111111111111', cvv: '123' }); ok('dados de cartão no corpo são recusados', card.status >= 400 && card.status < 500, card.status);
ok('sem ingresso antes de pagar', ((await buyer.get('/api/tickets')).json.tickets ?? []).length === 0);
const appr = await buyer.post(`/api/dev/mock-gateway/${order.id}/aprovado`); ok('webhook simulado confirma', appr.json?.outcome === 'confirmado', JSON.stringify(appr.json));
const tk = (await buyer.get('/api/tickets')).json.tickets; ok('3 ingressos emitidos', tk.length === 3);
const pdf = await buyer.get(`/api/orders/${order.id}/tickets/pdf`); ok('PDF do pedido', pdf.status === 200 && pdf.buf.subarray(0, 4).toString() === '%PDF', pdf.buf?.length);
const det = (await buyer.get(`/api/tickets/${tk[0].id}`)).json; const qr = (det.ticket ?? det).qrPayload ?? (det.ticket ?? det).qr;
ok('ingresso traz o conteúdo do QR', !!qr);
// isolamento
const other = new Client(); await other.signup(2);
ok('outro comprador não vê ingresso nem PDF alheio', (await other.get(`/api/tickets/${tk[0].id}`)).status === 404 && (await other.get(`/api/orders/${order.id}/tickets/pdf`)).status === 404);
// portaria
const val = new Client(); await val.login('validador@exemplo.com');
const s1 = await val.post('/api/gate/scan', { eventId: seed.eventId, qr }); const s2 = await val.post('/api/gate/scan', { eventId: seed.eventId, qr });
ok('portaria: verde e depois amarelo', s1.json.result === 'valido' && s2.json.result === 'ja_utilizado');
// cancelamento pelo admin
const qr2 = ((await buyer.get(`/api/tickets/${tk[1].id}`)).json); const q2 = (qr2.ticket ?? qr2).qrPayload ?? (qr2.ticket ?? qr2).qr;
const adm = new Client(); await adm.login('admin@exemplo.com');
const canc = await adm.post(`/api/admin/tickets/${tk[1].id}/cancel`, { reason: 'teste da rodada', confirm: true });
ok('administrador cancela ingresso', canc.status === 200, canc.status);
ok('portaria recusa o cancelado', (await val.post('/api/gate/scan', { eventId: seed.eventId, qr: q2 })).json.result === 'cancelado');
// recusa e expiração
const b2 = new Client(); await b2.signup(3);
const o2 = (await b2.post('/api/orders', { eventSlug: seed.slug, items: [{ ticketTypeId: pista.id, quantity: 1 }] })).json.order; await b2.post(`/api/orders/${o2.id}/payment`, { method: 'pix' });
ok('cartão/Pix recusado: sem ingresso', (await b2.post(`/api/dev/mock-gateway/${o2.id}/recusado`)).json.outcome === 'recusado' && ((await b2.get('/api/tickets')).json.tickets ?? []).length === 0);
const o3 = (await b2.post('/api/orders', { eventSlug: seed.slug, items: [{ ticketTypeId: pista.id, quantity: 1 }] })).json.order; await b2.post(`/api/orders/${o3.id}/payment`, { method: 'pix' });
ok('Pix vencido no gateway expira o pedido', (await b2.post(`/api/dev/mock-gateway/${o3.id}/expirado`)).json.outcome === 'expirado');
// relatórios e exportações
const month = new Date().toISOString().slice(0, 7);
const fee = await adm.get(`/api/admin/reports/fee?month=${month}`); ok('taxa do mês conta 3 ingressos (cancelado incluso) = R$ 3,00', fee.json.units === 3 && fee.json.feeCents === 300, JSON.stringify([fee.json.units, fee.json.feeCents]));
const sales = await adm.get('/api/admin/reports/sales'); ok('relatório de vendas', sales.status === 200);
const csv = await adm.get(`/api/admin/exports/events/${seed.eventId}/contingency.csv`); ok('CSV de contingência', csv.status === 200 && csv.buf.toString().includes('Comprador'));
const cpdf = await adm.get(`/api/admin/exports/events/${seed.eventId}/contingency.pdf`); ok('PDF de contingência', cpdf.status === 200);
// acesso indevido entre perfis
const probes = [['GET', '/api/admin/reports/fee'], ['GET', `/api/admin/exports/events/${seed.eventId}/contingency.csv`], ['GET', '/api/admin/team'], ['GET', '/api/admin/payments/exceptions'], ['POST', '/api/admin/tickets/' + tk[2].id + '/cancel']];
for (const [m, p] of probes) {
  const a = await val.req(m, p, m === 'POST' ? { reason: 'x', confirm: true } : undefined), c = await buyer.req(m, p, m === 'POST' ? { reason: 'x', confirm: true } : undefined), n = await new Client().req(m, p, m === 'POST' ? { reason: 'x', confirm: true } : undefined);
  ok(`${m} ${p.replace(/[0-9a-f-]{36}/, ':id')}: validador 403, cliente 403, anônimo 401`, a.status === 403 && c.status === 403 && n.status === 401, [a.status, c.status, n.status].join('/'));
}
ok('cliente não acessa a portaria', (await buyer.post('/api/gate/scan', { eventId: seed.eventId, qr })).status === 403);
console.log('\nRESUMO', out.filter(o => o.ok).length, 'ok de', out.length);
import { writeFileSync } from 'node:fs'; writeFileSync(process.env.SP + '/round.json', JSON.stringify(out, null, 1));
