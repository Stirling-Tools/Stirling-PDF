/**
 * Whether files the OS handed this window ("open with") are still on their way in.
 * Session restoration can reopen files, but must leave incoming files' selection and view alone.
 * Only the desktop app is launched with files.
 */
export async function launchFilesPending(): Promise<boolean> {
  return false;
}
