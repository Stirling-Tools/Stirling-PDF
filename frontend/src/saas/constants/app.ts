// Re-export all constants from core
export * from "@core/constants/app";

// SaaS-specific overrides
// Get base URL with fallback (for use outside React components)
export const getBaseUrl = (): string => {
  // Try to get from window object if set by app config
  return window.__STIRLING_PDF_BASE_URL__ || window.location.origin;
};

// Helper to set base URL (to be called when app config loads)
export const setBaseUrl = (url: string): void => {
  window.__STIRLING_PDF_BASE_URL__ = url;
};
