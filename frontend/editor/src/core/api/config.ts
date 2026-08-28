import apiClient from "@app/services/apiClient";
import { setProcessorEnabled } from "@app/services/processorEnabled";
import { getSimulatedAppConfig } from "@app/testing/serverExperienceSimulations";
import type { AppConfig } from "@app/types/appConfig";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";

/** Unauthenticated and unreachable both mean "assume login is on". */
export const DEFAULT_APP_CONFIG: AppConfig = { enableLogin: true };

/** Earliest point the Processor flag is known — feed the non-hook snapshot. */
function publishConfig(config: AppConfig): AppConfig {
  // Only an explicit false turns it off: the 401 fallback carries no flag, and
  // reading that as "off" would silently stop policy export enforcement.
  setProcessorEnabled(config.processorEnabled !== false);
  return config;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const simulated = getSimulatedAppConfig();
  if (simulated) return publishConfig(simulated);

  try {
    const response = await apiClient.get<AppConfig>(
      "/api/v1/config/app-config",
      { suppressErrorToast: true, skipAuthRedirect: true },
    );
    return publishConfig(response.data);
  } catch (error) {
    // 401 is an answer, not a failure: the app runs unauthenticated.
    if ((error as { response?: { status?: number } })?.response?.status === 401)
      return publishConfig(DEFAULT_APP_CONFIG);
    throw error;
  }
}

export type EndpointAvailabilityMap = Record<
  string,
  EndpointAvailabilityDetails
>;

/**
 * Fires on app load before auth settles, so a 401 must not trigger the global
 * login redirect. Callers treat a failure as "assume enabled".
 */
export async function fetchEndpointsAvailability(): Promise<EndpointAvailabilityMap> {
  const response = await apiClient.get<EndpointAvailabilityMap>(
    "/api/v1/config/endpoints-availability",
    { suppressErrorToast: true, skipAuthRedirect: true },
  );
  return Object.fromEntries(
    Object.entries(response.data).map(([name, detail]) => [
      name,
      { enabled: detail?.enabled ?? true, reason: detail?.reason ?? null },
    ]),
  );
}

export async function fetchEndpointEnabled(endpoint: string): Promise<boolean> {
  const response = await apiClient.get<boolean>(
    `/api/v1/config/endpoint-enabled?endpoint=${encodeURIComponent(endpoint)}`,
  );
  return response.data;
}

export interface FooterInfo {
  analyticsEnabled?: boolean;
  termsAndConditions?: string;
  privacyPolicy?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
}

/** Public — no authentication required. */
export async function fetchFooterInfo(): Promise<FooterInfo> {
  try {
    const response = await apiClient.get<FooterInfo>(
      "/api/v1/ui-data/footer-info",
      { suppressErrorToast: true },
    );
    return response.data;
  } catch (error) {
    // Toasts are suppressed here, so the failure would otherwise be silent.
    console.error("[api/config] footer-info failed:", error);
    throw error;
  }
}

export async function fetchGroupEnabled(group: string): Promise<boolean> {
  const response = await apiClient.get<boolean>(
    `/api/v1/config/group-enabled?group=${encodeURIComponent(group)}`,
  );
  return response.data;
}
