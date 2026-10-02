import { JWT_STORAGE_KEY } from "@app/auth/httpClient";
import { authService } from "@app/services/authService";
import { connectionModeService } from "@app/services/connectionModeService";

/** The account in the stored session token. Read, not verified: it only keys caches. */
function accountSubject(): string | null {
  let token: string | null = null;
  try {
    token = localStorage.getItem(JWT_STORAGE_KEY);
  } catch {
    return null;
  }
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub: unknown = JSON.parse(json).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Which server and account the app is connected as. Any change means another
 * server's or account's data, and desktop never reloads the page on sign-out or
 * a mode switch, so per-connection caches and subtrees key on this. Synchronous:
 * built from the cached mode, the cached server and the stored token.
 */
export function connectionIdentityKey(): string {
  const mode = connectionModeService.getCachedMode() ?? "unknown";
  const server =
    mode === "selfhosted"
      ? (connectionModeService.getCachedServerConfig()?.url ?? "")
      : "";
  return `${mode}|${server}|${accountSubject() ?? ""}`;
}

/** Calls the listener on every event that can move {@link connectionIdentityKey}. */
export function subscribeToConnectionIdentity(
  listener: () => void,
): () => void {
  const offMode = connectionModeService.subscribeToModeChanges(listener);
  const offAuth = authService.subscribeToAuth(() => listener());
  window.addEventListener("jwt-available", listener);
  return () => {
    offMode();
    offAuth();
    window.removeEventListener("jwt-available", listener);
  };
}
