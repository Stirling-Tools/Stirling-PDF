import { ask } from "@tauri-apps/plugin-dialog";
import i18n from "@editor/i18n";
import type { NavKey } from "@editor/components/shared/config/types";
import { navigateToSettings } from "@editor/utils/settingsNavigation";

/**
 * Desktop: one window, so the section opens in place and the caller's unsaved
 * draft is lost. Asks first; keeping the draft across the trip would take a
 * second window or settings inside the dialog.
 */
export function openSettingsSection(section: NavKey): void {
  void ask(
    i18n.t(
      "settings.leaveDraft.message",
      "What you were editing here has not been saved and will be lost.",
    ),
    {
      title: i18n.t("settings.leaveDraft.title", "Leave without saving?"),
      kind: "warning",
      okLabel: i18n.t("settings.leaveDraft.leave", "Open settings"),
      cancelLabel: i18n.t("settings.leaveDraft.stay", "Stay"),
    },
  )
    .then((leave) => {
      if (leave) navigateToSettings(section);
    })
    .catch(() => undefined);
}
