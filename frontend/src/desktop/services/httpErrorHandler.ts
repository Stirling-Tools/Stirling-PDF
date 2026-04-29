import { isAxiosError } from "axios";
import { handleHttpError as coreHandleHttpError } from "@core/services/httpErrorHandler";

/**
 * Desktop override of handleHttpError.
 * In desktop builds, 401 errors must never navigate to /login — the legacy web
 * login page must not appear. Instead, open the SignInModal for re-authentication.
 * All other error handling delegates to the core implementation.
 */
export async function handleHttpError(error: unknown): Promise<boolean> {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 401) {
    // In desktop builds, 401s are handled by the auth service (token refresh + toast
    // shown by apiClientSetup). Authentication is done via the onboarding modal or
    // SignInModal — never by navigating to /login or opening a popup here.
    return true; // Suppress toast
  }

  return coreHandleHttpError(error);
}
