import { authService } from "@app/services/authService";
import { operationRouter } from "@app/services/operationRouter";

export interface ServerAutomationSession {
  baseUrl: string;
  key: string;
}

/** Identifies the server and account that own a desktop automation and its results. */
export async function getServerAutomationSession(): Promise<ServerAutomationSession> {
  const baseUrl = await operationRouter.getConnectedServerBaseUrl();
  const user = await authService.getUserInfo();
  if (!user?.username) throw new Error("Sign in before running automation");
  return { baseUrl, key: JSON.stringify([baseUrl, user.username]) };
}

/** Stops queued work when its originating account or server is no longer connected. */
export async function requireAutomationSession(key: string): Promise<void> {
  if ((await getServerAutomationSession()).key !== key) {
    throw new Error(
      "The server connection changed. Reconnect to resume processing.",
    );
  }
}
