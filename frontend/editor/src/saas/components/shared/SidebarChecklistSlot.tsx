import { type SidebarChecklistSlotProps } from "@core/components/shared/SidebarChecklistSlot";
export { type SidebarChecklistSlotProps };

import { OnboardingChecklist } from "@app/components/onboarding/OnboardingChecklist";

/**
 * SaaS getting-started checklist, floating above the sidebar footer. Hidden
 * when the sidebar is collapsed to its narrow rail.
 */
export function SidebarChecklistSlot({ collapsed }: SidebarChecklistSlotProps) {
  if (collapsed) return null;
  return <OnboardingChecklist />;
}
