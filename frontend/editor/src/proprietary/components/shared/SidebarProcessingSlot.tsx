import { type SidebarProcessingSlotProps } from "@core/components/shared/SidebarProcessingSlot";
export { type SidebarProcessingSlotProps };

import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";
import { CreateProcessingFolderButton } from "@app/components/policies/CreateProcessingFolderButton";

/**
 * Creation stays available on the collapsed rail; the sentence-length Downloads offer does not.
 */
export function SidebarProcessingSlot({
  collapsed,
}: SidebarProcessingSlotProps) {
  return (
    <>
      <CreateProcessingFolderButton placement="sidebar" collapsed={collapsed} />
      {!collapsed && <DownloadsProcessingWizard />}
    </>
  );
}
