import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/** The four org roles, most → least privileged, mapped onto the backend's
 *  authorities + team leadership. Order drives the role select and grid. */
export type RoleId = "admin" | "team_owner" | "member" | "guest";

export type MemberStatus = "active" | "invited" | "suspended";

/**
 * Effective portal (processor) access for a member:
 *   admin   — implicit, admins always have it
 *   role    — implicit via team-owner leadership (default policy)
 *   team    — inherited from a PORTAL grant on the member's whole team
 *   granted — explicit per-user PORTAL grant
 *   none    — no access
 */
export type PortalAccessState = "admin" | "role" | "team" | "granted" | "none";

export const PORTAL_ACCESS_TONE: Record<
  PortalAccessState,
  "success" | "info" | "neutral" | "warning"
> = {
  admin: "info",
  role: "info",
  team: "info",
  granted: "success",
  none: "neutral",
};

export interface Member {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  status: MemberStatus;
  /** Effective portal access; set by the view from the grant list. */
  portalAccess?: PortalAccessState;
  /** Authoritative server-side portal access (roster DTO); drives whether a chip shows at all. */
  canAccessPortal?: boolean;
  /** The explicit PORTAL grant's id, for revoke (present when access = granted). */
  portalGrantId?: number;
  /** Relative-time string, e.g. "4m ago". Invited members read "—". */
  lastActive: string;
  /** Optional avatar image; falls back to initials when absent. */
  avatarUrl?: string;
  /** Backend linkage for row actions (absent on pure fixtures). */
  username?: string;
  teamId?: number;
  teamName?: string;
  /** Holds a LEADER membership on their team (independent of displayed role). */
  teamLead?: boolean;
  /** The signed-in admin's own row; self-directed actions are disabled. */
  isSelf?: boolean;
  /** Account locked after failed logins (admin can unlock). */
  locked?: boolean;
  /** MFA enrolled (admin can reset it). */
  mfaEnabled?: boolean;
  /** Auth provider: "web" (password), "oauth2", "saml2", etc. */
  authType?: string;
  /** Raw stored authority (e.g. ROLE_USER, ROLE_WEB_ONLY_USER); preserved on team moves. */
  authority?: string;
}

export interface Role {
  id: RoleId;
  label: string;
  /** One-line summary of what the role can do. */
  summary: string;
  /** Concrete permission bullets shown in the reference grid. */
  permissions: string[];
  tone: "purple" | "blue" | "green" | "amber" | "neutral";
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Access controls (tier-scoped)                                            */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Access posture for the org, shaped by tier. Free exposes only the seat limit
 * and an upgrade nudge; pro adds session/MFA self-service; enterprise adds
 * SSO/SAML, SCIM provisioning, enforced MFA and a session policy. Fields are
 * optional so the panel renders whatever the tier returns.
 */
export interface AccessControls {
  tier: Tier;
  /** Seats consumed by active + invited members. */
  seatsUsed: number;
  /** Total seats on the plan; null = unlimited (enterprise). */
  seatLimit: number | null;
  /** Free only: copy for the upgrade nudge. */
  upgradeHint?: string;
  /** Pro+: end-user MFA available (self-service, not enforced). */
  mfaAvailable?: boolean;
  /** Enterprise: MFA enforced org-wide. */
  mfaEnforced?: boolean;
  /** Pro+: idle session timeout, e.g. "30 days" / "12 hours". */
  sessionTimeout?: string;
  /** Enterprise: SSO connection summary. */
  sso?: {
    provider: string;
    status: "connected" | "not_configured";
    /** Email domains that auto-route to SSO. */
    domains: string[];
  };
  /** Enterprise: SCIM directory provisioning. */
  scim?: {
    enabled: boolean;
    /** Where the directory syncs from, e.g. "Okta". */
    directory: string;
    lastSync: string;
  };
}

export interface UsersSummary {
  totalMembers: number;
  pendingInvites: number;
  seatsUsed: number;
  /** null = unlimited. */
  seatLimit: number | null;
}

export interface UsersResponse {
  summary: UsersSummary;
  members: Member[];
  roles: Role[];
  access: AccessControls;
  /** Whether SMTP is configured (gates emailing passwords/invites). */
  mailEnabled: boolean;
  /** Whether email invites will work: SMTP on AND mail.enableInvites=true. Gates the
   * "Invite by email" option on self-hosted. */
  emailInvitesEnabled: boolean;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Presentation metadata — product copy, lives client-side                  */
/* ──────────────────────────────────────────────────────────────────────── */

export const MEMBER_STATUS_TONE: Record<
  MemberStatus,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  active: "success",
  invited: "info",
  suspended: "danger",
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Role catalogue                                                           */
/*  The same five roles exist on every tier — what varies is who can fill    */
/*  them and how access is enforced, not the role definitions themselves.    */
/* ──────────────────────────────────────────────────────────────────────── */

/** `label`/`summary`/`permissions` values are i18n keys — render with t(). */
export const ROLES: Role[] = [
  {
    id: "admin",
    label: "portal.users.roles.admin.label",
    summary: "portal.users.roles.admin.summary",
    permissions: [
      "portal.users.roles.admin.permissions.0",
      "portal.users.roles.admin.permissions.1",
      "portal.users.roles.admin.permissions.2",
      "portal.users.roles.admin.permissions.3",
    ],
    tone: "purple",
  },
  {
    id: "team_owner",
    label: "portal.users.roles.team_owner.label",
    summary: "portal.users.roles.team_owner.summary",
    permissions: [
      "portal.users.roles.team_owner.permissions.0",
      "portal.users.roles.team_owner.permissions.1",
      "portal.users.roles.team_owner.permissions.2",
      "portal.users.roles.team_owner.permissions.3",
    ],
    tone: "blue",
  },
  {
    id: "member",
    label: "portal.users.roles.member.label",
    summary: "portal.users.roles.member.summary",
    permissions: [
      "portal.users.roles.member.permissions.0",
      "portal.users.roles.member.permissions.1",
      "portal.users.roles.member.permissions.2",
      "portal.users.roles.member.permissions.3",
    ],
    tone: "green",
  },
  {
    id: "guest",
    label: "portal.users.roles.guest.label",
    summary: "portal.users.roles.guest.summary",
    permissions: [
      "portal.users.roles.guest.permissions.0",
      "portal.users.roles.guest.permissions.1",
      "portal.users.roles.guest.permissions.2",
      "portal.users.roles.guest.permissions.3",
    ],
    tone: "neutral",
  },
];

export const ROLE_LABEL: Record<RoleId, string> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.label]),
) as Record<RoleId, string>;

export const ROLE_TONE: Record<RoleId, Role["tone"]> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.tone]),
) as Record<RoleId, Role["tone"]>;


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
