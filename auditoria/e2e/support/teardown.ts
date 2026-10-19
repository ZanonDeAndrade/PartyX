import path from 'node:path';
import { stopServer } from '../../../e2e/support/server';
import { RUN_DIR } from './state';

export default async function teardown() {
  stopServer(path.join(RUN_DIR, 'server'));
}
