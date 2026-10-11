import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.fn();
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getClient = async () => ({ request });
  },
  OAuth2Client: class {
    verifyIdToken = verify;
  },
}));
const verify = vi.fn();

const { cloudTasksQueue, enqueueSafely, enqueueEmailSafely } = await import('./taskQueue');
const { googleJobAuthenticator } = await import('./jobsAuth');

const CFG = {
  queuePath: 'projects/partyx-prod/locations/southamerica-east1/queues/partyx-conciliacao',
  targetUrl: 'https://partyx-abc123-rj.a.run.app/',
  publicHost: 'partyx.example.com',
  invokerEmail: 'partyx-tasks@partyx-prod.iam.gserviceaccount.com',
};

describe('cloudTasksQueue (API REST do Cloud Tasks)', () => {
  beforeEach(() => request.mockReset());

  it('monta a tarefa: URL run.app, token OIDC com audience na run.app, nome determinístico, horário futuro', async () => {
    request.mockResolvedValue({ data: {} });
    const before = Date.now();
    await cloudTasksQueue(CFG).enqueue({
      orderId: '5f0c3e1e-6b0e-4f55-9c0f-1b9e6e6a8c11',
      attempt: 2,
      delaySeconds: 900,
    });
    expect(request).toHaveBeenCalledTimes(1);
    const call = request.mock.calls[0]![0];
    expect(call.url).toBe(`https://cloudtasks.googleapis.com/v2/${CFG.queuePath}/tasks`);
    expect(call.method).toBe('POST');
    const t = call.data.task;
    expect(t.name).toBe(`${CFG.queuePath}/tasks/reconcile-5f0c3e1e-6b0e-4f55-9c0f-1b9e6e6a8c11-2`);
    expect(t.httpRequest.url).toBe('https://partyx-abc123-rj.a.run.app/api/internal/tasks/reconcile-order');
    expect(t.httpRequest.httpMethod).toBe('POST');
    expect(t.httpRequest.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Forwarded-Host': CFG.publicHost,
    });
    expect(t.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: CFG.invokerEmail,
      audience: 'https://partyx-abc123-rj.a.run.app', // sem a barra final, igual ao que a rota confere
    });
    expect(JSON.parse(Buffer.from(t.httpRequest.body, 'base64').toString())).toEqual({
      orderId: '5f0c3e1e-6b0e-4f55-9c0f-1b9e6e6a8c11',
      attempt: 2,
    });
    const when = Date.parse(t.scheduleTime);
    expect(when).toBeGreaterThanOrEqual(before + 899_000);
    expect(when).toBeLessThanOrEqual(Date.now() + 901_000);
  });

  it('e-mail: URL e corpo próprios, nome determinístico e o mesmo token OIDC', async () => {
    request.mockResolvedValue({ data: {} });
    await cloudTasksQueue(CFG).enqueueEmail({
      emailId: '9a1b2c3d-0000-4000-8000-000000000001',
      attempt: 3,
      delaySeconds: 1800,
    });
    const t = request.mock.calls[0]![0].data.task;
    expect(t.name).toBe(`${CFG.queuePath}/tasks/email-9a1b2c3d-0000-4000-8000-000000000001-3`);
    expect(t.httpRequest.url).toBe('https://partyx-abc123-rj.a.run.app/api/internal/tasks/send-email');
    expect(t.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: CFG.invokerEmail,
      audience: 'https://partyx-abc123-rj.a.run.app',
    });
    expect(JSON.parse(Buffer.from(t.httpRequest.body, 'base64').toString())).toEqual({
      emailId: '9a1b2c3d-0000-4000-8000-000000000001',
      attempt: 3,
    });
    expect(Date.parse(t.scheduleTime) - Date.now()).toBeGreaterThan(1_790_000);
  });

  it('tarefa que já existe (409) é sucesso; qualquer outro erro sobe', async () => {
    request.mockRejectedValueOnce({ response: { status: 409 } });
    await expect(
      cloudTasksQueue(CFG).enqueue({ orderId: 'a', attempt: 1, delaySeconds: 600 }),
    ).resolves.toBeUndefined();
    request.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(cloudTasksQueue(CFG).enqueue({ orderId: 'a', attempt: 1, delaySeconds: 600 })).rejects.toBeTruthy();
  });

  it('enqueueSafely nunca lança e devolve se agendou', async () => {
    expect(await enqueueSafely(undefined, { orderId: 'a', attempt: 1, delaySeconds: 1 })).toBe(false);
    request.mockRejectedValueOnce(new Error('rede'));
    expect(await enqueueSafely(cloudTasksQueue(CFG), { orderId: 'a', attempt: 1, delaySeconds: 1 })).toBe(false);
    request.mockResolvedValueOnce({ data: {} });
    expect(await enqueueSafely(cloudTasksQueue(CFG), { orderId: 'a', attempt: 1, delaySeconds: 1 })).toBe(true);
    expect(await enqueueEmailSafely(undefined, { emailId: 'a', attempt: 1, delaySeconds: 1 })).toBe(false);
    request.mockRejectedValueOnce(new Error('rede'));
    expect(await enqueueEmailSafely(cloudTasksQueue(CFG), { emailId: 'a', attempt: 1, delaySeconds: 1 })).toBe(false);
  });
});

describe('googleJobAuthenticator com mais de uma conta (Scheduler e Cloud Tasks)', () => {
  const cfg = {
    JOBS_AUDIENCE: 'https://partyx-abc123-rj.a.run.app',
    JOBS_CALLER_EMAIL: 'partyx-scheduler@p.iam.gserviceaccount.com, Partyx-Tasks@p.iam.gserviceaccount.com',
  };
  beforeEach(() => verify.mockReset());

  it('aceita cada conta configurada (sem diferenciar maiúsculas) e confere a audience', async () => {
    const auth = googleJobAuthenticator(cfg)!;
    for (const email of ['partyx-scheduler@p.iam.gserviceaccount.com', 'partyx-tasks@p.iam.gserviceaccount.com']) {
      verify.mockResolvedValueOnce({ getPayload: () => ({ email, email_verified: true }) });
      expect(await auth.verify('Bearer abc.def.ghi')).toBe(true);
    }
    expect(verify.mock.calls[0]![0]).toEqual({ idToken: 'abc.def.ghi', audience: cfg.JOBS_AUDIENCE });
  });

  it('recusa outra conta, e-mail não verificado, token inválido e cabeçalho malformado', async () => {
    const auth = googleJobAuthenticator(cfg)!;
    verify.mockResolvedValueOnce({
      getPayload: () => ({ email: 'intruso@p.iam.gserviceaccount.com', email_verified: true }),
    });
    expect(await auth.verify('Bearer abc')).toBe(false);
    verify.mockResolvedValueOnce({
      getPayload: () => ({ email: 'partyx-tasks@p.iam.gserviceaccount.com', email_verified: false }),
    });
    expect(await auth.verify('Bearer abc')).toBe(false);
    verify.mockRejectedValueOnce(new Error('assinatura inválida'));
    expect(await auth.verify('Bearer abc')).toBe(false);
    expect(await auth.verify(undefined)).toBe(false);
    expect(await auth.verify('Basic abc')).toBe(false);
  });

  it('sem audience ou sem contas, não há autenticador (as rotas respondem 503)', () => {
    expect(googleJobAuthenticator({ JOBS_AUDIENCE: undefined, JOBS_CALLER_EMAIL: 'a@b.com' })).toBeUndefined();
    expect(googleJobAuthenticator({ JOBS_AUDIENCE: 'https://x.run.app', JOBS_CALLER_EMAIL: ' , ' })).toBeUndefined();
  });
});
