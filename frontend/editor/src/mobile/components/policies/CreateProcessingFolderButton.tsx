/**
 * No entry point on mobile: setting up folder processing starts by picking a
 * folder, and the dialog plugin has no folder picker on iOS or Android.
 */
export function CreateProcessingFolderButton() {
  return null;
}
