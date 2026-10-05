import { useEffect } from "react";
import { useAuth } from "@app/auth/UseSession";
import { useQuickNavHost } from "@app/contexts/QuickNavHostContext";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import { usePortalAccessState } from "@app/hooks/usePortalAccess";
import { useSigningBadgeState } from "@app/hooks/signing/useSigningBadgeCount";

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
