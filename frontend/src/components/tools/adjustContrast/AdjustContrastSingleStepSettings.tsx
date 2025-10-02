import React from 'react';
import { Stack } from '@mantine/core';
import { AdjustContrastParameters } from '../../../hooks/tools/adjustContrast/useAdjustContrastParameters';
import AdjustContrastBasicSettings from './AdjustContrastBasicSettings';
import AdjustContrastColorSettings from './AdjustContrastColorSettings';

interface Props {
  parameters: AdjustContrastParameters;
  onParameterChange: <K extends keyof AdjustContrastParameters>(key: K, value: AdjustContrastParameters[K]) => void;
  disabled?: boolean;
}

// Single-step settings used by Automate to configure Adjust Contrast in one panel
export default function AdjustContrastSingleStepSettings({ parameters, onParameterChange, disabled }: Props) {
  return (
    <Stack gap="lg">
      <AdjustContrastBasicSettings
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
      />
      <AdjustContrastColorSettings
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
      />
    </Stack>
  );
}


