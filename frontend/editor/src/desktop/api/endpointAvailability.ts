import { isAxiosError } from "axios";
import apiClient from "@app/services/apiClient";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";
import { connectionModeService } from "@app/services/connectionModeService";
import {
  createBackendNotReadyError,
  isBackendNotReadyError,
} from "@app/constants/backendErrors";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";
import type { AppConfig } from "@app/contexts/AppConfigContext";

export type EndpointAvailabilityMap = Record<
  string,
  EndpointAvailabilityDetails
>;

/** Self-hosted server down, but a local bundled backend is reachable. */
export function isSelfHostedOffline(): boolean {
  return (
    selfHostedServerMonitor.getSnapshot().status === "offline" &&
    !!tauriBackendService.getBackendUrl()
  );
}

/**
 * Gate every remote check on the backend reporting its dependencies ready.
 * Not-ready surfaces as a retryable error so the query retries rather than
 * caching a premature answer. {@link isBackendNotReadyError} also matches the
 * backend-starting error the fetch itself can throw, so both share one retry.
 */
async function ensureDependenciesReady(): Promise<void> {
  try {
    const response = await apiClient.get<AppConfig>(
      "/api/v1/config/app-config",
      { suppressErrorToast: true },
    );
    if (response.data?.dependenciesReady) return;
  } catch {
    // Unreachable app-config is itself "not ready yet".
  }
  throw createBackendNotReadyError();
}

/** New servers return the whole map for a bare call; old ones need the param. */
async function fetchAvailabilityMap(
  endpoints: string[],
): Promise<EndpointAvailabilityMap> {
  try {
    const response = await apiClient.get<EndpointAvailabilityMap>(
      "/api/v1/config/endpoints-availability",
      { suppressErrorToast: true },
    );
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 400) {
      const param = encodeURIComponent(endpoints.join(","));
      const response = await apiClient.get<EndpointAvailabilityMap>(
        `/api/v1/config/endpoints-availability?endpoints=${param}`,
        { suppressErrorToast: true },
      );
      return response.data;
    }
    throw error;
  }
}

function normalise(map: EndpointAvailabilityMap): EndpointAvailabilityMap {
  const out: EndpointAvailabilityMap = {};
  for (const [name, detail] of Object.entries(map)) {
    out[name] = {
      enabled: detail?.enabled ?? false,
      reason: detail?.reason ?? null,
    };
  }
  return out;
}

/** SaaS routing covers a locally-disabled endpoint, so mark it available. */
function applySaasOptimism(
  map: EndpointAvailabilityMap,
): EndpointAvailabilityMap {
  const out: EndpointAvailabilityMap = { ...map };
  for (const [name, detail] of Object.entries(out)) {
    if (!detail.enabled) out[name] = { enabled: true, reason: null };
  }
  return out;
}

/** Self-hosted offline: ask the local backend about each endpoint directly. */
async function resolveOffline(
  endpoints: string[],
): Promise<EndpointAvailabilityMap> {
  const localUrl = tauriBackendService.getBackendUrl();
  const results = await Promise.all(
    [...new Set(endpoints)].map(async (endpoint) => {
      try {
        const supported =
          await endpointAvailabilityService.isEndpointSupportedLocally(
            endpoint,
            localUrl,
          );
        return [endpoint, supported] as const;
      } catch {
        return [endpoint, false] as const;
      }
    }),
  );
  const map: EndpointAvailabilityMap = {};
  for (const [endpoint, supported] of results) {
    map[endpoint] = {
      enabled: supported,
      reason: supported ? null : "NOT_SUPPORTED_LOCALLY",
    };
  }
  return map;
}

/**
 * The whole availability map for the current environment. Fail-closed on a
 * fetch error outside SaaS mode (each requested endpoint disabled), matching
 * desktop's stance that an unknown local capability is unavailable — the
 * opposite of the web fail-open, and the reason this is a desktop shadow.
 */
export async function resolveEndpointsAvailability(
  endpoints: string[],
): Promise<EndpointAvailabilityMap> {
  if (isSelfHostedOffline()) {
    return resolveOffline(endpoints);
  }

  await ensureDependenciesReady();
  const saas = (await connectionModeService.getCurrentMode()) === "saas";

  try {
    const map = normalise(await fetchAvailabilityMap(endpoints));
    return saas ? applySaasOptimism(map) : map;
  } catch (error) {
    if (isBackendNotReadyError(error)) throw error;
    const fallback: EndpointAvailabilityMap = {};
    for (const endpoint of endpoints) {
      fallback[endpoint] = saas
        ? { enabled: true, reason: null }
        : { enabled: false, reason: "UNKNOWN" };
    }
    return fallback;
  }
}

/** Whether one endpoint is enabled, with the same SaaS optimism. */
export async function resolveEndpointEnabled(
  endpoint: string,
): Promise<boolean> {
  if (isSelfHostedOffline()) {
    // ConvertSettings already filters unsupported endpoints from the dropdown,
    // so a selected endpoint is supported locally by the time it reaches here.
    return true;
  }

  await ensureDependenciesReady();
  const saas = (await connectionModeService.getCurrentMode()) === "saas";

  try {
    const response = await apiClient.get<boolean>(
      `/api/v1/config/endpoint-enabled?endpoint=${encodeURIComponent(endpoint)}`,
      { suppressErrorToast: true },
    );
    return response.data || saas;
  } catch (error) {
    if (isBackendNotReadyError(error)) throw error;
    return saas;
  }
}
