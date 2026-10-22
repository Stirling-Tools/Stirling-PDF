import type {
  DesktopInstallActions,
  DesktopInstallCanInstall,
  DesktopInstallProgress,
  DesktopInstallState,
} from "@app/components/shared/UpdateModal";

/**
 * Desktop-only: user-facing update policy control, rendered inside the Software
 * updates card alongside the version info. Passed down from the desktop
 * GeneralSection override so this core component never imports a Tauri API.
 */
export interface DesktopUpdateModeControl {
  /** Current mode. */
  mode: "prompt" | "auto" | "disabled";
  /** `true` when the mode was written by a provisioning file - disables the control. */
  locked: boolean;
  /** Called when the user picks a new mode. Async: surface errors via toast. */
  onChange: (mode: "prompt" | "auto" | "disabled") => Promise<void> | void;
}

/** Desktop-only: Tauri updater install state, passed from the desktop override. */
export interface DesktopInstall {
  state: DesktopInstallState;
  progress: DesktopInstallProgress | null;
  errorMessage: string | null;
  tauriInstallReady: boolean;
  /** Result of the `can_install_updates` probe, used to show an inline warning
   *  when msiexec would need UAC elevation this user doesn't have. */
  canInstall?: DesktopInstallCanInstall | null;
  actions: DesktopInstallActions;
}

/**
 * What the Software updates card needs from the page that owns it. Every other
 * preferences card reads its own context (preferences, theme, app config) and
 * writes straight through, so this is the only card with props.
 */
export interface SoftwareUpdatesCardProps {
  desktopInstall?: DesktopInstall;
  desktopUpdateMode?: DesktopUpdateModeControl;
}
