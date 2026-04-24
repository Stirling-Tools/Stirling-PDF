import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DesktopInstallState,
  DesktopInstallProgress,
  DesktopInstallActions,
} from "@core/components/shared/UpdateModal";
import {
  desktopUpdateService,
  type CanInstallResult,
} from "@app/services/desktopUpdateService";

/**
 * Desktop-only hook managing the Tauri updater install state.
 * Provides state + actions that get passed to the core UpdateModal
 * via the desktop GeneralSection override.
 */
export function useDesktopInstall() {
  const [state, setState] = useState<DesktopInstallState>("idle");
  const [progress, setProgress] = useState<DesktopInstallProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tauriInstallReady, setTauriInstallReady] = useState(false);
  /**
   * Result of the `can_install_updates` probe. Populated when
   * [`checkTauriUpdate`] finds an update, because that's when it becomes
   * relevant — no point worrying about install permissions until we know
   * there's actually something to install.
   *
   * `null` means "haven't probed yet". When the probe runs and returns
   * `canInstall: false` the UpdateModal shows an inline blocked warning
   * with a link to the installation docs, and disables the Install Now
   * button so users can't click into a UAC prompt they can't satisfy.
   */
  const [canInstall, setCanInstall] = useState<CanInstallResult | null>(null);

  // Listen for the ready-to-restart event from Rust
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<void>("update-ready-to-restart", () => {
      setState("ready-to-restart");
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  /**
   * Check whether the Tauri updater has a downloadable build for the
   * current platform, and if so probe whether we can actually install it
   * without needing UAC elevation.
   */
  /**
   * Check whether the Tauri updater has a downloadable build for the
   * current platform, and if so probe whether we can actually install it
   * without needing UAC elevation.
   *
   * Returns `true` when an in-app install is available — callers MUST use
   * the return value instead of reading `tauriInstallReady` from the hook's
   * state, because React state updates are async and won't be visible
   * until the next render.
   */
  const checkTauriUpdate = useCallback(async (): Promise<boolean> => {
    try {
      const result = await invoke<{ version: string } | null>(
        "check_for_update",
      );
      const ready = !!result;
      setTauriInstallReady(ready);
      if (result) {
        const ci = await desktopUpdateService.canInstallUpdates();
        setCanInstall(ci);
      } else {
        setCanInstall(null);
      }
      return ready;
    } catch {
      setTauriInstallReady(false);
      setCanInstall(null);
      return false;
    }
  }, []);

  const startInstall: DesktopInstallActions["startInstall"] =
    useCallback(async () => {
      setState("downloading");
      setProgress(null);
      setErrorMessage(null);

      let progressUnlisten: UnlistenFn | undefined;
      let finishUnlisten: UnlistenFn | undefined;

      try {
        progressUnlisten = await listen<DesktopInstallProgress>(
          "update-download-progress",
          (event) => {
            setProgress(event.payload);
            if (event.payload.percent >= 100) setState("installing");
          },
        );
        finishUnlisten = await listen<void>("update-download-finished", () => {
          setState("installing");
        });
        await invoke<void>("download_and_install_update");
      } catch (err) {
        console.error("[useDesktopInstall] Install failed:", err);
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setState("error");
      } finally {
        progressUnlisten?.();
        finishUnlisten?.();
      }
    }, []);

  const restartApp: DesktopInstallActions["restartApp"] =
    useCallback(async () => {
      await invoke<void>("restart_app");
    }, []);

  return {
    state,
    progress,
    errorMessage,
    tauriInstallReady,
    canInstall,
    checkTauriUpdate,
    actions: { startInstall, restartApp },
  };
}
