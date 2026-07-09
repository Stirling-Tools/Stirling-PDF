/**
 * Users fixtures and the types api/users.ts shares with them.
 *
 * "Users" is the people surface of the org: team members and their access.
 * A member has a role (which governs what they can do), a status, and activity.
 * Alongside the roster sit the role catalogue (a reference grid) and the
 * tier-scoped access controls (seat limits, MFA, sessions, SSO/SCIM).
 *
 * api/users.ts imports the types; the MSW handlers serve the fixture data over
 * the intercepted apiClient.local.json() calls. Components never reach into this module
 * directly. Once a real backend exists the handlers stop being registered and
 * these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Roles & members                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

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

export const ROLES: Role[] = [
  {
    id: "admin",
    label: "Admin (Org owner)",
    summary: "Full governance over the workspace, settings and members.",
    permissions: [
      "Manage users, teams and roles",
      "Manage all integrations incl. S3 connections",
      "Grant or revoke portal access",
      "Everything Team Owner can do",
    ],
    tone: "purple",
  },
  {
    id: "team_owner",
    label: "Team owner",
    summary: "Owns a team — manages its members' resources and shared configs.",
    permissions: [
      "Create & manage the team's S3 connections",
      "Manage team-owned integration configs",
      "Portal access via the default policy",
      "Everything Member can do",
    ],
    tone: "blue",
  },
  {
    id: "member",
    label: "Member",
    summary:
      "Regular user — works with shared resources and their own configs.",
    permissions: [
      "Use the editor and shared integrations",
      "Create personal API & MCP configs",
      "See team configs shared with them",
      "No S3 or workspace management",
    ],
    tone: "green",
  },
  {
    id: "guest",
    label: "Guest",
    summary: "Limited or web-only access; cannot hold personal configs.",
    permissions: [
      "Web-only / demo usage",
      "No API keys or integrations",
      "No portal access",
      "Read-only where shared",
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

/* ──────────────────────────────────────────────────────────────────────── */
/*  Member fixtures                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

/** Pro org: a small team, one pending invite, one suspended account. */
const PRO_MEMBERS: Member[] = [
  {
    id: "usr-you",
    name: "You",
    email: "you@acme.com",
    role: "admin",
    status: "active",
    lastActive: "just now",
  },
  {
    id: "usr-priya",
    name: "Priya Nair",
    email: "priya@acme.com",
    role: "member",
    status: "active",
    lastActive: "8m ago",
  },
  {
    id: "usr-marcus",
    name: "Marcus Webb",
    email: "marcus@acme.com",
    role: "member",
    status: "active",
    lastActive: "1h ago",
  },
  {
    id: "usr-dana",
    name: "Dana Osei",
    email: "dana@acme.com",
    role: "member",
    status: "active",
    lastActive: "yesterday",
  },
  {
    // Pending invite: no activity yet and occupies a seat until accepted.
    id: "usr-invite-1",
    name: "sam.lee@acme.com",
    email: "sam.lee@acme.com",
    role: "guest",
    status: "invited",
    lastActive: "Never",
  },
  {
    // Suspended: retains the seat but cannot sign in until reinstated.
    id: "usr-leo",
    name: "Leo Fischer",
    email: "leo@acme.com",
    role: "member",
    status: "suspended",
    lastActive: "12 days ago",
  },
];

/** Enterprise adds a Team Owner, more seats in use, and a second pending invite. */
const ENTERPRISE_EXTRA: Member[] = [
  {
    id: "usr-aisha",
    name: "Aisha Rahman",
    email: "aisha@acme.com",
    role: "team_owner",
    status: "active",
    lastActive: "3m ago",
  },
  {
    id: "usr-tom",
    name: "Tom Becker",
    email: "tom@acme.com",
    role: "member",
    status: "active",
    lastActive: "26m ago",
  },
  {
    id: "usr-nadia",
    name: "Nadia Costa",
    email: "nadia@acme.com",
    role: "guest",
    status: "active",
    lastActive: "2h ago",
  },
  {
    id: "usr-invite-2",
    name: "contractor@partner.io",
    email: "contractor@partner.io",
    role: "member",
    status: "invited",
    lastActive: "Never",
  },
];

/** Free tier: a solo workspace approaching its seat ceiling. */
const FREE_MEMBERS: Member[] = [
  {
    id: "usr-you",
    name: "You",
    email: "you@acme.com",
    role: "admin",
    status: "active",
    lastActive: "just now",
  },
  {
    id: "usr-jess",
    name: "Jess Allen",
    email: "jess@acme.com",
    role: "member",
    status: "active",
    lastActive: "3h ago",
  },
];

export function membersFor(tier: Tier): Member[] {
  if (tier === "free") return FREE_MEMBERS;
  if (tier === "enterprise") return [...PRO_MEMBERS, ...ENTERPRISE_EXTRA];
  return PRO_MEMBERS;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Access controls per tier                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

function seatLimitFor(tier: Tier): number | null {
  if (tier === "free") return 3;
  if (tier === "pro") return 10;
  return null; // enterprise: unlimited
}

export function accessFor(tier: Tier): AccessControls {
  const members = membersFor(tier);
  // Both active and invited members hold a seat; suspended accounts do too,
  // matching how most seat-based plans bill until an account is removed.
  const seatsUsed = members.length;
  const seatLimit = seatLimitFor(tier);

  if (tier === "free") {
    return {
      tier,
      seatsUsed,
      seatLimit,
      upgradeHint:
        "Free workspaces cap at 3 seats with member-level roles only. Upgrade to add MFA, sessions and unlimited seats.",
    };
  }

  if (tier === "enterprise") {
    return {
      tier,
      seatsUsed,
      seatLimit,
      mfaAvailable: true,
      mfaEnforced: true,
      sessionTimeout: "12 hours",
      sso: {
        provider: "Okta (SAML 2.0)",
        status: "connected",
        domains: ["acme.com"],
      },
      scim: {
        enabled: true,
        directory: "Okta",
        lastSync: "6m ago",
      },
    };
  }

  // pro
  return {
    tier,
    seatsUsed,
    seatLimit,
    mfaAvailable: true,
    mfaEnforced: false,
    sessionTimeout: "30 days",
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Summary + response builder                                               */
/* ──────────────────────────────────────────────────────────────────────── */

export function summaryFor(tier: Tier): UsersSummary {
  const members = membersFor(tier);
  return {
    totalMembers: members.filter((m) => m.status !== "invited").length,
    pendingInvites: members.filter((m) => m.status === "invited").length,
    seatsUsed: members.length,
    seatLimit: seatLimitFor(tier),
  };
}

export function buildUsersResponse(tier: Tier): UsersResponse {
  return {
    summary: summaryFor(tier),
    members: membersFor(tier),
    roles: ROLES,
    access: accessFor(tier),
    mailEnabled: false,
    emailInvitesEnabled: false,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Backend-shaped fixtures                                                  */
/*  api/users.ts now reads the real admin-settings endpoint; mock mode       */
/*  serves this AdminSettingsData-shaped payload on the same route so the    */
/*  real adapter is exercised end to end.                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export function buildAdminSettingsData(tier: Tier) {
  const members = membersFor(tier);
  const users = members.map((m, i) => ({
    id: i + 1,
    username: m.email,
    email: m.email,
    rolesAsString:
      m.role === "admin"
        ? "ROLE_ADMIN"
        : m.role === "guest"
          ? "ROLE_WEB_ONLY_USER"
          : "ROLE_USER",
    teamLead: m.role === "team_owner",
    // Authoritative portal access as the backend computes it under the default policy
    // (admins + team leads), plus the seeded PORTAL grant on user id 2 (see mock grantStore).
    portalAccess: m.role === "admin" || m.role === "team_owner" || i + 1 === 2,
    enabled: m.status !== "suspended",
    team: { id: 1, name: "Default" },
  }));
  const userLastRequest = Object.fromEntries(
    members
      .filter((m) => m.status === "active")
      .map((m, i) => [m.email, Date.now() - i * 45 * 60 * 1000]),
  );
  const seatLimit = seatLimitFor(tier);
  return {
    users,
    userLastRequest,
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.enabled).length,
    disabledUsers: users.filter((u) => !u.enabled).length,
    maxAllowedUsers: seatLimit ?? 0,
    currentUsername: users[0]?.username,
    mailEnabled: false,
    emailInvitesEnabled: false,
  };
}
