import { defineConfig } from 'drizzle-kit';

// Migrações usam a conexão direta do Neon. A aplicação usa a conexão pooled (`DATABASE_URL`).
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/src/db/schema',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '' },
});
