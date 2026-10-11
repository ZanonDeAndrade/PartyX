import { Client, seed, cpfFor } from './lib.mjs'; import { writeFileSync } from 'node:fs';
const c = new Client(); const lv = (await c.get('/api/legal/versions')).json; const email = `compat${Date.now()}@exemplo.com`;
await c.post('/api/auth/register', { name: 'Compat Ficticio', email, cpf: cpfFor(800001), phone: '11987654321', password: 'festa2026Forte!', acceptedTermsVersion: lv.terms, acceptedPrivacyVersion: lv.privacy, accept: true });
c.csrf = (await c.get('/api/auth/me')).json.csrfToken;
const o = (await c.post('/api/orders', { eventSlug: seed.slug, items: [{ ticketTypeId: seed.pista, quantity: 2 }] })).json.order; await c.post(`/api/orders/${o.id}/payment`, { method: 'pix' }); await c.post(`/api/dev/mock-gateway/${o.id}/aprovado`);
const tk = (await c.get('/api/tickets')).json.tickets;
writeFileSync(process.env.SP + '/fixture.json', JSON.stringify({ email, orderId: o.id, ticketId: tk[0].id }));
console.log(email, o.id, tk[0].id);
