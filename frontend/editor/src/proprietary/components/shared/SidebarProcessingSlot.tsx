import { type SidebarProcessingSlotProps } from "@core/components/shared/SidebarProcessingSlot";
export { type SidebarProcessingSlotProps };

import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";

/** Offers Downloads processing where a server can execute and meter it. */
export function SidebarProcessingSlot({
  collapsed,
}: SidebarProcessingSlotProps) {
  const enabled = usePoliciesEnabled();
  if (collapsed || !enabled) return null;
  return <DownloadsProcessingWizard />;
}
