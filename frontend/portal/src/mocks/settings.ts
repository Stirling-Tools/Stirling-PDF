/**
 * Account-settings fixtures and the types api/settings.ts shares with them.
 * api/settings.ts imports the types; the MSW handlers in mocks/handlers/ serve
 * the fixture data over the intercepted httpJson() call. Components never reach
 * into this module directly.
 *
 * The shape is tier-aware: the workspace plan label, available regions, and
 * data-residency posture differ by tier, so the modal reflects what each plan
 * can actually configure.
 */

import type { Tier } from "@portal/contexts/TierContext";

export interface RegionOption {
  value: string;
  label: string;
  /** Enterprise-only residency regions are gated below higher tiers. */
  enterpriseOnly?: boolean;
}

export interface NotificationDefault {
  id: string;
  enabled: boolean;
}

/** A device/browser with an active session, shown under Admin → Security. */
export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  /** The session viewing this modal — can't be revoked from here. */
  current: boolean;
}

/**
 * Org-wide authentication posture. SSO/SCIM are enterprise capabilities; lower
 * tiers see them as locked rows with an upgrade nudge.
 */
export interface SecuritySettings {
  mfaEnforced: boolean;
  ssoEnabled: boolean;
  scimEnabled: boolean;
  /** Idle timeout before re-auth, in minutes. */
  sessionTimeoutMins: number;
  activeSessions: ActiveSession[];
}

/** An opt-in early-access feature flag. */
export interface BetaFeature {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Gated to enterprise — rendered locked below it. */
  enterpriseOnly?: boolean;
}

/**
 * Server snapshot of the account + workspace the modal opens onto. Editable
 * fields seed local form state; `planLabel` / `seats` are read-only context.
 */
export interface SettingsSnapshot {
  profile: {
    name: string;
    email: string;
    role: string;
    /** Avatar image URL, or null to fall back to initials. */
    avatarUrl: string | null;
  };
  workspace: {
    name: string;
    region: string;
    planLabel: string;
    seats: { used: number; total: number };
  };
  /** Per-category notification toggles, server-default on/off. */
  notifications: NotificationDefault[];
  regions: RegionOption[];
  /** Org-wide authentication + session posture (Admin scope). */
  security: SecuritySettings;
  /** Opt-in early-access features (Admin scope). */
  betaFeatures: BetaFeature[];
}

const REGIONS: RegionOption[] = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU West (Ireland)" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)" },
  {
    value: "ap-southeast-2",
    label: "Asia Pacific (Sydney)",
    enterpriseOnly: true,
  },
  { value: "ca-central-1", label: "Canada (Central)", enterpriseOnly: true },
];

const PLAN_LABEL: Record<Tier, string> = {
  free: "Free Plan",
  pro: "Pay-as-you-go",
  enterprise: "Enterprise Plan",
};

const SEATS: Record<Tier, { used: number; total: number }> = {
  free: { used: 1, total: 1 },
  pro: { used: 4, total: 5 },
  enterprise: { used: 38, total: 50 },
};

const WORKSPACE_NAME: Record<Tier, string> = {
  free: "My Workspace",
  pro: "Acme Document Ops",
  enterprise: "Acme Corp — Global",
};

/** Notification categories shown in Preferences, with sensible per-tier defaults. */
function notificationsFor(tier: Tier): NotificationDefault[] {
  return [
    { id: "pipeline-failures", enabled: true },
    { id: "pipeline-success", enabled: tier !== "free" },
    { id: "usage-alerts", enabled: true },
    { id: "weekly-digest", enabled: tier === "free" },
    { id: "security-alerts", enabled: true },
    { id: "product-updates", enabled: false },
  ];
}

/** Session timeout shortens as the plan's security posture tightens. */
const SESSION_TIMEOUT_MINS: Record<Tier, number> = {
  free: 1440,
  pro: 720,
  enterprise: 480,
};

function securityFor(tier: Tier): SecuritySettings {
  const base: ActiveSession[] = [
    {
      id: "sess-current",
      device: "Chrome · macOS",
      location: "London, UK",
      lastActive: "Active now",
      current: true,
    },
  ];
  if (tier !== "free") {
    base.push({
      id: "sess-cli",
      device: "Stirling CLI · CI runner",
      location: "eu-west-1",
      lastActive: "12 min ago",
      current: false,
    });
  }
  if (tier === "enterprise") {
    base.push({
      id: "sess-mobile",
      device: "Safari · iPhone",
      location: "London, UK",
      lastActive: "3 h ago",
      current: false,
    });
  }
  return {
    // Enterprise tenants enforce MFA + SSO/SCIM org-wide by default.
    mfaEnforced: tier === "enterprise",
    ssoEnabled: tier === "enterprise",
    scimEnabled: tier === "enterprise",
    sessionTimeoutMins: SESSION_TIMEOUT_MINS[tier],
    activeSessions: base,
  };
}

function betaFeaturesFor(tier: Tier): BetaFeature[] {
  return [
    {
      id: "pipeline-canary",
      label: "Pipeline canary rollouts",
      description: "Shadow-run a new pipeline version before promoting it.",
      enabled: false,
    },
    {
      id: "component-sandboxes",
      label: "Live component sandboxes",
      description: "Interactive previews for embeddable components.",
      enabled: tier !== "free",
    },
    {
      id: "agent-evals-v2",
      label: "Agent evals v2",
      description: "Richer golden-set scoring with regression diffs.",
      enabled: tier === "enterprise",
      enterpriseOnly: true,
    },
  ];
}

export function buildSettingsSnapshot(tier: Tier): SettingsSnapshot {
  return {
    profile: {
      name: "Reece Browne",
      email: "reece@stirlingpdf.com",
      role: tier === "enterprise" ? "Org Admin" : "Owner",
      avatarUrl: null,
    },
    workspace: {
      name: WORKSPACE_NAME[tier],
      region: tier === "free" ? "us-east-1" : "eu-west-1",
      planLabel: PLAN_LABEL[tier],
      seats: SEATS[tier],
    },
    notifications: notificationsFor(tier),
    regions: REGIONS,
    security: securityFor(tier),
    betaFeatures: betaFeaturesFor(tier),
  };
}
