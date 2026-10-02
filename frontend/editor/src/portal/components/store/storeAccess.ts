import { createContext, useContext } from "react";
import { stripBasePath, withBasePath } from "@app/constants/app";
import { rememberPendingDestination } from "@app/services/pendingDestination";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

/**
 * Who is looking at the store, which decides what it offers. Inside the portal the viewer is a
 * member: install, star, and the team's own listings. The store is also reachable outside the
 * portal gate (BR-01), by an account without portal access, which can star but not install, and
 * by a guest with no account, who can only read.
 */
export type StoreAccess = "member" | "signedIn" | "guest";

const StoreAccessContext = createContext<StoreAccess>("member");

export const StoreAccessProvider = StoreAccessContext.Provider;

export function useStoreAccess(): StoreAccess {
  return useContext(StoreAccessContext);
}

/** Whether a router path is the store's index or one of its listings. */
export function isStorePath(pathname: string): boolean {
  const store = `${PORTAL_BASENAME}/store`;
  return pathname === store || pathname.startsWith(`${store}/`);
}

/** Send a guest to sign in and bring them back to the page they were on. */
export function signInToContinue(): void {
  const { pathname, search, hash } = window.location;
  rememberPendingDestination(`${stripBasePath(pathname)}${search}${hash}`);
  window.location.href = withBasePath("/login");
}
