import type { UsersBackend } from "@portal/api/usersBackend";
import { apiClient } from "@portal/api/http";
import { tryGetPortalQueryClient } from "@portal/queryClient";
import { qk } from "@portal/queries/keys";
import {
  ROLES,
  type AdminAuthConfig,
  type InviteResult,
  type Member,
  type PendingInvitation,
  type RoleId,
  type UsersResponse,
} from "@portal/api/users";
import type { Team } from "@portal/api/teams";
import type { Tier } from "@portal/contexts/TierContext";

/**
 * SaaS build: the Users page runs as a team leader against SaasTeamController
 * (`/api/v1/team/*`), not the ROLE_ADMIN admin endpoints (which 403 for SaaS's
 * ROLE_USER accounts). Shapes here mirror SaasTeamController's DTOs and are
 * mapped onto the shared portal `Member` / `UsersResponse` types. Same paths the
 * editor's SaaSTeamContext uses.
 */

/* ── SaasTeamController DTOs ─────────────────────────────────────────────── */

interface TeamDetailsDTO {
  teamId: number;
  name: string;
  teamType: string;
  isPersonal: boolean;
  memberCount: number;
  seatCount: number;
  seatsUsed: number;
  maxSeats: number;
  isLeader: boolean;
}

interface TeamMemberDTO {
  id: number;
  username: string;
  email: string;
  /** "LEADER" | "MEMBER". */
  role: string;
  joinedAt?: string;
}

interface InvitationDTO {
  invitationId: number;
  teamName: string;
  inviterEmail: string;
  inviteeEmail: string;
  invitationToken: string;
  /** "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED". */
  status: string;
  expiresAt?: string;
}

/** No last-activity signal on the team endpoints, so the column reads a dash. */
const NO_ACTIVITY = "-";

/** 0 / huge sentinel seat values mean "no limit". */
function normalizeSeatLimit(max: number | undefined): number | null {
  if (!max || max <= 0 || max >= 100000) return null;
  return max;
}

/** True only when the ISO expiry is present, parseable, and in the past. */
function isExpired(iso: string | undefined): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) && ts <= Date.now();
}

/**
 * The leader's manageable team. Prefer a real (non-personal) team they lead,
 * then any team they lead, then their first team. Returns null when the user has
 * no teams at all.
 */
async function resolveTeam(): Promise<TeamDetailsDTO | null> {
  const fetchMy = () =>
    apiClient.local.json<TeamDetailsDTO[]>("/api/v1/team/my");
  // fetchUsers and fetchTeams both resolve the team; share one /team/my via the
  // query cache. fetchQuery (not ensureQueryData) so the shared entry honours
  // both staleTime — two callers in one mount dedupe to a single request — AND
  // invalidation: refresh() invalidates qk.teamMy(), so the next resolve after a
  // rename/remove refetches instead of returning the stale team. Falls back to a
  // direct fetch when no portal client is mounted (e.g. a unit test).
  const client = tryGetPortalQueryClient();
  const teams = client
    ? await client.fetchQuery({ queryKey: qk.teamMy(), queryFn: fetchMy })
    : await fetchMy();
  if (!teams || teams.length === 0) return null;
  return (
    teams.find((t) => t.isLeader && !t.isPersonal) ??
    teams.find((t) => t.isLeader) ??
    teams[0]
  );
}

/** Map a SaasTeamController member onto the portal Member. */
function toMember(dto: TeamMemberDTO, team: TeamDetailsDTO): Member {
  const isLeader = dto.role === "LEADER";
  const role: RoleId = isLeader ? "team_owner" : "member";
  return {
    id: String(dto.id),
    name: dto.username,
    email: dto.email ?? dto.username,
    username: dto.username,
    role,
    teamLead: isLeader,
    teamId: team.teamId,
    teamName: team.name,
    // The portal Users page is leader-only on SaaS, so when the viewer leads this
    // team the LEADER row is them; mark it self so self-remove is disabled (leaving
    // is a separate flow). Guarded on team.isLeader so a non-leader fallback view
    // doesn't mislabel someone else's row as self.
    isSelf: isLeader && team.isLeader,
    // Leaders hold portal (processor) access via the role-based default policy;
    // members don't by default. Drives the roster's access chip.
    canAccessPortal: isLeader,
    status: "active",
    lastActive: NO_ACTIVITY,
    authority: "ROLE_USER",
  };
}

/** Map a SaasTeamController invitation onto the portal PendingInvitation. */
function toInvitation(dto: InvitationDTO): PendingInvitation {
  return {
    id: dto.invitationId,
    email: dto.inviteeEmail,
    invitedBy: dto.inviterEmail,
    expiresAt: dto.expiresAt,
  };
}

export const usersBackend: UsersBackend = {
  async fetchUsers(tier: Tier): Promise<UsersResponse> {
    const team = await resolveTeam();
    if (!team) {
      return {
        summary: {
          totalMembers: 0,
          pendingInvites: 0,
          seatsUsed: 0,
          seatLimit: null,
        },
        members: [],
        roles: ROLES,
        access: { tier, seatsUsed: 0, seatLimit: null },
        mailEnabled: true,
        emailInvitesEnabled: true,
        invitations: [],
      };
    }

    const memberDtos = await apiClient.local.json<TeamMemberDTO[]>(
      `/api/v1/team/${team.teamId}/members`,
    );
    // Invitations are leader-only; skip the call (would 403) if we resolved a
    // team the user only belongs to.
    const invitationDtos = team.isLeader
      ? await apiClient.local.json<InvitationDTO[]>(
          `/api/v1/team/${team.teamId}/invitations`,
        )
      : [];

    const members = (memberDtos ?? []).map((m) => toMember(m, team));
    // Only genuinely-live invites: PENDING, and not past expiry. The backend
    // returns every status and flips PENDING->EXPIRED on a daily sweep, so a
    // past-expiry PENDING row can linger for up to a day - drop it here.
    const invitations = (invitationDtos ?? [])
      .filter((i) => i.status === "PENDING" && !isExpired(i.expiresAt))
      .map(toInvitation);
    const seatLimit = normalizeSeatLimit(team.maxSeats);
    const seatsUsed = team.seatsUsed ?? members.length;

    return {
      summary: {
        totalMembers: members.length,
        pendingInvites: invitations.length,
        seatsUsed,
        seatLimit,
      },
      members,
      roles: ROLES,
      access: { tier, seatsUsed, seatLimit },
      // SaaS always has email (Supabase); no self-hosted SMTP gate.
      mailEnabled: true,
      emailInvitesEnabled: true,
      invitations,
    };
  },

  async fetchTeams(): Promise<Team[]> {
    const team = await resolveTeam();
    if (!team) return [];
    return [
      {
        id: team.teamId,
        name: team.name,
        userCount: team.memberCount,
        owners: [],
        isPersonal: team.isPersonal,
      },
    ];
  },

  fetchAuthConfig(): Promise<AdminAuthConfig> {
    // SaaS is Supabase-authed: no direct password create, no self-hosted
    // OAuth/SAML provider list. Static, no network call (the login probe is an
    // admin/self-hosted endpoint).
    return Promise.resolve({
      canDirectCreate: false,
      hasOauth: false,
      hasSaml: false,
    });
  },

  async inviteMember(
    email: string,
    _role: Extract<RoleId, "admin" | "member">,
    teamId?: number,
  ): Promise<InviteResult> {
    // SaaS invitations are always plain members; role is ignored.
    const tid = teamId ?? (await resolveTeam())?.teamId;
    if (tid == null) throw new Error("No team to invite to");
    await apiClient.local.json(`/api/v1/team/invite`, {
      method: "POST",
      body: { teamId: tid, email },
    });
    return { successCount: 1, failureCount: 0 };
  },

  async renameTeam(teamId: number, newName: string): Promise<void> {
    await apiClient.local.json(`/api/v1/team/${teamId}/rename`, {
      method: "POST",
      body: { newName },
    });
  },

  async removeMember(member: Member): Promise<void> {
    if (member.teamId == null) {
      throw new Error("Member has no team to be removed from");
    }
    await apiClient.local.json(
      `/api/v1/team/${member.teamId}/members/${member.id}`,
      { method: "DELETE" },
    );
  },

  async cancelInvitation(invitationId: number): Promise<void> {
    await apiClient.local.json(`/api/v1/team/invitations/${invitationId}`, {
      method: "DELETE",
    });
  },
};
