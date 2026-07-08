import { portalBackend } from "@portal/api/http";

/**
 * Integration-config service layer: stored API / MCP connections.
 *
 * (S3 connections are "sources" and live in the Sources surface; this module
 * covers the self-serve API and MCP configs only.) Secrets arrive masked as
 * "********"; sending the mask back on update keeps the stored value.
 *
 * Backend: /api/v1/integrations (any authenticated user; the backend scopes
 * what each caller sees and may manage via `canManage`).
 */

export type IntegrationType = "S3" | "MCP" | "API";
export type OwnerScope = "USER" | "TEAM" | "SERVER";
export type DefaultAccessPolicy =
  | "ORG_ALL"
  | "ADMINS_AND_TEAM_LEADS"
  | "EXPLICIT_ONLY";

/** The API/MCP types this surface manages (S3 belongs to Sources). */
export const MANAGED_TYPES: IntegrationType[] = ["API", "MCP"];

export interface IntegrationConfig {
  id: number;
  integrationType: IntegrationType;
  name: string;
  scope: OwnerScope;
  ownerUserId?: number | null;
  ownerTeamId?: number | null;
  enabled: boolean;
  locked: boolean;
  defaultAccess: DefaultAccessPolicy;
  /** Type-specific fields; secret values are masked. */
  config: Record<string, unknown>;
  /** Whether the caller may edit/delete/share this config. */
  canManage: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IntegrationConfigRequest {
  integrationType?: IntegrationType;
  name?: string;
  scope?: OwnerScope;
  ownerTeamId?: number;
  enabled?: boolean;
  locked?: boolean;
  defaultAccess?: DefaultAccessPolicy;
  config?: Record<string, unknown>;
}

const BASE = "/api/v1/integrations";

/** GET /integrations: every config the caller can see (own + shared + server). */
export async function fetchIntegrations(): Promise<IntegrationConfig[]> {
  return portalBackend.json<IntegrationConfig[]>(BASE);
}

/** POST /integrations: create a config. */
export async function createIntegration(
  req: IntegrationConfigRequest,
): Promise<IntegrationConfig> {
  return portalBackend.json<IntegrationConfig>(BASE, {
    method: "POST",
    body: req,
  });
}

/** PUT /integrations/{id}: update name/enabled/config (blank secrets kept). */
export async function updateIntegration(
  id: number,
  req: IntegrationConfigRequest,
): Promise<IntegrationConfig> {
  return portalBackend.json<IntegrationConfig>(`${BASE}/${id}`, {
    method: "PUT",
    body: req,
  });
}

/** DELETE /integrations/{id}: remove a config and its shares. */
export async function deleteIntegration(id: number): Promise<void> {
  await portalBackend.json(`${BASE}/${id}`, { method: "DELETE" });
}
