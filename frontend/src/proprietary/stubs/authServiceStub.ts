/**
 * Runtime-safe stub for desktop-only auth service.
 * Proprietary (web/SaaS) build must not ship Tauri deps, so we expose just the
 * minimal surface that desktop entry points dynamically import.
 */
export const authService = {
  async localClearAuth(): Promise<void> {
    // noop for web builds
  },
};
