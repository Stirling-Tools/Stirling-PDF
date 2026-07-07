import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";
import type {
  ApiKey,
  AuditLogResponse,
  DeploymentRegion,
  ModelsResponse,
  RecentDeployment,
  SecurityConfig,
  StorageConfig,
} from "@portal/mocks/infrastructure";

export type {
  AccessPolicy,
  ApiKey,
  ApiKeyPermission,
  ApiKeyStatus,
  AttestationStatus,
  AuditCategory,
  AuditEvent,
  AuditLogResponse,
  AuditStatus,
  AuditSummary,
  CertStatus,
  ComplianceAttestation,
  ComplianceCert,
  DataResidency,
  DeploymentRegion,
  DeploymentStatus,
  IpAllowEntry,
  KeyManagement,
  KeyMode,
  ModelCostUnit,
  ModelEntry,
  ModelProvider,
  ModelsResponse,
  ModelsSummary,
  ModelStatus,
  ModelType,
  RecentDeployment,
  RegionStatus,
  RetentionWindow,
  RoutingRule,
  SecurityConfig,
  StorageConfig,
  StorageProvider,
} from "@portal/mocks/infrastructure";

export interface DeploymentsResponse {
  regions: DeploymentRegion[];
  recent: RecentDeployment[];
}

const q = (tier: Tier) => `?tier=${encodeURIComponent(tier)}`;

/** GET /v1/infrastructure/deployments?tier=… */
export async function fetchDeployments(
  tier: Tier,
): Promise<DeploymentsResponse> {
  return apiClient.local.json<DeploymentsResponse>(
    `/v1/infrastructure/deployments${q(tier)}`,
  );
}

/** GET /v1/infrastructure/api-keys?tier=… */
export async function fetchApiKeys(tier: Tier): Promise<ApiKey[]> {
  return apiClient.local.json<ApiKey[]>(
    `/v1/infrastructure/api-keys${q(tier)}`,
  );
}

/** GET /v1/infrastructure/security?tier=… */
export async function fetchSecurity(tier: Tier): Promise<SecurityConfig> {
  return apiClient.local.json<SecurityConfig>(
    `/v1/infrastructure/security${q(tier)}`,
  );
}

/** GET /v1/infrastructure/models?tier=… */
export async function fetchModels(tier: Tier): Promise<ModelsResponse> {
  return apiClient.local.json<ModelsResponse>(
    `/v1/infrastructure/models${q(tier)}`,
  );
}

/** GET /v1/infrastructure/storage?tier=… */
export async function fetchStorage(tier: Tier): Promise<StorageConfig> {
  return apiClient.local.json<StorageConfig>(
    `/v1/infrastructure/storage${q(tier)}`,
  );
}

/**
 * GET /api/v1/proprietary/ui-data/infrastructure/audit-log?tier=…
 *
 * Real backend endpoint (Enterprise): serves recent audit_events mapped to the
 * tab's shape, cached server-side. The backend scopes the result to the caller:
 *
 *   - self-hosted / SaaS admin → whole-server view
 *   - SaaS team leader         → only their own team's events
 *
 * In SaaS the portal authenticates with the Supabase JWT (apiClient.saas) so the
 * backend can resolve the caller's team; self-hosted uses the same path via
 * apiClient.local (Spring admin bearer). `tier` is accepted for symmetry but
 * ignored server-side - the audit log isn't tier-scoped.
 */
export async function fetchAuditLog(tier: Tier): Promise<AuditLogResponse> {
  const path = `/api/v1/proprietary/ui-data/infrastructure/audit-log${q(tier)}`;
  return apiClient.saas.isConfigured()
    ? apiClient.saas.json<AuditLogResponse>(path)
    : apiClient.local.json<AuditLogResponse>(path);
}

/**
 * GET /api/v1/proprietary/ui-data/audit-export — download the audit log as a
 * CSV/JSON blob. This endpoint is admin-only and whole-server (no team scope),
 * so the UI only offers it in the full-server view. Routed via the same
 * local/saas client as {@link fetchAuditLog} so SaaS hits the SaaS backend.
 */
export async function exportAuditLog(
  format: "csv" | "json",
  fields: string,
): Promise<Blob> {
  const path = `/api/v1/proprietary/ui-data/audit-export?format=${format}&fields=${encodeURIComponent(
    fields,
  )}`;
  return apiClient.saas.isConfigured()
    ? apiClient.saas.blob(path)
    : apiClient.local.blob(path);
}
