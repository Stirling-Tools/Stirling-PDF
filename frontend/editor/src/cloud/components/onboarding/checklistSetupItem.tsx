import { useCallback, useState, type ReactNode } from "react";
import SaasOnboardingModal from "@app/components/onboarding/SaasOnboardingModal";

export interface ChecklistItem {
  id: string;
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
  onClick: () => void;
}

export interface ChecklistSetupItem {
  /** Null hides the row, and it no longer counts towards the total. */
  item: ChecklistItem | null;
  dialog: ReactNode;
}

const STEP_DOWNLOAD_DESKTOP = "download-desktop";

/** The platform-specific first row of the getting-started checklist. */
export function useChecklistSetupItem(
  markDone: (stepId: string) => void,
): ChecklistSetupItem {
  const [open, setOpen] = useState(false);

  // The slide's skip and download buttons both close it, and either completes the task.
  const handleClose = useCallback(() => {
    markDone(STEP_DOWNLOAD_DESKTOP);
    setOpen(false);
  }, [markDone]);

  return {
    item: {
      id: STEP_DOWNLOAD_DESKTOP,
      titleKey: "onboarding.checklist.downloadDesktop.title",
      titleFallback: "Download Stirling for Desktop",
      descriptionKey: "onboarding.checklist.downloadDesktop.description",
      descriptionFallback: "Run Stirling natively on your machine",
      onClick: () => setOpen(true),
    },
    dialog: (
      <SaasOnboardingModal
        opened={open}
        onClose={handleClose}
        slideIds={["desktop-install"]}
      />
    ),
  };
}
