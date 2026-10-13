import { apiClient } from "@app/portal/api/http";
import { getPortalSaasToken } from "@app/portal/auth/portalSaasSession";
import type { Member } from "@app/portal/api/users";
import type {
  CloudOwnershipStatus,
  OwnershipStatus,
  OwnershipTransferAdapter,
} from "@app/components/shared/ownership/OwnershipTransferModal";

const path = "/api/v1/ownership/handover";

/** Only the local owner can read a pending transfer. No cloud bearer is stored in the handover. */
export const pendingOwnership = () =>
  apiClient.local.json<OwnershipStatus | null>(path);

/** The local server supplies its own device credential and rechecks cloud ownership on completion. */
export function ownershipAdapter(
  member: Pick<Member, "id" | "name" | "email" | "teamId">,
  local: boolean,
  signIn: () => void,
): OwnershipTransferAdapter {
  async function cloudAction(action: "invite" | "transfer") {
    const token = await getPortalSaasToken();
    return apiClient.local.json<OwnershipStatus>(`${path}/cloud/${action}`, {
      method: "POST",
      headers: token ? { "X-SaaS-Authorization": `Bearer ${token}` } : {},
    });
  }
  if (local)
    return {
      local,
      signIn,
      loadCandidates: () =>
        apiClient.local.json<NonNullable<OwnershipStatus["candidates"]>>(
          `${path}/members`,
        ),
      prepare: () =>
        apiClient.local.json<OwnershipStatus>(`${path}/${member.id}`, {
          method: "POST",
        }),
      selectCloud: (selection) =>
        apiClient.local.json<OwnershipStatus>(`${path}/${member.id}`, {
          method: "POST",
          body: selection,
        }),
      invite: () => cloudAction("invite"),
      transferCloud: () => cloudAction("transfer"),
      completeLocal: () =>
        apiClient.local.json<void>("/api/v1/user/admin/transferOwnership", {
          method: "POST",
          body: { userId: Number(member.id) },
        }),
      cancel: () => apiClient.local.json<void>(path, { method: "DELETE" }),
    };
  const wrap = (cloud: CloudOwnershipStatus): OwnershipStatus => ({
    targetId: Number(member.id),
    targetName: member.name,
    targetEmail: member.email ?? null,
    cloud,
  });
  return {
    local,
    prepare: async () =>
      wrap(
        await apiClient.local.json<CloudOwnershipStatus>(
          `/api/v1/team/${member.teamId}/ownership/status`,
          { method: "POST", body: { email: member.email } },
        ),
      ),
    transferCloud: async (state) =>
      wrap(
        await apiClient.local.json<CloudOwnershipStatus>(
          `/api/v1/team/${member.teamId}/ownership/transfer`,
          {
            method: "POST",
            body: {
              email: member.email,
              expectedLeaderId: state.cloud?.leaderUserId,
            },
          },
        ),
      ),
  };
}
