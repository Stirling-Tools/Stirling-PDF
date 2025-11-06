import { Stack, Text, Select, ColorInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ReplaceColorParameters } from "@app/hooks/tools/replaceColor/useReplaceColorParameters";

interface ReplaceColorSettingsProps {
  parameters: ReplaceColorParameters;
  onParameterChange: <K extends keyof ReplaceColorParameters>(key: K, value: ReplaceColorParameters[K]) => void;
  disabled?: boolean;
}

const ReplaceColorSettings = ({ parameters, onParameterChange, disabled = false }: ReplaceColorSettingsProps) => {
  const { t } = useTranslation();

  const replaceAndInvertOptions = [
    {
      value: 'HIGH_CONTRAST_COLOR',
      label: t('replaceColor.options.highContrast', 'High contrast')
    },
    {
      value: 'FULL_INVERSION',
      label: t('replaceColor.options.invertAll', 'Invert all colours')
    },
    {
      value: 'CUSTOM_COLOR',
      label: t('replaceColor.options.custom', 'Custom')
    },
    {
      value: 'COLOR_SPACE_CONVERSION',
      label: t('replaceColor.options.cmyk', 'Convert to CMYK')
    }
  ];

  const highContrastOptions = [
    {
      value: 'WHITE_TEXT_ON_BLACK',
      label: t('replace-color.selectText.6', 'White text on black background')
    },
    {
      value: 'BLACK_TEXT_ON_WHITE',
      label: t('replace-color.selectText.7', 'Black text on white background')
    },
    {
      value: 'YELLOW_TEXT_ON_BLACK',
      label: t('replace-color.selectText.8', 'Yellow text on black background')
    },
    {
      value: 'GREEN_TEXT_ON_BLACK',
      label: t('replace-color.selectText.9', 'Green text on black background')
    }
  ];

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('replaceColor.labels.colourOperation', 'Colour operation')}
        </Text>
        <Select
          value={parameters.replaceAndInvertOption}
          onChange={(value) => value && onParameterChange('replaceAndInvertOption', value as ReplaceColorParameters['replaceAndInvertOption'])}
          data={replaceAndInvertOptions}
          disabled={disabled}
        />
      </Stack>

      {parameters.replaceAndInvertOption === 'HIGH_CONTRAST_COLOR' && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            {t('replace-color.selectText.5', 'High contrast color options')}
          </Text>
          <Select
            value={parameters.highContrastColorCombination}
            onChange={(value) => value && onParameterChange('highContrastColorCombination', value as ReplaceColorParameters['highContrastColorCombination'])}
            data={highContrastOptions}
            disabled={disabled}
          />
        </Stack>
      )}

      {parameters.replaceAndInvertOption === 'CUSTOM_COLOR' && (
        <>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('replace-color.selectText.10', 'Choose text Color')}
            </Text>
            <ColorInput
              value={parameters.textColor}
              onChange={(value) => onParameterChange('textColor', value)}
              format="hex"
              disabled={disabled}
            />
          </Stack>

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('replace-color.selectText.11', 'Choose background Color')}
            </Text>
            <ColorInput
              value={parameters.backGroundColor}
              onChange={(value) => onParameterChange('backGroundColor', value)}
              format="hex"
              disabled={disabled}
            />
          </Stack>
        </>
      )}
    </Stack>
  );
};

export default ReplaceColorSettings;
