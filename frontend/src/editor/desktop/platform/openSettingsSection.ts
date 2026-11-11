import type { NavKey } from "@editor/components/shared/config/types";
import { navigateToSettings } from "@editor/utils/settingsNavigation";

/** Desktop: one window, so the section opens in place and the draft is left behind. */
export function openSettingsSection(section: NavKey): void {
  navigateToSettings(section);
}
