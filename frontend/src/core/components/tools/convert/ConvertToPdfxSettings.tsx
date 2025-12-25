import { Stack, Text, Alert } from '@mantine/core';
import { useEffect } from 'react';
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
  selectedFiles
}: ConvertToPdfxSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures } = usePdfSignatureDetection(selectedFiles);

  // Automatically set PDF/X-3 format when this component is rendered
  useEffect(() => {
    if (parameters.pdfxOptions.outputFormat !== 'pdfx-3') {
      onParameterChange('pdfxOptions', {
        ...parameters.pdfxOptions,
        outputFormat: 'pdfx-3'
      });
    }
  }, [parameters.pdfxOptions.outputFormat, onParameterChange]);

  return (
    <Stack gap="sm" data-testid="pdfx-settings">
      {hasDigitalSignatures && (
        <Alert color="yellow">
          <Text size="sm">
            {t("convert.pdfxDigitalSignatureWarning", "The PDF contains a digital signature. This will be removed in the next step.")}
          </Text>
        </Alert>
      )}

      <Text size="sm">
        {t("convert.pdfxDescription", "PDF/X is an ISO standard PDF subset for reliable printing and graphics exchange.")}
      </Text>
    </Stack>
  );
};

export default ConvertToPdfxSettings;
