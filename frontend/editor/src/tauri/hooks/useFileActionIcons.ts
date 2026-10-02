import type { IconName } from "@app/ui/Icon";

/**
 * File action icons for desktop builds.
 * Opens a local folder rather than uploading, and saves rather than
 * downloading. A defined \`saveAs\` makes WorkbenchBar show the Save As button.
 */
export function useFileActionIcons(): {
  upload: IconName;
  download: IconName;
  saveAs: IconName | undefined;
} {
  return {
    upload: "folder-open",
    download: "save",
    // Returning this causes WorkbenchBar to render the Save As button. On
    // desktop, downloadFile() without a localPath shows a native save dialog.
    saveAs: "save-all",
  };
}
