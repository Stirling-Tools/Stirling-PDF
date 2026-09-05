import { isAxiosError } from "axios";
import apiClient from "@app/services/apiClient";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";

export async function fetchEndpointsAvailability(): Promise<
  Record<string, EndpointAvailabilityDetails>
> {
  try {
    const response = await apiClient.get<
      Record<string, EndpointAvailabilityDetails>
    >(`/api/v1/config/endpoints-availability`, {
      suppressErrorToast: true,
      skipAuthRedirect: true,
    });
    const result: Record<string, EndpointAvailabilityDetails> = {};
    for (const [endpoint, details] of Object.entries(response.data)) {
      result[endpoint] = {
        enabled: details?.enabled ?? true,
        reason: details?.reason ?? null,
      };
    }
    return result;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.status === 401) {
      return {};
    }
    throw err;
  }
}

export async function fetchGroupEnabled(group: string): Promise<boolean> {
  const response = await apiClient.get<boolean>(
    `/api/v1/config/group-enabled?group=${encodeURIComponent(group)}`,
  );
  return response.data;
}

export function pickEndpointDetails(
  map: Record<string, EndpointAvailabilityDetails> | undefined,
  endpoints: string[],
): {
  status: Record<string, boolean>;
  details: Record<string, EndpointAvailabilityDetails>;
} {
  const status: Record<string, boolean> = {};
  const details: Record<string, EndpointAvailabilityDetails> = {};
  for (const endpoint of endpoints) {
    const cached = map?.[endpoint];
    status[endpoint] = cached?.enabled ?? true;
    details[endpoint] = cached ?? { enabled: true, reason: null };
  }
  return { status, details };
}
