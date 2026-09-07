import { type SidebarProcessingSlotProps } from "@core/components/shared/SidebarProcessingSlot";
export { type SidebarProcessingSlotProps };

import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";

/**
 * The Downloads offer, beside the sidebar's other file-entry actions — one more way of
 * getting files in. Not gated on policies being available: it gates itself by asking the
 * server for a readable Downloads directory, and renders nothing without one. Hidden on
 * the collapsed rail — it is a sentence, not an icon.
 */
export function SidebarProcessingSlot({
  collapsed,
}: SidebarProcessingSlotProps) {
  if (collapsed) return null;
  return <DownloadsProcessingWizard />;
}
