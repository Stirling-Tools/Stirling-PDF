/**
 * AddPageNumbersPositionSettings - Position & Pages step
 */

import { Stack, TextInput, NumberInput, Divider, Text, SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPageNumbersParameters } from "./useAddPageNumbersParameters";
import { Tooltip } from "../../shared/Tooltip";
import PageNumberPreview from "./PageNumberPreview";

interface AddPageNumbersPositionSettingsProps {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(key: K, value: AddPageNumbersParameters[K]) => void;
  disabled?: boolean;
  file?: File | null;
  showQuickGrid?: boolean;
}

const AddPageNumbersPositionSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  file = null,
  showQuickGrid = true
}: AddPageNumbersPositionSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('addPageNumbers.processingMode.label', 'Processing mode')}
        </Text>
        <SegmentedControl
          value={parameters.processingMode}
          onChange={(value) => onParameterChange('processingMode', value as AddPageNumbersParameters['processingMode'])}
          data={[
            { label: t('addPageNumbers.processingMode.backend', 'Backend'), value: 'backend' },
            { label: t('addPageNumbers.processingMode.frontend', 'Browser'), value: 'frontend' }
          ]}
          fullWidth
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.processingMode === 'frontend'
            ? t('addPageNumbers.processingMode.frontendDescription', 'Stamp page numbers locally (page lists only).')
            : t('addPageNumbers.processingMode.backendDescription', 'Use the server for formula-based selection and heavy PDFs.')}
        </Text>
      </Stack>

      {/* Position Selection */}
      <Stack gap="md">
        <PageNumberPreview
          parameters={parameters}
          onParameterChange={onParameterChange}
          file={file}
          showQuickGrid={showQuickGrid}
        />
      </Stack>

      <Divider />

      {/* Pages & Starting Number Section */}
      <Stack gap="md">
        <Text size="sm" fw={500} mb="xs">{t('addPageNumbers.pagesAndStarting', 'Pages & Starting Number')}</Text>

        <Tooltip content={t('pageSelectionPrompt', 'Custom Page Selection (Enter a comma-separated list of page numbers 1,5,6 or Functions like 2n+1)')}>
          <TextInput
            label={t('addPageNumbers.selectText.5', 'Pages to Number')}
            value={parameters.pagesToNumber || ''}
            onChange={(e) => onParameterChange('pagesToNumber', e.currentTarget.value)}
            placeholder={t('addPageNumbers.numberPagesDesc', 'e.g., 1,3,5-8 or leave blank for all pages')}
            disabled={disabled}
          />
        </Tooltip>

        <Tooltip content={t('startingNumberTooltip', 'The first number to display. Subsequent pages will increment from this number.')}>
          <NumberInput
            label={t('addPageNumbers.selectText.4', 'Starting Number')}
            value={parameters.startingNumber}
            onChange={(v) => onParameterChange('startingNumber', typeof v === 'number' ? v : 1)}
            min={1}
            disabled={disabled}
          />
        </Tooltip>
      </Stack>
    </Stack>
  );
};

export default AddPageNumbersPositionSettings;
