import type { IconName } from "@app/ui/Icon";

export interface QuickNavIdentity {
  displayName: string;
  profilePictureUrl: string | null;
}

/** One row of the avatar menu: a settings page worth reaching in one click. */
export interface QuickNavAccountShortcut {
  id: string;
  label: string;
  icon: IconName;
  /** A `/settings/{section}` path, optionally with a `#anchor`. */
  to: string;
}

export interface QuickNavAccountMenu {
  shortcuts: QuickNavAccountShortcut[];
  /** Absent when there is no session to end (no login, or a guest). */
  signOut?: () => void;
}

/** The last resolved account data, retained across view changes. */
export interface QuickNavAccount {
  accountId: string | null;
  isAnonymous: boolean;
  identity: QuickNavIdentity | null;
  signingBadge: number;
  portalAccess: boolean;
}

/** Undefined fields retain their previous value; null, false and zero replace it. */
export type QuickNavAccountUpdate = Partial<QuickNavAccount>;

export const EMPTY_QUICK_NAV_ACCOUNT: QuickNavAccount = {
  accountId: null,
  isAnonymous: false,
  identity: null,
  signingBadge: 0,
  portalAccess: false,
};

/** Clears the previous account before applying an update for a different account. */
export function updateQuickNavAccount(
  previous: QuickNavAccount,
  update: QuickNavAccountUpdate,
): QuickNavAccount {
  const accountId =
    update.accountId === undefined ? previous.accountId : update.accountId;
  const current =
    accountId === previous.accountId ? previous : EMPTY_QUICK_NAV_ACCOUNT;
  const next: QuickNavAccount = {
    accountId,
    isAnonymous: update.isAnonymous ?? current.isAnonymous,
    identity:
      update.identity === undefined ? current.identity : update.identity,
    signingBadge: update.signingBadge ?? current.signingBadge,
    portalAccess: update.portalAccess ?? current.portalAccess,
  };

  const unchanged =
    next.accountId === previous.accountId &&
    next.isAnonymous === previous.isAnonymous &&
    next.signingBadge === previous.signingBadge &&
    next.portalAccess === previous.portalAccess &&
    next.identity?.displayName === previous.identity?.displayName &&
    next.identity?.profilePictureUrl === previous.identity?.profilePictureUrl;
  return unchanged ? previous : next;
}
