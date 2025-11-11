/**
 * Default backend readiness guard (web builds do not need to wait for
 * anything outside the browser, so we always report ready).
 */
export async function ensureBackendReady(): Promise<boolean> {
  return true;
}
