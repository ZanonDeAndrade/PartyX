import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { createFakeClock } from '../providers/clock';
import { GatewayRejectedError } from './gateway';
import { createGateway } from './index';
import { createMockGateway, MOCK_ACCOUNT_ID } from './mockGateway';

const clock = createFakeClock('2026-10-10T15:00:00Z');
const pixInput = (over: Record<string, unknown> = {}) => ({
  orderId: 'ped-1',
  amountCents: 16000,
  payer: { name: 'Ana Teste', email: 'ana@partyx.test', cpf: '12345678909' },
  description: 'Pedido de teste',
  idempotencyKey: 'order:ped-1:pix',
  expiresAt: new Date('2026-10-10T15:10:00Z'),
  ...over,
});

describe('adaptador fictício', () => {
  it('cria Pix com copia e cola e a referência do pedido, em BRL e na conta da PartyX', async () => {
    const g = createMockGateway(clock);
    const created = await g.createPix(pixInput());
    expect(created.snapshot).toMatchObject({
      status: 'pendente',
      method: 'pix',
      orderRef: 'ped-1',
      amountCents: 16000,
      currency: 'BRL',
      accountId: MOCK_ACCOUNT_ID,
    });
    expect(created.snapshot.pix?.copyPaste.length).toBeGreaterThan(20);
  });
  it('a mesma chave de idempotência devolve a mesma cobrança', async () => {
    const g = createMockGateway(clock);
    const a = await g.createPix(pixInput());
    const b = await g.createPix(pixInput());
    expect(b.gatewayPaymentId).toBe(a.gatewayPaymentId);
    expect(g.simulate.all()).toHaveLength(1);
    const c = await g.createPix(pixInput({ idempotencyKey: 'order:ped-2:pix', orderId: 'ped-2' }));
    expect(c.gatewayPaymentId).not.toBe(a.gatewayPaymentId);
  });
  it('recusa valor inválido e número de cartão no lugar do token', async () => {
    const g = createMockGateway(clock);
    for (const amountCents of [0, -5, 10.5])
      await expect(g.createPix(pixInput({ amountCents }))).rejects.toBeInstanceOf(GatewayRejectedError);
    await expect(
      g.createCard({ ...pixInput(), mode: 'token', cardToken: '4111 1111 1111 1111', installments: 1 } as never),
    ).rejects.toMatchObject({ reason: 'numero_de_cartao_nao_aceito' });
  });
  it('reconsulta mostra o estado atual e o que foi alterado na origem', async () => {
    const g = createMockGateway(clock);
    const { gatewayPaymentId } = await g.createPix(pixInput());
    g.simulate.setStatus(gatewayPaymentId, 'aprovado');
    expect(await g.getPayment(gatewayPaymentId)).toMatchObject({ status: 'aprovado', paidAt: clock.now() });
    g.simulate.tamper(gatewayPaymentId, { amountCents: 1 });
    expect((await g.getPayment(gatewayPaymentId)).amountCents).toBe(1);
    await expect(g.getPayment('inexistente')).rejects.toBeInstanceOf(GatewayRejectedError);
  });

  describe('autenticação de notificações', () => {
    const body = JSON.stringify({ id: 'evt-1', paymentId: 'pay-1', type: 'payment.approved' });
    const check = (g: ReturnType<typeof createMockGateway>, headers: Record<string, string>, raw = body) =>
      g.verifyNotification({ headers: new Headers(headers), rawBody: raw, query: new URLSearchParams() });

    it('aceita a assinatura correta e extrai evento, pagamento e tipo', async () => {
      const g = createMockGateway(clock);
      expect(await check(g, { 'x-mock-signature': g.simulate.sign(body) })).toEqual({
        valid: true,
        eventId: 'evt-1',
        type: 'payment.approved',
        subject: { kind: 'payment', id: 'pay-1' },
      });
    });
    it('recusa sem assinatura, mal formada, de outra instância, com corpo alterado e vencida', async () => {
      const g = createMockGateway(clock);
      const other = createMockGateway(clock);
      expect(await check(g, {})).toEqual({ valid: false, reason: 'assinatura_ausente' });
      expect(await check(g, { 'x-mock-signature': 'lixo' })).toEqual({ valid: false, reason: 'formato_invalido' });
      expect(await check(g, { 'x-mock-signature': other.simulate.sign(body) })).toEqual({
        valid: false,
        reason: 'assinatura_invalida',
      });
      expect(await check(g, { 'x-mock-signature': g.simulate.sign(body) }, body.replace('pay-1', 'pay-2'))).toEqual({
        valid: false,
        reason: 'assinatura_invalida',
      });
      const old = Math.floor(clock.now().getTime() / 1000) - 3600;
      expect(await check(g, { 'x-mock-signature': g.simulate.sign(body, old) })).toEqual({
        valid: false,
        reason: 'fora_do_prazo',
      });
    });
    it('assinatura certa com corpo sem os campos é formato inválido, não evento', async () => {
      const g = createMockGateway(clock);
      const raw = '{"id":"x"}';
      expect(await check(g, { 'x-mock-signature': g.simulate.sign(raw) }, raw)).toEqual({
        valid: false,
        reason: 'formato_invalido',
      });
    });
    it('cada instância tem chave própria: não há segredo conhecido no código', async () => {
      const a = createMockGateway(clock);
      const b = createMockGateway(clock);
      expect(a.simulate.sign(body, 1)).not.toBe(b.simulate.sign(body, 1));
    });
  });
});

describe('escolha do gateway pela configuração (mock só no local)', () => {
  const cloud = {
    PUBLIC_BASE_URL: 'https://partyx.example.com',
    DATABASE_URL: 'postgres://x',
    SESSION_SECRET: 's'.repeat(40),
    QR_HMAC_KEYS: `1:${randomBytes(32).toString('base64url')}`,
    TURNSTILE_SECRET: 'segredo-turnstile-teste',
    TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
  };
  it('local usa o fictício por padrão; homologação e produção, nenhum', () => {
    expect(loadConfig({}).PAYMENT_GATEWAY).toBe('mock');
    expect(loadConfig({ APP_ENV: 'homologacao', ...cloud }).PAYMENT_GATEWAY).toBe('none');
    expect(loadConfig({ APP_ENV: 'producao', ...cloud }).PAYMENT_GATEWAY).toBe('none');
  });
  it('configurar o fictício em homologação ou produção impede o servidor de subir', () => {
    for (const APP_ENV of ['homologacao', 'producao']) {
      expect(() => loadConfig({ APP_ENV, PAYMENT_GATEWAY: 'mock', ...cloud })).toThrow(
        /gateway fictício só pode ser usado no ambiente local/,
      );
    }
    expect(loadConfig({ PAYMENT_GATEWAY: 'mock' }).PAYMENT_GATEWAY).toBe('mock');
  });
  it('homologação libera o fictício SÓ com a variável explícita; produção nunca, com ou sem ela', () => {
    const hml = { APP_ENV: 'homologacao', PAYMENT_GATEWAY: 'mock', ...cloud };
    expect(() => loadConfig(hml)).toThrow(/HOMOLOGACAO_GATEWAY_FICTICIO=true/);
    expect(() => loadConfig({ ...hml, HOMOLOGACAO_GATEWAY_FICTICIO: 'false' })).toThrow(
      /só pode ser usado no ambiente local/,
    );
    const ok = loadConfig({ ...hml, HOMOLOGACAO_GATEWAY_FICTICIO: 'true' });
    expect([ok.PAYMENT_GATEWAY, ok.mockGatewayInHomologacao]).toEqual(['mock', true]);
    // Em produção a configuração recusa o fictício e recusa a própria variável.
    expect(() => loadConfig({ ...hml, APP_ENV: 'producao', HOMOLOGACAO_GATEWAY_FICTICIO: 'true' })).toThrow(
      /gateway fictício só pode ser usado/s,
    );
    expect(() =>
      loadConfig({ APP_ENV: 'producao', HOMOLOGACAO_GATEWAY_FICTICIO: 'true', PAYMENT_GATEWAY: 'none', ...cloud }),
    ).toThrow(/só existe em homologação/);
    expect(() => loadConfig({ HOMOLOGACAO_GATEWAY_FICTICIO: 'true' })).toThrow(/só existe em homologação/); // nem no local
    // Sem a escolha do gateway, homologação continua sem gateway.
    expect(loadConfig({ APP_ENV: 'homologacao', HOMOLOGACAO_GATEWAY_FICTICIO: 'true', ...cloud }).PAYMENT_GATEWAY).toBe(
      'none',
    );
  });
  it('a fábrica também recusa: homologação só com o aval, produção nunca', () => {
    expect(() => createGateway({ APP_ENV: 'homologacao', PAYMENT_GATEWAY: 'mock' }, clock)).toThrow(
      /só pode ser usado no ambiente local/,
    );
    expect(
      createGateway({ APP_ENV: 'homologacao', PAYMENT_GATEWAY: 'mock', mockGatewayInHomologacao: true }, clock),
    ).toBeDefined();
    expect(() =>
      createGateway({ APP_ENV: 'producao', PAYMENT_GATEWAY: 'mock', mockGatewayInHomologacao: true }, clock),
    ).toThrow(/só pode ser usado no ambiente local/);
  });
  it('mesmo sem passar pela configuração, a fábrica recusa o fictício fora do local', () => {
    for (const APP_ENV of ['homologacao', 'producao'] as const) {
      expect(() => createGateway({ APP_ENV, PAYMENT_GATEWAY: 'mock' }, clock)).toThrow(
        /só pode ser usado no ambiente local/,
      );
    }
    expect(createGateway({ APP_ENV: 'local', PAYMENT_GATEWAY: 'mock' }, clock)?.capabilities.providerId).toBe('mock');
    expect(createGateway({ APP_ENV: 'producao', PAYMENT_GATEWAY: 'none' }, clock)).toBeUndefined();
  });
  it('valor desconhecido de gateway é recusado', () => {
    expect(() => loadConfig({ PAYMENT_GATEWAY: 'mercadopago' })).toThrow();
  });
});
