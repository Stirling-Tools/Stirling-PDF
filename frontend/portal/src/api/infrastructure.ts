import { httpJson } from "@portal/api/http";
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
  return httpJson<DeploymentsResponse>(
    `/v1/infrastructure/deployments${q(tier)}`,
  );
}

/** GET /v1/infrastructure/api-keys?tier=… */
export async function fetchApiKeys(tier: Tier): Promise<ApiKey[]> {
  return httpJson<ApiKey[]>(`/v1/infrastructure/api-keys${q(tier)}`);
}

/** GET /v1/infrastructure/security?tier=… */
export async function fetchSecurity(tier: Tier): Promise<SecurityConfig> {
  return httpJson<SecurityConfig>(`/v1/infrastructure/security${q(tier)}`);
}

/** GET /v1/infrastructure/models?tier=… */
export async function fetchModels(tier: Tier): Promise<ModelsResponse> {
  return httpJson<ModelsResponse>(`/v1/infrastructure/models${q(tier)}`);
}

/** GET /v1/infrastructure/storage?tier=… */
export async function fetchStorage(tier: Tier): Promise<StorageConfig> {
  return httpJson<StorageConfig>(`/v1/infrastructure/storage${q(tier)}`);
}

/** GET /v1/infrastructure/audit-log?tier=… */
export async function fetchAuditLog(tier: Tier): Promise<AuditLogResponse> {
  return httpJson<AuditLogResponse>(`/v1/infrastructure/audit-log${q(tier)}`);
}
