import { createDatabase } from '../src/db/client';
import { loadConfig } from '../src/config';
import { systemClock } from '../src/providers/clock';
import { feeStatement, previousMonth, renderFeeStatement } from '../src/ops/feeStatement';

/**
 * Extrato da taxa do mês anterior (rotina até o dia 5). Uso: `npm run ops:fee -- [AAAA-MM] [--mensalidade=150,00] [--json]`.
 * Só lê o banco e imprime. Não emite boleto, não cobra e não envia nada.
 */
const args = process.argv.slice(2);
const month = args.find(a => /^\d{4}-\d{2}$/.test(a)) ?? previousMonth(systemClock.now());
const monthly = args.find(a => a.startsWith('--mensalidade='))?.split('=')[1];
const monthlyCents = monthly ? Math.round(Number(monthly.replace('.', '').replace(',', '.')) * 100) : undefined;
const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('defina DATABASE_URL (conexão de leitura)');
  process.exit(1);
}
const database = createDatabase(config);
try {
  const statement = await feeStatement(database.db, month);
  console.log(
    args.includes('--json')
      ? JSON.stringify(statement, null, 2)
      : renderFeeStatement(statement, { generatedAt: systemClock.now(), monthlyFeeCents: monthlyCents }),
  );
  if (!statement.reconciliation.ok) process.exitCode = 2;
} finally {
  await database.close();
}
