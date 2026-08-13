export interface SidebarProcessingSlotProps {
  /** Whether the sidebar is collapsed to its narrow rail. */
  collapsed?: boolean;
}

/**
 * Extension point for a processing-folder offer in the sidebar's controls box.
 * Core has no policy engine to run one, so it renders nothing; builds that
 * ship processing folders (proprietary/SaaS) shadow this file.
 */
export function SidebarProcessingSlot(_props: SidebarProcessingSlotProps) {
  return null;
}
