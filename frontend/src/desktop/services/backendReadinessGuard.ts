import i18n from '@app/i18n';
import { alert } from '@app/components/toast';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { operationRouter } from '@app/services/operationRouter';

const BACKEND_TOAST_COOLDOWN_MS = 4000;
let lastBackendToast = 0;

/**
 * Desktop-specific guard that ensures the embedded backend is healthy
 * before tools attempt to call any API endpoints.
 * Enhanced to skip checks for endpoints routed to SaaS backend.
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

  // Check local backend health
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
