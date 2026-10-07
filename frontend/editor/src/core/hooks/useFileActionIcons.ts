import type { IconName } from "@app/ui/Icon";

/** File action icons for web builds. Desktop overrides this file to swap in
 * Save/Save As instead of Download. */
export function useFileActionIcons(): {
  upload: IconName;
  download: IconName;
  saveAs: IconName | undefined;
} {
  return {
    upload: "upload",
    download: "download",
    // Web builds do not expose a Save As action - the button is hidden when
    // this is undefined. Desktop builds override this file.
    saveAs: undefined,
  };
}
