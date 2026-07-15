import {
  GROUP_PRIMARY,
  GROUP_OPERATIONAL,
  GROUP_PLATFORM,
  type NavEntry,
} from "@portal-proprietary/components/sidebarGroups";

// SaaS shadows the base nav groups so sections not yet shipped there can be
// dropped. Nothing is currently removed, so the base groups pass through as-is.
export { GROUP_PRIMARY, GROUP_OPERATIONAL, GROUP_PLATFORM };
export type { NavEntry };
