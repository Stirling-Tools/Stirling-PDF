/**
 * Desktop directory picking: the Tauri file dialog hands back a real path,
 * which is the whole reason local folders are a desktop capability — a
 * browser can only produce handles, never locations.
 */

import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { PickedDirectory } from "@core/services/directoryPicker";
export type { PickedDirectory };

// The desktop bundle also runs as a plain web page in dev; only the actual
// Tauri webview can open the native dialog.
export const canPickDirectory = isTauri();

export async function pickDirectory(): Promise<PickedDirectory | null> {
  if (!canPickDirectory) return null;
  const picked = await open({ directory: true, multiple: false });
  if (typeof picked !== "string" || picked.length === 0) return null;
  // The path's last segment, tolerant of either separator and a trailing one.
  const name =
    picked
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || picked;
  return { path: picked, name };
}
