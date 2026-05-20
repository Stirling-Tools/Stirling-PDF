/**
 * Stub implementation for web builds.
 * In desktop builds this is shadowed by desktop/hooks/useSaaSMode.ts which
 * returns whether the app is currently in SaaS connection mode (vs self-hosted).
 */
export function useSaaSMode(): boolean {
  return false;
}
