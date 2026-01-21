/**
 * AddPageNumbersAppearanceSettings - Customize Appearance step
 */

import { Stack, Select, TextInput, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPageNumbersParameters } from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { Tooltip } from "@app/components/shared/Tooltip";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface AddPageNumbersAppearanceSettingsProps {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(key: K, value: AddPageNumbersParameters[K]) => void;
  disabled?: boolean;
}

const AddPageNumbersAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: AddPageNumbersAppearanceSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Tooltip content={t('marginTooltip', 'Distance between the page number and the edge of the page.')}>
        <Select
          label={t('addPageNumbers.selectText.2', 'Margin')}
          value={parameters.customMargin}
          onChange={(v) => onParameterChange('customMargin', (v as any) || 'medium')}
          data={[
            { value: 'small', label: t('sizes.small', 'Small') },
            { value: 'medium', label: t('sizes.medium', 'Medium') },
            { value: 'large', label: t('sizes.large', 'Large') },
            { value: 'x-large', label: t('sizes.x-large', 'Extra Large') },
          ]}
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
        />
      </Tooltip>

      <Tooltip content={t('fontSizeTooltip', 'Size of the page number text in points. Larger numbers create bigger text.')}>
        <NumberInput
          label={t('addPageNumbers.fontSize', 'Font Size')}
          value={parameters.fontSize}
          onChange={(v) => onParameterChange('fontSize', typeof v === 'number' ? v : 12)}
          min={1}
          disabled={disabled}
        />
      </Tooltip>

      <Tooltip content={t('fontTypeTooltip', 'Font family for the page numbers. Choose based on your document style.')}>
        <Select
          label={t('addPageNumbers.fontName', 'Font Type')}
          value={parameters.fontType}
          onChange={(v) => onParameterChange('fontType', (v as any) || 'Times')}
          data={[
            { value: 'Times', label: 'Times Roman' },
            { value: 'Helvetica', label: 'Helvetica' },
            { value: 'Courier', label: 'Courier New' },
          ]}
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
        />
      </Tooltip>

      <Tooltip content={t('customTextTooltip', 'Optional custom format for page numbers. Use {n} as placeholder for the number. Example: "Page {n}" will show "Page 1", "Page 2", etc.')}>
        <TextInput
          label={t('addPageNumbers.selectText.6', 'Custom Text Format')}
          value={parameters.customText || ''}
          onChange={(e) => onParameterChange('customText', e.currentTarget.value)}
          placeholder={t('addPageNumbers.customNumberDesc', 'e.g., "Page {n}" or leave blank for just numbers')}
          disabled={disabled}
        />
      </Tooltip>
    </Stack>
  );
};

export default AddPageNumbersAppearanceSettings;
