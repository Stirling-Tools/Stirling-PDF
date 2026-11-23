import UpdateModal from "@editor-core/components/shared/UpdateModal";
import type { useDesktopUpdatePopup } from "@editor/hooks/useDesktopUpdatePopup";

/** The startup update popup, shown when a newer desktop release is available. */
export function DesktopUpdatePopup({
  popup,
}: {
  popup: ReturnType<typeof useDesktopUpdatePopup>;
}) {
  const { state: popupState, actions: popupActions } = popup;
  if (!popupState.updateSummary) return null;
  return (
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
  );
}
