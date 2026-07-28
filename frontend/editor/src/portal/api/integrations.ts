/**
 * Integrations service layer: stored connections (S3, Purview, ConsignO, and free-form API) that
 * policy sources, pipeline outputs and integration steps reference by id instead of embedding
 * credentials. Secrets are write-only - reads return them masked, and sending
 * the mask back on update keeps the stored value.
 */
import { apiClient } from "@portal/api/http";

export type IntegrationType = "S3" | "MCP" | "API" | "PURVIEW" | "CONSIGNO";
export type OwnerScope = "USER" | "TEAM" | "SERVER";

/** Mirrors the backend IntegrationConfigResponse; `config` values are masked. */
export interface IntegrationConfig {
  id: number;
  integrationType: IntegrationType;
  name: string;
  scope: OwnerScope;
  ownerUserId: number | null;
  ownerTeamId: number | null;
  enabled: boolean;
  locked: boolean;
  defaultAccess: string;
  config: Record<string, unknown>;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Create/update body; omitted fields keep their stored values on update. */
export interface IntegrationConfigRequest {
  integrationType?: IntegrationType;
  name?: string;
  scope?: OwnerScope;
  ownerTeamId?: number | null;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export async function fetchIntegrations(): Promise<IntegrationConfig[]> {
  return apiClient.local.json<IntegrationConfig[]>("/api/v1/integrations");
}

/** The S3 connections the caller may use, for source/output pickers. */
export async function fetchS3Connections(): Promise<IntegrationConfig[]> {
  return (await fetchIntegrations()).filter(
    (integration) => integration.integrationType === "S3",
  );
}

/**
 * What this caller may set up. Answered by the server because the custom-API gate is an
 * authorization decision, not a presentation one - the create call is refused regardless.
 */
export interface IntegrationCapabilities {
  customApi: boolean;
}

export async function fetchIntegrationCapabilities(): Promise<IntegrationCapabilities> {
  return apiClient.local.json<IntegrationCapabilities>(
    "/api/v1/integrations/capabilities",
  );
}

export async function createIntegration(
  body: IntegrationConfigRequest,
): Promise<IntegrationConfig> {
  return apiClient.local.json<IntegrationConfig>("/api/v1/integrations", {
    method: "POST",
    body,
  });
}

export async function updateIntegration(
  id: number,
  body: IntegrationConfigRequest,
): Promise<IntegrationConfig> {
  return apiClient.local.json<IntegrationConfig>(
    `/api/v1/integrations/${encodeURIComponent(id)}`,
    { method: "PUT", body },
  );
}

export async function deleteIntegration(id: number): Promise<void> {
  await apiClient.local.json<void>(
    `/api/v1/integrations/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
