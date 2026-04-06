import React, { useEffect } from 'react';
import { Stack } from '@mantine/core';
import CoreGeneralSection from '@core/components/shared/config/configSections/GeneralSection';
import { DefaultAppSettings } from '@app/components/shared/config/configSections/DefaultAppSettings';
import { useDesktopInstall } from '@app/hooks/useDesktopInstall';

/**
 * Desktop extension of GeneralSection.
 * Adds default PDF editor settings and wires up the Tauri auto-updater
 * install flow (check + download + install via the Rust updater plugin).
 */
const GeneralSection: React.FC = () => {
  const install = useDesktopInstall();

  // Check for Tauri updater availability on mount
  useEffect(() => {
    void install.checkTauriUpdate();
  }, [install.checkTauriUpdate]);

  return (
    <Stack gap="lg">
      <DefaultAppSettings />
      <CoreGeneralSection
        desktopInstall={{
          state: install.state,
          progress: install.progress,
          errorMessage: install.errorMessage,
          tauriInstallReady: install.tauriInstallReady,
          actions: install.actions,
        }}
      />
    </Stack>
  );
};

export default GeneralSection;
