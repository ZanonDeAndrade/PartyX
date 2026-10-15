import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  /**
   * Apaga todas as imagens de um evento excluído (a pasta dele, de `eventImagePrefix`): banner atual, versões menores, imagem de
   * pré-visualização e banners antigos. Devolve quantos arquivos saíram.
   */
  removeEventImages(eventId: string): Promise<number>;
  /** Lê um arquivo gravado (a capa, para sugerir a cor de destaque). */
  read(name: string): Promise<Buffer>;
}

/** Nome seguro de objeto: pastas e arquivo em letras minúsculas, números, hífen e ponto. Recusa `..` e barras duplas. */
export function assertSafeObjectName(name: string) {
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]{2,5}$/.test(name)) throw new Error('nome de objeto inválido');
}

/** Pasta das imagens de um evento (`events/<id>/`, onde a rota do banner grava). Só aceita um id de evento (uuid). */
export function eventImagePrefix(eventId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(eventId)) throw new Error('id de evento inválido');
  return `events/${eventId}/`;
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
    // Exige listar e apagar objetos no bucket dos banners (papel próprio da conta do serviço, `deploy.sh banners-iam`). O bucket tem
    // versionamento: apagar só a versão atual deixaria as antigas guardadas, então sai cada versão (cada `generation`) da pasta.
    async removeEventImages(eventId) {
      const [files] = await client.bucket(bucket).getFiles({ prefix: eventImagePrefix(eventId), versions: true });
      for (const file of files) await file.delete({ ignoreNotFound: true });
      return new Set(files.map(f => f.name)).size;
    },
    async read(name) {
      assertSafeObjectName(name);
      const [data] = await client.bucket(bucket).file(name).download();
      return data;
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
    async removeEventImages(eventId) {
      const folder = path.join(dir, eventImagePrefix(eventId));
      const files = await readdir(folder).catch(() => [] as string[]);
      await rm(folder, { recursive: true, force: true });
      return files.length;
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
  async read(name: string) {
    assertSafeObjectName(name);
    const found = this.objects.get(name);
    if (!found) throw new Error('arquivo não encontrado');
    return found.data;
  }
  async removeEventImages(eventId: string) {
    const prefix = eventImagePrefix(eventId);
    const names = [...this.objects.keys()].filter(n => n.startsWith(prefix));
    for (const n of names) this.objects.delete(n);
    return names.length;
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
