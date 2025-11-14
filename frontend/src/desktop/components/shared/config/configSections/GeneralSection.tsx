import React from 'react';
import { Stack } from '@mantine/core';
import CoreGeneralSection from '@core/components/shared/config/configSections/GeneralSection';
import { DefaultAppSettings } from '@app/components/shared/config/configSections/DefaultAppSettings';

/**
 * Desktop extension of GeneralSection that adds default PDF editor settings
 */
const GeneralSection: React.FC = () => {
  return (
    <Stack gap="lg">
      <DefaultAppSettings />
      <CoreGeneralSection />
    </Stack>
  );
};

export default GeneralSection;
