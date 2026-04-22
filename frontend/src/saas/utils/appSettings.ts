// Utility helpers to open the settings/config modal programmatically
// and optionally navigate to a specific section (e.g., 'plan').

import type { NavKey } from "@app/components/shared/config/types";

export function openAppSettings(targetKey?: NavKey, notice?: string) {
  try {
    const detail: { key?: NavKey; notice?: string } = {};
    if (targetKey) detail.key = targetKey;
    if (notice) detail.notice = notice;
    // Ask the UI to open the App Config modal
    window.dispatchEvent(new CustomEvent("appConfig:open", { detail }));
    // If a specific section is requested, navigate there once modal mounts
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
