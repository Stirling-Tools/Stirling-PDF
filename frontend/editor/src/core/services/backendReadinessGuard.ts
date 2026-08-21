/**
 * Default backend readiness guard (web builds do not need to wait for
 * anything outside the browser, so we always report ready).
 * @param _endpoint - Optional endpoint path (not used in web builds)
 */
export async function ensureBackendReady(_endpoint?: string): Promise<boolean> {
  return true;
}
