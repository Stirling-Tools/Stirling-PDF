import i18n from '@app/i18n';
import { alert } from '@app/components/toast';
import { tauriBackendService } from '@app/services/tauriBackendService';

const BACKEND_TOAST_COOLDOWN_MS = 4000;
let lastBackendToast = 0;

/**
 * Desktop-specific guard that ensures the embedded backend is healthy
 * before tools attempt to call any API endpoints.
 */
export async function ensureBackendReady(): Promise<boolean> {
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
