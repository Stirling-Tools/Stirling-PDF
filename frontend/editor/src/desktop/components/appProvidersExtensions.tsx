import type { ReactNode } from "react";
import { SaveShortcutListener } from "@app/components/SaveShortcutListener";
import { LocalProcessingFolders } from "@app/components/LocalProcessingFolders";
import { DiskConflictHost } from "@app/components/shared/DiskConflictHost";
import { ClassificationBackgroundRunner } from "@app/components/onboarding/classificationDemo/ClassificationBackgroundRunner";
import UpdateModal from "@core/components/shared/UpdateModal";
import { useDesktopUpdatePopup } from "@app/hooks/useDesktopUpdatePopup";

export function AppHostExtensions(): ReactNode {
  return (
    <>
      <SaveShortcutListener />
      <LocalProcessingFolders />
      <DiskConflictHost />
      <ClassificationBackgroundRunner />
    </>
  );
}

export function useUpdatePopupModal(): ReactNode {
  const { state: popupState, actions: popupActions } = useDesktopUpdatePopup();
  return (
    popupState.updateSummary && (
      <UpdateModal
        opened={popupState.showModal}
        onClose={popupActions.dismissModal}
        onRemindLater={popupActions.remindLater}
        currentVersion={popupState.currentVersion}
        updateSummary={popupState.updateSummary}
        machineInfo={{
          machineType: navigator.platform?.toLowerCase().includes("mac")
            ? "Client-mac"
            : navigator.platform?.toLowerCase().includes("linux")
              ? "Client-unix"
              : "Client-win",
          activeSecurity: false,
          licenseType: "NORMAL",
        }}
        desktopInstall={
          popupState.tauriInstallReady
            ? {
                state: popupState.state,
                progress: popupState.progress,
                errorMessage: popupState.errorMessage,
                canInstall: popupState.canInstall,
                actions: popupActions,
              }
            : undefined
        }
      />
    )
  );
}
