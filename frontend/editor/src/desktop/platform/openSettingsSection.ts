import type { NavKey } from "@app/components/shared/config/types";
import { navigateToSettings } from "@app/utils/settingsNavigation";

/** Desktop: one window, so the section opens in place and the draft is left behind. */
export function openSettingsSection(section: NavKey): void {
  navigateToSettings(section);
}
