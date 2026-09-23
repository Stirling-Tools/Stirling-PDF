import { useAuth } from "@app/auth/UseSession";

/** Guests cannot load or run policies, including browser-side classification. */
export function usePoliciesEnabled(): boolean {
  const { user, loading, isAnonymous } = useAuth();
  return !loading && Boolean(user) && !isAnonymous;
}
