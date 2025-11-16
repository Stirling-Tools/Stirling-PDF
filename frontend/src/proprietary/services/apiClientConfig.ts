import {
  createBackendBalancer,
  resolveConfiguredBackendUrls,
  type BackendBalancer,
  type BackendBalancerStrategy,
} from '@proprietary/services/backendBalancer';

const configuredUrls = resolveConfiguredBackendUrls(import.meta.env);
const strategy = (import.meta.env.VITE_API_BACKEND_STRATEGY as BackendBalancerStrategy | undefined) || 'round-robin';
const cooldownEnv = Number.parseInt(import.meta.env.VITE_API_BACKEND_FAILURE_COOLDOWN_MS ?? '', 10);
const failureCooldownMs = Number.isFinite(cooldownEnv) ? cooldownEnv : undefined;

const backendBalancer: BackendBalancer = createBackendBalancer(configuredUrls, {
  strategy,
  failureCooldownMs,
});

/**
 * Select the next backend base URL using the configured strategy.
 */
export function getApiBaseUrl(): string {
  return backendBalancer.getNextBaseUrl();
}

/**
 * Notify the balancer that a backend failed so it can be temporarily deprioritized.
 */
export function reportBackendFailure(baseUrl?: string | null): void {
  backendBalancer.reportFailure(baseUrl ?? undefined);
}
