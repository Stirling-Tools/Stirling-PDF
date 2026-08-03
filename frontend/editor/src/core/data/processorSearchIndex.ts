/**
 * Search index for the admin portal ("Processor") destinations offered by the
 * global super search. Core and desktop builds ship no portal, so the index is
 * empty and the Processor group never renders; the proprietary build (which
 * mounts the portal as a route-set) shadows this with the real view list.
 */
export interface ProcessorSearchEntry {
  /** Portal view id — stable key for the result row. */
  id: string;
  /** i18n key for the view's display name (shared with the portal sidebar). */
  labelKey: string;
  labelFallback: string;
  /** In-app path to navigate to. Empty when externalUrl is set. */
  path: string;
  /** Opens in a new tab instead of navigating (e.g. hosted docs). */
  externalUrl?: string;
  /** Extra fuzzy-match terms beyond the label. */
  keywords?: string[];
}

export const PROCESSOR_SEARCH_INDEX: ProcessorSearchEntry[] = [];
