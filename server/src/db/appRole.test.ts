import { describe, expect, it } from 'vitest';
import { roleUrl } from './appRole';

describe('roleUrl (função pura)', () => {
  it('app: host pooled do Neon; backup: host direto; local não muda de host', () => {
    const owner = 'postgresql://dono:senha@ep-cool-123456.sa-east-1.aws.neon.tech/neondb?sslmode=require';
    const app = new URL(roleUrl(owner, 'partyx_app', 'abc', true));
    expect(app.hostname).toBe('ep-cool-123456-pooler.sa-east-1.aws.neon.tech');
    expect([app.username, app.password, app.search]).toEqual(['partyx_app', 'abc', '?sslmode=require']);
    expect(new URL(roleUrl(owner, 'partyx_backup', 'xyz', false)).hostname).toBe('ep-cool-123456.sa-east-1.aws.neon.tech');
    expect(new URL(roleUrl(roleUrl(owner, 'a', 'b', true), 'a', 'b', true)).hostname).toBe('ep-cool-123456-pooler.sa-east-1.aws.neon.tech'); // não duplica
    expect(new URL(roleUrl('postgres://u:p@127.0.0.1:5432/db', 'partyx_app', 'abc', true)).hostname).toBe('127.0.0.1');
  });
  it('a senha com caracteres especiais sai codificada', () => {
    expect(roleUrl('postgres://u:p@h.neon.tech/db', 'r', 'a/b@c#d', false)).not.toContain('a/b@c#d');
  });
});

