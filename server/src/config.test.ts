import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const SECRET = 's'.repeat(40);
/** Chave de QR de teste (32 bytes em base64url), gerada na hora: nenhum segredo escrito no código. */
const QR = `1:${randomBytes(32).toString('base64url')}`;

describe('loadConfig', () => {
  it('usa padrões seguros em ambiente local sem banco', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ APP_ENV: 'local', PORT: 8080, DB_POOL_MAX: 5, WEB_DIST_DIR: 'dist' });
    expect(config.DATABASE_URL).toBeUndefined();
  });

  it('variável vazia vale como ausente (NOME= no .env)', () => {
    const config = loadConfig({
      TERMS_VERSION: '',
      LEGAL_CONTENT_DIR: '',
      CANCELLATION_VERSION: '',
      VISUAL_APPROVED: '',
    });
    expect(config.legalContentDir).toBeUndefined();
    expect(config.visualApproved).toBe(false);
    expect(config.legal.terms).toBe('ficticio-0');
  });

  it('converte PORT para número', () => {
    expect(loadConfig({ PORT: '3000' }).PORT).toBe(3000);
  });

  it('exige DATABASE_URL fora do ambiente local', () => {
    expect(() => loadConfig({ APP_ENV: 'homologacao' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ APP_ENV: 'producao' })).toThrow(/DATABASE_URL/);
    expect(
      loadConfig({ APP_ENV: 'homologacao', DATABASE_URL: 'postgres://x', SESSION_SECRET: SECRET, QR_HMAC_KEYS: QR })
        .APP_ENV,
    ).toBe('homologacao');
  });

  it('exige SESSION_SECRET fora do ambiente local e nunca aceita o segredo local em nuvem', () => {
    expect(() => loadConfig({ APP_ENV: 'homologacao', DATABASE_URL: 'postgres://x' })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ APP_ENV: 'homologacao', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'curto' })).toThrow(
      /SESSION_SECRET/,
    );
    expect(loadConfig({}).SESSION_SECRET.length).toBeGreaterThanOrEqual(32); // só local
  });

  it('textos legais: fictícios fora de produção, obrigatórios em produção', () => {
    expect(loadConfig({}).legal).toEqual({
      terms: 'ficticio-0',
      privacy: 'ficticio-0',
      ready: true,
      provisional: true,
    });
    const prod = {
      APP_ENV: 'producao',
      PUBLIC_BASE_URL: 'https://partyx.example.com',
      DATABASE_URL: 'postgres://x',
      SESSION_SECRET: SECRET,
      QR_HMAC_KEYS: QR,
      TURNSTILE_SECRET: 'segredo-turnstile-teste',
      TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
    };
    expect(loadConfig(prod).legal).toMatchObject({ ready: false });
    expect(loadConfig({ ...prod, TERMS_VERSION: 'v1' }).legal).toMatchObject({ ready: false });
    expect(loadConfig({ ...prod, TERMS_VERSION: 'v1', PRIVACY_VERSION: 'v1' }).legal).toEqual({
      terms: 'v1',
      privacy: 'v1',
      ready: true,
      provisional: false,
    });
  });

  it('recusa valores inválidos sem repetir o valor recebido', () => {
    const segredo = 'postgres://usuario:senha-super-secreta@host/db';
    try {
      loadConfig({ PORT: 'abc', APP_ENV: 'qualquer', DATABASE_URL: segredo });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/PORT/);
      expect(message).toMatch(/APP_ENV/);
      expect(message).not.toContain('senha-super-secreta');
    }
  });

  describe('reserva, limite e abertura das vendas', () => {
    const cloud = {
      PUBLIC_BASE_URL: 'https://partyx.example.com',
      DATABASE_URL: 'postgres://x',
      SESSION_SECRET: SECRET,
      QR_HMAC_KEYS: QR,
      TURNSTILE_SECRET: 'segredo-turnstile-teste',
      TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
    };
    it('padrões: reserva de 10 minutos e 6 ingressos por compra (premissas D-03 e D-05)', () => {
      expect(loadConfig({})).toMatchObject({ RESERVATION_MINUTES: 10, MAX_TICKETS_PER_ORDER: 6 });
    });
    it('aceita valores configurados e recusa fora da faixa', () => {
      expect(loadConfig({ RESERVATION_MINUTES: '15', MAX_TICKETS_PER_ORDER: '4' })).toMatchObject({
        RESERVATION_MINUTES: 15,
        MAX_TICKETS_PER_ORDER: 4,
      });
      for (const bad of [
        { RESERVATION_MINUTES: '0' },
        { RESERVATION_MINUTES: '61' },
        { MAX_TICKETS_PER_ORDER: '0' },
        { MAX_TICKETS_PER_ORDER: 'x' },
      ]) {
        expect(() => loadConfig(bad), JSON.stringify(bad)).toThrow();
      }
    });
    it('vendas abertas fora de produção; em produção ficam fechadas até SALES_OPEN=true', () => {
      expect(loadConfig({}).salesOpen).toBe(true);
      expect(loadConfig({ APP_ENV: 'homologacao', ...cloud }).salesOpen).toBe(true);
      expect(loadConfig({ APP_ENV: 'producao', ...cloud }).salesOpen).toBe(false);
      expect(loadConfig({ APP_ENV: 'producao', SALES_OPEN: 'true', ...cloud }).salesOpen).toBe(true);
      expect(loadConfig({ SALES_OPEN: 'false' }).salesOpen).toBe(false);
      expect(() => loadConfig({ SALES_OPEN: 'talvez' })).toThrow();
    });
  });

  describe('chaves do QR dos ingressos', () => {
    const cloud = { APP_ENV: 'homologacao', DATABASE_URL: 'postgres://x', SESSION_SECRET: SECRET };
    const key = () => randomBytes(32).toString('base64url');
    it('local: chave derivada e estável entre reinícios, para o ingresso de desenvolvimento continuar valendo', () => {
      const a = loadConfig({});
      const b = loadConfig({});
      expect(a.qr.currentVersion).toBe(1);
      expect(a.qr.keys.get(1)!.equals(b.qr.keys.get(1)!)).toBe(true);
      expect(a.qr.keys.get(1)!.length).toBeGreaterThanOrEqual(32);
    });
    it('fora do local a variável é obrigatória e nada é derivado', () => {
      expect(() => loadConfig(cloud)).toThrow(/QR_HMAC_KEYS/);
      expect(() => loadConfig({ ...cloud, APP_ENV: 'producao' })).toThrow(/QR_HMAC_KEYS/);
    });
    it('a versão atual é a maior, ou a escolhida, e precisa existir', () => {
      expect(loadConfig({ ...cloud, QR_HMAC_KEYS: `1:${key()},2:${key()}` }).qr.currentVersion).toBe(2);
      expect(
        loadConfig({ ...cloud, QR_HMAC_KEYS: `1:${key()},2:${key()}`, QR_HMAC_CURRENT: '1' }).qr.currentVersion,
      ).toBe(1);
      expect(() => loadConfig({ ...cloud, QR_HMAC_KEYS: `1:${key()}`, QR_HMAC_CURRENT: '3' })).toThrow(/versão atual/);
    });
    it('recusa chave curta sem repetir o valor na mensagem', () => {
      const weak = randomBytes(8).toString('base64url');
      try {
        loadConfig({ ...cloud, QR_HMAC_KEYS: `1:${weak}` });
        throw new Error('deveria falhar');
      } catch (e) {
        expect((e as Error).message).toMatch(/32 bytes/);
        expect((e as Error).message).not.toContain(weak);
      }
    });
    it('a configuração pronta não expõe o texto das chaves de entrada', () => {
      const c = loadConfig({ ...cloud, QR_HMAC_KEYS: `1:${key()}` }) as unknown as Record<string, unknown>;
      expect(c).not.toHaveProperty('QR_HMAC_KEYS');
    });
  });

  describe('e-mail', () => {
    it('SMTP_URL exige remetente; remetente precisa ser um endereço', () => {
      expect(() => loadConfig({ SMTP_URL: 'smtp://x' })).toThrow(/EMAIL_FROM/);
      expect(
        loadConfig({ SMTP_URL: 'smtp://x', EMAIL_FROM: 'PartyX <ingressos@partyx.exemplo.test>' }).EMAIL_FROM,
      ).toContain('ingressos@');
      expect(loadConfig({ EMAIL_FROM: 'ingressos@partyx.exemplo.test' }).EMAIL_FROM).toBeDefined();
      for (const bad of ['sem-arroba', 'a@b', 'x@y.com\r\nBcc: z@z.com'])
        expect(() => loadConfig({ EMAIL_FROM: bad }), bad).toThrow();
    });
    it('a URL do SMTP (segredo) não aparece na mensagem de erro', () => {
      const url = 'smtps://usuario:senha-super-secreta@host:465';
      try {
        loadConfig({ SMTP_URL: url });
      } catch (e) {
        expect((e as Error).message).not.toContain('senha-super-secreta');
      }
    });
  });

  describe('conciliação sob demanda (Cloud Tasks)', () => {
    it('fila no formato do Cloud Tasks; contas de serviço como lista de e-mails', () => {
      const ok = loadConfig({
        TASKS_QUEUE: 'projects/partyx-prod/locations/southamerica-east1/queues/partyx-conciliacao',
        TASKS_INVOKER_EMAIL: 'partyx-tasks@partyx-prod.iam.gserviceaccount.com',
        JOBS_CALLER_EMAIL: 'a@p.iam.gserviceaccount.com, b@p.iam.gserviceaccount.com',
      });
      expect(ok.TASKS_QUEUE).toContain('queues/partyx-conciliacao');
      for (const bad of ['partyx-conciliacao', 'projects/p/locations/l', 'projects/p/locations/l/queues/']) {
        expect(() => loadConfig({ TASKS_QUEUE: bad }), bad).toThrow(/TASKS_QUEUE/);
      }
      expect(() => loadConfig({ JOBS_CALLER_EMAIL: 'a@p.com, nao-e-email' })).toThrow(/JOBS_CALLER_EMAIL/);
    });
  });

  describe('verificação humana (Turnstile): opcional, desligada por padrão', () => {
    const keys = { TURNSTILE_SECRET: 'segredo-longo-123', TURNSTILE_SITE_KEY: '0x4AAAAAAAchave123' };
    const prod = {
      APP_ENV: 'producao',
      PUBLIC_BASE_URL: 'https://partyx.example.com',
      DATABASE_URL: 'postgres://u:p@h/db',
      SESSION_SECRET: 'a'.repeat(40),
      QR_HMAC_KEYS: `1:${Buffer.alloc(48, 1).toString('base64url')}`,
    };
    it('desligada (padrão): PRODUÇÃO sobe sem nenhuma chave; as chaves, se existirem, são ignoradas e não saem da configuração', () => {
      const off = loadConfig(prod);
      expect([off.turnstileEnabled, off.TURNSTILE_SECRET, off.TURNSTILE_SITE_KEY]).toEqual([
        false,
        undefined,
        undefined,
      ]);
      const ignored = loadConfig({ ...prod, ...keys });
      expect([ignored.turnstileEnabled, ignored.TURNSTILE_SECRET, ignored.TURNSTILE_SITE_KEY]).toEqual([
        false,
        undefined,
        undefined,
      ]);
      expect(loadConfig({ ...prod, ...keys, TURNSTILE_ENABLED: 'false' }).TURNSTILE_SECRET).toBeUndefined();
    });
    it('ligada (TURNSTILE_ENABLED=true): exige as DUAS chaves, em qualquer ambiente', () => {
      expect(() => loadConfig({ ...prod, TURNSTILE_ENABLED: 'true' })).toThrow(
        /TURNSTILE_SECRET.*obrigatória com TURNSTILE_ENABLED=true/s,
      );
      expect(() => loadConfig({ ...prod, TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET: keys.TURNSTILE_SECRET })).toThrow(
        /TURNSTILE_SITE_KEY/,
      );
      expect(() => loadConfig({ TURNSTILE_ENABLED: 'true' })).toThrow(/TURNSTILE_SECRET/);
      const on = loadConfig({ ...prod, ...keys, TURNSTILE_ENABLED: 'true' });
      expect([on.turnstileEnabled, on.TURNSTILE_SECRET, on.TURNSTILE_SITE_KEY]).toEqual([
        true,
        keys.TURNSTILE_SECRET,
        keys.TURNSTILE_SITE_KEY,
      ]);
    });
    it('valor inválido é recusado e a chave secreta não aparece na mensagem de erro', () => {
      expect(() => loadConfig({ TURNSTILE_ENABLED: 'sim' })).toThrow(/TURNSTILE_ENABLED/);
      try {
        loadConfig({ ...prod, TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET: keys.TURNSTILE_SECRET });
      } catch (e) {
        expect((e as Error).message).not.toContain(keys.TURNSTILE_SECRET);
      }
    });
  });

  describe('limites globais', () => {
    it('padrões de cadastro por IP e global, recuperação e portaria; configuráveis', () => {
      const c = loadConfig({});
      expect([
        c.SIGNUPS_PER_IP_PER_HOUR,
        c.GLOBAL_SIGNUPS_PER_HOUR,
        c.GLOBAL_RECOVERIES_PER_HOUR,
        c.GATE_SCANS_PER_MINUTE,
        c.GATE_SEARCHES_PER_MINUTE,
      ]).toEqual([100, 1000, 60, 3000, 400]);
      const d = loadConfig({
        SIGNUPS_PER_IP_PER_HOUR: '40',
        GLOBAL_SIGNUPS_PER_HOUR: '600',
        GLOBAL_RECOVERIES_PER_HOUR: '200',
      });
      expect([d.SIGNUPS_PER_IP_PER_HOUR, d.GLOBAL_SIGNUPS_PER_HOUR, d.GLOBAL_RECOVERIES_PER_HOUR]).toEqual([
        40, 600, 200,
      ]);
      for (const bad of ['0', '-1', 'muitos', '1000000'])
        expect(() => loadConfig({ GLOBAL_SIGNUPS_PER_HOUR: bad }), bad).toThrow(/GLOBAL_SIGNUPS_PER_HOUR/);
    });
  });

  it('exige domínio público em produção e recusa protótipo nesse ambiente', () => {
    const cloud = { APP_ENV: 'producao', DATABASE_URL: 'postgres://x', SESSION_SECRET: SECRET, QR_HMAC_KEYS: QR };
    expect(() => loadConfig(cloud)).toThrow(/PUBLIC_BASE_URL/);
    expect(() =>
      loadConfig({ ...cloud, PUBLIC_BASE_URL: 'https://partyx.example.com', ENABLE_PROTOTYPE: 'true' }),
    ).toThrow(/ENABLE_PROTOTYPE/);
    expect(loadConfig({ ...cloud, PUBLIC_BASE_URL: 'https://partyx.example.com' }).ENABLE_PROTOTYPE).toBe('false');
  });

  describe('ambiente das credenciais do gateway', () => {
    const cloud = {
      PUBLIC_BASE_URL: 'https://partyx.example.com',
      DATABASE_URL: 'postgres://x',
      SESSION_SECRET: 's'.repeat(40),
      QR_HMAC_KEYS: `1:${Buffer.alloc(48, 2).toString('base64url')}`,
      TURNSTILE_SECRET: 'segredo-turnstile-teste',
      TURNSTILE_SITE_KEY: 'chave-site-turnstile-teste',
    };
    it('credenciais de SANDBOX em produção são recusadas; de PRODUÇÃO em homologação também', () => {
      expect(() => loadConfig({ APP_ENV: 'producao', GATEWAY_ENVIRONMENT: 'sandbox', ...cloud })).toThrow(
        /SANDBOX do gateway em produção/,
      );
      expect(() => loadConfig({ APP_ENV: 'homologacao', GATEWAY_ENVIRONMENT: 'producao', ...cloud })).toThrow(
        /PRODUÇÃO do gateway em homologação/,
      );
      expect(loadConfig({ APP_ENV: 'producao', GATEWAY_ENVIRONMENT: 'producao', ...cloud }).APP_ENV).toBe('producao');
      expect(loadConfig({ APP_ENV: 'homologacao', GATEWAY_ENVIRONMENT: 'sandbox', ...cloud }).APP_ENV).toBe(
        'homologacao',
      );
    });
    it('valor inválido é recusado', () => {
      expect(() => loadConfig({ GATEWAY_ENVIRONMENT: 'teste' })).toThrow(/GATEWAY_ENVIRONMENT/);
    });
  });
  describe('cadência da conciliação e contato da PartyX', () => {
    it('padrão: 1, 2, 4 e 8 min, margem de 2 min, tardias de 15 min a 24 h, trava de 2 min; sem contato configurado', () => {
      const c = loadConfig({});
      expect(c.reconcile).toEqual({
        taskOffsetsSeconds: [60, 120, 240, 480],
        taskMarginSeconds: 120,
        lateOffsetsSeconds: [900, 1800, 3600, 10800, 28800, 86400],
        lockSeconds: 120,
      });
      expect(c.partyxSupport).toBeNull();
    });
    it('tudo configurável pelo ambiente', () => {
      const c = loadConfig({
        RECONCILE_TASK_OFFSETS_SECONDS: '30, 90,300',
        RECONCILE_TASK_MARGIN_SECONDS: '0',
        RECONCILE_LATE_OFFSETS_SECONDS: '1200,7200,172800',
        RECONCILE_LOCK_SECONDS: '60',
      });
      expect(c.reconcile).toEqual({
        taskOffsetsSeconds: [30, 90, 300],
        taskMarginSeconds: 0,
        lateOffsetsSeconds: [1200, 7200, 172800],
        lockSeconds: 60,
      });
    });
    it('listas de esperas inválidas são recusadas (fora de ordem, repetida, fora da faixa, texto, longa demais)', () => {
      for (const bad of ['120,60', '60,60', '5', '60,4000', ',', 'a,b', '1,2,3,4,5,6,7,8,9,10,11'])
        expect(() => loadConfig({ RECONCILE_TASK_OFFSETS_SECONDS: bad }), bad).toThrow(/RECONCILE_TASK_OFFSETS_SECONDS/);
      for (const bad of ['30', '900,600', '900,300000', 'x'])
        expect(() => loadConfig({ RECONCILE_LATE_OFFSETS_SECONDS: bad }), bad).toThrow(/RECONCILE_LATE_OFFSETS_SECONDS/);
      expect(() => loadConfig({ RECONCILE_LOCK_SECONDS: '5' })).toThrow(/RECONCILE_LOCK_SECONDS/);
    });
    it('contato da PartyX: e-mail e WhatsApp validados; qualquer um sozinho basta', () => {
      expect(loadConfig({ PARTYX_SUPPORT_EMAIL: 'atendimento@partyx.example' }).partyxSupport).toEqual({
        email: 'atendimento@partyx.example',
        whatsapp: null,
      });
      expect(loadConfig({ PARTYX_SUPPORT_WHATSAPP: '+55 (11) 91234-5678' }).partyxSupport).toEqual({
        email: null,
        whatsapp: '+55 (11) 91234-5678',
      });
      expect(() => loadConfig({ PARTYX_SUPPORT_EMAIL: 'nao-e-email' })).toThrow(/PARTYX_SUPPORT_EMAIL/);
      for (const bad of ['123', 'whatsapp', '+55 11 9<script>'])
        expect(() => loadConfig({ PARTYX_SUPPORT_WHATSAPP: bad }), bad).toThrow(/PARTYX_SUPPORT_WHATSAPP/);
    });
  });
});
