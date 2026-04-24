import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { updateService, UpdateSummary } from "@app/services/updateService";
import { useDesktopInstall } from "@app/hooks/useDesktopInstall";
import {
  desktopUpdateService,
  type CanInstallResult,
} from "@app/services/desktopUpdateService";

const SNOOZE_KEY = "stirling-pdf-updater:snoozedUntil";
const STARTUP_DELAY_MS = 15_000;

/**
 * Desktop-only hook that checks for updates on startup and handles the
 * three update modes configured via the tauri store (or the MDM
 * provisioning file):
 *
 * * `disabled` — no check is performed, no UI is shown, no network call.
 * * `auto`     — FULLY HEADLESS. We download + install + restart in the
 *                background with no modal and no countdown. The whole
 *                point of `auto` is that the admin has already decided
 *                for the user; adding a UI on top would defeat that.
 *                If the Rust `can_install_updates` probe reports the
 *                current process can't write to the install directory
 *                (non-admin on a per-machine install, typical MDM case),
 *                we silently skip — no annoying popup on every launch.
 * * `prompt`   — default interactive flow. Shows the UpdateModal so the
 *                user can decide. If the probe reports we can't install,
 *                the modal renders an inline "administrator permissions
 *                required" alert and disables the Install Now button —
 *                the user learns about the restriction at the moment
 *                they try to act on it.
 *
 * The `Later` snooze is only honoured in interactive mode. Auto mode
 * ignores the snooze so enterprise installs never drift onto old versions
 * just because a previous user clicked Later once.
 */
export function useDesktopUpdatePopup() {
  const [showModal, setShowModal] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(
    null,
  );
  // Popup-local canInstall — kept separate from install.canInstall so the
  // modal can be guaranteed to receive the probe result on the same render
  // that opens the modal. Setting setCanInstall + setShowModal in the same
  // microtask lets React batch them into a single render.
  const [canInstall, setCanInstall] = useState<CanInstallResult | null>(null);
  const install = useDesktopInstall();
  const hasChecked = useRef(false);

  // Keep a ref to install so the startup effect can call into it without
  // re-firing on every re-render (install.actions is a fresh object each time).
  const installRef = useRef(install);
  installRef.current = install;

  // Startup check
  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    const timer = setTimeout(async () => {
      let mode: Awaited<ReturnType<typeof desktopUpdateService.getUpdateMode>> =
        "prompt";
      try {
        mode = await desktopUpdateService.getUpdateMode();
      } catch {
        /* fall through with default */
      }

      if (mode === "disabled") {
        // Managed deployment opted out of updates entirely — nothing to do.
        return;
      }

      // Honour the user's "remind me later" snooze, but only in the interactive
      // flow. `auto` mode always applies updates so enterprise installs never
      // drift onto old versions just because a previous user pressed Later.
      if (mode === "prompt") {
        const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
        if (snoozedUntil && Date.now() < parseInt(snoozedUntil, 10)) return;
      }

      try {
        const version = await getVersion();
        setCurrentVersion(version);

        const platform = navigator.platform?.toLowerCase() ?? "";
        const machineType = platform.includes("mac")
          ? "Client-mac"
          : platform.includes("linux")
            ? "Client-unix"
            : "Client-win";
        const machineInfo = {
          machineType,
          activeSecurity: false,
          licenseType: "NORMAL",
        };
        const summary = await updateService.getUpdateSummary(
          version,
          machineInfo,
        );
        if (
          !summary?.latest_version ||
          updateService.compareVersions(summary.latest_version, version) <= 0
        )
          return;

        // Ask the Tauri updater whether it can provide an in-app install.
        // This may fail (placeholder pubkey, 404 on latest.json, signature
        // mismatch, …) — that's fine, it just means we show "Download
        // Latest" instead of "Install Now". The Supabase summary above is
        // the source of truth for "is there a newer version at all"; the
        // Tauri endpoint is only about "can we install it in-process".
        //
        // IMPORTANT: use the RETURN VALUE, not installRef.current.tauriInstallReady.
        // React state updates are async — the ref would still hold the
        // stale pre-check value at this point in the microtask.
        const tauriReady = await installRef.current.checkTauriUpdate();

        if (mode === "auto") {
          // Auto mode requires a working Tauri updater — we can't headless-
          // install via an external download link. If the tauri endpoint
          // is broken, or the user can't install, silently skip. The
          // interactive flow will still show the "Download Latest" fallback
          // if they ever open the popup manually.
          if (!tauriReady) {
            console.warn(
              "[DesktopUpdatePopup] auto-update skipped: tauri updater not available (pubkey/endpoint/signature issue?)",
            );
            return;
          }
          const ci: CanInstallResult =
            await desktopUpdateService.canInstallUpdates();
          if (!ci.canInstall) {
            console.warn(
              "[DesktopUpdatePopup] auto-update silently skipped: install dir not writable",
            );
            return;
          }
          // Fully headless flow: download + install + restart with no UI.
          try {
            await installRef.current.actions.startInstall();
            await installRef.current.actions.restartApp();
          } catch (err) {
            console.error("[DesktopUpdatePopup] auto-update failed:", err);
          }
          return;
        }

        // Interactive mode: always show the modal. The footer renders
        // "Install Now" when tauriInstallReady is true, or falls back
        // to "Download Latest" (external link) when the Tauri updater
        // is unavailable — so the user always has a path forward even
        // when latest.json is missing, the pubkey is wrong, or the
        // signature doesn't match.
        const ci: CanInstallResult =
          await desktopUpdateService.canInstallUpdates();
        setUpdateSummary(summary);
        setCanInstall(ci);
        setShowModal(true);
      } catch (err) {
        console.error("[DesktopUpdatePopup] Startup check failed:", err);
      }
    }, STARTUP_DELAY_MS);

    // Intentionally empty deps — this is a one-shot startup effect guarded
    // by `hasChecked.current`. Adding `install` to the deps would re-fire
    // the timer every time the install state changes, which is wrong.
    return () => clearTimeout(timer);
  }, []);

  const dismissModal = useCallback(() => setShowModal(false), []);
  const remindLater = useCallback(() => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    setShowModal(false);
  }, []);

  return {
    state: {
      showModal,
      currentVersion,
      updateSummary,
      ...install,
      // Override the install hook's canInstall with the popup-local copy
      // so consumers see the value captured at the moment the modal was
      // opened. Prevents a race where install.canInstall is still null
      // when the modal first renders.
      canInstall,
    },
    actions: { dismissModal, remindLater, ...install.actions },
  };
}
