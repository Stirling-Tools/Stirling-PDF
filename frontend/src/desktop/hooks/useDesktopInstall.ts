import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DesktopInstallState, DesktopInstallProgress, DesktopInstallActions } from '@core/components/shared/UpdateModal';

/**
 * Desktop-only hook managing the Tauri updater install state.
 * Provides state + actions that get passed to the core UpdateModal
 * via the desktop GeneralSection override.
 */
export function useDesktopInstall() {
  const [state, setState] = useState<DesktopInstallState>('idle');
  const [progress, setProgress] = useState<DesktopInstallProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tauriInstallReady, setTauriInstallReady] = useState(false);

  // Listen for the ready-to-restart event from Rust
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<void>('update-ready-to-restart', () => {
      setState('ready-to-restart');
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  /** Check whether the Tauri updater has a downloadable build for the current platform. */
  const checkTauriUpdate = useCallback(async () => {
    try {
      const result = await invoke<{ version: string } | null>('check_for_update');
      setTauriInstallReady(!!result);
    } catch {
      setTauriInstallReady(false);
    }
  }, []);

  const startInstall: DesktopInstallActions['startInstall'] = useCallback(async () => {
    setState('downloading');
    setProgress(null);
    setErrorMessage(null);

    let progressUnlisten: UnlistenFn | undefined;
    let finishUnlisten: UnlistenFn | undefined;

    try {
      progressUnlisten = await listen<DesktopInstallProgress>(
        'update-download-progress',
        (event) => {
          setProgress(event.payload);
          if (event.payload.percent >= 100) setState('installing');
        },
      );
      finishUnlisten = await listen<void>('update-download-finished', () => {
        setState('installing');
      });
      await invoke<void>('download_and_install_update');
    } catch (err) {
      console.error('[useDesktopInstall] Install failed:', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState('error');
    } finally {
      progressUnlisten?.();
      finishUnlisten?.();
    }
  }, []);

  const restartApp: DesktopInstallActions['restartApp'] = useCallback(async () => {
    await invoke<void>('restart_app');
  }, []);

  return {
    state,
    progress,
    errorMessage,
    tauriInstallReady,
    checkTauriUpdate,
    actions: { startInstall, restartApp },
  };
}
