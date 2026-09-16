import { DownloadsProcessingWizard } from "@app/components/policies/DownloadsProcessingWizard";

/**
 * The Downloads offer, beside the sidebar's other file-entry actions — one more way of
 * getting files in. Not gated on policies being available: it gates itself by asking the
 * server for a readable Downloads directory, and renders nothing without one.
 */
export function SidebarProcessingSlot() {
  return <DownloadsProcessingWizard />;
}
