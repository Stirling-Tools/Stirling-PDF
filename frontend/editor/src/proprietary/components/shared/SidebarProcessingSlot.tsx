import { type SidebarProcessingSlotProps } from "@core/components/shared/SidebarProcessingSlot";
export { type SidebarProcessingSlotProps };

import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";

/**
 * The sentence-length Downloads offer is hidden when the sidebar is collapsed.
 */
export function SidebarProcessingSlot({
  collapsed,
}: SidebarProcessingSlotProps) {
  return collapsed ? null : <DownloadsProcessingWizard />;
}
