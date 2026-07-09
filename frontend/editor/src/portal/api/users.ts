import { apiClient } from "@portal/api/http";
import { ROLES } from "@portal/mocks/users";
import type { Member, RoleId, UsersResponse } from "@portal/mocks/users";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  AccessControls,
  Member,
  MemberStatus,
  PortalAccessState,
  Role,
  RoleId,
  UsersResponse,
  UsersSummary,
} from "@portal/mocks/users";
export {
  MEMBER_STATUS_TONE,
  PORTAL_ACCESS_TONE,
  ROLES,
  ROLE_LABEL,
  ROLE_TONE,
} from "@portal/mocks/users";

/** Roles an admin can assign from the portal; guest is derived, not assigned. */
export const ASSIGNABLE_ROLES: RoleId[] = ["admin", "team_owner", "member"];

/* ── backend payload (subset of AdminSettingsData) ─────────────────────── */

interface AdminUserSummaryDto {
  id: number;
  username: string;
  email?: string;
  rolesAsString?: string;
  enabled: boolean;
  teamLead?: boolean;
  team?: { id: number; name: string };
  authenticationType?: string;
  /** Authoritative server-side portal access (honors the configured default policy). */
  portalAccess?: boolean;
}

interface AdminSettingsDto {
  users: AdminUserSummaryDto[];
  userLastRequest?: Record<string, number | string>;
  userSettings?: Record<string, Record<string, string>>;
  lockedUsers?: string[];
  mailEnabled?: boolean;
  emailInvitesEnabled?: boolean;
  totalUsers?: number;
  maxAllowedUsers?: number;
  currentUsername?: string;
}

function roleIdFor(u: AdminUserSummaryDto): RoleId {
  const role = u.rolesAsString ?? "";
  if (role.includes("ROLE_ADMIN")) return "admin";
  if (u.teamLead) return "team_owner";
  // Guest (web-only/demo) is hidden from the UI for now; surface as a member.
  return "member";
}

/** A member's last-seen time as plain language; "Never" when no session is tracked. */
function relativeTime(value: number | string | undefined): string {
  if (value === undefined || value === null) return "Never";
  const ts = typeof value === "string" ? Date.parse(value) : value;
  if (!Number.isFinite(ts) || ts <= 0) return "Never";
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  if (months < 12) return months <= 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.round(days / 365);
  return years <= 1 ? "1 year ago" : `${years} years ago`;
}

/** 0 / huge sentinel license values mean "no seat limit". */
function normalizeSeatLimit(max: number | undefined): number | null {
  if (!max || max <= 0 || max >= 100000) return null;
  return max;
}

/**
 * GET /api/v1/proprietary/ui-data/admin-settings adapted onto the portal's
 * UsersResponse. Role = stored authority + team leadership; the role
 * catalogue is client copy. `tier` shapes only the access card.
 */
export async function fetchUsers(tier: Tier): Promise<UsersResponse> {
  const data = await apiClient.local.json<AdminSettingsDto>(
    "/api/v1/proprietary/ui-data/admin-settings",
  );
  const locked = new Set(data.lockedUsers ?? []);
  const members: Member[] = (data.users ?? []).map((u) => ({
    id: String(u.id),
    name: u.username,
    email: u.email ?? u.username,
    username: u.username,
    teamId: u.team?.id,
    teamName: u.team?.name,
    role: roleIdFor(u),
    teamLead: u.teamLead === true,
    canAccessPortal: u.portalAccess === true,
    isSelf: !!data.currentUsername && data.currentUsername === u.username,
    status: u.enabled ? "active" : "suspended",
    lastActive: relativeTime(data.userLastRequest?.[u.username]),
    locked: locked.has(u.username),
    mfaEnabled: data.userSettings?.[u.username]?.mfaEnabled === "true",
    authType: u.authenticationType,
    authority: u.rolesAsString,
  }));
  const seatLimit = normalizeSeatLimit(data.maxAllowedUsers);
  const seatsUsed = data.totalUsers ?? members.length;
  return {
    summary: {
      totalMembers: members.length,
      pendingInvites: 0,
      seatsUsed,
      seatLimit,
    },
    members,
    roles: ROLES,
    access: { tier, seatsUsed, seatLimit },
    mailEnabled: data.mailEnabled === true,
    emailInvitesEnabled: data.emailInvitesEnabled === true,
  };
}

/* ── row actions (Spring @RequestParam endpoints) ──────────────────────── */

async function setAuthority(username: string, role: string): Promise<void> {
  await apiClient.local.form("/api/v1/user/admin/changeRole", {
    username,
    role,
  });
}

/**
 * Reassign a member's canonical role. Admin/member map onto the stored ROLE_*
 * authority; team owner is a LEADER membership on the user's team. Leadership is
 * assigned/removed on `teamLead` (independent of the displayed role), and for
 * team_owner the ownership call runs FIRST so a rejection can't strand a demote.
 */
export async function changeMemberRole(
  member: Member,
  target: RoleId,
): Promise<void> {
  if (!member.username) throw new Error("Member has no backend identity");
  if (target === member.role) return;

  const holdsAdmin = member.role === "admin";
  const holdsLeader = member.teamLead === true;
  // A stored web-only/demo authority must be lifted to ROLE_USER for member/team_owner.
  // roleIdFor() surfaces a web-only account as "member", so read the raw authority.
  const holdsWebOnly = (member.authority ?? "").includes("ROLE_WEB_ONLY_USER");

  if (target === "guest") {
    // Demote to web-only; drop any leadership first so no team is left ownerless-by-a-guest.
    if (holdsLeader && member.teamId) {
      await apiClient.local.form("/api/v1/team/removeOwner", {
        teamId: String(member.teamId),
        userId: member.id,
      });
    }
    await setAuthority(member.username, "ROLE_WEB_ONLY_USER");
    return;
  }

  if (target === "admin") {
    if (!holdsAdmin) await setAuthority(member.username, "ROLE_ADMIN");
    return; // any LEADER membership is harmless; an admin owns everything anyway
  }

  if (target === "team_owner") {
    if (!member.teamId) {
      throw new Error("Member must belong to a team to become its owner");
    }
    // Assign ownership first so a 400 (e.g. system team) leaves the user unchanged.
    await apiClient.local.form("/api/v1/team/setOwner", {
      teamId: String(member.teamId),
      userId: member.id,
    });
    if (holdsAdmin || holdsWebOnly)
      await setAuthority(member.username, "ROLE_USER");
    return;
  }

  // target === "member": drop any leadership, and normalise a non-ROLE_USER authority.
  if (holdsLeader && member.teamId) {
    await apiClient.local.form("/api/v1/team/removeOwner", {
      teamId: String(member.teamId),
      userId: member.id,
    });
  }
  if (holdsAdmin || holdsWebOnly)
    await setAuthority(member.username, "ROLE_USER");
}

export async function setMemberSuspended(
  member: Member,
  suspended: boolean,
): Promise<void> {
  if (!member.username) throw new Error("Member has no backend identity");
  await apiClient.local.form(
    `/api/v1/user/admin/changeUserEnabled/${encodeURIComponent(member.username)}`,
    { enabled: String(!suspended) },
  );
}

export async function removeMember(member: Member): Promise<void> {
  if (!member.username) throw new Error("Member has no backend identity");
  await apiClient.local.json(
    `/api/v1/user/admin/deleteUser/${encodeURIComponent(member.username)}`,
    { method: "POST" },
  );
}

export interface ResetPasswordOptions {
  /** The new password (client-generated or admin-typed). */
  newPassword: string;
  forcePasswordChange?: boolean;
  sendEmail?: boolean;
  includePassword?: boolean;
}

/** Admin reset of a member's password (cannot target yourself). */
export async function resetMemberPassword(
  member: Member,
  opts: ResetPasswordOptions,
): Promise<void> {
  if (!member.username) throw new Error("Member has no backend identity");
  const params: Record<string, string> = {
    username: member.username,
    newPassword: opts.newPassword,
  };
  if (opts.forcePasswordChange) params.forcePasswordChange = "true";
  if (opts.sendEmail) params.sendEmail = "true";
  if (opts.includePassword) params.includePassword = "true";
  await apiClient.local.form(
    "/api/v1/user/admin/changePasswordForUser",
    params,
  );
}

/** Unlock an account locked after failed logins. */
export async function unlockMember(member: Member): Promise<void> {
  if (!member.username) throw new Error("Member has no backend identity");
  await apiClient.local.json(
    `/api/v1/user/admin/unlockUser/${encodeURIComponent(member.username)}`,
    { method: "POST" },
  );
}

/** Reset (disable) a member's MFA enrolment. */
export async function disableMemberMfa(member: Member): Promise<void> {
  if (!member.username) throw new Error("Member has no backend identity");
  await apiClient.local.json(
    `/api/v1/auth/mfa/disable/admin/${encodeURIComponent(member.username)}`,
    { method: "POST" },
  );
}

/**
 * Move a member to a different team, keeping their role. The backend changeRole
 * endpoint requires a single role, so we resolve one canonical authority from the
 * member's stored roles (which may be a CSV) - preserving a web-only account and
 * never silently promoting one to ROLE_USER.
 */
export async function moveMemberToTeam(
  member: Member,
  teamId: number,
): Promise<void> {
  if (!member.username) throw new Error("Member has no backend identity");
  const role = canonicalAuthority(member);
  await apiClient.local.form("/api/v1/user/admin/changeRole", {
    username: member.username,
    role,
    teamId: String(teamId),
  });
}

/**
 * The member's single canonical ROLE_* authority. `authority` is the raw stored
 * rolesAsString, which may be a CSV; match on substrings so a compound value maps
 * to one role. Web-only is preserved; team_owner/member both store as ROLE_USER
 * (leadership is a separate membership, not an authority).
 */
function canonicalAuthority(member: Member): string {
  const stored = member.authority ?? "";
  if (stored.includes("ROLE_ADMIN")) return "ROLE_ADMIN";
  if (stored.includes("ROLE_WEB_ONLY_USER")) return "ROLE_WEB_ONLY_USER";
  if (stored.includes("ROLE_USER")) return "ROLE_USER";
  // Authority absent/unrecognized: fall back to the displayed role, never upgrading.
  return member.role === "admin" ? "ROLE_ADMIN" : "ROLE_USER";
}

/* ── direct account creation (self-hosted / password auth only) ────────── */

interface LoginConfigDto {
  enableLogin?: boolean;
  loginMethod?: string;
  providerList?: Record<string, string>;
}

export interface AdminAuthConfig {
  /**
   * True only on a self-hosted instance with username/password login (loginMethod
   * all|normal). SaaS (Supabase-authed) has no password accounts, so direct
   * create is hidden there - and the portal can only reach a self-hosted backend
   * anyway (it logs in via /api/v1/auth/login, which SaaS doesn't expose).
   */
  canDirectCreate: boolean;
  hasOauth: boolean;
  hasSaml: boolean;
}

/** Probe the login config to decide whether direct account creation is offered. */
export async function fetchAuthConfig(): Promise<AdminAuthConfig> {
  const d = await apiClient.local.json<LoginConfigDto>(
    "/api/v1/proprietary/ui-data/login",
  );
  const method = (d.loginMethod ?? "all").toLowerCase();
  const keys = Object.keys(d.providerList ?? {});
  return {
    canDirectCreate:
      d.enableLogin === true && (method === "all" || method === "normal"),
    hasOauth: keys.some((k) => k.includes("oauth2")),
    hasSaml: keys.some((k) => k.includes("saml")),
  };
}

export type AuthType = "WEB" | "OAUTH2" | "SAML2";

export interface CreateMemberParams {
  username: string;
  /** Required for WEB (password) accounts; omitted for OAUTH2/SAML2. */
  password?: string;
  role: Extract<RoleId, "admin" | "member">;
  teamId?: number;
  authType: AuthType;
  forceChange?: boolean;
  forceMFA?: boolean;
}

/** Create an account directly (self-hosted). Returns the created username. */
export async function createMember(p: CreateMemberParams): Promise<string> {
  const params: Record<string, string> = {
    username: p.username,
    role: p.role === "admin" ? "ROLE_ADMIN" : "ROLE_USER",
    authType: p.authType,
  };
  if (p.password) params.password = p.password;
  if (p.teamId != null) params.teamId = String(p.teamId);
  if (p.forceChange) params.forceChange = "true";
  if (p.forceMFA) params.forceMFA = "true";
  await apiClient.local.form("/api/v1/user/admin/saveUser", params);
  return p.username;
}

export interface InviteResult {
  successCount?: number;
  failureCount?: number;
  message?: string;
  errors?: string;
  error?: string;
}

/** Email invite; creates the account and mails a join link (mail required). */
export async function inviteMember(
  email: string,
  role: Extract<RoleId, "admin" | "member">,
  teamId?: number,
): Promise<InviteResult> {
  const params: Record<string, string> = {
    emails: email,
    role: role === "admin" ? "ROLE_ADMIN" : "ROLE_USER",
  };
  if (teamId != null) params.teamId = String(teamId);
  return apiClient.local.form<InviteResult>(
    "/api/v1/user/admin/inviteUsers",
    params,
  );
}
