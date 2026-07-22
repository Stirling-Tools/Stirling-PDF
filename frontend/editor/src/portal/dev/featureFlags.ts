import { useSyncExternalStore } from "react";

/**
 * In-app dev feature flags, backed by sessionStorage (per-tab, cleared when the
 * tab closes — so a flag never leaks into a real session). Flip one at runtime
 * from the console:
 *
 *   window.portalDev.setFlag("reactQuery", true)
 *
 * or via the on-page {@link ReactQueryDevToggle}. Components read a flag with
 * {@link useFeatureFlag}; toggling re-renders every reader (and every open tab)
 * with no page reload.
 *
 * These are a dev-only harness, NOT a product feature — there is no server
 * component and no persistence beyond the tab.
 */
export type PortalFlag = "reactQuery";

const PREFIX = "portal.ff.";
const CHANGE_EVENT = "portal:flags-changed";

export function getFlag(name: PortalFlag): boolean {
  try {
    return sessionStorage.getItem(PREFIX + name) === "1";
  } catch {
    return false;
  }
}

export function setFlag(name: PortalFlag, value: boolean): void {
  try {
    if (value) sessionStorage.setItem(PREFIX + name, "1");
    else sessionStorage.removeItem(PREFIX + name);
  } catch {
    // sessionStorage unavailable (private mode / SSR) — flag stays off.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  // `storage` fires in OTHER tabs — keeps multiple dev tabs in sync.
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Reactive read of a dev flag. Re-renders the caller whenever the flag flips. */
export function useFeatureFlag(name: PortalFlag): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getFlag(name),
    () => false,
  );
}

// Console handle for quick toggling without the on-page control.
if (typeof window !== "undefined") {
  window.portalDev = {
    getFlag,
    setFlag,
    flags: () => ({ reactQuery: getFlag("reactQuery") }),
  };
}

declare global {
  interface Window {
    portalDev?: {
      getFlag: (name: PortalFlag) => boolean;
      setFlag: (name: PortalFlag, value: boolean) => void;
      flags: () => Record<PortalFlag, boolean>;
    };
  }
}
