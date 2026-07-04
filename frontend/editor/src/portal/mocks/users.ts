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

/** The five org roles, most → least privileged. Order is meaningful: it drives
 *  the role select and the reference grid. */
export type RoleId =
  | "org_owner"
  | "team_owner"
  | "developer"
  | "reviewer"
  | "viewer";

export type MemberStatus = "active" | "invited" | "suspended";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  status: MemberStatus;
  /** Relative-time string, e.g. "4m ago". Invited members read "—". */
  lastActive: string;
  /** Optional avatar image; falls back to initials when absent. */
  avatarUrl?: string;
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
    id: "org_owner",
    label: "Org Owner",
    summary: "Full governance over the organization, billing and members.",
    permissions: [
      "Manage billing & plan",
      "Add, suspend and remove members",
      "Configure SSO, SCIM and security policy",
      "Everything Team Owner can do",
    ],
    tone: "purple",
  },
  {
    id: "team_owner",
    label: "Team Owner",
    summary: "Team-scoped admin — manage members and pipelines for a team.",
    permissions: [
      "Invite & manage team members",
      "Create and deploy pipelines",
      "View team usage & audit log",
      "No org billing or SSO access",
    ],
    tone: "blue",
  },
  {
    id: "developer",
    label: "Developer",
    summary: "Build and operate pipelines, agents and integrations.",
    permissions: [
      "Create & edit pipelines",
      "Manage API keys, agents and webhooks",
      "Run and debug document jobs",
      "Read team audit log",
    ],
    tone: "green",
  },
  {
    id: "reviewer",
    label: "Reviewer",
    summary: "Approve or reject documents routed for human review.",
    permissions: [
      "Approve / reject review tasks",
      "Annotate and redact documents",
      "Read assigned pipelines",
      "No pipeline or key management",
    ],
    tone: "amber",
  },
  {
    id: "viewer",
    label: "Viewer",
    summary: "Read-only access to documents and dashboards.",
    permissions: [
      "View documents & results",
      "View dashboards & usage",
      "Export permitted reports",
      "No write access",
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
    role: "org_owner",
    status: "active",
    lastActive: "just now",
  },
  {
    id: "usr-priya",
    name: "Priya Nair",
    email: "priya@acme.com",
    role: "developer",
    status: "active",
    lastActive: "8m ago",
  },
  {
    id: "usr-marcus",
    name: "Marcus Webb",
    email: "marcus@acme.com",
    role: "developer",
    status: "active",
    lastActive: "1h ago",
  },
  {
    id: "usr-dana",
    name: "Dana Osei",
    email: "dana@acme.com",
    role: "reviewer",
    status: "active",
    lastActive: "yesterday",
  },
  {
    // Pending invite: no activity yet and occupies a seat until accepted.
    id: "usr-invite-1",
    name: "sam.lee@acme.com",
    email: "sam.lee@acme.com",
    role: "viewer",
    status: "invited",
    lastActive: "—",
  },
  {
    // Suspended: retains the seat but cannot sign in until reinstated.
    id: "usr-leo",
    name: "Leo Fischer",
    email: "leo@acme.com",
    role: "developer",
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
    role: "reviewer",
    status: "active",
    lastActive: "26m ago",
  },
  {
    id: "usr-nadia",
    name: "Nadia Costa",
    email: "nadia@acme.com",
    role: "viewer",
    status: "active",
    lastActive: "2h ago",
  },
  {
    id: "usr-invite-2",
    name: "contractor@partner.io",
    email: "contractor@partner.io",
    role: "reviewer",
    status: "invited",
    lastActive: "—",
  },
];

/** Free tier: a solo workspace approaching its seat ceiling. */
const FREE_MEMBERS: Member[] = [
  {
    id: "usr-you",
    name: "You",
    email: "you@acme.com",
    role: "org_owner",
    status: "active",
    lastActive: "just now",
  },
  {
    id: "usr-jess",
    name: "Jess Allen",
    email: "jess@acme.com",
    role: "developer",
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
  };
}
