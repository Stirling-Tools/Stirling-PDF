import i18n from '@app/i18n';
import { alert } from '@app/components/toast';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { operationRouter } from '@app/services/operationRouter';
import { connectionModeService } from '@app/services/connectionModeService';
import { selfHostedServerMonitor } from '@app/services/selfHostedServerMonitor';

const BACKEND_TOAST_COOLDOWN_MS = 4000;
let lastBackendToast = 0;

/**
 * Desktop-specific guard that ensures the embedded backend is healthy
 * before tools attempt to call any API endpoints.
 * Enhanced to skip checks for endpoints routed to SaaS backend.
 * In self-hosted mode:
 *   - If the remote server is online, checks remote server health.
 *   - If the remote server is offline, allows through if the local backend port is
 *     known (the operation router will route to local); suppresses the error toast
 *     since the SelfHostedOfflineBanner already communicates the outage.
 *
 * @param endpoint - Optional endpoint path to check if it needs local backend
 * @returns true if backend is ready OR endpoint will be routed to SaaS
 */
export async function ensureBackendReady(endpoint?: string): Promise<boolean> {
  // Skip waiting if endpoint will be routed to SaaS backend
  if (endpoint) {
    const skipCheck = await operationRouter.shouldSkipBackendReadyCheck(endpoint);
    if (skipCheck) {
      console.debug('[backendReadinessGuard] Skipping backend ready check (SaaS routing)');
      return true;
    }
  }

  // In self-hosted mode, handle server-offline + local fallback case
  const mode = await connectionModeService.getCurrentMode();
  if (mode === 'selfhosted') {
    const { status } = selfHostedServerMonitor.getSnapshot();
    if (status === 'offline') {
      // Server offline: allow through if local backend port is known.
      // The operation router will route to local for supported endpoints.
      // Suppress the toast — the banner already communicates the outage.
      const localUrl = tauriBackendService.getBackendUrl();
      return !!localUrl;
    }
    // Server online: fall through to the existing health check (which checks self-hosted server)
  }

  // Check backend health (in self-hosted mode this checks the remote server;
  // in SaaS mode this checks the local bundled backend)
  if (tauriBackendService.isBackendHealthy()) {
    return true;
  }

  // Trigger a health check so we get the freshest status
  await tauriBackendService.checkBackendHealth();
  if (tauriBackendService.isBackendHealthy()) {
    return true;
  }

  const now = Date.now();
  if (now - lastBackendToast > BACKEND_TOAST_COOLDOWN_MS) {
    lastBackendToast = now;
    alert({
      alertType: 'error',
      title: i18n.t('backendHealth.offline', 'Backend Offline'),
      body: i18n.t('backendHealth.checking', 'Checking backend status...'),
      isPersistentPopup: false,
    });
  }

  return false;
}
