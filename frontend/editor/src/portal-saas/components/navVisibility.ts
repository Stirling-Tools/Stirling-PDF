import type { ViewId } from "@portal/contexts/ViewContext";

/**
 * SaaS flavor: the Infrastructure tab isn't built for SaaS yet, so hide it from
 * the sidebar until it is. Drop the entry here (or empty the set) to bring it
 * back.
 */
export const HIDDEN_NAV_VIEWS: ReadonlySet<ViewId> = new Set<ViewId>([
  "infrastructure",
]);
