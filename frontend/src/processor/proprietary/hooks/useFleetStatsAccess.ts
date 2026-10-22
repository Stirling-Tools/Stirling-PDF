import { useAuth } from "@app/auth/UseSession";

/** Cache scope for a confirmed local admin; null prevents requests, including login-off sessions. */
export function useFleetStatsAccess(): string | null {
  const auth = useAuth();
  if (
    auth.loading ||
    auth.error ||
    !auth.session ||
    auth.isAnonymous ||
    !auth.isAdmin
  ) {
    return null;
  }
  return auth.user?.id ?? null;
}
