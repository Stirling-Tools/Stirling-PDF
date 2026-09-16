import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";
import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";

/**
 * The Downloads offer, one more way of getting files in. Hidden without a server that can
 * run it, and hidden again by the wizard when that server has no readable Downloads directory.
 */
export function SidebarProcessingSlot() {
  const blocked = useServerProcessingBlock();
  if (blocked) return null;
  return <DownloadsProcessingWizard />;
}
