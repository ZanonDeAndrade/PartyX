import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Taxa de serviço (D-90): a release que cobra a taxa só sobe com os Termos 1.3 e a Política de Cancelamento 1.1
 * (`infra/producao/textos-taxa.py`, chamado pelo `deploy.sh conferir`), e texto legal de versão nova vale a partir da virada
 * (`deploy.sh virar`, com um `gcloud` falso: nada vai à nuvem).
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');
const dir = mkdtempSync(path.join(tmpdir(), 'partyx-textos-'));

function textCheck(terms: string, cancellation: string, termsVersion: string, cancellationVersion: string) {
  writeFileSync(path.join(dir, 't.txt'), terms);
  writeFileSync(path.join(dir, 'c.txt'), cancellation);
  const r = spawnSync(
    'python3',
    [
      '-I',
      path.join(ROOT, 'infra/producao/textos-taxa.py'),
      path.join(dir, 't.txt'),
      path.join(dir, 'c.txt'),
      termsVersion,
      cancellationVersion,
    ],
    { encoding: 'utf8' },
  );
  return { status: r.status, err: r.stderr };
}

describe('textos legais da release da taxa de serviço', () => {
  const terms = readFileSync(path.join(ROOT, 'conteudo-legal/termos-de-uso.txt'), 'utf8');
  const cancellation = readFileSync(path.join(ROOT, 'conteudo-legal/cancelamento.txt'), 'utf8');

  it('os textos do repositório (Termos 1.6 e Política 1.2) passam', () => {
    expect(textCheck(terms, cancellation, '1.6', '1.2')).toEqual({ status: 0, err: '' });
  });

  it('os textos anteriores, que diziam não haver taxa, são recusados, um motivo por linha', () => {
    const r = textCheck(
      'Preço: você paga apenas o valor dos ingressos mostrado na tela de compra. Não há taxa de conveniência nem taxa de serviço.',
      'Como não há taxa de conveniência, o reembolso, quando devido, corresponde ao valor total pago.',
      '1.2',
      '1.0',
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('TERMS_VERSION=1.2');
    expect(r.err).toContain('CANCELLATION_VERSION=1.0');
    expect(r.err).toContain('os Termos de Uso ainda dizem que não há taxa de serviço');
    expect(r.err).toContain('a Política de Cancelamento ainda diz que não há taxa de conveniência');
  });

  it('texto novo com a versão antiga no env, ou versão vazia: recusa', () => {
    expect(textCheck(terms, cancellation, '1.2', '1.1').err).toContain('TERMS_VERSION=1.2');
    expect(textCheck(terms, cancellation, '1.3', '').err).toContain('CANCELLATION_VERSION=(vazio)');
    expect(textCheck(terms, cancellation, '1.10', '2.0').status).toBe(0);
  });
});

function discountCheck(terms: string, termsVersion: string) {
  writeFileSync(path.join(dir, 'td.txt'), terms);
  const r = spawnSync(
    'python3',
    ['-I', path.join(ROOT, 'infra/producao/textos-desconto.py'), path.join(dir, 'td.txt'), termsVersion],
    {
      encoding: 'utf8',
    },
  );
  return { status: r.status, err: r.stderr };
}

describe('Termos de Uso da release do desconto por promoter (D-91)', () => {
  const terms = readFileSync(path.join(ROOT, 'conteudo-legal/termos-de-uso.txt'), 'utf8');
  it('os Termos do repositório (1.6, que mantêm o desconto) passam', () => {
    expect(discountCheck(terms, '1.6')).toEqual({ status: 0, err: '' });
  });
  it('os Termos 1.4, que diziam que o código não dá desconto, são recusados, um motivo por linha', () => {
    const r = discountCheck(
      'Código de divulgação: o campo de código de promoter é opcional. Ele só identifica quem indicou a compra e não dá desconto.',
      '1.4',
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('TERMS_VERSION=1.4');
    expect(r.err).toContain('ainda dizem que o código de promoter não dá desconto');
    expect(r.err).toContain('não explicam o desconto do código de divulgação');
  });
  it('texto novo com a versão antiga no env: recusa', () => {
    expect(discountCheck(terms, '1.4').err).toContain('TERMS_VERSION=1.4');
    expect(discountCheck(terms, '').err).toContain('TERMS_VERSION=(vazio)');
  });
});

const FAKE = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_GCLOUD_LOG"
case "$*" in
  *'run services describe partyx'*'--format=json'*) printf '%s' "$FAKE_SERVICE" ;;
  *'run revisions describe rev-antiga'*) printf '%s' "$FAKE_REV_ANTIGA" ;;
  *'run revisions describe rev-nova'*) printf '%s' "$FAKE_REV_NOVA" ;;
esac
exit 0
`;
writeFileSync(path.join(dir, 'gcloud'), FAKE);
chmodSync(path.join(dir, 'gcloud'), 0o755);

const revision = (env: Record<string, string>) =>
  JSON.stringify({
    spec: {
      containers: [
        { env: [...Object.entries(env).map(([name, value]) => ({ name, value })), { name: 'S', valueFrom: {} }] },
      ],
    },
  });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

let n = 0;
function virar(nova: Record<string, string>) {
  const log = path.join(dir, `chamadas-${++n}.log`);
  writeFileSync(log, '');
  const r = spawnSync('bash', [path.join(ROOT, 'infra/producao/deploy.sh'), 'virar'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      PROJECT: 'partyx-teste',
      FAKE_GCLOUD_LOG: log,
      FAKE_SERVICE: JSON.stringify({
        status: {
          traffic: [
            { percent: 100, revisionName: 'rev-antiga' },
            { tag: 'candidata', revisionName: 'rev-nova' },
          ],
        },
      }),
      FAKE_REV_ANTIGA: revision({
        TERMS_VERSION: '1.2',
        TERMS_DATE: '2026-10-15',
        CANCELLATION_VERSION: '1.0',
        CANCELLATION_DATE: '2026-10-15',
      }),
      FAKE_REV_NOVA: revision(nova),
    },
  });
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  return { status: r.status, err: r.stderr, switched: calls.some(c => c.includes('update-traffic')) };
}

function privateCheck(
  privacy: string,
  terms: string,
  cancellation: string,
  privacyVersion: string,
  termsVersion: string,
  cancellationVersion: string,
) {
  writeFileSync(path.join(dir, 'pp.txt'), privacy);
  writeFileSync(path.join(dir, 'pt.txt'), terms);
  writeFileSync(path.join(dir, 'pc.txt'), cancellation);
  const r = spawnSync(
    'python3',
    [
      '-I',
      path.join(ROOT, 'infra/producao/textos-privado.py'),
      path.join(dir, 'pp.txt'),
      path.join(dir, 'pt.txt'),
      path.join(dir, 'pc.txt'),
      privacyVersion,
      termsVersion,
      cancellationVersion,
    ],
    { encoding: 'utf8' },
  );
  return { status: r.status, err: r.stderr };
}

describe('textos legais da release do evento privado (D-92)', () => {
  // Privacidade 1.3, Termos 1.6 e Cancelamento 1.2, aprovados pelo Bernardo em 20/10/2026.
  const privacy = readFileSync(path.join(ROOT, 'conteudo-legal/privacidade.txt'), 'utf8');
  const terms = readFileSync(path.join(ROOT, 'conteudo-legal/termos-de-uso.txt'), 'utf8');
  const cancellation = readFileSync(path.join(ROOT, 'conteudo-legal/cancelamento.txt'), 'utf8');
  // Os textos anteriores: sem nenhuma linha que fale do evento privado.
  const before = (text: string) =>
    text
      .split('\n')
      .filter(l => !/eventos? privados?/i.test(l))
      .join('\n');

  it('os textos do repositório (Privacidade 1.3, Termos 1.6, Cancelamento 1.2) passam', () => {
    expect(privateCheck(privacy, terms, cancellation, '1.3', '1.6', '1.2')).toEqual({ status: 0, err: '' });
  });

  it('os textos anteriores (Privacidade 1.2, Termos 1.5, Cancelamento 1.1) são recusados, um motivo por linha', () => {
    const r = privateCheck(before(privacy), before(terms), before(cancellation), '1.2', '1.5', '1.1');
    expect(r.status).toBe(1);
    expect(r.err).toContain('PRIVACY_VERSION=1.2');
    expect(r.err).toContain('TERMS_VERSION=1.5');
    expect(r.err).toContain('CANCELLATION_VERSION=1.1');
    expect(r.err).toContain('não fala da lista de autorizados');
    expect(r.err).toContain('não diz que a lista é apagada 6 meses após o Evento');
    expect(r.err).toContain('não têm a cláusula do Evento privado');
    expect(r.err).toContain(
      'os Termos de Uso não dizem que a transferência em Evento privado só vale para conta autorizada',
    );
    expect(r.err).toContain('a Política de Cancelamento não diz que a transferência em Evento privado só vale');
    expect(r.err.trim().split('\n')).toHaveLength(8);
  });

  it('texto novo com versão antiga ou vazia no env: recusa; versões posteriores passam', () => {
    expect(privateCheck(privacy, terms, cancellation, '1.2', '1.6', '1.2').err).toContain('PRIVACY_VERSION=1.2');
    expect(privateCheck(privacy, terms, cancellation, '1.3', '', '1.2').err).toContain('TERMS_VERSION=(vazio)');
    expect(privateCheck(privacy, terms, cancellation, '1.3', '1.6', '1.1').err).toContain('CANCELLATION_VERSION=1.1');
    expect(privateCheck(privacy, terms, cancellation, '1.10', '2.0', '1.2').status).toBe(0);
  });

  it('só a Política de Cancelamento sem a frase da transferência: recusa só por ela', () => {
    const r = privateCheck(privacy, terms, before(cancellation), '1.3', '1.6', '1.2');
    expect(r.status).toBe(1);
    expect(r.err.trim()).toBe(
      'Recuso: a Política de Cancelamento não diz que a transferência em Evento privado só vale para conta autorizada.',
    );
  });
});

describe('deploy.sh virar: texto legal de versão nova vale a partir da virada', () => {
  it('versão nova com a data de hoje: vira', () => {
    const r = virar({ TERMS_VERSION: '1.3', TERMS_DATE: today, CANCELLATION_VERSION: '1.1', CANCELLATION_DATE: today });
    expect(r.err).not.toContain('Recuso: a candidata publica');
    expect(r.switched).toBe(true);
  });

  it('versão nova com outra data (candidata montada noutro dia): recusa antes de mexer no tráfego', () => {
    const r = virar({
      TERMS_VERSION: '1.3',
      TERMS_DATE: '2026-01-01',
      CANCELLATION_VERSION: '1.1',
      CANCELLATION_DATE: today,
    });
    expect(r.status).toBe(1);
    expect(r.err).toContain('TERMS_VERSION=1.3 (antes 1.2) com vigência 2026-01-01');
    expect(r.switched).toBe(false);
  });

  it('mesma versão de antes (publicação que não mexe nos textos): a data antiga não importa', () => {
    const r = virar({
      TERMS_VERSION: '1.2',
      TERMS_DATE: '2026-10-15',
      CANCELLATION_VERSION: '1.0',
      CANCELLATION_DATE: '2026-10-15',
    });
    expect(r.err).not.toContain('Recuso: a candidata publica');
    expect(r.switched).toBe(true);
  });
});
