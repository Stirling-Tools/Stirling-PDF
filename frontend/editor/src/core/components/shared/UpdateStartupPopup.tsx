import { useEffect, useRef, useState } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFrontendVersionInfo } from "@app/hooks/useFrontendVersionInfo";
import { updateService, type UpdateSummary } from "@app/services/updateService";
import UpdateModal from "@app/components/shared/UpdateModal";

/**
 * How long to wait after mount before checking for an update. Matches the
 * desktop popup delay (15s) so the first-launch experience feels the same
 * in both environments and the check doesn't race with initial app config
 * load / auth handshake on slow networks.
 */
const STARTUP_DELAY_MS = 15_000;

/**
 * localStorage key used by the "Remind me later" button on the UpdateModal.
 * Shared with the desktop popup so snoozing in either context suppresses
 * both popups for the same 24h window.
 */
const SNOOZE_KEY = "stirling-pdf-updater:snoozedUntil";
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Best-effort Tauri detection without importing `@tauri-apps/api` into the
 * core bundle (which must remain runnable on plain web). Tauri v2 injects
 * `__TAURI_INTERNALS__` before any user code runs.
 */
function isRunningInTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ !== "undefined"
  );
}

/**
 * Web/server-side auto-popup that shows the UpdateModal on startup when a
 * newer Stirling-PDF version is available. Previously this check only ran
 * from the Settings → General "Check for Updates" button, so non-desktop
 * users could sit on stale versions indefinitely without any prompt.
 *
 * On desktop (Tauri) this component is a no-op — `useDesktopUpdatePopup`
 * drives the desktop flow because it also has to honour the headless
 * `updateMode` provisioning flag and wire up the silent/auto installer.
 * Running both would double-popup.
 */
export function UpdateStartupPopup() {
  const { config } = useAppConfig();
  const { appVersion } = useFrontendVersionInfo(config?.appVersion);

  // The version to compare against the latest. Prefer the frontend version
  // (which is always known) so we don't wait for the backend handshake in
  // offline / self-hosted-down scenarios.
  const currentVersion = appVersion ?? config?.appVersion ?? null;

  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(
    null,
  );
  const [showModal, setShowModal] = useState(false);
  const hasChecked = useRef(false);

  useEffect(() => {
    // Skip on desktop — the Tauri popup owns that flow end-to-end.
    if (isRunningInTauri()) return;
    if (hasChecked.current) return;
    if (!currentVersion) return;
    // Don't even schedule the timer until we have a version to compare.
    hasChecked.current = true;

    const timer = setTimeout(async () => {
      // Respect the 24h snooze set by the "Remind me later" button.
      const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
      if (snoozedUntil && Date.now() < parseInt(snoozedUntil, 10)) return;

      try {
        const machineInfo = {
          machineType: config?.machineType ?? "unknown",
          activeSecurity: config?.activeSecurity ?? false,
          licenseType: config?.license ?? "NORMAL",
        };
        const summary = await updateService.getUpdateSummary(
          currentVersion,
          machineInfo,
        );
        if (
          summary?.latest_version &&
          updateService.compareVersions(
            summary.latest_version,
            currentVersion,
          ) > 0
        ) {
          setUpdateSummary(summary);
          setShowModal(true);
        }
      } catch (err) {
        // Surface as a console warning — a silent failure here is preferable
        // to a noisy error banner on every offline startup.
        console.warn("[UpdateStartupPopup] startup update check failed:", err);
      }
    }, STARTUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    currentVersion,
    config?.machineType,
    config?.activeSecurity,
    config?.license,
  ]);

  if (!updateSummary || !currentVersion) return null;

  const machineInfo = {
    machineType: config?.machineType ?? "unknown",
    activeSecurity: config?.activeSecurity ?? false,
    licenseType: config?.license ?? "NORMAL",
  };

  return (
    <UpdateModal
      opened={showModal}
      onClose={() => setShowModal(false)}
      onRemindLater={() => {
        localStorage.setItem(
          SNOOZE_KEY,
          String(Date.now() + SNOOZE_DURATION_MS),
        );
        setShowModal(false);
      }}
      currentVersion={currentVersion}
      updateSummary={updateSummary}
      machineInfo={machineInfo}
    />
  );
}

export default UpdateStartupPopup;
