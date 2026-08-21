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
  "help",
  "legal",
  "backendThirdPartyLicenses",
  "frontendThirdPartyLicenses",
  "payg",
  "account-link",
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
  icon: string;
  component: React.ReactNode;
  disabled?: boolean;
  disabledTooltip?: string;
  badge?: string;
  badgeColor?: string;
}

export interface ConfigNavSection {
  title: string;
  items: ConfigNavItem[];
}
