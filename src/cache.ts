import type { CacheEntry, CacheMetrics, StorageDriver } from './types.js';
import { hashString, now } from './utils.js';

export class CacheManager<TValue> {
  private readonly storage: StorageDriver;
  private readonly namespace: string;
  private readonly ttlMs: number;
  private readonly memory = new Map<string, CacheEntry<TValue>>();
  private metrics: CacheMetrics = { hits: 0, misses: 0, stale: 0 };

  constructor(options: { storage: StorageDriver; namespace: string; ttlMs: number }) {
    this.storage = options.storage;
    this.namespace = options.namespace;
    this.ttlMs = options.ttlMs;
  }

  async get(key: string): Promise<TValue | undefined> {
    const record = this.memory.get(key);
    if (record && !this.isExpired(record)) {
      this.metrics.hits += 1;
      return record.value;
    }
    if (record && this.isExpired(record)) {
      this.metrics.stale += 1;
      this.memory.delete(key);
    }

    const persisted = await this.storage.getItem<TValue>(`${this.namespace}:${key}`);
    if (persisted === undefined) {
      this.metrics.misses += 1;
      return undefined;
    }

    this.metrics.hits += 1;
    const entry: CacheEntry<TValue> = { value: persisted, expiresAt: now() + this.ttlMs };
    this.memory.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: TValue, ttlMs?: number): Promise<void> {
    const entry: CacheEntry<TValue> = {
      value,
      expiresAt: now() + (ttlMs ?? this.ttlMs)
    };
    this.memory.set(key, entry);
    await this.storage.setItem(`${this.namespace}:${key}`, value, ttlMs ?? this.ttlMs);
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    await this.storage.removeItem(`${this.namespace}:${key}`);
  }

  async clear(): Promise<void> {
    this.memory.clear();
    const keys = await this.storage.keys(this.namespace);
    await Promise.all(keys.map((key) => this.storage.removeItem(key)));
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return entry.expiresAt !== Number.POSITIVE_INFINITY && entry.expiresAt <= now();
  }
}

export const createRulepackCacheKey = async (policyId: string, checksum: string): Promise<string> =>
  hashString(`${policyId}:${checksum}`);
