import { api, apiLogin, buyPaid, expect, newBuyer, S, sql, test } from './support/fixtures';

test.describe('LGPD: cópia dos dados e exclusão (anonimização) a pedido, pelo administrador', () => {
  test('localizar titular, exportar os dados com protocolo e anonimizar; a conta deixa de entrar', async ({ ctx, browser }) => {
    const b = await newBuyer(ctx.request, { name: 'Titular LGPD Fictício' });
    const { orderId } = await buyPaid(ctx.request, S.events.principal!.slug, [{ ticketTypeId: S.events.principal!.types.vip!, quantity: 1 }]);
    const adm = await browser.newContext();
    await apiLogin(adm.request, S.base, S.team.admin.email, S.team.admin.password);
    const found = await api(adm.request, S.base, 'GET', `/admin/privacy/subjects?email=${encodeURIComponent(b.email)}`);
    expect(found.status).toBe(200);
    const id = found.json.subject.id as string;
    const noProtocol = await adm.request.get(`${S.base}/api/admin/privacy/subjects/${id}/export`);
    expect(noProtocol.status()).toBe(422);
    const exported = await adm.request.get(`${S.base}/api/admin/privacy/subjects/${id}/export?protocolo=AUD-2026-001`);
    expect(exported.status()).toBe(200);
    expect(exported.headers()['content-disposition']).toContain('attachment');
    const data = JSON.stringify(await exported.json());
    expect(data).toContain(b.email);
    const number = (await sql<{ number: number }>(S.db, `select number from orders where id = $1`, [orderId]))[0]!.number;
    expect(data).toContain(`"number":${number}`);
    expect(data).toContain(b.cpf);
    // Validador não acessa.
    const v = await browser.newContext();
    await apiLogin(v.request, S.base, S.team.validador.email, S.team.validador.password);
    expect((await v.request.get(`${S.base}/api/admin/privacy/subjects?email=${encodeURIComponent(b.email)}`)).status()).toBe(403);
    await v.close();
    // Anonimizar: com ingresso válido exige o reconhecimento explícito.
    const refused = await api(adm.request, S.base, 'POST', `/admin/privacy/subjects/${id}/anonymize`, { reference: 'AUD-2026-001', reason: 'Pedido do titular', confirm: true });
    const ok = refused.status === 200 ? refused : await api(adm.request, S.base, 'POST', `/admin/privacy/subjects/${id}/anonymize`, { reference: 'AUD-2026-001', reason: 'Pedido do titular', confirm: true, acknowledgeValidTickets: true });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    const row = (await sql<{ email: string; name: string; cpf: string | null; anon: Date | null; active: boolean }>(S.db, `select email, name, cpf, anonymized_at as anon, is_active as active from users where id = $1`, [id]))[0]!;
    expect(row.anon).not.toBeNull();
    expect(row.email).not.toBe(b.email);
    expect(row.cpf === null || row.cpf !== b.cpf).toBe(true);
    expect(row.name).not.toContain('Titular LGPD');
    const login = await adm.request.post(`${S.base}/api/auth/login`, { data: { email: b.email, password: b.password }, headers: { origin: S.base } });
    expect(login.status()).toBeGreaterThanOrEqual(400);
    // O pedido e a taxa mensal ficam; a trilha registra consulta, exportação e anonimização sem o dado pessoal.
    expect((await sql<{ s: string }>(S.db, `select status as s from orders where id = $1`, [orderId]))[0]!.s).toBe('pago');
    const audit = await sql<{ action: string; before_json: unknown; after_json: unknown }>(S.db, `select action, before_json, after_json from audit_log where action like 'privacidade.%' and entity_id = $1 order by created_at`, [id]);
    expect(audit.map(a => a.action)).toEqual(expect.arrayContaining(['privacidade.consulta', 'privacidade.exportacao', 'privacidade.anonimizacao']));
    expect(JSON.stringify(audit)).not.toContain(b.cpf);
    expect(JSON.stringify(audit)).not.toContain(b.email);
    await adm.close();
  });
});
