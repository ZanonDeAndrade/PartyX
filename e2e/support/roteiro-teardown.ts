import path from 'node:path';
import { stopServer } from './server';
import { ROTEIRO_DIR } from './roteiro-setup';

// O banco descartável fica para conferência depois da rodada; `npm run db:test:down` apaga tudo (tmpfs).
export default async function teardown() {
  stopServer(path.join(ROTEIRO_DIR, 'server'));
}
