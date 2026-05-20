import { invoke } from "@tauri-apps/api/core";

export enum DesktopOs {
  Mac = "macos",
  Windows = "windows",
  Linux = "linux",
  Unknown = "unknown",
}

let desktopOsPromise: Promise<DesktopOs> | null = null;

export async function getDesktopOs() {
  if (!desktopOsPromise) {
    desktopOsPromise = invoke<DesktopOs>("get_desktop_os");
  }

  return desktopOsPromise;
}
