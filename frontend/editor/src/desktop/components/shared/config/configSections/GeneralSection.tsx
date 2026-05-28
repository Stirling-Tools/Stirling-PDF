import React, { useCallback, useEffect, useState } from "react";
import { Stack, Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import CoreGeneralSection from "@core/components/shared/config/configSections/GeneralSection";
import { DefaultAppSettings } from "@app/components/shared/config/configSections/DefaultAppSettings";
import { useDesktopInstall } from "@app/hooks/useDesktopInstall";
import {
  desktopUpdateService,
  type UpdateMode,
  type UpdateModeInfo,
} from "@app/services/desktopUpdateService";

/**
 * Desktop extension of GeneralSection.
 *
 * Adds default PDF editor settings, wires up the Tauri auto-updater install
 * flow, and exposes the user-facing update-mode control (prompt / auto /
 * disabled). When the mode is locked by a provisioning file the control is
 * still rendered but disabled, with a "Managed by administrator" hint, so
 * managed-deployment users can see what policy is in effect.
 */
const GeneralSection: React.FC = () => {
  const { t } = useTranslation();
  const install = useDesktopInstall();
  const [updateModeInfo, setUpdateModeInfo] = useState<UpdateModeInfo>({
    mode: "prompt",
    locked: false,
  });
  const [updateModeError, setUpdateModeError] = useState<string | null>(null);

  // Check for Tauri updater availability on mount
  useEffect(() => {
    void install.checkTauriUpdate();
  }, [install.checkTauriUpdate]);

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
      <DefaultAppSettings />
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
      <CoreGeneralSection
        hideUpdateSection={
          updateModeInfo.mode === "disabled" && updateModeInfo.locked
        }
        desktopInstall={{
          state: install.state,
          progress: install.progress,
          errorMessage: install.errorMessage,
          tauriInstallReady: install.tauriInstallReady,
          canInstall: install.canInstall,
          actions: install.actions,
        }}
        desktopUpdateMode={{
          mode: updateModeInfo.mode,
          locked: updateModeInfo.locked,
          onChange: handleUpdateModeChange,
        }}
      />
    </Stack>
  );
};

export default GeneralSection;
