import { createDatabase } from '../src/db/client';
import { loadConfig } from '../src/config';
import { logger } from '../src/logger';
import { bootstrapFirstAdmin } from '../src/auth/bootstrap';
import { systemClock } from '../src/providers/clock';
import { argon2Hasher } from '../src/providers/passwordHasher';

/**
 * Cria o primeiro administrador. Uso: BOOTSTRAP_ADMIN_NAME="Nome Sobrenome" BOOTSTRAP_ADMIN_EMAIL=... npm run admin:bootstrap
 * Opcional: BOOTSTRAP_ADMIN_PASSWORD (do Secret Manager). Sem ela, uma senha temporária é gerada e impressa uma vez.
 * Pode rodar mais de uma vez: se já existe administrador, não faz nada.
 */
const config = loadConfig();
if (!config.DATABASE_URL) {
  logger.error('bootstrap: defina DATABASE_URL');
  process.exit(1);
}
const name = process.env.BOOTSTRAP_ADMIN_NAME;
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
if (!name || !email) {
  logger.error('bootstrap: defina BOOTSTRAP_ADMIN_NAME e BOOTSTRAP_ADMIN_EMAIL');
  process.exit(1);
}

const database = createDatabase(config);
try {
  const result = await bootstrapFirstAdmin(
    { db: database.db, hasher: argon2Hasher, clock: systemClock },
    { name, email, password: process.env.BOOTSTRAP_ADMIN_PASSWORD || undefined },
  );
  if (result.status === 'criado') {
    logger.info('administrador inicial criado', { appEnv: config.APP_ENV });
    // A senha vai só para o terminal de quem executou, nunca para o logger estruturado.
    if (result.passwordGenerated) {
      console.log(
        `\nE-mail: ${result.email}\nSenha temporária (mostrada só agora): ${result.temporaryPassword}\nO primeiro acesso exige trocar a senha.\n`,
      );
    } else {
      console.log('\nAdministrador criado com a senha informada. O primeiro acesso exige trocar a senha.\n');
    }
  } else if (result.status === 'ja_existe') {
    logger.info('bootstrap ignorado: já existe administrador');
  } else {
    logger.error('bootstrap recusado: o e-mail já pertence a outra conta');
    process.exitCode = 1;
  }
} finally {
  await database.close();
}
