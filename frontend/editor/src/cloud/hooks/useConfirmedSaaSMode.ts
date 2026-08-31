/**
 * Cloud web (saas) is synchronously always in SaaS mode — there's no
 * connection state to confirm asynchronously, unlike desktop's local-vs-
 * connected toggle. Desktop shadows this (desktop/hooks/useConfirmedSaaSMode.ts)
 * with the real gate, which starts false to avoid a cold-start fetch against
 * the local backend before the connection mode resolves. See that file for
 * why consumers that fire a network call on mount (like useWallet) should
 * gate on this rather than useSaaSMode().
 */
export function useConfirmedSaaSMode(): boolean {
  return true;
}
