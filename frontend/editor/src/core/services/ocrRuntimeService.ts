import apiClient from "@app/services/apiClient";

/**
 * Talking to the on-demand OCR installer.
 *
 * The desktop installer no longer carries a Tesseract runtime, so the engine and
 * each language model are fetched when someone actually wants them. What is on
 * offer comes from a catalogue whose address is a setting, which is what lets an
 * installation point at an internal mirror or work with no internet at all.
 */

export interface OcrArtifact {
  url: string;
  size: number;
  sha256: string;
  version?: string;
  name?: string;
}

export interface OcrRuntimeStatus {
  engineInstalled: boolean;
  platform: string;
  installedLanguages: string[];
  catalogueReachable: boolean;
  catalogueError?: string;
  engineAvailable?: OcrArtifact | null;
  availableLanguages?: Record<string, OcrArtifact>;
  availableExtras?: Record<string, OcrArtifact>;
}

export interface OcrLanguagesResult {
  installedLanguages: string[];
  failed: Record<string, string>;
}

export async function getOcrRuntimeStatus(): Promise<OcrRuntimeStatus> {
  const { data } = await apiClient.get<OcrRuntimeStatus>(
    "/api/v1/ui-data/ocr/runtime",
  );
  return data;
}

export async function installOcrEngine(): Promise<{
  installed: boolean;
  restartRequired?: boolean;
  error?: string;
}> {
  const { data } = await apiClient.post("/api/v1/ui-data/ocr/runtime/install");
  return data;
}

/**
 * Language changes take effect immediately - the backend re-reads the models
 * from disk on every OCR request - so there is nothing to restart afterwards.
 *
 * A partial result is normal rather than exceptional: one model can fail while
 * the rest land, and the caller is told exactly which.
 */
export async function changeOcrLanguages(
  install: string[],
  remove: string[],
): Promise<OcrLanguagesResult> {
  const { data } = await apiClient.post<OcrLanguagesResult>(
    "/api/v1/ui-data/ocr/languages",
    { install, remove },
  );
  return data;
}

/** Sizes are the reason someone picks two languages instead of ten. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
