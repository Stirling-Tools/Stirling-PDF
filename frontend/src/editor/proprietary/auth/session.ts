import { getPortalSaasToken } from "@app/portal/auth/portalSaasSession";

/** Checkout uses the account session installed by the validated owner connection flow. */
export async function getAccessToken(): Promise<string | null> {
  return getPortalSaasToken();
}
