import type { Environment, HttpRequestOptions, HttpResponse, RetryOptions } from './types.js';
import { NetworkError, TimeoutError } from './types.js';

const globalObject: typeof globalThis = typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof self !== 'undefined' ? (self as typeof globalThis) : (global as unknown as typeof globalThis));

export const isBrowser = (): boolean => typeof window !== 'undefined' && typeof window.document !== 'undefined';

let nodeAgentPromise: Promise<unknown> | undefined;

const ensureNodeAgent = async (): Promise<unknown> => {
  if (isBrowser()) {
    return undefined;
  }
  if (!nodeAgentPromise) {
    nodeAgentPromise = (async () => {
      const https = await import('node:https');
      return new https.Agent({ keepAlive: true, maxSockets: 10 });
    })();
  }
  return nodeAgentPromise;
};

export const getEnvironment = (): Environment => (isBrowser() ? 'browser' : 'node');

export const now = (): number => Date.now();

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> => {
  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
    return promise;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(message ?? `Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export const exponentialBackoff = async (
  attempt: number,
  options: RetryOptions
): Promise<void> => {
  const delayMs = Math.min(options.maxTimeoutMs, options.minTimeoutMs * Math.pow(options.factor, attempt));
  await delay(delayMs);
};

export const parseHeaders = (headers: Headers | Record<string, string>): Record<string, string> => {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
};

export const ensureFetch = async (): Promise<typeof fetch> => {
  if (typeof globalObject.fetch === 'function') {
    return globalObject.fetch.bind(globalObject);
  }

  if (!isBrowser()) {
    const { default: nodeFetch } = await import('node-fetch');
    return nodeFetch as unknown as typeof fetch;
  }

  throw new NetworkError('Fetch API is not available in this environment');
};

export const httpRequest = async <T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> => {
  const fetchImpl = await ensureFetch();
  const controller = options.signal ? undefined : new AbortController();
  const timeout = options.timeoutMs ?? 10_000;
  const signal = options.signal ?? controller?.signal;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...options.headers
  };

  const body = options.body !== undefined && options.method !== 'GET'
    ? (headers['content-type']?.includes('application/json')
        ? JSON.stringify(options.body)
        : (options.body as BodyInit))
    : undefined;

  const agent = (await ensureNodeAgent()) as unknown;

  const requestInit: RequestInit & { agent?: unknown } = {
    method: options.method ?? 'GET',
    headers,
    body,
    signal,
    credentials: isBrowser() ? 'include' : undefined,
    mode: isBrowser() ? 'cors' : undefined,
    cache: 'no-store'
  };

  if (!isBrowser() && agent) {
    (requestInit as any).agent = agent;
  }

  const request = fetchImpl(options.url, requestInit);

  let response: Response;
  try {
    response = await withTimeout(request, timeout, `Request to ${options.url} timed out`);
  } catch (error) {
    if (error instanceof TimeoutError) {
      controller?.abort();
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new NetworkError(`HTTP ${response.status}: ${text}`);
  }

  let data: unknown;
  if (options.useStream && !isBrowser() && 'body' in response && response.body) {
    return {
      status: response.status,
      headers: parseHeaders(response.headers),
      data: response.body as unknown as T
    };
  }

  switch (options.responseType) {
    case 'arrayBuffer':
      data = await response.arrayBuffer();
      break;
    case 'text':
      data = await response.text();
      break;
    default:
      data = await response.json();
      break;
  }

  return {
    status: response.status,
    headers: parseHeaders(response.headers),
    data: data as T
  };
};

export const generateCacheKey = (...parts: Array<string | number | boolean | undefined>): string =>
  parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => `${part}`.replace(/\s+/g, '_'))
    .join(':');

export const hashString = async (value: string, algorithm: string = 'SHA-256'): Promise<string> => {
  if (isBrowser() && globalObject.crypto && 'subtle' in globalObject.crypto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const digest = await globalObject.crypto.subtle.digest(algorithm, data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  const { createHash } = await import('node:crypto');
  return createHash(algorithm).update(value).digest('hex');
};

export const randomId = (prefix = 'evt'): string => {
  if (globalObject.crypto?.randomUUID) {
    return `${prefix}_${globalObject.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
};

export const safeJsonParse = <T>(value: string | null | undefined): T | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

export const isServiceWorkerSupported = (): boolean =>
  isBrowser() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

export const registerServiceWorker = async (scriptUrl: string): Promise<ServiceWorkerRegistration | undefined> => {
  if (!isServiceWorkerSupported()) {
    return undefined;
  }
  return navigator.serviceWorker.register(scriptUrl);
};

export const unregisterServiceWorkers = async (): Promise<void> => {
  if (!isServiceWorkerSupported()) {
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
};

export const decompress = async (input: ArrayBuffer): Promise<Uint8Array> => {
  const { inflate } = await import('pako');
  return inflate(new Uint8Array(input));
};
