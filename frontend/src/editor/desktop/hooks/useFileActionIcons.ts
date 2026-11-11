import type { IconName } from "@editor/ui/Icon";

/**
 * File action icons for desktop builds.
 * Opens a local folder rather than uploading, and saves rather than
 * downloading.
 */
export function useFileActionIcons(): {
  upload: IconName;
  download: IconName;
} {
  return {
    upload: "folder-open",
    download: "save",
  };
}
