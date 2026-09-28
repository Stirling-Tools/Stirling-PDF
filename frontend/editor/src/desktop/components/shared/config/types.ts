import type {
  ConfigNavItem as CoreConfigNavItem,
  ConfigNavSection as CoreConfigNavSection,
} from "@core/components/shared/config/types";
import { VALID_NAV_KEYS as CORE_NAV_KEYS } from "@core/components/shared/config/types";

export const VALID_NAV_KEYS = [
  ...CORE_NAV_KEYS,
  "connectionMode",
  "planBilling",
] as const;

export type NavKey = (typeof VALID_NAV_KEYS)[number];

// Core's item over this flavor's widened key union. Derived, not copied: a new
// field on the core shape must reach every flavor or the shared settings page
// stops compiling for one of them.
export interface ConfigNavItem extends Omit<CoreConfigNavItem, "key"> {
  key: NavKey;
}

export interface ConfigNavSection extends Omit<CoreConfigNavSection, "items"> {
  items: ConfigNavItem[];
}
