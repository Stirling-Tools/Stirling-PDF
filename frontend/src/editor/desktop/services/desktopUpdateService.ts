import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface UpdateInfo {
  /** New version string, e.g. "2.8.0" */
  version: string;
  /** Currently installed version string */
  currentVersion: string;
  /** Release notes from the update endpoint, if any */
  releaseNotes: string | null;
}

export interface UpdateProgress {
  /** Total bytes downloaded so far */
  downloaded: number;
  /** Total bytes to download (null if unknown) */
  total: number | null;
  /** Download percentage 0–100 */
  percent: number;
}

/**
 * Headless-install update policy, set via the `updateMode` field of a
 * `stirling-provisioning.json` file dropped by MDM / Intune tooling — or
 * from the Settings → Software Updates panel by the user.
 *
 * * `prompt`   – default. Show the update popup and let the user decide.
 * * `auto`     – silently download, install, and restart on startup.
 * * `disabled` – never check for updates or surface update UI.
 */
export type UpdateMode = "prompt" | "auto" | "disabled";

/** Current [`UpdateMode`] plus whether the UI can change it. */
export interface UpdateModeInfo {
  mode: UpdateMode;
  /**
   * `true` when the mode was written by a provisioning file. The Settings
   * control should render disabled with a "Managed by your administrator"
   * hint; attempts to call [`setUpdateMode`] are rejected by the Rust
   * command with an error so the UI can't quietly fall out of sync.
   */
  locked: boolean;
}

/** Shape returned by the `can_install_updates` Tauri command. */
export interface CanInstallResult {
  /** `true` when the current process can write to the install directory. */
  canInstall: boolean;
  /** Machine-readable reason when `canInstall` is `false`. */
  reason: string | null;
  /** The directory that was probed, for display in error messages. */
  installDir: string | null;
}

// ─── localStorage keys ────────────────────────────────────────────────────────
const KEY_PREFIX = "stirling-pdf-updater:";
const KEY_LAST_CHECKED = `${KEY_PREFIX}lastChecked`;
const KEY_CHECK_INTERVAL_HOURS = `${KEY_PREFIX}checkIntervalHours`;
const KEY_AUTO_DOWNLOAD = `${KEY_PREFIX}autoDownload`;
const KEY_SNOOZED_UNTIL = `${KEY_PREFIX}snoozedUntil`;

const DEFAULT_CHECK_INTERVAL_HOURS = 24;

// ─── Service ─────────────────────────────────────────────────────────────────

class DesktopUpdateService {
  private periodicCheckTimer: ReturnType<typeof setInterval> | null = null;
  private progressUnlisten: UnlistenFn | null = null;
  private finishUnlisten: UnlistenFn | null = null;

  // ── Tauri command wrappers ─────────────────────────────────────────────────

  /**
   * Ask the Rust updater to check the configured endpoint.
   * Returns `null` when up-to-date or when the check fails silently
   * (e.g. no network, bad pubkey configuration).
   */
  async checkForUpdate(): Promise<UpdateInfo | null> {
    try {
      return await invoke<UpdateInfo | null>("check_for_update");
    } catch (error) {
      console.error("[DesktopUpdateService] check_for_update failed:", error);
      return null;
    }
  }

  /**
   * Download and install the available update.
   *
   * `onProgress` is called for each received chunk.
   * `onFinish` is called when the download is complete and the installer
   * has been written to disk (install is underway).
   *
   * Throws if the download or install fails — callers should catch and fall
   * back to opening the download page.
   */
  async downloadAndInstall(
    onProgress: (progress: UpdateProgress) => void,
    onFinish: () => void,
  ): Promise<void> {
    this.cleanupEventListeners();

    this.progressUnlisten = await listen<UpdateProgress>(
      "update-download-progress",
      (event) => onProgress(event.payload),
    );

    this.finishUnlisten = await listen<void>("update-download-finished", () =>
      onFinish(),
    );

    try {
      await invoke<void>("download_and_install_update");
    } finally {
      this.cleanupEventListeners();
    }
  }

  /**
   * Restart the app to apply an already-installed update.
   * The process will be replaced — this call never returns normally.
   */
  async restartApp(): Promise<void> {
    await invoke<void>("restart_app");
  }

  /** Return the currently running app version string. */
  async getAppVersion(): Promise<string> {
    return invoke<string>("get_app_version");
  }

  /**
   * Return the configured update mode plus whether it's locked by provisioning.
   *
   * Falls back to `{mode: 'prompt', locked: false}` if the Tauri command is
   * unavailable (e.g. running in a browser dev environment) so non-managed
   * installs always get the default interactive flow.
   */
  async getUpdateModeInfo(): Promise<UpdateModeInfo> {
    try {
      return await invoke<UpdateModeInfo>("get_update_mode");
    } catch (error) {
      console.warn(
        "[DesktopUpdateService] get_update_mode failed, defaulting to prompt/unlocked:",
        error,
      );
      return { mode: "prompt", locked: false };
    }
  }

  /** Convenience wrapper when callers only need the mode itself. */
  async getUpdateMode(): Promise<UpdateMode> {
    return (await this.getUpdateModeInfo()).mode;
  }

  /**
   * Persist a user-chosen update mode. Throws when the mode is locked by
   * provisioning — callers should not swallow that error; it should be
   * surfaced as a UI toast or equivalent so the user knows why nothing
   * changed.
   */
  async setUpdateMode(mode: UpdateMode): Promise<void> {
    await invoke<void>("set_update_mode", { mode });
  }

  /**
   * Check whether the Tauri updater is likely to be able to install a new
   * version silently on this machine. See the Rust docstring on
   * `can_install_updates` for the underlying write-probe heuristic.
   *
   * Returns an optimistic `{canInstall: true, ...}` if the Tauri command is
   * unavailable so we don't block updates in non-Tauri dev environments.
   */
  async canInstallUpdates(): Promise<CanInstallResult> {
    try {
      return await invoke<CanInstallResult>("can_install_updates");
    } catch (error) {
      console.warn(
        "[DesktopUpdateService] can_install_updates failed, assuming allowed:",
        error,
      );
      return { canInstall: true, reason: null, installDir: null };
    }
  }

  // ── Periodic checking ──────────────────────────────────────────────────────

  /**
   * Start a recurring timer that checks for updates at the configured
   * interval.  `onUpdateAvailable` is called when a newer version is found.
   *
   * The timer respects the snooze setting — if the user has snoozed
   * notifications, the callback is suppressed until the snooze expires.
   */
  startPeriodicChecks(
    onUpdateAvailable: (update: UpdateInfo) => void,
    intervalHours?: number,
  ): void {
    this.stopPeriodicChecks();

    const hours = intervalHours ?? this.getCheckIntervalHours();
    const intervalMs = hours * 60 * 60 * 1000;

    this.periodicCheckTimer = setInterval(async () => {
      if (!this.shouldCheckNow()) return;
      const update = await this.checkForUpdate();
      this.setLastChecked();
      if (update) onUpdateAvailable(update);
    }, intervalMs);
  }

  stopPeriodicChecks(): void {
    if (this.periodicCheckTimer !== null) {
      clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = null;
    }
  }

  // ── Settings (persisted to localStorage) ──────────────────────────────────

  /**
   * Returns `true` when enough time has elapsed since the last check
   * AND the user has not snoozed update notifications.
   */
  shouldCheckNow(): boolean {
    const snoozedUntil = this.getSnoozedUntil();
    if (snoozedUntil !== null && Date.now() < snoozedUntil) return false;

    const lastChecked = this.getLastChecked();
    if (lastChecked === null) return true;

    const intervalMs = this.getCheckIntervalHours() * 60 * 60 * 1000;
    return Date.now() - lastChecked >= intervalMs;
  }

  getCheckIntervalHours(): number {
    const stored = localStorage.getItem(KEY_CHECK_INTERVAL_HOURS);
    return stored !== null
      ? parseInt(stored, 10)
      : DEFAULT_CHECK_INTERVAL_HOURS;
  }

  setCheckIntervalHours(hours: number): void {
    localStorage.setItem(KEY_CHECK_INTERVAL_HOURS, String(hours));
  }

  isAutoDownloadEnabled(): boolean {
    return localStorage.getItem(KEY_AUTO_DOWNLOAD) === "true";
  }

  setAutoDownload(value: boolean): void {
    localStorage.setItem(KEY_AUTO_DOWNLOAD, String(value));
  }

  getLastChecked(): number | null {
    const stored = localStorage.getItem(KEY_LAST_CHECKED);
    return stored !== null ? parseInt(stored, 10) : null;
  }

  setLastChecked(): void {
    localStorage.setItem(KEY_LAST_CHECKED, String(Date.now()));
  }

  getSnoozedUntil(): number | null {
    const stored = localStorage.getItem(KEY_SNOOZED_UNTIL);
    return stored !== null ? parseInt(stored, 10) : null;
  }

  /** Snooze update notifications for the given number of hours. */
  snoozeFor(hours: number): void {
    localStorage.setItem(
      KEY_SNOOZED_UNTIL,
      String(Date.now() + hours * 60 * 60 * 1000),
    );
  }

  clearSnooze(): void {
    localStorage.removeItem(KEY_SNOOZED_UNTIL);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private cleanupEventListeners(): void {
    this.progressUnlisten?.();
    this.progressUnlisten = null;
    this.finishUnlisten?.();
    this.finishUnlisten = null;
  }
}

export const desktopUpdateService = new DesktopUpdateService();
