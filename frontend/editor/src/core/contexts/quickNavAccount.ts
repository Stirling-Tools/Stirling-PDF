export interface QuickNavIdentity {
  displayName: string;
  profilePictureUrl: string | null;
}

/** The last resolved account data, retained across view changes. */
export interface QuickNavAccount {
  accountId: string | null;
  identity: QuickNavIdentity | null;
  signingBadge: number;
  processorAccess: boolean;
}

/** Undefined fields retain their previous value; null, false and zero replace it. */
export type QuickNavAccountUpdate = Partial<QuickNavAccount>;

export const EMPTY_QUICK_NAV_ACCOUNT: QuickNavAccount = {
  accountId: null,
  identity: null,
  signingBadge: 0,
  processorAccess: false,
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
    identity:
      update.identity === undefined ? current.identity : update.identity,
    signingBadge: update.signingBadge ?? current.signingBadge,
    processorAccess: update.processorAccess ?? current.processorAccess,
  };

  const unchanged =
    next.accountId === previous.accountId &&
    next.signingBadge === previous.signingBadge &&
    next.processorAccess === previous.processorAccess &&
    next.identity?.displayName === previous.identity?.displayName &&
    next.identity?.profilePictureUrl === previous.identity?.profilePictureUrl;
  return unchanged ? previous : next;
}
