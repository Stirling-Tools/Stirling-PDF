import { PROCESSOR_SEARCH_INDEX as PROPRIETARY_INDEX } from "@proprietary/data/processorSearchIndex";

export type { ProcessorSearchEntry } from "@core/data/processorSearchIndex";

/**
 * SaaS pre-release trims sections from the portal nav (see
 * portal-saas/components/sidebarGroups) — the search index must offer only
 * what that nav actually ships, or a result navigates to a route that
 * redirects home. Keep this filter in step with that file's exclusions.
 */
export const PROCESSOR_SEARCH_INDEX = PROPRIETARY_INDEX.filter(
  (entry) => entry.id !== "components",
);
