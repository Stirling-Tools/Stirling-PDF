import { NavKey } from "@app/components/shared/config/types";
import { stripBasePath, withBasePath } from "@app/constants/app";

const ORIGIN_KEY = "stirling.settingsOrigin";

/**
 * Record where the user is before they go to settings, so its Back control can
 * restore that URL by replacement. Recorded rather than inferred: history.go(-1)
 * is dropped by WebKit under load, and an entry made by pushState carries no
 * router key to tell "came from the editor" apart from "opened a deep link".
 * A no-op while already in settings, so tab switches keep the original origin.
 */
export function rememberSettingsOrigin(): void {
  const here = stripBasePath(window.location.pathname);
  if (here.startsWith("/settings")) return;
  try {
    window.sessionStorage.setItem(ORIGIN_KEY, here + window.location.search);
  } catch {
    // Private mode or storage disabled: Back falls back to the editor.
  }
}

/** The origin recorded by {@link rememberSettingsOrigin}, cleared on read. */
export function takeSettingsOrigin(): string | null {
  try {
    const origin = window.sessionStorage.getItem(ORIGIN_KEY);
    window.sessionStorage.removeItem(ORIGIN_KEY);
    return origin;
  } catch {
    return null;
  }
}

/**
 * Go to the settings page from outside the router — modals, services, and
 * contexts that must keep working where no <Router> is mounted (portal unit
 * tests render their providers bare). pushState + a synthetic popstate is how
 * React Router picks the change up without a hook.
 *
 * @param section land on this section; omit for the page's default
 * @param anchor scroll to and highlight this control, by its slug
 */
export function navigateToSettings(section?: NavKey, anchor?: string) {
  rememberSettingsOrigin();
  const hash = anchor ? `#${encodeURIComponent(anchor)}` : "";
  const path = `/settings${section ? `/${section}` : ""}${hash}`;
  window.history.pushState({}, "", withBasePath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** URL for a settings section (subpath-aware). */
export function getSettingsUrl(section: NavKey): string {
  return withBasePath(`/settings/${section}`);
}

/** Whether the current URL is in /settings (optionally a specific section). */
export function isInSettings(section?: NavKey): boolean {
  const pathname = stripBasePath(window.location.pathname);
  if (!section) return pathname.startsWith("/settings");
  return pathname === `/settings/${section}`;
}
