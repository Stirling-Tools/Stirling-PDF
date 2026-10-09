import { STIRLING_SAAS_URL } from "@app/constants/connection";
import { authService } from "@app/services/authService";
import * as server from "@portal-proprietary/auth/portalSaasSession";
import { handlePortalSessionRequired } from "@app/portal/auth/sessionClient";
import { currentEdition } from "@portal/edition";

export {
  SaasSessionRequiredError,
  subscribePortalSaasSession,
  getPortalSaasSessionState,
  resetPortalSaasSessionState,
  portalSaasSessionRestored,
  isTerminalSaasAuthError,
} from "@portal-proprietary/auth/portalSaasSession";

/**
 * On Stirling Cloud the billing account IS the desktop's signed-in account, so
 * its token and refresh are authService's rather than a second Supabase session.
 * A self-hosted server keeps the base billing session, which desktop installs
 * from its in-app Stirling sign-in.
 */
async function cloudToken(): Promise<string | null> {
  await authService.awaitRefreshIfInProgress();
  const token = await authService.getAuthToken();
  if (token && authService.isTokenExpiringSoon(token)) {
    return (await renewCloudToken(token)) ?? token;
  }
  return token;
}

let renewal: Promise<string | null> | null = null;

/** Coalesced, and reuses a token another caller already renewed. */
function renewCloudToken(rejected: string): Promise<string | null> {
  renewal ??= (async () => {
    try {
      const current = await authService.getAuthToken();
      if (current && current !== rejected) return current;
      const refreshed =
        await authService.refreshSupabaseToken(STIRLING_SAAS_URL);
      return refreshed ? await authService.getAuthToken() : null;
    } finally {
      renewal = null;
    }
  })();
  return renewal;
}

function cloudSessionRequired(): never {
  handlePortalSessionRequired();
  throw new server.SaasSessionRequiredError();
}

/** Same contract as the base: only operations marked safe to replay are retried. */
async function withCloudSession<T>(
  send: (token: string) => Promise<T>,
  unauthorized: (response: T) => boolean,
  retry: boolean,
): Promise<T> {
  const token = await cloudToken();
  if (!token) return cloudSessionRequired();
  const response = await send(token);
  if (!unauthorized(response)) return response;
  if (!retry) return cloudSessionRequired();
  const renewed = await renewCloudToken(token);
  if (!renewed) return cloudSessionRequired();
  const retried = await send(renewed);
  if (unauthorized(retried)) return cloudSessionRequired();
  return retried;
}

export function getPortalSaasToken(): Promise<string | null> {
  return currentEdition() === "cloud"
    ? cloudToken()
    : server.getPortalSaasToken();
}

export function refreshPortalSaasToken(
  rejectedToken: string,
): Promise<string | null> {
  return currentEdition() === "cloud"
    ? renewCloudToken(rejectedToken)
    : server.refreshPortalSaasToken(rejectedToken);
}

export function withPortalSaasSession<T>(
  send: (token: string) => Promise<T>,
  unauthorized: (response: T) => boolean,
  retry: boolean = false,
): Promise<T> {
  return currentEdition() === "cloud"
    ? withCloudSession(send, unauthorized, retry)
    : server.withPortalSaasSession(send, unauthorized, retry);
}
