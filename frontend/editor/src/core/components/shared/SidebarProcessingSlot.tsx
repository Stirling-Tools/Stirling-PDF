export interface SidebarProcessingSlotProps {
  collapsed?: boolean;
}

/**
 * Extension point for a processing-folder offer in the sidebar's controls box. Core has
 * no policy engine to run one; builds that ship processing folders shadow this file.
 */
export function SidebarProcessingSlot(_props: SidebarProcessingSlotProps) {
  return null;
}
