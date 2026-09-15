import { downloadDir } from "@tauri-apps/api/path";

/** Desktop: the real Downloads folder, from the OS. Null rather than a throw when there is none
 *  or access is refused — to a caller that is "nothing to offer", not an error. */
export async function getDownloadsDirectory(): Promise<string | null> {
  try {
    return await downloadDir();
  } catch {
    return null;
  }
}
