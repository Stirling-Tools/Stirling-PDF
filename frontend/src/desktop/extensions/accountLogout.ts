import { connectionModeService } from '@app/services/connectionModeService';

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

      const currentConfig = await connectionModeService.getCurrentConfig();
      if (!currentConfig.lock_connection_mode) {
        // Switch to local mode so the app stays usable after logout without requiring login
        await connectionModeService.switchToLocal();
      }

      window.history.replaceState({}, '', '/');
      // No reload needed — AppProviders remounts the SaaS provider tree via
      // connectionModeService subscription when mode changes to local.
      return;
    } catch (err) {
      console.warn('[Desktop AccountLogout] Desktop-specific logout failed, falling back to redirect', err);
    }

    redirectToLogin();
  };
}
