import { useEffect } from "react";
import { useAuth } from "@editor/auth/UseSession";
import { useQuickNavHost } from "@editor/contexts/QuickNavHostContext";
import { useAccountIdentity } from "@editor/hooks/useAccountIdentity";
import { usePortalAccessState } from "@editor/hooks/usePortalAccess";
import { useSigningBadgeState } from "@editor/hooks/signing/useSigningBadgeCount";

/** Publishes resolved account fields from the mounted view into the root cache. */
export function useSyncQuickNavAccount(): void {
  const updateAccount = useQuickNavHost()?.updateAccount;
  const { user, isAnonymous, loading: authLoading } = useAuth();
  const {
    displayName,
    profilePictureUrl,
    loading: identityLoading,
  } = useAccountIdentity();
  const { granted, settled: accessSettled } = usePortalAccessState();
  const { count, settled: signingSettled, items } = useSigningBadgeState();
  const accountId = user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    updateAccount?.({
      accountId,
      isAnonymous: Boolean(isAnonymous),
      identity: identityLoading
        ? undefined
        : { displayName, profilePictureUrl },
      signingBadge: signingSettled ? count : undefined,
      signingItems: signingSettled ? items : undefined,
      portalAccess: accessSettled ? granted : undefined,
    });
  }, [
    updateAccount,
    accountId,
    isAnonymous,
    authLoading,
    identityLoading,
    displayName,
    profilePictureUrl,
    signingSettled,
    items,
    count,
    accessSettled,
    granted,
  ]);
}
