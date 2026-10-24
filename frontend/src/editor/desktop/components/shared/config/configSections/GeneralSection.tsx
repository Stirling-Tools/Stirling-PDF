import React, { useCallback, useEffect, useState } from "react";
import { Stack, Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import PreferencesSection, {
  type PreferencesSectionProps,
} from "@core/components/shared/config/configSections/preferences/PreferencesSection";
import { DefaultAppSettings } from "@app/components/shared/config/configSections/DefaultAppSettings";
import { useDesktopInstall } from "@app/hooks/useDesktopInstall";
import {
  desktopUpdateService,
  type UpdateMode,
  type UpdateModeInfo,
} from "@app/services/desktopUpdateService";

/**
 * Desktop Preferences page: the lower layers' props plus file defaults, the Tauri
 * updater and the update-mode control (shown disabled when provisioning locks it).
 */
const GeneralSection: React.FC<PreferencesSectionProps> = ({
  editorDefaultsSlot,
  hideUpdateSection = false,
  ...props
}) => {
  const { t } = useTranslation();
  const install = useDesktopInstall();
  const [updateModeInfo, setUpdateModeInfo] = useState<UpdateModeInfo | null>(
    null,
  );
  const [updateModeError, setUpdateModeError] = useState<string | null>(null);

  // Provisioning can prohibit update requests before Settings opens.
  useEffect(() => {
    if (!updateModeInfo || updateModeInfo.mode === "disabled") return;
    void install.checkTauriUpdate();
  }, [install.checkTauriUpdate, updateModeInfo]);

  // Load the current update mode + lock status on mount. We intentionally
  // re-fetch on every mount so that a provisioning file dropped while the
  // app is running (admin re-pushes config via MDM) is reflected the next
  // time the user opens Settings — the Rust side re-reads the store on
  // every call, so this is essentially a fresh read.
  useEffect(() => {
    let cancelled = false;
    desktopUpdateService.getUpdateModeInfo().then((info) => {
      if (!cancelled) setUpdateModeInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateModeChange = useCallback(
    async (mode: UpdateMode) => {
      setUpdateModeError(null);
      try {
        await desktopUpdateService.setUpdateMode(mode);
        // Refresh rather than optimistically updating — the Rust command
        // can refuse the change (locked) and we want the UI to reflect
        // the authoritative stored value.
        const fresh = await desktopUpdateService.getUpdateModeInfo();
        setUpdateModeInfo(fresh);
      } catch (err) {
        console.error("[GeneralSection] setUpdateMode failed:", err);
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : t(
                  "settings.general.updates.updateBehaviorErrorLocked",
                  "This setting is locked by your administrator.",
                );
        setUpdateModeError(msg);
      }
    },
    [t],
  );

  return (
    <Stack gap="lg">
      {updateModeError && (
        <Alert
          color="red"
          title={t(
            "settings.general.updates.updateBehaviorError",
            "Could not change update behavior",
          )}
          withCloseButton
          onClose={() => setUpdateModeError(null)}
        >
          {updateModeError}
        </Alert>
      )}
      <PreferencesSection
        {...props}
        editorDefaultsSlot={
          <>
            {editorDefaultsSlot}
            <DefaultAppSettings />
          </>
        }
        // Mounting the card starts its summary request, so policy must be known first.
        hideUpdateSection={hideUpdateSection || !updateModeInfo}
        desktopInstall={{
          state: install.state,
          progress: install.progress,
          errorMessage: install.errorMessage,
          tauriInstallReady: install.tauriInstallReady,
          canInstall: install.canInstall,
          actions: install.actions,
        }}
        desktopUpdateMode={
          updateModeInfo
            ? {
                mode: updateModeInfo.mode,
                locked: updateModeInfo.locked,
                onChange: handleUpdateModeChange,
              }
            : undefined
        }
      />
    </Stack>
  );
};

export default GeneralSection;
