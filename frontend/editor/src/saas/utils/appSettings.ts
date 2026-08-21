// Utility helpers to open the settings/config modal programmatically
// and optionally navigate to a specific section (e.g., 'plan').

import type { NavKey } from "@app/components/shared/config/types";

let pendingNavKey: NavKey | null = null;

/** Read and clear the section a caller asked to open the modal on (if any). */
export function consumePendingSettingsNav(): NavKey | null {
  const key = pendingNavKey;
  pendingNavKey = null;
  return key;
}

export function openAppSettings(targetKey?: NavKey, notice?: string) {
  try {
    const detail: { key?: NavKey; notice?: string } = {};
    if (targetKey) detail.key = targetKey;
    if (notice) detail.notice = notice;
    // Stash the target so a not-yet-mounted (lazy) modal starts on it.
    if (targetKey) pendingNavKey = targetKey;
    // Ask the UI to open the App Config modal
    window.dispatchEvent(new CustomEvent("appConfig:open", { detail }));
    // Navigate there too — handles the case where the modal is already mounted.
    if (targetKey) {
      window.dispatchEvent(
        new CustomEvent("appConfig:navigate", { detail: { key: targetKey } }),
      );
    }
  } catch (_e) {
    // no-op on SSR or test environments
  }
}

export function openPlanSettings(notice?: string) {
  openAppSettings("plan", notice);
}
