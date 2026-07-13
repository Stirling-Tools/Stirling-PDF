import {
  GROUP_PRIMARY,
  GROUP_OPERATIONAL as BASE_OPERATIONAL,
  GROUP_PLATFORM,
  type NavEntry,
} from "@portal-proprietary/components/sidebarGroups";

export { GROUP_PRIMARY, GROUP_PLATFORM };
export type { NavEntry };

/**
 * SaaS pre-release: the Components section isn't shipped there yet, so drop it
 * from the operational nav. Everything else is inherited from the base groups, so
 * new nav items appear in SaaS automatically — only Components is removed here.
 */
export const GROUP_OPERATIONAL: NavEntry[] = BASE_OPERATIONAL.filter(
  (entry) => entry.id !== "components",
);
