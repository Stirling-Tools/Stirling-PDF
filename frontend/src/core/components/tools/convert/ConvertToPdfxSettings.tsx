import { Stack, Text, Alert } from '@mantine/core';
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
  selectedFiles,
}: ConvertToPdfxSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures } = usePdfSignatureDetection(selectedFiles);

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

      <Text size="sm">
        {t("convert.pdfxDescription", "This tool will convert your PDF to PDF/X format, which is optimized for print production.")}
      </Text>
    </Stack>
  );
};

export default ConvertToPdfxSettings;