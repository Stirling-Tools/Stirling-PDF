import { useAuth } from "@app/auth/UseSession";

/** SaaS returns team-scoped statistics to signed-in members as well as leaders. */
export function useFleetStatsAccess(): string | null {
  const auth = useAuth();
  if (auth.loading || auth.error || !auth.session || auth.isAnonymous) {
    return null;
  }
  return auth.user?.id ?? null;
}
