export type Environment = 'browser' | 'node';

export interface RetryOptions {
  retries: number;
  factor: number;
  minTimeoutMs: number;
  maxTimeoutMs: number;
}

export interface GovernorConfig {
  apiKey?: string;
  endpoint: string;
  environment?: Environment;
  timeoutMs: number;
  retry: RetryOptions;
  cacheTTL: number;
  offline?: boolean;
  storageKeyPrefix: string;
  fetchImplementation?: typeof fetch;
  enableAuditLog?: boolean;
  encryptionKey?: CryptoKey | Buffer | string;
}

export interface PolicyDefinition {
  id: string;
  version: string;
  rules: RuleDefinition[];
  metadata?: Record<string, unknown>;
}

export interface RuleDefinition {
  id: string;
  description?: string;
  expression: string;
  priority?: number;
  tags?: string[];
}

export interface Rulepack {
  id: string;
  checksum: string;
  updatedAt: string;
  policies: PolicyDefinition[];
  ttlSeconds?: number;
}

export interface EvaluationContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  timestamp?: string;
  ipAddress?: string;
  [key: string]: unknown;
}

export interface EvaluationPayload {
  policyId: string;
  input: unknown;
  context?: EvaluationContext;
  options?: {
    offline?: boolean;
    audit?: boolean;
  };
}

export interface EvaluationResult {
  policyId: string;
  decision: 'allow' | 'deny' | 'review';
  score?: number;
  reasons?: string[];
  metadata?: Record<string, unknown>;
  evaluatedAt: string;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface StorageDriver {
  getItem<T = unknown>(key: string): Promise<T | undefined>;
  setItem<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export interface OfflineEvent {
  type: 'evaluation' | 'policy-update';
  payload: unknown;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface PolicyUpdate {
  policyId: string;
  checksum: string;
  rules: RuleDefinition[];
  updatedAt: string;
}

export interface HttpRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseType?: 'json' | 'arrayBuffer' | 'text';
  useStream?: boolean;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  stale: number;
}

export class GovernorError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'GovernorError';
    this.code = code;
  }
}

export class NetworkError extends GovernorError {
  constructor(message: string) {
    super(message, 'network_error');
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends GovernorError {
  constructor(message: string) {
    super(message, 'timeout_error');
    this.name = 'TimeoutError';
  }
}

export class PolicyError extends GovernorError {
  constructor(message: string) {
    super(message, 'policy_error');
    this.name = 'PolicyError';
  }
}

export class StorageError extends GovernorError {
  constructor(message: string) {
    super(message, 'storage_error');
    this.name = 'StorageError';
  }
}
