import type { ReactNode } from "react";
import { SaveShortcutListener } from "@editor/components/SaveShortcutListener";
import { LocalProcessingFolders } from "@editor/components/LocalProcessingFolders";
import { DiskConflictHost } from "@editor/components/shared/DiskConflictHost";
import { ClassificationBackgroundRunner } from "@editor/components/onboarding/classificationDemo/ClassificationBackgroundRunner";
import UpdateModal from "@editor-core/components/shared/UpdateModal";
import { useDesktopUpdatePopup } from "@editor/hooks/useDesktopUpdatePopup";

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
