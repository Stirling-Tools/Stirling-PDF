import type React from "react";
import { VALID_NAV_KEYS as CORE_NAV_KEYS } from "@core/components/shared/config/types";

// SaaS adds an "overview" account section and an "mcp" integrations tab. All
// other keys (including ones SaaS doesn't render today) come from core -
// subtracting them here would just break the type union without affecting
// runtime nav.
export const VALID_NAV_KEYS = [...CORE_NAV_KEYS, "overview", "mcp"] as const;

export type NavKey = (typeof VALID_NAV_KEYS)[number];

// Mirrors the core shape over the widened saas NavKey union — see the core
// module for why these live in types rather than configNavSections.
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
