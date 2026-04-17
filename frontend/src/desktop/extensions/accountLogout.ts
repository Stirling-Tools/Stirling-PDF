import { connectionModeService } from "@app/services/connectionModeService";

type SignOutFn = () => Promise<void>;

interface AccountLogoutDeps {
  signOut: SignOutFn;
  redirectToLogin: () => void;
}

/**
 * Desktop-specific logout: mirrors Connection Settings flow to avoid stale state.
 */
export function useAccountLogout() {
  return async ({
    signOut,
    redirectToLogin,
  }: AccountLogoutDeps): Promise<void> => {
    try {
      await signOut();

      const currentConfig = await connectionModeService.getCurrentConfig();
      // Save server URL before clearing so user can easily reconnect (self-hosted only)
      if (
        currentConfig.mode === "selfhosted" &&
        currentConfig.server_config?.url
      ) {
        localStorage.setItem("server_url", currentConfig.server_config.url);
      }
      // Always switch to local after logout so the app remains usable
      await connectionModeService.switchToLocal();

      window.history.replaceState({}, "", "/");
      // No reload needed — AppProviders remounts the SaaS provider tree via
      // connectionModeService subscription when mode changes to local.
      return;
    } catch (err) {
      console.warn(
        "[Desktop AccountLogout] Desktop-specific logout failed, falling back to redirect",
        err,
      );
    }

    redirectToLogin();
  };
}
