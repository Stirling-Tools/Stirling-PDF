/**
 * The files a required policy has blocked (fileId -> unusable until re-run clean
 * or closed).
 */

const blocked = new Set<string>();

/** Replace the blocked set wholesale - FileContext's `ui.policyBlocks` is authoritative. */
export function setBlockedFileIds(fileIds: readonly string[]): void {
  blocked.clear();
  for (const id of fileIds) blocked.add(id);
}

/** Whether a required policy currently blocks this file, so it must not export. */
export function isFileBlocked(fileId: string): boolean {
  return blocked.has(fileId);
}
