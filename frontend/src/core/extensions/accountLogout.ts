type SignOutFn = () => Promise<void>;

interface AccountLogoutDeps {
  signOut: SignOutFn;
  redirectToLogin: () => void;
}

/**
 * Core (open-source) logout handler: sign out and redirect to /login.
 * Proprietary/desktop builds override this file via path resolution.
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
