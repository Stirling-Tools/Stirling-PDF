import { NavKey } from "@editor/components/shared/config/types";
import { stripBasePath, withBasePath } from "@editor/constants/app";

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
