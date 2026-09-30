import { useEffect } from "react";
import { useDefaultApp } from "@app/hooks/useDefaultApp";
import type { ChecklistSetupItem } from "@cloud/components/onboarding/checklistSetupItem";

export type {
  ChecklistItem,
  ChecklistSetupItem,
} from "@cloud/components/onboarding/checklistSetupItem";

export function useChecklistSetupItem(
  _markDone: (stepId: string) => void,
): ChecklistSetupItem {
  const { isDefault, handleSetDefault, checkDefaultStatus } = useDefaultApp();

  // Windows makes the choice in its own settings dialog, so re-check when the user comes back.
  useEffect(() => {
    window.addEventListener("focus", checkDefaultStatus);
    return () => window.removeEventListener("focus", checkDefaultStatus);
  }, [checkDefaultStatus]);

  if (isDefault !== false) {
    return { item: null, dialog: null };
  }

  return {
    item: {
      id: "set-default-app",
      titleKey: "onboarding.checklist.setDefaultApp.title",
      titleFallback: "Make Stirling your default",
      descriptionKey: "onboarding.checklist.setDefaultApp.description",
      descriptionFallback: "Open PDF files in Stirling PDF",
      onClick: () => void handleSetDefault(),
    },
    dialog: null,
  };
}
