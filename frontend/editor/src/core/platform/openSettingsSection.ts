import type { NavKey } from "@app/components/shared/config/types";
import { getSettingsUrl } from "@app/utils/settingsNavigation";

/**
 * Opens a settings section while keeping the current page, for a dialog
 * holding an unsaved draft: a new tab. A seam: desktop has no tabs.
 */
export function openSettingsSection(section: NavKey): void {
  window.open(getSettingsUrl(section), "_blank", "noopener,noreferrer");
}
