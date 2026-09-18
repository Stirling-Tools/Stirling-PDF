import { apiClient } from "@portal/api/http";

export interface DocparseCapabilities {
  enabled: boolean;
  mode: string;
  advancedInstalled: boolean;
  engineReachable: boolean;
  indexingConfigured?: boolean | null;
  doclingVersion: string | null;
}

export function fetchDocparseCapabilities(
  refresh = false,
): Promise<DocparseCapabilities> {
  return apiClient.local.json<DocparseCapabilities>(
    `/api/v1/docparse/capabilities${refresh ? "?refresh=true" : ""}`,
  );
}
