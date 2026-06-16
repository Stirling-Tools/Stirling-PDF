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
}

const REGIONS: RegionOption[] = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU West (Ireland)" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)", enterpriseOnly: true },
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
  };
}
