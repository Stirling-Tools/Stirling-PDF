import { type SidebarProcessingSlotProps } from "@core/components/shared/SidebarProcessingSlot";
export { type SidebarProcessingSlotProps };

import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";
import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";

/**
 * The Downloads offer, beside the sidebar's other file-entry actions — one more way of
 * getting files in. Hidden without a server that can run it, and hidden again by the
 * wizard itself when that server reports no readable Downloads directory. Hidden on
 * the collapsed rail — it is a sentence, not an icon.
 */
export function SidebarProcessingSlot({
  collapsed,
}: SidebarProcessingSlotProps) {
  const blocked = useServerProcessingBlock();
  if (collapsed || blocked) return null;
  return <DownloadsProcessingWizard />;
}
