import { apiClient } from "@portal/api/http";
import type { UsersResponse } from "@portal/mocks/users";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  AccessControls,
  Member,
  MemberStatus,
  Role,
  RoleId,
  UsersResponse,
  UsersSummary,
} from "@portal/mocks/users";
export {
  MEMBER_STATUS_TONE,
  ROLES,
  ROLE_LABEL,
  ROLE_TONE,
} from "@portal/mocks/users";

/** GET /v1/users?tier=… — summary strip, members table, role catalogue, access. */
export async function fetchUsers(tier: Tier): Promise<UsersResponse> {
  return apiClient.local.json<UsersResponse>(
    `/v1/users?tier=${encodeURIComponent(tier)}`,
  );
}
