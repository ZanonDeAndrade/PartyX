import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `infra/producao/deploy.sh evento-on|evento-off|status` com um `gcloud` falso, que só anota cada chamada (nada vai à nuvem).
 * A instância mínima é do SERVIÇO (`--min`): vale para a revisão que recebe o tráfego, sem revisão nova. O `--min-instances` antigo
 * (da revisão) criava uma revisão nova que ficava com 0%, porque o tráfego fica preso à revisão virada (18/10/2026).
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');
const dir = mkdtempSync(path.join(tmpdir(), 'partyx-deploy-'));
const FAKE = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_GCLOUD_LOG"
case "$*" in
  *'value(metadata.annotations["run.googleapis.com/minScale"])'*) printf '%s\\n' "\${FAKE_MIN_SERVICO:-}" ;;
  *'value(spec.template.metadata.annotations["autoscaling.knative.dev/minScale"])'*) printf '%s\\n' "\${FAKE_MIN_REVISAO:-}" ;;
esac
exit 0
`;
writeFileSync(path.join(dir, 'gcloud'), FAKE);
chmodSync(path.join(dir, 'gcloud'), 0o755);

let n = 0;
function run(command: string, env: Record<string, string> = {}) {
  const log = path.join(dir, `chamadas-${++n}.log`);
  writeFileSync(log, '');
  const r = spawnSync('bash', [path.join(ROOT, 'infra/producao/deploy.sh'), command], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROJECT: 'partyx-teste', FAKE_GCLOUD_LOG: log, ...env },
  });
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  return { status: r.status, out: r.stdout, err: r.stderr, calls };
}

describe('deploy.sh: instância mínima no serviço', () => {
  it('evento-on: uma única chamada, --min=1 no serviço, sem --min-instances e sem mexer no tráfego', () => {
    const r = run('evento-on');
    expect(r.status, r.err).toBe(0);
    expect(r.calls).toEqual(['--project=partyx-teste run services update partyx --region=southamerica-east1 --min=1 --quiet']);
    expect(r.out).toContain('sem revisão nova');
    expect(r.out).toMatch(/R\$ 2,69 por dia/);
  });

  it('evento-off: uma única chamada, --min=default (tira a instância mínima do serviço)', () => {
    const r = run('evento-off');
    expect(r.status, r.err).toBe(0);
    expect(r.calls).toEqual(['--project=partyx-teste run services update partyx --region=southamerica-east1 --min=default --quiet']);
  });

  it('nenhum dos dois usa o --min-instances da revisão nem o update-traffic', () => {
    for (const c of ['evento-on', 'evento-off'])
      for (const call of run(c).calls) expect(call, c).not.toMatch(/--min-instances|update-traffic|deploy /);
  });

  it('status: avisa a instância mínima do serviço e a da revisão; sem nenhuma, não avisa', () => {
    const nada = run('status');
    expect(nada.status, nada.err).toBe(0);
    expect(nada.out).not.toContain('ATENÇÃO');
    expect(nada.calls.some(c => c.includes('MIN_SERVICO') && c.includes('MIN_REVISAO'))).toBe(true);

    const servico = run('status', { FAKE_MIN_SERVICO: '1' });
    expect(servico.out).toContain('ATENÇÃO: instância mínima no serviço = 1');
    expect(servico.out).not.toContain('na revisão');

    const revisao = run('status', { FAKE_MIN_REVISAO: '1' });
    expect(revisao.out).toContain('ATENÇÃO: instância mínima na revisão = 1');

    expect(run('status', { FAKE_MIN_SERVICO: '0', FAKE_MIN_REVISAO: '0' }).out).not.toContain('ATENÇÃO');
  });

  it('recusa projeto de homologação antes de chamar o gcloud', () => {
    const r = run('evento-on', { PROJECT: 'partyx-hml' });
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
  });
});
