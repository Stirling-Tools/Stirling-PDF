export type BackendBalancerStrategy = 'round-robin' | 'random';

export interface BackendBalancerOptions {
  strategy?: BackendBalancerStrategy;
  failureCooldownMs?: number;
}

export interface BackendBalancer {
  getNextBaseUrl(): string;
  getAllBaseUrls(): string[];
  reportFailure(baseUrl?: string | null): void;
}

const DEFAULT_BASE_URL = '/';
const DEFAULT_COOLDOWN_MS = 15000;

export function sanitizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed === '/') return '/';
  return trimmed.replace(/\/+$/, '');
}

export function parseBackendUrlList(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw)
    ? raw
    : raw
        .split(/[,\s]+/)
        .map((segment) => segment.trim())
        .filter(Boolean);

  const normalized: string[] = [];
  for (const candidate of parts) {
    const sanitized = sanitizeBaseUrl(candidate);
    if (sanitized && !normalized.includes(sanitized)) {
      normalized.push(sanitized);
    }
  }
  return normalized;
}

interface EnvLike {
  [key: string]: string | undefined;
}

export function resolveConfiguredBackendUrls(
  env?: EnvLike,
  fallback: string = DEFAULT_BASE_URL
): string[] {
  const rawMulti = env?.VITE_API_BASE_URLS;
  const rawSingle = env?.VITE_API_BASE_URL;
  const parsed = [rawMulti, rawSingle]
    .flatMap((value) => parseBackendUrlList(value))
    .filter(Boolean);

  if (parsed.length > 0) {
    return parsed;
  }

  const sanitizedFallback = sanitizeBaseUrl(fallback);
  return sanitizedFallback ? [sanitizedFallback] : [DEFAULT_BASE_URL];
}

export function createBackendBalancer(
  urls: string[],
  options?: BackendBalancerOptions
): BackendBalancer {
  const unique = urls.length > 0 ? Array.from(new Set(urls.map(sanitizeBaseUrl).filter(Boolean))) : [DEFAULT_BASE_URL];
  let pointer = 0;
  const penalties = new Map<string, number>();
  const strategy: BackendBalancerStrategy = options?.strategy ?? 'round-robin';
  const cooldown = Math.max(0, options?.failureCooldownMs ?? DEFAULT_COOLDOWN_MS);

  function getCandidateRoundRobin(now: number): string {
    for (let attempt = 0; attempt < unique.length; attempt += 1) {
      const idx = (pointer + attempt) % unique.length;
      const candidate = unique[idx];
      const penaltyExpires = penalties.get(candidate) ?? 0;
      if (penaltyExpires <= now) {
        pointer = (idx + 1) % unique.length;
        return candidate;
      }
    }
    pointer = (pointer + 1) % unique.length;
    return unique[pointer];
  }

  function getCandidateRandom(now: number): string {
    for (let attempt = 0; attempt < unique.length; attempt += 1) {
      const idx = Math.floor(Math.random() * unique.length);
      const candidate = unique[idx];
      const penaltyExpires = penalties.get(candidate) ?? 0;
      if (penaltyExpires <= now) {
        return candidate;
      }
    }
    return unique[Math.floor(Math.random() * unique.length)];
  }

  function pickCandidate(): string {
    const now = Date.now();
    return strategy === 'random' ? getCandidateRandom(now) : getCandidateRoundRobin(now);
  }

  function reportFailure(baseUrl?: string | null): void {
    if (!baseUrl) return;
    const normalized = sanitizeBaseUrl(baseUrl);
    if (!normalized) return;
    const expiresAt = Date.now() + cooldown;
    penalties.set(normalized, expiresAt);
  }

  return {
    getNextBaseUrl: pickCandidate,
    getAllBaseUrls: () => [...unique],
    reportFailure,
  };
}
