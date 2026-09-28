import { useAuth } from "@app/auth";

export function useAccountLinkOwner(): boolean {
  const { user, isAdmin, loading } = useAuth();
  return !loading && isAdmin && user?.orgOwner === true;
}
