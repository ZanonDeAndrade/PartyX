import type pg from 'pg';

/**
 * Conferência de uma restauração (Prompt 25). Roda no banco ISOLADO onde o backup foi restaurado e responde, com números,
 * "isto é o banco do PartyX inteiro e consistente?". Não decide nada sozinha: devolve cada verificação e quem chama (o script
 * `backup:verify`) sai com erro se alguma falhar.
 *
 * O manifesto (`<arquivo>.manifest.json`, gerado pelo `infra/backup/backup.sh`) traz a contagem de linhas medida logo antes do dump.
 * Como o banco continua recebendo gravações entre a contagem e o dump, tabelas que só crescem precisam ter **pelo menos** as linhas do
 * manifesto, não exatamente elas. Tabelas com exclusão (sessões, tentativas de login, tokens) não entram na conta.
 */
export interface Manifest {
  generatedAt: string;
  dump: string;
  server: string;
  migrations: number;
  tables: Record<string, number>;
}

/** Tabelas em que nada é apagado (exclusão lógica, trilha, histórico): a restauração não pode ter menos linhas que o manifesto. */
export const APPEND_ONLY_TABLES = [
  'users',
  'events',
  'ticket_types',
  'promoters',
  'orders',
  'order_items',
  'tickets',
  'checkins',
  'payment_events',
  'audit_log',
  'consents',
  'email_log',
  'minor_term_acceptances',
] as const;

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * `expectedMigrations`: quantas migrações o repositório tem. `opts.exactMigrations`: para restaurar um backup ANTERIOR a uma release
 * (o banco restaurado tem menos migrações que o repositório, de propósito), informe quantas a cópia deve ter; a conferência passa a
 * exigir exatamente esse número, igual ao do manifesto.
 */
export async function verifyRestore(
  pool: pg.Pool,
  manifest: Manifest,
  expectedMigrations: number,
  opts: { exactMigrations?: number } = {},
): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const num = async (sql: string) => Number(((await pool.query(sql)).rows[0] as { n: string | number }).n);

  const migrations = await num('select count(*) as n from drizzle.__drizzle_migrations');
  if (opts.exactMigrations === undefined) {
    add(
      'migrações aplicadas',
      migrations === manifest.migrations && migrations >= expectedMigrations,
      `${migrations} restauradas, ${manifest.migrations} no manifesto, ${expectedMigrations} no repositório`,
    );
  } else {
    add(
      'migrações aplicadas',
      migrations === manifest.migrations && migrations === opts.exactMigrations,
      `${migrations} restauradas, ${manifest.migrations} no manifesto, ${opts.exactMigrations} esperadas (informado: cópia anterior a uma release; o repositório tem ${expectedMigrations})`,
    );
  }

  for (const table of APPEND_ONLY_TABLES) {
    const expected = manifest.tables[table];
    if (expected === undefined) {
      // Cópia anterior à migração que criou a tabela: ela também não existe no banco restaurado, e isso é o esperado.
      const exists = await num(
        `select count(*) as n from information_schema.tables where table_schema = 'public' and table_name = '${table}'`,
      );
      add(
        `linhas de ${table}`,
        exists === 0,
        exists === 0 ? 'tabela posterior a esta cópia' : 'a tabela não consta do manifesto',
      );
      continue;
    }
    const got = await num(`select count(*) as n from "${table}"`);
    add(`linhas de ${table}`, got >= expected, `${got} restauradas, ao menos ${expected} esperadas`);
  }

  const dupCodes = await num(
    'select count(*) as n from (select code from tickets group by code having count(*) > 1) x',
  );
  const dupShort = await num(
    'select count(*) as n from (select short_code from tickets group by short_code having count(*) > 1) x',
  );
  add(
    'códigos de ingresso únicos',
    dupCodes === 0 && dupShort === 0,
    `${dupCodes} códigos e ${dupShort} códigos curtos repetidos`,
  );

  const soldMismatch = await num(`
    select count(*) as n from ticket_types t
     where t.quantity_sold <> (select count(*) from tickets k where k.ticket_type_id = t.id)`);
  add('vendidos = ingressos emitidos, por tipo', soldMismatch === 0, `${soldMismatch} tipos divergentes`);

  const orderMismatch = await num(`
    select count(*) as n from orders o
     where o.status in ('pago', 'estornado', 'contestado', 'cancelado')
       and (select coalesce(sum(quantity), 0) from order_items i where i.order_id = o.id)
        <> (select count(*) from tickets k where k.order_id = o.id)`);
  add('pedido pago tem um ingresso por unidade', orderMismatch === 0, `${orderMismatch} pedidos divergentes`);

  const noPaidAt = await num(
    `select count(*) as n from orders where status in ('pago', 'estornado', 'contestado', 'cancelado', 'pago_sem_estoque') and paid_at is null`,
  );
  add('pedido aprovado guarda paid_at (base da taxa)', noPaidAt === 0, `${noPaidAt} pedidos sem paid_at`);

  const overSold = await num(
    'select count(*) as n from ticket_types where quantity_sold > quantity_total or quantity_sold < 0',
  );
  add('estoque dentro da capacidade', overSold === 0, `${overSold} tipos fora da capacidade`);

  const usedWithoutCheckin = await num(`
    select count(*) as n from tickets k
     where k.status = 'utilizado' and not exists (select 1 from checkins c where c.ticket_id = k.id and c.result = 'valido')`);
  add(
    'ingresso utilizado tem a entrada registrada',
    usedWithoutCheckin === 0,
    `${usedWithoutCheckin} sem registro de entrada`,
  );

  const triggers = await num(
    `select count(*) as n from pg_trigger where tgname in ('orders_paid_at_immutable', 'audit_log_no_update', 'orders_forbid_delete') and not tgisinternal`,
  );
  add('regras de integridade do banco restauradas (gatilhos)', triggers === 3, `${triggers} de 3 gatilhos presentes`);

  return checks;
}
