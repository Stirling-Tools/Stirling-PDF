import { downloadDir } from "@tauri-apps/api/path";

/**
 * Desktop: the real Downloads folder, resolved from the OS.
 *
 * Returns null rather than throwing when the OS reports no Download directory, or when the
 * platform refuses access — to a caller that is a "nothing to offer", not an error worth
 * surfacing.
 */
export async function getDownloadsDirectory(): Promise<string | null> {
  try {
    return await downloadDir();
  } catch {
    return null;
  }
}
