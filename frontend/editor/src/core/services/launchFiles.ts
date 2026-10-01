/**
 * Whether files the OS handed this window ("open with") are still on their way in.
 * They own the workbench when they arrive, so a session restore yields to them.
 * Only the desktop app is launched with files.
 */
export async function launchFilesPending(): Promise<boolean> {
  return false;
}
