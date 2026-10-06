import type { NavKey } from "@app/components/shared/config/types";
import { getSettingsUrl } from "@app/utils/settingsNavigation";

/**
 * Opens a settings section while keeping the current page, for a dialog
 * holding an unsaved draft: a new tab. A seam: desktop has no tabs.
 */
export function openSettingsSection(section: NavKey): void {
  // A page of this app, so only ever this origin.
  const url = new URL(getSettingsUrl(section), window.location.origin);
  if (url.origin !== window.location.origin) return;
  window.open(url.href, "_blank", "noopener,noreferrer");
}
