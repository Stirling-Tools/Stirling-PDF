type SignOutFn = () => Promise<void>;

interface AccountLogoutDeps {
  signOut: SignOutFn;
  redirectToLogin: () => void;
}

/**
 * Default (web/proprietary) logout handler: sign out and redirect to /login.
 * Desktop builds override this file via path resolution.
 */
export function useAccountLogout() {
  return async ({ signOut, redirectToLogin }: AccountLogoutDeps): Promise<void> => {
    try {
      await signOut();
    } finally {
      redirectToLogin();
    }
  };
}
