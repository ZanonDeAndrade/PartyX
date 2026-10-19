import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Conferidor dos arquivos de variáveis do Cloud Run (`infra/env-check.py`), que o deploy roda ANTES do build. Aqui ficam as regras
 * que impedem publicar produção com algo trocado: venda e cadastro precisam estar escritos, nada de homologação, nada de segredo.
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');
const dir = mkdtempSync(path.join(tmpdir(), 'partyx-env-'));
const prod = readFileSync(path.join(ROOT, 'infra/producao/env.prod.yaml'), 'utf8');
const hml = readFileSync(path.join(ROOT, 'infra/homologacao/env.hml.yaml'), 'utf8');
let n = 0;
function check(content: string, env: 'producao' | 'homologacao', extra: string[] = []) {
  const file = path.join(dir, `env-${++n}.yaml`);
  writeFileSync(file, content);
  const r = spawnSync('python3', ['-I', path.join(ROOT, 'infra/env-check.py'), file, env, ...extra], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const set = (text: string, name: string, value: string) => {
  const line = new RegExp(`^${name}: ".*"$`, 'm');
  return line.test(text) ? text.replace(line, `${name}: "${value}"`) : `${text}\n${name}: "${value}"\n`;
};
const drop = (text: string, name: string) => text.replace(new RegExp(`^${name}: ".*"\\n`, 'm'), '');
const withAccount = set(prod, 'MP_COLLECTOR_ID', '123456789');

describe('infra/env-check.py', () => {
  it('python3 disponível (o deploy depende dele)', () => {
    expect(execFileSync('python3', ['--version'], { encoding: 'utf8' })).toMatch(/Python 3/);
  });

  it('arquivo de homologação do repositório passa', () => {
    expect(check(hml, 'homologacao', ['EMAIL_FROM']).status).toBe(0);
  });

  it('arquivo de produção do repositório: venda ABERTA com o visual aprovado, cadastro aberto com os textos, sem protótipo, sem lista de e-mail', () => {
    // Cadastro aberto por autorização de 14/10/2026 (docs/registros/autorizacao-cadastro-producao-2026-10-14.md), com Termos e
    // Privacidade publicados (D-84; 1.2 e a Política de Cancelamento, Troca e Reembolso 1.0 em 15/10/2026, D-87). Venda aberta na
    // release-2026-10-18 (autorizacao-abertura-vendas-2026-10-15.md), com o visual aprovado por escrito em 18/10/2026 (CA-33). Termos
    // 1.3 e Política 1.1 com a taxa de serviço (D-90), na release da taxa, com vigência na data da virada; Termos 1.4 com a
    // porcentagem aprovada (7,5%), no mesmo dia; Termos 1.5 com o desconto por promoter (D-91), na release dele.
    for (const [name, value] of [
      ['SALES_OPEN', 'true'],
      ['VISUAL_APPROVED', 'true'],
      ['SIGNUP_OPEN', 'true'],
      ['TERMS_VERSION', '1.5'],
      ['TERMS_DATE', '2026-10-19'],
      ['PRIVACY_VERSION', '1.2'],
      ['PRIVACY_DATE', '2026-10-15'],
      ['CANCELLATION_VERSION', '1.1'],
      ['CANCELLATION_DATE', '2026-10-19'],
      ['MINOR_TERM_VERSION', '1.0'],
      ['MINOR_AUTHORIZATION_VERSION', '1.0'],
      ['RETENTION_SESSIONS_DAYS', '180'],
      ['RETENTION_LOGIN_ATTEMPTS_DAYS', '180'],
      ['RETENTION_PASSWORD_RESETS_DAYS', '180'],
      ['PAYMENT_GATEWAY', 'mercadopago'],
      ['GATEWAY_ENVIRONMENT', 'producao'],
      ['RESERVATION_MINUTES', '30'],
      ['GATE_CLOSED_WINDOW_BEFORE_HOURS', '12'],
      ['GATE_CLOSED_WINDOW_AFTER_HOURS', '24'],
      ['GLOBAL_SIGNUPS_PER_HOUR', '1000'],
      ['SIGNUPS_PER_IP_PER_HOUR', '50'],
    ])
      expect(prod, name).toMatch(new RegExp(`^${name}: "${value}"$`, 'm'));
    expect(prod).not.toMatch(/^(ENABLE_PROTOTYPE|EMAIL_ALLOWLIST|PUBLIC_HOST_CHECK):/m);
    const ok = check(withAccount, 'producao');
    expect(ok.err).toBe('');
    expect(ok.status).toBe(0);
    expect(ok.out).toContain("ENVF_SALES_OPEN=true");
    expect(ok.out).toContain("ENVF_SIGNUP_OPEN=true");
  });

  it('o prazo de retenção dos códigos de recuperação passa; uma senha de verdade no arquivo continua recusada', () => {
    expect(check(set(withAccount, 'RETENTION_PASSWORD_RESETS_DAYS', '180'), 'producao').status).toBe(0);
    expect(check(set(withAccount, 'SMTP_PASSWORD', 'abc'), 'producao').err).toContain('parece segredo');
  });

  it('produção sem o id da conta do Mercado Pago é recusada (o arquivo do repositório fica assim até o bloco de segredos)', () => {
    const r = check(set(prod, 'MP_COLLECTOR_ID', ''), 'producao');
    expect(r.status).toBe(1);
    expect(r.err).toContain('MP_COLLECTOR_ID');
  });

  it.each([
    ['venda não escrita', drop(withAccount, 'SALES_OPEN'), 'SALES_OPEN'],
    ['cadastro não escrito', drop(withAccount, 'SIGNUP_OPEN'), 'SIGNUP_OPEN'],
    ['protótipo ligado', set(withAccount, 'ENABLE_PROTOTYPE', 'true'), 'ENABLE_PROTOTYPE'],
    ['lista de e-mail de homologação', set(withAccount, 'EMAIL_ALLOWLIST', 'a@example.com'), 'EMAIL_ALLOWLIST'],
    ['gateway de teste', set(withAccount, 'GATEWAY_ENVIRONMENT', 'sandbox'), 'GATEWAY_ENVIRONMENT'],
    ['gateway fictício', set(withAccount, 'PAYMENT_GATEWAY', 'mock'), 'fictício'],
    ['barreira de Host desligada', set(withAccount, 'PUBLIC_HOST_CHECK', 'false'), 'PUBLIC_HOST_CHECK'],
    ['endereço da homologação', set(withAccount, 'PUBLIC_BASE_URL', 'https://partyx-hml.web.app'), 'HOMOLOGAÇÃO'],
    ['bucket da homologação', set(withAccount, 'BANNER_BUCKET', 'partyx-hml-banners'), 'HOMOLOGAÇÃO'],
    ['endereço sem https', set(withAccount, 'PUBLIC_BASE_URL', 'http://partyx.com.br'), 'https'],
    ['chave de teste do Turnstile', set(set(withAccount, 'TURNSTILE_ENABLED', 'true'), 'TURNSTILE_SITE_KEY', '1x00000000000000000000AA'), 'TESTE'],
    ['venda com valor estranho', set(withAccount, 'SALES_OPEN', 'sim'), 'SALES_OPEN'],
    ['segredo no arquivo', set(withAccount, 'SESSION_SECRET', 'abc'), 'parece segredo'],
    ['ambiente trocado', set(withAccount, 'APP_ENV', 'homologacao'), 'APP_ENV'],
    ['linha fora do formato', `${withAccount}\nSALES_OPEN: true\n`, 'formato'],
  ])('produção recusa: %s', (_name, content, reason) => {
    const r = check(content, 'producao');
    expect(r.status).toBe(1);
    expect(r.err).toContain(reason);
    expect(r.out).toBe('');
  });

  it('homologação recusa bucket ou fila de produção e gateway de produção', () => {
    expect(check(set(hml, 'BANNER_BUCKET', 'partyx-producao-banners'), 'homologacao').err).toContain('PRODUÇÃO');
    expect(check(set(hml, 'GATEWAY_ENVIRONMENT', 'producao'), 'homologacao').status).toBe(1);
  });

  it('a recusa não repete valores do arquivo (um segredo colado por engano não vai para o terminal)', () => {
    const r = check(set(withAccount, 'MP_ACCESS_TOKEN', 'APP_USR-valor-que-nao-pode-aparecer'), 'producao');
    expect(r.status).toBe(1);
    expect(r.err + r.out).not.toContain('valor-que-nao-pode-aparecer');
  });
});
