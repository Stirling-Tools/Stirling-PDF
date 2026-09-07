import { clearNotificationReadState } from "@app/hooks/useNotifications";
import { suspendWorkbenchSession } from "@app/services/workbenchSession";

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
  return async ({
    signOut,
    redirectToLogin,
  }: AccountLogoutDeps): Promise<void> => {
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "stirling_sso_auto_login_logged_out",
          "1",
        );
      }
      // The tab outlives the session; the next person to sign in here must not
      // inherit this workbench. Suspends writing too - signing out unmounts the
      // editor, and its flush would otherwise write the record straight back.
      suspendWorkbenchSession();
      // Same reason: the next person's own failures must not arrive pre-read.
      clearNotificationReadState();
      await signOut();
    } finally {
      redirectToLogin();
    }
  };
}
