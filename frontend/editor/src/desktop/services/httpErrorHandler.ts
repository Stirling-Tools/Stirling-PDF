import { isAxiosError } from "axios";
import { handleHttpError as coreHandleHttpError } from "@core/services/httpErrorHandler";
import {
  classifyPaygError,
  handlePaygError,
} from "@app/services/paygErrorInterceptor";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";

/**
 * Desktop override of handleHttpError.
 * In desktop builds, 401 errors must never navigate to /login — the legacy web
 * login page must not appear. Instead, open the SignInModal for re-authentication.
 * All other error handling delegates to the core implementation.
 */
export async function handleHttpError(error: unknown): Promise<boolean> {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  // PAYG entitlement sentinels (402 FEATURE_DEGRADED / PAYG_LIMIT_REACHED,
  // 401 SIGNUP_REQUIRED) come from the backend EntitlementGuard on DIRECT API
  // calls. Mirror saas's paygErrorInterceptor: pop the matching usage-limit
  // modal (free vs spend-cap, keyed on `subscribed`) and suppress the generic
  // toast — the modal is the actionable surface. Classified strictly so we
  // don't hijack the session-expired 401 flow below. Server-side run paths
  // (policy auto-run, AI agent) broadcast the usageLimitBridge event instead,
  // which the mounted UsageLimitModalHost handles.
  const paygKind = classifyPaygError(error);
  if (paygKind !== null) {
    if (paygKind === "SIGNUP_REQUIRED") {
      // Desktop has no web signup-page bootstrap (handlePaygError's
      // payg:signupRequired event has no desktop listener). The desktop account
      // flow is the SignInModal, so open that directly for an anonymous user who
      // hit a billable endpoint.
      try {
        window.dispatchEvent(new Event(OPEN_SIGN_IN_EVENT));
      } catch {
        // non-browser env (tests / SSR) — no-op.
      }
    } else {
      handlePaygError(paygKind, error);
    }
    return true; // Suppress generic toast — modal handles it.
  }

  if (status === 401) {
    // In desktop builds, 401s are handled by the auth service (token refresh + toast
    // shown by apiClientSetup). Authentication is done via the onboarding modal or
    // SignInModal — never by navigating to /login or opening a popup here.
    return true; // Suppress toast
  }

  return coreHandleHttpError(error);
}
