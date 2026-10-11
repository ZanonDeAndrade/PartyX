import { describe, expect, it } from 'vitest';
import { judgeDatabaseEnvironment, neonEndpointId } from './environment';

describe('judgeDatabaseEnvironment (função pura)', () => {
  it('banco do mesmo ambiente: ok', () => {
    expect(judgeDatabaseEnvironment('producao', 'producao')).toEqual({ ok: true });
    expect(judgeDatabaseEnvironment('homologacao', 'homologacao')).toEqual({ ok: true });
  });
  it('PRODUÇÃO com banco de homologação (e o inverso) é recusado, com mensagem que diz quem é quem', () => {
    const a = judgeDatabaseEnvironment('producao', 'homologacao');
    expect(a).toMatchObject({ ok: false, reason: 'outro_ambiente' });
    expect((a as { message: string }).message).toMatch(/ambiente producao.*pertence ao ambiente homologacao/);
    expect(judgeDatabaseEnvironment('homologacao', 'producao')).toMatchObject({ ok: false, reason: 'outro_ambiente' });
  });
  it('banco SEM marca é recusado nos ambientes de nuvem (a marca é obrigatória)', () => {
    expect(judgeDatabaseEnvironment('producao', null)).toMatchObject({ ok: false, reason: 'sem_marca' });
    expect(judgeDatabaseEnvironment('homologacao', null)).toMatchObject({ ok: false, reason: 'sem_marca' });
  });
  it('local não confere nada, mesmo com marca de nuvem (banco de desenvolvimento copiado)', () => {
    expect(judgeDatabaseEnvironment('local', null)).toEqual({ ok: true });
    expect(judgeDatabaseEnvironment('local', 'producao')).toEqual({ ok: true });
  });
});

describe('neonEndpointId', () => {
  it('URL pooled e direta do mesmo banco dão o mesmo endpoint; bancos diferentes, não', () => {
    const direct = 'postgresql://u:p@ep-cool-darkness-123456.sa-east-1.aws.neon.tech/neondb';
    const pooled = 'postgresql://u:p@ep-cool-darkness-123456-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require';
    expect(neonEndpointId(direct)).toBe('ep-cool-darkness-123456');
    expect(neonEndpointId(pooled)).toBe(neonEndpointId(direct));
    expect(neonEndpointId('postgresql://u:p@ep-outro-999999.sa-east-1.aws.neon.tech/neondb')).not.toBe(neonEndpointId(direct));
    expect(neonEndpointId('isto não é uma URL')).toBeNull();
  });
});
