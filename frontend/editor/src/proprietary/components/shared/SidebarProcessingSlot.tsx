import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";
import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";

/** Offers Downloads processing where a server can execute and meter it. */
export function SidebarProcessingSlot() {
  const enabled = usePoliciesEnabled();
  const blocked = useServerProcessingBlock();
  if (!enabled || blocked) return null;
  return <DownloadsProcessingWizard />;
}
