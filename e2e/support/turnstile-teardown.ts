import path from 'node:path';
import { stopServer } from './server';
import { TS_DIR } from './turnstile-setup';

export default async function teardown() {
  stopServer(path.join(TS_DIR, 'passa'));
  stopServer(path.join(TS_DIR, 'bloqueia'));
}
