import { Stack, Text, Select, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from '@app/hooks/tools/convert/useConvertParameters';
import { usePdfSignatureDetection } from '@app/hooks/usePdfSignatureDetection';
import { StirlingFile } from '@app/types/fileContext';

interface ConvertToPdfaSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  selectedFiles: StirlingFile[];
  disabled?: boolean;
}

const ConvertToPdfaSettings = ({
  parameters,
  onParameterChange,
  selectedFiles,
  disabled = false
}: ConvertToPdfaSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures, isChecking } = usePdfSignatureDetection(selectedFiles);

  const pdfaFormatOptions = [
    { value: 'pdfa-1', label: 'PDF/A-1b' },
    { value: 'pdfa', label: 'PDF/A-2b' },
    { value: 'pdfa-3', label: 'PDF/A-3b' }
  ];

  return (
    <Stack gap="sm" data-testid="pdfa-settings">
      <Text size="sm" fw={500}>{t("convert.pdfaOptions", "PDF/A Options")}:</Text>

      {hasDigitalSignatures && (
        <Alert color="yellow">
          <Text size="sm">
            {t("convert.pdfaDigitalSignatureWarning", "The PDF contains a digital signature. This will be removed in the next step.")}
          </Text>
        </Alert>
      )}

      <Stack gap="xs">
        <Text size="xs" fw={500}>{t("convert.outputFormat", "Output Format")}:</Text>
        <Select
          value={parameters.pdfaOptions.outputFormat}
          onChange={(value) => onParameterChange('pdfaOptions', {
            ...parameters.pdfaOptions,
            outputFormat: value || 'pdfa-1'
          })}
          data={pdfaFormatOptions}
          disabled={disabled || isChecking}
          data-testid="pdfa-output-format-select"
        />
        <Text size="xs" c="dimmed">
          {t("convert.pdfaNote", "PDF/A-1b is more compatible, PDF/A-2b supports more features, PDF/A-3b supports embedded files.")}
        </Text>
      </Stack>
    </Stack>
  );
};

export default ConvertToPdfaSettings;
