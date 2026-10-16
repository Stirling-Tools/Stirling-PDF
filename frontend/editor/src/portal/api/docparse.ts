import { apiClient } from "@portal/api/http";

export interface DocparseCapabilities {
  enabled: boolean;
  engineReachable: boolean;
  indexingConfigured: boolean;
}

/** Probe current ingestion readiness before saving a guided policy. */
export function fetchDocparseCapabilities(): Promise<DocparseCapabilities> {
  return apiClient.local.json<DocparseCapabilities>(
    "/api/v1/docparse/capabilities",
  );
}
