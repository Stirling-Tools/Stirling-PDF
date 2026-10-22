import { FolderClassificationRailItem } from "@app/components/quickNav/FolderClassificationRailItem";

/** Desktop's extra rail footer entries, above the bell. Each entry decides for itself
 *  whether it has anything to show, so adding one here never leaves a gap. */
export function QuickNavRailFooterExtensions() {
  return (
    <>
      <FolderClassificationRailItem />
    </>
  );
}
