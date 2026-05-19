import { open as shellOpen } from "@tauri-apps/plugin-shell";
import {
  getExternalHref as getCoreExternalHref,
  toSafeExternalUrl,
} from "@core/utils/openExternalUrl";

export { toSafeExternalUrl };

export function getExternalHref(rawUrl: string): string | null {
  return getCoreExternalHref(rawUrl);
}

export async function openExternalUrl(rawUrl: string): Promise<boolean> {
  const safeUrl = toSafeExternalUrl(rawUrl);
  if (!safeUrl) {
    return false;
  }

  try {
    await shellOpen(safeUrl.href);
    return true;
  } catch (error) {
    console.warn(
      "[openExternalUrl] Failed to open URL via Tauri shell, falling back to window.open",
      error,
    );
    window.open(safeUrl.href, "_blank", "noopener,noreferrer");
    return true;
  }
}
