import type { IconName } from "@editor/ui/Icon";

/** File action icons for web builds. Desktop overrides this file to swap in
 * Save instead of Download. */
export function useFileActionIcons(): {
  upload: IconName;
  download: IconName;
} {
  return {
    upload: "upload",
    download: "download",
  };
}
