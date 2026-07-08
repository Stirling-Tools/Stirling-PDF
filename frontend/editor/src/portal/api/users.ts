import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * "Users" is the people surface of the org: team members and their access.
 * A member has a role (which governs what they can do), a status, and activity.
 * Alongside the roster sit the role catalogue (a reference grid) and the
 * tier-scoped access controls (seat limits, MFA, sessions, SSO/SCIM).
 */

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
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

/** GET /v1/users?tier=… — summary strip, members table, role catalogue, access. */
export async function fetchUsers(tier: Tier): Promise<UsersResponse> {
  return apiClient.local.json<UsersResponse>(
    `/v1/users?tier=${encodeURIComponent(tier)}`,
  );
}
