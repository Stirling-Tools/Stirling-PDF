import React from 'react';
import { Stack, Text, NumberInput, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConvertParameters } from '../../../hooks/tools/convert/useConvertParameters';

interface ConvertFromEmailSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: (key: keyof ConvertParameters, value: any) => void;
  disabled?: boolean;
}

const ConvertFromEmailSettings = ({ 
  parameters, 
  onParameterChange, 
  disabled = false 
}: ConvertFromEmailSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="email-settings">
      <Text size="sm" fw={500}>{t("convert.emailOptions", "Email to PDF Options")}:</Text>
      
      <Checkbox
        label={t("convert.includeAttachments", "Include email attachments")}
        checked={parameters.emailOptions.includeAttachments}
        onChange={(event) => onParameterChange('emailOptions', { 
          ...parameters.emailOptions, 
          includeAttachments: event.currentTarget.checked 
        })}
        disabled={disabled}
        data-testid="include-attachments-checkbox"
      />
      
      {parameters.emailOptions.includeAttachments && (
        <Stack gap="xs">
          <Text size="xs" fw={500}>{t("convert.maxAttachmentSize", "Maximum attachment size (MB)")}:</Text>
          <NumberInput
            value={parameters.emailOptions.maxAttachmentSizeMB}
            onChange={(value) => onParameterChange('emailOptions', { 
              ...parameters.emailOptions, 
              maxAttachmentSizeMB: Number(value) || 10 
            })}
            min={1}
            max={100}
            step={1}
            disabled={disabled}
            data-testid="max-attachment-size-input"
          />
        </Stack>
      )}
      
      <Checkbox
        label={t("convert.includeAllRecipients", "Include CC and BCC recipients in header")}
        checked={parameters.emailOptions.includeAllRecipients}
        onChange={(event) => onParameterChange('emailOptions', { 
          ...parameters.emailOptions, 
          includeAllRecipients: event.currentTarget.checked 
        })}
        disabled={disabled}
        data-testid="include-all-recipients-checkbox"
      />
      
      <Checkbox
        label={t("convert.downloadHtml", "Download HTML intermediate file instead of PDF")}
        checked={parameters.emailOptions.downloadHtml}
        onChange={(event) => onParameterChange('emailOptions', { 
          ...parameters.emailOptions, 
          downloadHtml: event.currentTarget.checked 
        })}
        disabled={disabled}
        data-testid="download-html-checkbox"
      />
    </Stack>
  );
};

export default ConvertFromEmailSettings;