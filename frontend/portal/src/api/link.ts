import { httpJson } from "@portal/api/http";
import type {
  LinkedInstanceRow,
  RegisterInstanceRequest,
  RegisterInstanceResponse,
} from "@portal/mocks/link";

export type {
  LinkedInstanceRow,
  RegisterInstanceRequest,
  RegisterInstanceResponse,
} from "@portal/mocks/link";

/**
 * Account-link client (combined-billing "Mode A").
 *
 * The portal admin signs in to the SaaS Supabase project (see
 * auth/supabaseLink.ts), then these calls hit the org's own same-origin backend,
 * which proxies to the SaaS account-link API. The paths mirror the real
 * AccountLinkController so MSW can be dropped with no code change. The Supabase
 * access token is forwarded as a Bearer credential — the backend validates it
 * through the existing Supabase security chain before minting a device
 * credential bound to the caller's team.
 */

const BASE = "/api/v1/account-link";

function authHeaders(accessToken: string | null): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/**
 * POST /api/v1/account-link/register — mint a device credential for this
 * instance, bound to the signed-in admin's team. `deviceSecret` is returned
 * exactly once.
 */
export async function registerInstance(
  accessToken: string | null,
  req: RegisterInstanceRequest = {},
): Promise<RegisterInstanceResponse> {
  return httpJson<RegisterInstanceResponse>(`${BASE}/register`, {
    method: "POST",
    body: req,
    headers: authHeaders(accessToken),
  });
}

/** GET /api/v1/account-link/instances — every linked instance for the team. */
export async function fetchInstances(
  accessToken: string | null,
): Promise<LinkedInstanceRow[]> {
  return httpJson<LinkedInstanceRow[]>(`${BASE}/instances`, {
    headers: authHeaders(accessToken),
  });
}

/** POST /api/v1/account-link/instances/{id}/revoke — revoke a linked instance. */
export async function revokeInstance(
  accessToken: string | null,
  instanceId: number,
): Promise<void> {
  await httpJson<void>(`${BASE}/instances/${instanceId}/revoke`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}
