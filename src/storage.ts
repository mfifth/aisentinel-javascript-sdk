import { isBrowser, safeJsonParse } from './utils.js';
import type { CacheEntry, StorageDriver } from './types.js';
import { StorageError } from './types.js';

const memoryStore = new Map<string, CacheEntry<unknown>>();

const serialize = <T>(value: T, ttlMs?: number): CacheEntry<T> => ({
  value,
  expiresAt: Date.now() + (ttlMs ?? Number.POSITIVE_INFINITY)
});

const isExpired = (entry?: CacheEntry<unknown>): boolean => {
  if (!entry) {
    return true;
  }
  return entry.expiresAt !== Number.POSITIVE_INFINITY && entry.expiresAt < Date.now();
};

const ensureIndexedDb = async () => {
  const { set, get, del, keys } = await import('idb-keyval');
  return { set, get, del, keys } as const;
};

const getPrefixedKey = (prefix: string, key: string): string => `${prefix}:${key}`;

const createBrowserStorage = (prefix: string): StorageDriver => ({
  async getItem<T>(key: string): Promise<T | undefined> {
    const namespaced = getPrefixedKey(prefix, key);
    try {
      const { get } = await ensureIndexedDb();
      const entry = (await get(namespaced)) as CacheEntry<T> | undefined;
      if (!entry || isExpired(entry)) {
        if (entry) {
          await this.removeItem(key);
        }
        return undefined;
      }
      return entry.value;
    } catch (error) {
      if (typeof localStorage === 'undefined') {
        return undefined;
      }
      const serialized = safeJsonParse<CacheEntry<T>>(localStorage.getItem(namespaced));
      if (!serialized || isExpired(serialized)) {
        return undefined;
      }
      return serialized.value;
    }
  },

  async setItem<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const namespaced = getPrefixedKey(prefix, key);
    const entry = serialize(value, ttlMs);
    try {
      const { set } = await ensureIndexedDb();
      await set(namespaced, entry);
    } catch (error) {
      if (typeof localStorage === 'undefined') {
        throw error;
      }
      localStorage.setItem(namespaced, JSON.stringify(entry));
    }
  },

  async removeItem(key: string): Promise<void> {
    const namespaced = getPrefixedKey(prefix, key);
    try {
      const { del } = await ensureIndexedDb();
      await del(namespaced);
    } catch (error) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(namespaced);
      }
    }
  },

  async keys(namespace?: string): Promise<string[]> {
    const prefixFilter = namespace ? getPrefixedKey(prefix, namespace) : `${prefix}:`;
    const matches = new Set<string>();
    try {
      const { keys } = await ensureIndexedDb();
      const indexedKeys = await keys();
      indexedKeys.forEach((name) => {
        if (typeof name === 'string' && name.startsWith(prefixFilter)) {
          matches.add(name.replace(`${prefix}:`, ''));
        }
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key?.startsWith(prefixFilter)) {
            matches.add(key.replace(`${prefix}:`, ''));
          }
        }
      }
    }
    return Array.from(matches);
  }
});

const createNodeStorage = (prefix: string): StorageDriver => {
  let basePathPromise: Promise<string> | undefined;
  const ensureBasePath = async (): Promise<string> => {
    if (!basePathPromise) {
      basePathPromise = (async () => {
        const os = await import('node:os');
        const path = await import('node:path');
        const fs = await import('node:fs/promises');
        const dir = path.join(os.homedir(), '.aisentinel', 'cache');
        await fs.mkdir(dir, { recursive: true });
        return dir;
      })();
    }
    return basePathPromise;
  };

  const readFileEntry = async <T>(filePath: string): Promise<CacheEntry<T> | undefined> => {
    try {
      const fs = await import('node:fs/promises');
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as CacheEntry<T>;
    } catch (error) {
      return undefined;
    }
  };

  const writeFileEntry = async <T>(filePath: string, entry: CacheEntry<T>): Promise<void> => {
    const fs = await import('node:fs/promises');
    await fs.writeFile(filePath, JSON.stringify(entry), 'utf8');
  };

  const deleteFileEntry = async (filePath: string): Promise<void> => {
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(filePath);
    } catch {
      /* noop */
    }
  };

  return {
    async getItem<T>(key: string): Promise<T | undefined> {
      const namespaced = getPrefixedKey(prefix, key);
      const entry = memoryStore.get(namespaced) as CacheEntry<T> | undefined;
      if (entry && !isExpired(entry)) {
        return entry.value;
      }

      const dir = await ensureBasePath();
      const path = await import('node:path');
      const file = path.join(dir, `${namespaced}.json`);
      const persisted = await readFileEntry<T>(file);
      if (!persisted || isExpired(persisted)) {
        if (persisted) {
          await deleteFileEntry(file);
        }
        memoryStore.delete(namespaced);
        return undefined;
      }

      memoryStore.set(namespaced, persisted);
      return persisted.value;
    },

    async setItem<T>(key: string, value: T, ttlMs?: number): Promise<void> {
      const namespaced = getPrefixedKey(prefix, key);
      const entry = serialize(value, ttlMs);
      memoryStore.set(namespaced, entry);
      const dir = await ensureBasePath();
      const path = await import('node:path');
      const file = path.join(dir, `${namespaced}.json`);
      await writeFileEntry(file, entry);
    },

    async removeItem(key: string): Promise<void> {
      const namespaced = getPrefixedKey(prefix, key);
      memoryStore.delete(namespaced);
      const dir = await ensureBasePath();
      const path = await import('node:path');
      const file = path.join(dir, `${namespaced}.json`);
      await deleteFileEntry(file);
    },

    async keys(namespace?: string): Promise<string[]> {
      const prefixFilter = namespace ? getPrefixedKey(prefix, namespace) : `${prefix}:`;
      const dir = await ensureBasePath();
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const files = await fs.readdir(dir, { withFileTypes: true });
      return files
        .filter((entry) => entry.isFile() && entry.name.startsWith(prefixFilter))
        .map((entry) => entry.name.replace(`${prefix}:`, '').replace(/\.json$/, ''));
    }
  } satisfies StorageDriver;
};

export const createStorageDriver = (prefix: string): StorageDriver => {
  try {
    return isBrowser() ? createBrowserStorage(prefix) : createNodeStorage(prefix);
  } catch (error) {
    throw new StorageError(`Unable to initialize storage: ${(error as Error).message}`);
  }
};
