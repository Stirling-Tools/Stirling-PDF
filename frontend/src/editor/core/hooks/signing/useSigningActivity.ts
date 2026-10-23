import { useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@editor/auth/UseSession";
import {
  getSigningSeenVersion,
  hasUnseenSigningActivity,
  subscribeSigningSeen,
} from "@editor/services/signingSeenStore";
import type { SigningItem, SigningMenuItem } from "@editor/utils/signingItems";

/** Shares account-scoped unread indicators between the popover and expanded session table. */
export function useSigningActivity(items: SigningItem[]): SigningMenuItem[] {
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const version = useSyncExternalStore(
    subscribeSigningSeen,
    getSigningSeenVersion,
    getSigningSeenVersion,
  );
  return useMemo(
    () =>
      items.map((item) => ({
        ...item,
        unread: hasUnseenSigningActivity(accountId, item),
      })),
    [items, accountId, version],
  );
}
