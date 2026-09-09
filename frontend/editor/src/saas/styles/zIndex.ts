// Centralized z-index constants for new usages added in this branch.
// Keep values identical to their original inline usages.

// Re-export all core z-index constants
export * from "@core/styles/zIndex";

// SaaS-specific z-index constants
export const Z_ANALYTICS_MODAL = 1301;
// Z_INDEX_OVER_SETTINGS_MODAL now lives in core (re-exported above) so the
// shared cloud/ checkout component can resolve it too.
