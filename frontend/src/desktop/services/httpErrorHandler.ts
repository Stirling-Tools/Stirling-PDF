import { handleHttpError as coreHandleHttpError } from '@core/services/httpErrorHandler';
import { LOCAL_MODE_STORAGE_KEY } from '@app/services/connectionModeService';

/**
 * Desktop override of handleHttpError.
 * In desktop builds, 401 errors must never navigate to /login — the legacy web
 * login page must not appear. Instead, open the SignInModal for re-authentication.
 * All other error handling delegates to the core implementation.
 */
export async function handleHttpError(error: any): Promise<boolean> {
  const status: number | undefined = error?.response?.status;
  const url: string = error?.config?.url ?? '';

  if (status === 401) {
    // In desktop builds, 401s are handled by the auth service (token refresh + toast
    // shown by apiClientSetup). Authentication is done via the onboarding modal or
    // SignInModal — never by navigating to /login or opening a popup here.
    return true; // Suppress toast
  }

  // In local mode the bundled backend has no proprietary features, so all
  // /api/v1/proprietary/* calls will fail. Suppress the toasts — they are
  // expected and not actionable. In SaaS/self-hosted these errors are real.
  if (localStorage.getItem(LOCAL_MODE_STORAGE_KEY) === 'true' && url.includes('/api/v1/proprietary/')) {
    return true; // Suppress toast
  }

  return coreHandleHttpError(error);
}
