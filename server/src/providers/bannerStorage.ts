import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import type { Config } from '../config';

/**
 * Armazenamento dos banners. Só o servidor grava, e só com nome que ele mesmo gera (hash do conteúdo):
 * o navegador nunca escolhe o caminho. Leitura é pública por URL.
 */
export interface BannerStorage {
  /** Grava (idempotente: mesmo nome, mesmo conteúdo) e devolve a URL pública. */
  put(name: string, data: Buffer, contentType: string): Promise<string>;
}

/** Nome seguro de objeto: pastas e arquivo em letras minúsculas, números, hífen e ponto. Recusa `..` e barras duplas. */
export function assertSafeObjectName(name: string) {
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]{2,5}$/.test(name)) throw new Error('nome de objeto inválido');
}

export function gcsBannerStorage(bucket: string, publicBaseUrl?: string): BannerStorage {
  const client = new Storage();
  const base = (publicBaseUrl ?? `https://storage.googleapis.com/${bucket}`).replace(/\/$/, '');
  return {
    async put(name, data, contentType) {
      assertSafeObjectName(name);
      // Nome é o hash do conteúdo: o runtime só precisa de permissão de criação, nunca de sobrescrita.
      await client
        .bucket(bucket)
        .file(name)
        .save(data, {
          contentType,
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: { cacheControl: 'public, max-age=31536000, immutable' },
        })
        .catch((error: { code?: number }) => {
          if (error?.code !== 412) throw error; // 412: já existe com o mesmo hash, nada a fazer
        });
      return `${base}/${name}`;
    },
  };
}

/** Disco local, só para desenvolvimento. Servido por `/api/media/*` apenas com APP_ENV=local. */
export function localBannerStorage(
  dir: string,
  publicBaseUrl: string,
): BannerStorage & { read(name: string): Promise<Buffer> } {
  return {
    async put(name, data) {
      assertSafeObjectName(name);
      const file = path.join(dir, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
      return `${publicBaseUrl.replace(/\/$/, '')}/api/media/${name}`;
    },
    read(name) {
      assertSafeObjectName(name);
      return readFile(path.join(dir, name));
    },
  };
}

/** Memória, para testes. */
export class MemoryBannerStorage implements BannerStorage {
  readonly objects = new Map<string, { data: Buffer; contentType: string }>();
  async put(name: string, data: Buffer, contentType: string) {
    assertSafeObjectName(name);
    this.objects.set(name, { data, contentType });
    return `https://banners.exemplo.test/${name}`;
  }
}

export const LOCAL_BANNER_DIR = '.data/banners';

/** Escolhe a implementação pela configuração. Fora do local, sem bucket não há gravação. */
export function bannerStorageFor(config: Config): BannerStorage | undefined {
  if (config.BANNER_BUCKET) return gcsBannerStorage(config.BANNER_BUCKET, config.BANNER_PUBLIC_BASE_URL);
  if (config.APP_ENV === 'local') {
    return localBannerStorage(LOCAL_BANNER_DIR, config.PUBLIC_BASE_URL ?? `http://localhost:${config.PORT}`);
  }
  return undefined;
}
