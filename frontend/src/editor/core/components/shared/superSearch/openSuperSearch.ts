export const SUPER_SEARCH_FOCUS_EVENT = "superSearch:focus";

export interface SuperSearchFocusDetail {
  /** Scope chips to preselect, replacing any the user had picked. */
  scopeIds?: readonly string[];
}

/**
 * Opens and focuses whichever super search is on screen. A no-op when none is,
 * so only call it from surfaces that sit alongside one.
 */
export function openSuperSearch(scopeIds?: readonly string[]) {
  window.dispatchEvent(
    new CustomEvent<SuperSearchFocusDetail>(SUPER_SEARCH_FOCUS_EVENT, {
      detail: { scopeIds },
    }),
  );
}
