import React from 'react';
import { Stack, Text, NumberInput, Slider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from '../../../hooks/tools/convert/useConvertParameters';

interface ConvertFromWebSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: (key: keyof ConvertParameters, value: any) => void;
  disabled?: boolean;
}

const ConvertFromWebSettings = ({ 
  parameters, 
  onParameterChange, 
  disabled = false 
}: ConvertFromWebSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="web-settings">
      <Text size="sm" fw={500}>{t("convert.webOptions", "Web to PDF Options")}:</Text>
      
      <Stack gap="xs">
        <Text size="xs" fw={500}>{t("convert.zoomLevel", "Zoom Level")}:</Text>
        <NumberInput
          value={parameters.htmlOptions.zoomLevel}
          onChange={(value) => onParameterChange('htmlOptions', { 
            ...parameters.htmlOptions, 
            zoomLevel: Number(value) || 1.0 
          })}
          min={0.1}
          max={3.0}
          step={0.1}
          precision={1}
          disabled={disabled}
          data-testid="zoom-level-input"
        />
        <Slider
          value={parameters.htmlOptions.zoomLevel}
          onChange={(value) => onParameterChange('htmlOptions', { 
            ...parameters.htmlOptions, 
            zoomLevel: value 
          })}
          min={0.1}
          max={3.0}
          step={0.1}
          disabled={disabled}
          data-testid="zoom-level-slider"
        />
      </Stack>
    </Stack>
  );
};

export default ConvertFromWebSettings;