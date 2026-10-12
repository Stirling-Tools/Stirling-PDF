import { PORTAL_BASENAME } from "@app/routes/portalBasename";

export type ConnectMode = "link" | "reauth";
export interface PendingConnect {
  ownerId: string;
  mode: ConnectMode;
  returnTo: string;
  browserState: string;
}

const KEY = "stirling.portalConnect";

/** Retains tab-local intent across the SaaS redirect; never stores access or refresh tokens. */
export function rememberConnect(pending: PendingConnect): void {
  const { ownerId, mode, returnTo, browserState } = pending;
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ ownerId, mode, returnTo, browserState }),
  );
}

/** Returns a same-origin portal or settings destination in router-relative form. */
export function readPendingConnect(): PendingConnect | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (
      !value ||
      (value.mode !== "link" && value.mode !== "reauth") ||
      typeof value.returnTo !== "string" ||
      typeof value.ownerId !== "string" ||
      typeof value.browserState !== "string"
    )
      return null;
    const url = new URL(value.returnTo, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !(
        url.pathname === PORTAL_BASENAME ||
        url.pathname.startsWith(`${PORTAL_BASENAME}/`) ||
        url.pathname === "/settings" ||
        url.pathname.startsWith("/settings/")
      )
    )
      return null;
    return {
      ownerId: value.ownerId,
      mode: value.mode,
      browserState: value.browserState,
      returnTo: `${url.pathname}${url.search}`,
    };
  } catch {
    return null;
  }
}

/** Cancels local callback acceptance without disconnecting the instance. */
export function clearPendingConnect(): void {
  sessionStorage.removeItem(KEY);
}
