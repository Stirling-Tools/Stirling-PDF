import { type SidebarProcessingSlotProps } from "@core/components/shared/SidebarProcessingSlot";
export { type SidebarProcessingSlotProps };

import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";

/**
 * The offer to process the user's Downloads, alongside the sidebar's other
 * file-entry actions — it is one more way of getting files in, so it belongs
 * with "Open from computer" rather than in the tool panel.
 *
 * Hidden on the collapsed rail: the offer is a sentence, not an icon, and the
 * wizard makes no sense reduced to a glyph.
 */
export function SidebarProcessingSlot({ collapsed }: SidebarProcessingSlotProps) {
  const policiesEnabled = usePoliciesEnabled();
  if (collapsed || !policiesEnabled) return null;
  return <DownloadsProcessingWizard />;
}
