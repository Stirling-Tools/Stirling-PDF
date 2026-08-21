import { NavKey } from "@app/components/shared/config/types";
import { stripBasePath, withBasePath } from "@app/constants/app";

/** Push the URL for a settings section and notify listeners. */
export function navigateToSettings(section: NavKey) {
  const newPath = withBasePath(`/settings/${section}`);
  window.history.pushState({}, "", newPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function openSettings(section: NavKey) {
  window.history.pushState({}, "", withBasePath(`/settings/${section}`));
  window.dispatchEvent(
    new CustomEvent("appConfig:open", { detail: { section } }),
  );
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
