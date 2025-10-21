import { resolveGovernorConfig } from './config.js';
import { CacheManager, createRulepackCacheKey } from './cache.js';
import { createStorageDriver } from './storage.js';
import { detectPII } from './pii.js';
import {
  type AuditRecord,
  type EvaluationPayload,
  type EvaluationResult,
  type GovernorConfig,
  type HttpResponse,
  type HttpRequestOptions,
  type OfflineEvent,
  type PolicyDefinition,
  type PolicyUpdate,
  type Rulepack,
  GovernorError,
  NetworkError,
  PolicyError
} from './types.js';
import { getEnvironment, httpRequest, randomId, exponentialBackoff, decompress } from './utils.js';
import type { StorageDriver } from './types.js';

const OFFLINE_QUEUE_KEY = 'offline-queue';
const AUDIT_LOG_KEY = 'audit-log';
const RULEPACK_INDEX_KEY = 'rulepack-index';

const concatUint8Arrays = (chunks: Uint8Array[]): Uint8Array => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const toUint8Array = (chunk: unknown): Uint8Array => {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (ArrayBuffer.isView(chunk)) {
    const view = chunk as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  if (typeof chunk === 'string') {
    return new TextEncoder().encode(chunk);
  }
  return Uint8Array.from(chunk as Iterable<number>);
};

export class Governor {
  private readonly config: GovernorConfig;
  private readonly storage: StorageDriver;
  private readonly rulepackCache: CacheManager<Rulepack>;
  private readonly offlineQueue: OfflineEvent[] = [];
  private readonly auditLog: AuditRecord[] = [];
  private readonly rulepackIndex = new Map<string, string>();
  private isOffline: boolean;
  private realtimeInterval?: ReturnType<typeof setInterval>;

  private constructor(config: GovernorConfig, storage: StorageDriver) {
    this.config = config;
    this.storage = storage;
    this.rulepackCache = new CacheManager<Rulepack>({
      storage,
      namespace: 'rulepack',
      ttlMs: config.cacheTTL
    });
    this.isOffline = config.offline ?? false;
  }

  static async create(config?: Partial<GovernorConfig>): Promise<Governor> {
    const resolved = resolveGovernorConfig(config);
    const storage = createStorageDriver(resolved.storageKeyPrefix);
    const governor = new Governor(resolved, storage);
    await governor.initialize();
    return governor;
  }

  private async initialize(): Promise<void> {
    const queue = await this.storage.getItem<OfflineEvent[]>(this.withPrefix(OFFLINE_QUEUE_KEY));
    if (queue) {
      this.offlineQueue.push(...queue);
    }

    const audit = await this.storage.getItem<AuditRecord[]>(this.withPrefix(AUDIT_LOG_KEY));
    if (audit) {
      this.auditLog.push(...audit);
    }

    const index = await this.storage.getItem<Record<string, string>>(this.withPrefix(RULEPACK_INDEX_KEY));
    if (index) {
      Object.entries(index).forEach(([policyId, cacheKey]) => this.rulepackIndex.set(policyId, cacheKey));
    }
  }

  getEnvironment(): string {
    return getEnvironment();
  }

  getConfig(): GovernorConfig {
    return { ...this.config };
  }

  async evaluate(payload: EvaluationPayload): Promise<EvaluationResult> {
    if (!payload.policyId) {
      throw new PolicyError('policyId is required for evaluation');
    }

    const piiMatches = typeof payload.input === 'string' ? detectPII(payload.input) : [];

    if (this.isOffline || payload.options?.offline) {
      const event: OfflineEvent = {
        type: 'evaluation',
        payload,
        createdAt: new Date().toISOString()
      };
      await this.enqueueOfflineEvent(event);
      return {
        policyId: payload.policyId,
        decision: 'review',
        evaluatedAt: new Date().toISOString(),
        metadata: {
          offline: true,
          queuedEventId: event.createdAt,
          piiMatches
        }
      };
    }

    await this.ensureRulepackCached(payload.policyId);

    const response = await this.requestWithRetry<EvaluationResult>({
      url: `${this.config.endpoint}/policies/${payload.policyId}/evaluate`,
      method: 'POST',
      body: payload,
      headers: this.createHeaders(),
      timeoutMs: this.config.timeoutMs
    });

    const result = {
      ...response.data,
      metadata: {
        ...response.data.metadata,
        piiMatches,
        cacheMetrics: this.rulepackCache.getMetrics()
      }
    } satisfies EvaluationResult;

    if (this.config.enableAuditLog) {
      await this.appendAuditRecord({
        id: randomId('audit'),
        timestamp: new Date().toISOString(),
        action: 'evaluate',
        payload: {
          policyId: payload.policyId,
          decision: result.decision,
          score: result.score,
          offline: false,
          matches: piiMatches
        }
      });
    }

    return result;
  }

  async loadRulepack(policyId: string, forceRefresh = false): Promise<Rulepack | undefined> {
    if (!policyId) {
      throw new PolicyError('policyId is required to load a rulepack');
    }

    if (!forceRefresh) {
      const cached = await this.getCachedRulepack(policyId);
      if (cached) {
        return cached;
      }
    }

    if (this.isOffline) {
      return undefined;
    }

    const environment = getEnvironment();
    const url = `${this.config.endpoint}/policies/${policyId}/rulepack`;
    const response = await this.requestWithRetry<ArrayBuffer | any>({
      url,
      method: 'GET',
      headers: this.createHeaders(),
      responseType: environment === 'browser' ? 'arrayBuffer' : 'text',
      useStream: environment !== 'browser',
      timeoutMs: this.config.timeoutMs
    });

    let rawBytes: Uint8Array;
    if (environment !== 'browser' && response.data && typeof (response.data as any).pipe === 'function') {
      const stream = response.data as any;
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(toUint8Array(chunk));
      }
      rawBytes = concatUint8Arrays(chunks);
    } else if (response.data instanceof ArrayBuffer) {
      rawBytes = new Uint8Array(response.data);
    } else if (typeof response.data === 'string') {
      rawBytes = new TextEncoder().encode(response.data);
    } else {
      rawBytes = new TextEncoder().encode(JSON.stringify(response.data));
    }

    let rulepack: Rulepack;
    try {
      const text = new TextDecoder().decode(rawBytes);
      rulepack = JSON.parse(text) as Rulepack;
    } catch {
      const decompressed = await decompress(
        rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer
      );
      rulepack = JSON.parse(new TextDecoder().decode(decompressed)) as Rulepack;
    }

    await this.cacheRulepack(policyId, rulepack);
    return rulepack;
  }

  async updatePolicies(policies: PolicyDefinition[]): Promise<void> {
    if (this.isOffline) {
      await this.enqueueOfflineEvent({
        type: 'policy-update',
        payload: policies,
        createdAt: new Date().toISOString()
      });
      return;
    }

    await this.requestWithRetry({
      url: `${this.config.endpoint}/policies`,
      method: 'PUT',
      headers: this.createHeaders(),
      body: { policies }
    });
  }

  async fetchPolicyUpdates(): Promise<PolicyUpdate[]> {
    if (this.isOffline) {
      return [];
    }

    const response = await this.requestWithRetry<PolicyUpdate[]>({
      url: `${this.config.endpoint}/policies/updates`,
      method: 'GET',
      headers: this.createHeaders()
    });

    await Promise.all(
      response.data.map(async (update) => {
        await this.cacheRulepack(update.policyId, {
          id: update.policyId,
          checksum: update.checksum,
          updatedAt: update.updatedAt,
          policies: [
            {
              id: update.policyId,
              version: update.updatedAt,
              rules: update.rules
            }
          ]
        });
      })
    );

    return response.data;
  }

  startRealtimeUpdates(intervalMs = 60_000): void {
    this.stopRealtimeUpdates();
    this.realtimeInterval = setInterval(() => {
      void this.fetchPolicyUpdates().catch((error) => {
        if (error instanceof NetworkError) {
          this.setOfflineMode(true);
        }
      });
    }, intervalMs);
  }

  stopRealtimeUpdates(): void {
    if (this.realtimeInterval) {
      clearInterval(this.realtimeInterval);
      this.realtimeInterval = undefined;
    }
  }

  async flushOfflineQueue(): Promise<void> {
    if (this.isOffline) {
      return;
    }

    while (this.offlineQueue.length > 0) {
      const event = this.offlineQueue.shift();
      if (!event) {
        break;
      }

      try {
        if (event.type === 'evaluation') {
          // Strip offline option when replaying to ensure the evaluation is actually sent
          const originalPayload = event.payload as EvaluationPayload;
          const payload: EvaluationPayload = {
            ...originalPayload,
            options: originalPayload.options ? { ...originalPayload.options, offline: false } : undefined
          };
          await this.evaluate(payload);
        } else if (event.type === 'policy-update') {
          await this.updatePolicies(event.payload as PolicyDefinition[]);
        }
      } catch (error) {
        this.offlineQueue.unshift(event);
        throw error;
      }
    }

    await this.persistOfflineQueue();
  }

  setOfflineMode(enabled: boolean): void {
    this.isOffline = enabled;
  }

  async appendAuditRecord(record: AuditRecord): Promise<void> {
    if (!this.config.enableAuditLog) {
      return;
    }
    this.auditLog.push(record);
    if (this.auditLog.length > 500) {
      this.auditLog.splice(0, this.auditLog.length - 500);
    }
    await this.storage.setItem(this.withPrefix(AUDIT_LOG_KEY), [...this.auditLog]);
  }

  async getAuditLog(): Promise<AuditRecord[]> {
    return [...this.auditLog];
  }

  async clearAuditLog(): Promise<void> {
    this.auditLog.length = 0;
    await this.storage.removeItem(this.withPrefix(AUDIT_LOG_KEY));
  }

  async close(): Promise<void> {
    this.stopRealtimeUpdates();
    await this.persistOfflineQueue();
  }

  private withPrefix(key: string): string {
    return `${this.config.storageKeyPrefix}:${key}`;
  }

  private async cacheRulepack(policyId: string, rulepack: Rulepack): Promise<void> {
    const ttlSeconds = rulepack.ttlSeconds ?? Math.max(1, Math.floor(this.config.cacheTTL / 1_000));
    const ttlMs = ttlSeconds * 1_000;
    const cacheKey = await createRulepackCacheKey(policyId, rulepack.checksum);
    await this.rulepackCache.set(cacheKey, rulepack, ttlMs);
    this.rulepackIndex.set(policyId, cacheKey);
    await this.storage.setItem(this.withPrefix(RULEPACK_INDEX_KEY), Object.fromEntries(this.rulepackIndex));
  }

  private async getCachedRulepack(policyId: string): Promise<Rulepack | undefined> {
    const cacheKey = this.rulepackIndex.get(policyId);
    if (!cacheKey) {
      return undefined;
    }
    return this.rulepackCache.get(cacheKey);
  }

  private async ensureRulepackCached(policyId: string): Promise<void> {
    const cached = await this.getCachedRulepack(policyId);
    if (!cached) {
      await this.loadRulepack(policyId, true);
    }
  }

  private async enqueueOfflineEvent(event: OfflineEvent): Promise<void> {
    this.offlineQueue.push(event);
    await this.persistOfflineQueue();
  }

  private async persistOfflineQueue(): Promise<void> {
    await this.storage.setItem(this.withPrefix(OFFLINE_QUEUE_KEY), [...this.offlineQueue]);
  }

  private createHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-sdk-environment': getEnvironment(),
      'x-sdk-version': '0.1.0'
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private async requestWithRetry<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    let attempt = 0;
    let lastError: unknown;
    const maxAttempts = this.config.retry.retries + 1;
    while (attempt < maxAttempts) {
      try {
        const response = await httpRequest<T>({
          ...options,
          timeoutMs: options.timeoutMs ?? this.config.timeoutMs
        });
        this.setOfflineMode(false);
        return response;
      } catch (error) {
        lastError = error;
        if (error instanceof NetworkError) {
          this.setOfflineMode(true);
        }
        attempt += 1;
        if (attempt >= maxAttempts) {
          throw error;
        }
        await exponentialBackoff(attempt - 1, this.config.retry);
      }
    }
    throw lastError instanceof Error ? lastError : new GovernorError('Unknown error', 'unknown');
  }
}
