import type { SigningMenuItem } from "@editor/utils/signingItems";

export interface QuickNavIdentity {
  displayName: string;
  profilePictureUrl: string | null;
  /**
   * Nobody is signed in, but the server lets visitors use the tools. The rail
   * then draws a way in rather than an avatar for an account that isn't there.
   */
  isGuest?: boolean;
}

/** The last resolved account data, retained across view changes. */
export interface QuickNavAccount {
  accountId: string | null;
  isAnonymous: boolean;
  identity: QuickNavIdentity | null;
  signingBadge: number;
  signingItems: SigningMenuItem[];
  portalAccess: boolean;
}

/** Undefined fields retain their previous value; null, false and zero replace it. */
export type QuickNavAccountUpdate = Partial<QuickNavAccount>;

export const EMPTY_QUICK_NAV_ACCOUNT: QuickNavAccount = {
  accountId: null,
  isAnonymous: false,
  identity: null,
  signingBadge: 0,
  signingItems: [],
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
    signingItems: update.signingItems ?? current.signingItems,
    portalAccess: update.portalAccess ?? current.portalAccess,
  };

  const unchanged =
    next.accountId === previous.accountId &&
    next.isAnonymous === previous.isAnonymous &&
    next.signingBadge === previous.signingBadge &&
    next.signingItems === previous.signingItems &&
    next.portalAccess === previous.portalAccess &&
    next.identity?.displayName === previous.identity?.displayName &&
    next.identity?.profilePictureUrl === previous.identity?.profilePictureUrl &&
    next.identity?.isGuest === previous.identity?.isGuest;
  return unchanged ? previous : next;
}
