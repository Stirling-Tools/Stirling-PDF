/**
 * The hosted edition has no server-admin concept: the signed-in account IS the Stirling account,
 * and its billing gate renders for any member of it. Inheriting the self-hosted check would leave
 * that page reachable only by typed URL.
 */
export function useAdminNavVisible(): boolean {
  return true;
}
