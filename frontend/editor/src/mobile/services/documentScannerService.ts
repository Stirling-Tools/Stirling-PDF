import { invoke } from "@tauri-apps/api/core";
import { readFile, remove } from "@tauri-apps/plugin-fs";
import i18n from "@app/i18n";

interface ScanResult {
  path: string | null;
}

function scanFileName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`;
  return `${i18n.t("mobile.scan.fileName", "Scan {{date}}", { date })}.pdf`;
}

/**
 * Opens the platform document scanner (VisionKit on iOS, ML Kit on Android)
 * and resolves to the scanned pages as one PDF, or null when the user cancels.
 * Rejects when the device has no scanner or the scan could not be saved.
 */
export async function scanDocument(): Promise<File | null> {
  const { path } = await invoke<ScanResult>("plugin:document-scanner|scan");
  if (!path) return null;

  try {
    const data = await readFile(path);
    return new File([data], scanFileName(), { type: "application/pdf" });
  } finally {
    // The native side hands over a temporary file; the workspace keeps its own copy.
    await remove(path).catch(() => undefined);
  }
}
