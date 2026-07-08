/**
 * Users fixtures. Types and the role catalogue live in api/users.ts (the
 * backend contract); this module only builds fake data for Storybook and
 * tests.
 *
 * "Users" is the people surface of the org: team members and their access.
 * A member has a role (which governs what they can do), a status, and activity.
 * Alongside the roster sit the role catalogue (a reference grid) and the
 * tier-scoped access controls (seat limits, MFA, sessions, SSO/SCIM).
 */

import type { Tier } from "@portal/contexts/TierContext";
import type {
  AccessControls,
  Member,
  UsersResponse,
  UsersSummary,
} from "@portal/api/users";
import { ROLES } from "@portal/api/users";

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
