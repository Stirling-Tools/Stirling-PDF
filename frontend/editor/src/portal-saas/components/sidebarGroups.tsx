import {
  GROUP_PROCESSOR,
  GROUP_PLATFORM,
  type NavEntry,
  type NavGroup,
} from "@portal-proprietary/components/sidebarGroups";

// SaaS shadows the base nav groups so sections not yet shipped there can be
// dropped. Nothing is currently removed, so the base groups pass through as-is.
export { GROUP_PROCESSOR, GROUP_PLATFORM };
export type { NavEntry, NavGroup };
