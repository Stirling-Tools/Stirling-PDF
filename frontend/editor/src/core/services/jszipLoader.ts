import type JSZip from "jszip";

/**
 * A new JSZip, loaded the first time a ZIP is handled. The services that read and
 * write ZIPs sit on the startup graph (every added file is checked for being one,
 * and the landing page imports the share and server-storage bundles), so a static
 * import put JSZip in front of the first screen for sessions that never see a ZIP.
 */
export async function createZip(): Promise<JSZip> {
  const { default: JSZipClass } = await import("jszip");
  return new JSZipClass();
}
