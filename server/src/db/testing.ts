import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { runMigrations } from './migrate';

/**
 * Banco descartável para testes de integração: um banco novo por arquivo de teste, removido no fim. `serviceFee`: taxa de serviço do
 * banco (sem a opção, fica o que a migração 0017 grava: 0%); os testes da taxa pedem a que querem (ex.: 5%).
 */
export async function createTestDatabase(
  adminUrl: string,
  options: { migrate?: boolean; serviceFee?: { rateBps: number; minCents: number } } = {},
) {
  const name = `partyx_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  if (options.migrate !== false) {
    await runMigrations(url.toString());
    // SÓ NO BANCO DE TESTE: quem é cadastrado direto no SQL (fixtures antigas) nasce adulto, para o checkout não pedir a data de
    // nascimento em todo teste (regra de 14/10/2026). Produção não tem valor padrão: o cadastro exige a data e conta antiga fica nula.
    // Os testes de menores e de "conta antiga sem data" informam a data, ou `null`, explicitamente.
    const setup = new pg.Client({ connectionString: url.toString() });
    await setup.connect();
    await setup.query(`alter table users alter column birth_date set default date '1990-01-01'`);
    // Taxa de serviço (D-90): a migração grava 0% (produção começa sem taxa), então os testes anteriores à taxa conferem total =
    // preço × quantidade sem mexer em nada; os testes da taxa pedem a que querem (`serviceFee`), gravada aqui como o painel gravaria.
    if (options.serviceFee)
      await setup.query('update service_fee_settings set rate_bps = $1, min_cents = $2', [
        options.serviceFee.rateBps,
        options.serviceFee.minCents,
      ]);
    await setup.end();
  }

  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  return {
    url: url.toString(),
    pool,
    async drop() {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: adminUrl });
      await cleanup.connect();
      // `pool.end()` volta antes de o servidor fechar as sessões. Com `force` na hora, uma sessão ainda fechando era derrubada e o
      // cliente recebia "terminating connection" (57P01) fora de qualquer teste: erro sem tratamento, e a bateria saía com falha.
      // Espera as sessões do pool sumirem (até 2 s); `force` fica só para sobra de verdade.
      for (let i = 0; i < 100; i++) {
        const { rows } = await cleanup.query('select count(*)::int as n from pg_stat_activity where datname = $1', [name]);
        if (rows[0].n === 0) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}
