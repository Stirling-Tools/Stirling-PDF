import apiClient from "@editor/services/apiClient";

export type CloudProvider = "microsoft" | "google";

export interface ConnectedAccount {
  id: number;
  provider: CloudProvider;
  email: string | null;
  displayName: string | null;
  status: "CONNECTED" | "NEEDS_RECONNECT";
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

export type ConnectOutcome = "connected" | "cancelled" | "error" | "closed";

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
