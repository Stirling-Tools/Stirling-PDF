import type { ChecklistSetupItem } from "@editor-cloud/components/onboarding/checklistSetupItem";

export type {
  ChecklistItem,
  ChecklistSetupItem,
} from "@editor-cloud/components/onboarding/checklistSetupItem";

/** No setup row by default: cloud's row offers the desktop download, and this already is the app. */
export function useChecklistSetupItem(
  _markDone: (stepId: string) => void,
): ChecklistSetupItem {
  return { item: null, dialog: null };
}
