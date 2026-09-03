import type React from "react";

// Single source of truth for all valid nav keys
export const VALID_NAV_KEYS = [
  "preferences",
  "notifications",
  "connections",
  "account",
  "general",
  "people",
  "teams",
  "security",
  "identity",
  "plan",
  "payments",
  "requests",
  "developer",
  "api-keys",
  "hotkeys",
  "adminGeneral",
  "adminSecurity",
  "adminConnections",
  "adminPrivacy",
  "adminDatabase",
  "adminAdvanced",
  "adminLegal",
  "adminPremium",
  "adminFeatures",
  "adminPlan",
  "adminAudit",
  "adminUsage",
  "adminEndpoints",
  "adminStorageSharing",
  "adminFolderAccess",
  "adminMcp",
  "adminAiGeneral",
  "adminAiModels",
  "adminAiDocuments",
  "adminAiLimits",
  // Holds all four AI rows above; they stay listed so their deep links alias.
  "adminAi",
  "help",
  "legal",
  "backendThirdPartyLicenses",
  "frontendThirdPartyLicenses",
  // Holds all four of the rows above; they stay listed so their deep links alias.
  "about",
  "payg",
  "account-link",
  // Server administration moved off the processor's own nav (see
  // portalSettingsSections).
  "users",
  "billing",
  "audit",
  "storage",
] as const;

// Derive the type from the array
export type NavKey = (typeof VALID_NAV_KEYS)[number];

// some of these are not used yet, but appear in figma designs

// Nav structure of the settings modal. Lives here (not configNavSections) so
// consumers that only need the shape don't pull the whole section-component
// tree into their build's typecheck graph.
export interface ConfigNavItem {
  key: NavKey;
  label: string;
  /** One line under the page title. The page owns the header; sections don't repeat it. */
  description?: string;
  icon: string;
  component: React.ReactNode;
  disabled?: boolean;
  disabledTooltip?: string;
  badge?: string;
  badgeColor?: string;
  /**
   * The section draws its own page header and gutters, so the settings page
   * gives it the whole pane and keeps only the chrome it can't provide (the
   * mobile back button).
   */
  fullBleed?: boolean;
}

export interface ConfigNavSection {
  /** Stable across languages and layers: merge target, and the key the fold state is remembered under. */
  id?: string;
  title: string;
  items: ConfigNavItem[];
  /** Start folded in the sidebar; opening it (or landing in it) unfolds. */
  collapsedByDefault?: boolean;
}
