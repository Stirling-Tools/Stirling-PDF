import { HttpError, SaasUnconfiguredError } from "@app/portal/api/http";
import { saasApiBase } from "@app/portal/api/saasApiBase";
import { saasFetch } from "@app/portal/saasTransport";

/** The correlator the server is waiting on; the web approval page sends it in a redirect. */
export interface ConnectApproval {
  callbackUrl: string;
  nonce: string;
}

/**
 * Approves a pending handshake as the account `accessToken` belongs to. Not
 * apiClient.saas: that sends the installed billing session, and this account is
 * only installed once the server has accepted it. 409 means a re-auth signed in
 * to an account outside the linked team.
 */
export async function approveConnect(
  requestId: string,
  accessToken: string,
): Promise<ConnectApproval> {
  const base = saasApiBase();
  if (base === null) throw new SaasUnconfiguredError();
  const response = await saasFetch(
    `${base}/api/v1/account-link/connect/${encodeURIComponent(requestId)}/approve`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not every refusal carries a body.
    }
    throw new HttpError(response.status, response.statusText, body);
  }
  return (await response.json()) as ConnectApproval;
}

/** The handshake id the server put in its approval link. */
export function requestIdOf(authorizeUrl: string): string | null {
  try {
    return new URL(authorizeUrl).searchParams.get("request");
  } catch {
    return null;
  }
}
