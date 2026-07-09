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

/** GET the audit log; SaaS or local, backend-scoped (admin → server, SaaS lead → team). */
export async function fetchAuditLog(tier: Tier): Promise<AuditLogResponse> {
  const path = `/api/v1/proprietary/ui-data/infrastructure/audit-log${q(tier)}`;
  return apiClient.saas.isConfigured()
    ? apiClient.saas.json<AuditLogResponse>(path)
    : apiClient.local.json<AuditLogResponse>(path);
}

/** Download the audit log as a CSV/JSON blob (admin-only, whole-server); SaaS or local. */
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
