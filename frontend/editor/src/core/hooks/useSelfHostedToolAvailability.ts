/**
 * Stub implementation for web / SaaS builds.
 * In self-hosted desktop mode this is shadowed by the desktop override which
 * returns the set of tool IDs that are unavailable when the self-hosted server
 * is offline (i.e. tools whose endpoints the local bundled backend does not support).
 */
export function useSelfHostedToolAvailability(
  _tools: Array<{ id: string; endpoints?: string[] }>,
): Set<string> {
  return new Set<string>();
}
