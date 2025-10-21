import type { GovernorConfig, RetryOptions } from './types.js';
import { getEnvironment } from './utils.js';

const DEFAULT_RETRY: RetryOptions = {
  retries: 3,
  factor: 2,
  minTimeoutMs: 250,
  maxTimeoutMs: 4_000
};

const DEFAULT_ENDPOINT = 'https://api.aisentinel.ai/v1';

const DEFAULTS: GovernorConfig = {
  endpoint: DEFAULT_ENDPOINT,
  timeoutMs: 10_000,
  retry: DEFAULT_RETRY,
  cacheTTL: 300_000,
  storageKeyPrefix: 'aisentinel',
  environment: getEnvironment(),
  offline: false,
  enableAuditLog: true
};

const readEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process?.env) {
    return process.env[key];
  }
  if (typeof window !== 'undefined') {
    return (window as unknown as Record<string, string | undefined>)[key];
  }
  return undefined;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mergeRetry = (input?: Partial<RetryOptions>): RetryOptions => ({
  retries: input?.retries ?? DEFAULT_RETRY.retries,
  factor: input?.factor ?? DEFAULT_RETRY.factor,
  minTimeoutMs: input?.minTimeoutMs ?? DEFAULT_RETRY.minTimeoutMs,
  maxTimeoutMs: input?.maxTimeoutMs ?? DEFAULT_RETRY.maxTimeoutMs
});

export const resolveGovernorConfig = (config?: Partial<GovernorConfig>): GovernorConfig => {
  const apiKey = config?.apiKey ?? readEnv('AISENTINEL_API_KEY');
  const endpoint = config?.endpoint ?? readEnv('AISENTINEL_ENDPOINT') ?? DEFAULT_ENDPOINT;
  const timeoutMs = config?.timeoutMs ?? parseNumber(readEnv('AISENTINEL_TIMEOUT_MS'), DEFAULTS.timeoutMs);
  const cacheTTL = config?.cacheTTL ?? parseNumber(readEnv('AISENTINEL_CACHE_TTL_MS'), DEFAULTS.cacheTTL);
  const offline = config?.offline ?? parseBoolean(readEnv('AISENTINEL_OFFLINE'), DEFAULTS.offline ?? false);
  const enableAuditLog =
    config?.enableAuditLog ?? parseBoolean(readEnv('AISENTINEL_ENABLE_AUDIT_LOG'), DEFAULTS.enableAuditLog ?? true);
  const storageKeyPrefix = config?.storageKeyPrefix ?? readEnv('AISENTINEL_STORAGE_PREFIX') ?? DEFAULTS.storageKeyPrefix;

  return {
    ...DEFAULTS,
    ...config,
    apiKey,
    endpoint,
    timeoutMs,
    cacheTTL,
    offline,
    enableAuditLog,
    storageKeyPrefix,
    retry: mergeRetry(config?.retry)
  };
};

export const maskApiKey = (apiKey?: string): string | undefined => {
  if (!apiKey) {
    return undefined;
  }
  if (apiKey.length <= 8) {
    return '*'.repeat(apiKey.length);
  }
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
};
