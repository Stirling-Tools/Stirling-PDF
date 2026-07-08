/**
 * Account-settings fixtures. Types live in api/settings.ts (the backend
 * contract); this module only builds fake data for Storybook and tests.
 *
 * The shape is tier-aware: the workspace plan label, available regions, and
 * data-residency posture differ by tier, so the modal reflects what each plan
 * can actually configure.
 */

import type {
  ActiveSession,
  BetaFeature,
  NotificationDefault,
  RegionOption,
  SecuritySettings,
  SettingsSnapshot,
} from "@portal/api/settings";
import type { Tier } from "@portal/contexts/TierContext";

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
  free: "Editor plan",
  pro: "Processor plan",
  enterprise: "Enterprise plan",
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
