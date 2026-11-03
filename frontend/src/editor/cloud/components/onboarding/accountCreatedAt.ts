export interface AccountCreatedAt {
  /** True while the lookup is in flight; the checklist stays hidden until it settles. */
  loading: boolean;
  /** Null when the platform cannot tell, which never hides the checklist. */
  createdAt: Date | null;
}

/** When the signed-in user's account was created. */
export function useAccountCreatedAt(): AccountCreatedAt {
  return { loading: false, createdAt: null };
}
