export interface SidebarChecklistSlotProps {
  /** Whether the sidebar is collapsed to its narrow rail. */
  collapsed?: boolean;
}

/**
 * Extension point for a getting-started checklist that floats above the
 * sidebar footer. Core renders nothing; builds that offer onboarding (SaaS)
 * shadow this file to provide the real checklist.
 */
export function SidebarChecklistSlot(_props: SidebarChecklistSlotProps) {
  return null;
}
