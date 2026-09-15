// Programmatic entry into the settings page from outside the router (cloud
// modals, onboarding checklists, service callbacks).

import type { NavKey } from "@app/components/shared/config/types";
import { navigateToSettings } from "@app/utils/settingsNavigation";

export function openAppSettings(targetKey?: NavKey, notice?: string) {
  try {
    navigateToSettings(targetKey ?? "overview");
    // The Plan section shows why the caller sent the user here (e.g. "Not
    // enough credits"), and only it listens.
    if (notice) {
      window.dispatchEvent(
        new CustomEvent("appConfig:notice", {
          detail: { key: targetKey, notice },
        }),
      );
    }
  } catch (_e) {
    // no-op on SSR or test environments
  }
}

export function openPlanSettings(notice?: string) {
  openAppSettings("plan", notice);
}
