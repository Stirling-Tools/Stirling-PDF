import { connectionModeService } from '@app/services/connectionModeService';
import { STIRLING_SAAS_URL } from '@app/constants/connection';

type SignOutFn = () => Promise<void>;

interface AccountLogoutDeps {
  signOut: SignOutFn;
  redirectToLogin: () => void;
}

/**
 * Desktop-specific logout: mirrors Connection Settings flow to avoid stale state.
 */
export function useAccountLogout() {
  return async ({ signOut, redirectToLogin }: AccountLogoutDeps): Promise<void> => {
    try {
      await signOut();

      await connectionModeService.switchToSaaS(STIRLING_SAAS_URL);
      await connectionModeService.resetSetupCompletion().catch(() => {});

      window.history.replaceState({}, '', '/');
      window.location.reload();
      return;
    } catch (err) {
      console.warn('[Desktop AccountLogout] Desktop-specific logout failed, falling back to redirect', err);
    }

    redirectToLogin();
  };
}
