import { type SidebarProcessingSlotProps } from "@core/components/shared/SidebarProcessingSlot";
export { type SidebarProcessingSlotProps };

import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";

/**
 * The offer to process the user's Downloads, alongside the sidebar's other
 * file-entry actions — it is one more way of getting files in, so it belongs
 * with "Open from computer" rather than in the tool panel.
 *
 * Deliberately not gated on whether policies are available. A processing
 * folder is its own surface: it happens to run on the policy engine, but a
 * user never meets the word, and the builds where the portal's Policies rail
 * makes sense are not the builds where a Downloads folder exists. The offer
 * gates itself instead — it asks the server whether there is a Downloads
 * directory it is allowed to read, and renders nothing when there is not.
 *
 * Hidden on the collapsed rail: the offer is a sentence, not an icon, and the
 * wizard makes no sense reduced to a glyph.
 */
export function SidebarProcessingSlot({ collapsed }: SidebarProcessingSlotProps) {
  if (collapsed) return null;
  return <DownloadsProcessingWizard />;
}
