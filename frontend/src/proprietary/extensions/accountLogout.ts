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
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('stirling_sso_auto_login_logged_out', '1');
      }
      await signOut();
    } finally {
      redirectToLogin();
    }
  };
}
