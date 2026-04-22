import i18n from "@app/i18n";
import { alert } from "@app/components/toast";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { operationRouter } from "@app/services/operationRouter";
import { connectionModeService } from "@app/services/connectionModeService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";

const BACKEND_TOAST_COOLDOWN_MS = 4000;
let lastBackendToast = 0;

/**
 * Desktop-specific guard that ensures the relevant backend is ready before
 * tools attempt to call any API endpoints.
 *
 * - SaaS mode: checks the local bundled backend via tauriBackendService.isOnline
 * - Self-hosted mode (server online/checking): allows through — the operation
 *   targets the remote server and will surface network errors naturally
 * - Self-hosted mode (server confirmed offline): allows through if local port is
 *   known (operationRouter falls back to local); suppresses toast since
 *   SelfHostedOfflineBanner already communicates the outage
 *
 * @param endpoint - Optional endpoint path to check if it needs local backend
 * @returns true if backend is ready OR endpoint will be routed to SaaS
 */
export async function ensureBackendReady(endpoint?: string): Promise<boolean> {
  // Skip waiting if endpoint will be routed to SaaS backend
  if (endpoint) {
    const skipCheck =
      await operationRouter.shouldSkipBackendReadyCheck(endpoint);
    if (skipCheck) {
      console.debug(
        "[backendReadinessGuard] Skipping backend ready check (SaaS routing)",
      );
      return true;
    }
  }

  const mode = await connectionModeService.getCurrentMode();
  if (mode === "selfhosted") {
    let { status } = selfHostedServerMonitor.getSnapshot();

    // 'checking' means the first poll hasn't returned yet. Wait briefly (up to
    // 1.5 s) for it to resolve so we don't surface raw network errors during the
    // first few seconds after launch. If it doesn't resolve in time we fall
    // through and allow the operation — the HTTP layer will handle any error.
    if (status === "checking") {
      await Promise.race([
        selfHostedServerMonitor.checkNow(),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      status = selfHostedServerMonitor.getSnapshot().status;
    }

    if (status === "offline") {
      // Server offline: allow through if local backend port is known.
      // operationRouter will route to local for supported endpoints.
      // Suppress the toast — SelfHostedOfflineBanner communicates the outage.
      return !!tauriBackendService.getBackendUrl();
    }
    // Server online: allow through — the operation targets the remote server.
    return true;
  }

  // SaaS mode: check local bundled backend
  if (tauriBackendService.isOnline) {
    return true;
  }

  // Trigger a fresh check so we get the latest status
  await tauriBackendService.checkBackendHealth();
  if (tauriBackendService.isOnline) {
    return true;
  }

  const now = Date.now();
  if (now - lastBackendToast > BACKEND_TOAST_COOLDOWN_MS) {
    lastBackendToast = now;
    alert({
      alertType: "error",
      title: i18n.t("backendHealth.offline", "Backend Offline"),
      body: i18n.t("backendHealth.checking", "Checking backend status..."),
      isPersistentPopup: false,
    });
  }

  return false;
}
