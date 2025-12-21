import { Stack, Text, Select, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from '@app/hooks/tools/convert/useConvertParameters';
import { usePdfSignatureDetection } from '@app/hooks/usePdfSignatureDetection';
import { StirlingFile } from '@app/types/fileContext';

interface ConvertToPdfxSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  selectedFiles: StirlingFile[];
  disabled?: boolean;
}

const ConvertToPdfxSettings = ({
  parameters,
  onParameterChange,
  selectedFiles,
  disabled = false
}: ConvertToPdfxSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures, isChecking } = usePdfSignatureDetection(selectedFiles);

  const pdfxFormatOptions = [
    { value: 'pdfx-1', label: 'PDF/X-1a' },
    { value: 'pdfx-3', label: 'PDF/X-3' },
    { value: 'pdfx-4', label: 'PDF/X-4' }
  ];

  return (
    <Stack gap="sm" data-testid="pdfx-settings">
      <Text size="sm" fw={500}>{t("convert.pdfxOptions", "PDF/X Options")}:</Text>

      {hasDigitalSignatures && (
        <Alert color="yellow">
          <Text size="sm">
            {t("convert.pdfxDigitalSignatureWarning", "The PDF contains a digital signature. This will be removed in the next step.")}
          </Text>
        </Alert>
      )}

      <Stack gap="xs">
        <Text size="xs" fw={500}>{t("convert.outputFormat", "Output Format")}:</Text>
        <Select
          value={parameters.pdfxOptions?.outputFormat || 'pdfx-1'}
          onChange={(value) => onParameterChange('pdfxOptions', {
            ...parameters.pdfxOptions,
            outputFormat: value || 'pdfx-1'
          })}
          data={pdfxFormatOptions}
          disabled={disabled || isChecking}
          data-testid="pdfx-output-format-select"
        />
        <Text size="xs" c="dimmed">
          {t("convert.pdfxNote", "PDF/X-1a for basic print exchange, PDF/X-3 for color-managed workflows, PDF/X-4 for transparency support.")}
        </Text>
      </Stack>
    </Stack>
  );
};

export default ConvertToPdfxSettings;