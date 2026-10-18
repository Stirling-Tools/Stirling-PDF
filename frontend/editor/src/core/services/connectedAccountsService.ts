/**
 * Users' own connected Microsoft and Google accounts. One sign-in serves the
 * editor's file pickers and the user's pipelines alike: the server keeps the
 * refresh token, and the editor asks it for short-lived access tokens.
 */
import apiClient from "@app/services/apiClient";

export type CloudProvider = "microsoft" | "google";

export interface ConnectedAccount {
  id: number;
  provider: CloudProvider;
  email: string | null;
  displayName: string | null;
  status: "CONNECTED" | "NEEDS_RECONNECT";
  /** A personal Microsoft account (consumer OneDrive), not work or school. */
  personal: boolean;
  lastError: string | null;
  createdAt: string | null;
}

export interface ConnectedAccountsState {
  providers: Record<CloudProvider, boolean>;
  accounts: ConnectedAccount[];
}

const BASE = "/api/v1/connected-accounts";
const CONNECT_MESSAGE_SOURCE = "stirling-connected-account";

export async function fetchConnectedAccounts(): Promise<ConnectedAccountsState> {
  const response = await apiClient.get<ConnectedAccountsState>(BASE, {
    suppressErrorToast: true,
  });
  return response.data;
}

export async function disconnectAccount(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

/**
 * A short-lived access token for one of the caller's accounts. `resource` is
 * `graph` or a SharePoint origin for Microsoft, `drive` for Google.
 */
export async function fetchAccessToken(
  id: number,
  resource: string,
): Promise<string> {
  const response = await apiClient.post<{ accessToken: string }>(
    `${BASE}/${id}/access-token`,
    { resource },
    { suppressErrorToast: true },
  );
  return response.data.accessToken;
}

export type ConnectOutcome = "connected" | "cancelled" | "error" | "closed";

/**
 * Signs the user in with the provider in a pop-up and resolves once it ends.
 * The window opens synchronously, before any await, so it stays inside the
 * click's user activation and pop-up blockers let it through; the provider URL
 * is filled in once the server has issued it.
 */
export async function connectAccount(
  provider: CloudProvider,
): Promise<ConnectOutcome> {
  const popup = window.open(
    "",
    `stirling-connect-${provider}`,
    "width=520,height=680,menubar=no,toolbar=no",
  );
  if (!popup) {
    throw new PopupBlockedError();
  }
  let url: string;
  try {
    const response = await apiClient.post<{ authorizationUrl: string }>(
      `${BASE}/${provider}/connect`,
    );
    url = response.data.authorizationUrl;
  } catch (error) {
    popup.close();
    throw error;
  }
  popup.location.href = url;
  return waitForPopup(popup);
}

/** Whether a sign-in failed because the browser blocked its pop-up window. */
export function isPopupBlocked(error: unknown): boolean {
  const failure = error as { code?: string; errorCode?: string } | null;
  const code = failure?.errorCode ?? failure?.code;
  return code === "popup_blocked" || code === "popup_window_error";
}

export class PopupBlockedError extends Error {
  readonly code = "popup_blocked";
  constructor() {
    super("popup_blocked");
  }
}

function waitForPopup(popup: Window): Promise<ConnectOutcome> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (outcome: ConnectOutcome) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(watch);
      resolve(outcome);
    };
    // The callback page posts only a status; the account list is re-read from
    // the API, so a forged message can at worst trigger a harmless refresh.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; status?: string } | null;
      if (event.source !== popup || data?.source !== CONNECT_MESSAGE_SOURCE) {
        return;
      }
      const status = data.status;
      finish(
        status === "connected" || status === "cancelled" || status === "error"
          ? status
          : "error",
      );
    };
    window.addEventListener("message", onMessage);
    const watch = window.setInterval(() => {
      if (popup.closed) finish("closed");
    }, 500);
  });
}
