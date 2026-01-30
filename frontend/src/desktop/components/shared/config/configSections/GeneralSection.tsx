import React from 'react';
import { Stack } from '@mantine/core';
import CoreGeneralSection from '@core/components/shared/config/configSections/GeneralSection';
import { DefaultAppSettings } from '@app/components/shared/config/configSections/DefaultAppSettings';
import { useVersionInfo } from '@app/hooks/useVersionInfo';

const GeneralSection: React.FC = () => {
  const { desktopVersion } = useVersionInfo();

  return (
    <Stack gap="lg">
      <DefaultAppSettings />
      <CoreGeneralSection hideTitle desktopVersion={desktopVersion} isDesktop />
    </Stack>
  );
};

export default GeneralSection;
