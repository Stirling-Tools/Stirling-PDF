import { apiClient } from "@portal/api/http";

/**
 * Access-control service layer: the ResourceGrant ACL the portal admin drives.
 *
 * Grants sit on top of the default policy (admins + team leads may enter the
 * portal; owners/admins may use their configs). A grant widens that: a PORTAL
 * grant lets a specific user/team into the processor; an INTEGRATION_CONFIG
 * grant shares one stored config with a user/team at USE or MANAGE.
 *
 * Backend: /api/v1/admin/access/grants (admin only).
 */

export type PrincipalType = "USER" | "TEAM";
export type ResourceType = "PORTAL" | "INTEGRATION_CONFIG";
export type AccessPermission = "USE" | "MANAGE";

/** One ACL row. `resourceId` is "" for the singleton PORTAL resource. */
export interface ResourceGrant {
  id: number;
  resourceType: ResourceType;
  resourceId: string;
  principalType: PrincipalType;
  principalId: number;
  permission: AccessPermission;
  createdAt?: string;
}

/** Create body; `permission` defaults to USE, `resourceId` empty for PORTAL. */
export interface GrantRequest {
  resourceType: ResourceType;
  resourceId?: string;
  principalType: PrincipalType;
  principalId: number;
  permission?: AccessPermission;
}

const BASE = "/api/v1/admin/access/grants";

/** GET /grants: every grant on one resource (PORTAL, or one config by id). */
export async function fetchGrants(
  resourceType: ResourceType,
  resourceId = "",
): Promise<ResourceGrant[]> {
  const q = new URLSearchParams({ resourceType });
  if (resourceId) q.set("resourceId", resourceId);
  return apiClient.local.json<ResourceGrant[]>(`${BASE}?${q.toString()}`);
}

/** POST /grants: grant (or, for a new permission, re-grant) access. */
export async function createGrant(req: GrantRequest): Promise<ResourceGrant> {
  return apiClient.local.json<ResourceGrant>(BASE, {
    method: "POST",
    body: req,
  });
}

/** DELETE /grants/{id}: revoke a single grant row. */
export async function revokeGrant(id: number): Promise<void> {
  await apiClient.local.json(`${BASE}/${id}`, { method: "DELETE" });
}
