import { Stack, Button, Text, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ManageSignaturesParameters } from "../../../hooks/tools/manageSignatures/useManageSignaturesParameters";

interface CertificateTypeSettingsProps {
  parameters: ManageSignaturesParameters;
  onParameterChange: (key: keyof ManageSignaturesParameters, value: any) => void;
  disabled?: boolean;
}

const CertificateTypeSettings = ({ parameters, onParameterChange, disabled = false }: CertificateTypeSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <div style={{ display: 'flex', gap: '4px' }}>
        <Button
          variant={parameters.signMode === 'MANUAL' ? 'filled' : 'outline'}
          color={parameters.signMode === 'MANUAL' ? 'blue' : 'var(--text-muted)'}
          onClick={() => {
            onParameterChange('signMode', 'MANUAL');
            // Reset cert type when switching to manual
            if (parameters.signMode === 'AUTO') {
              onParameterChange('certType', '');
            }
          }}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            Manual<br />(Provide Files)
          </div>
        </Button>
        <Button
          variant={parameters.signMode === 'AUTO' ? 'filled' : 'outline'}
          color={parameters.signMode === 'AUTO' ? 'green' : 'var(--text-muted)'}
          onClick={() => {
            onParameterChange('signMode', 'AUTO');
            // Clear cert type and files when switching to auto
            onParameterChange('certType', '');
          }}
          disabled={disabled}
          style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
        >
          <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
            Auto<br />(Server Certificate)
          </div>
        </Button>
      </div>
      <Text size="xs" c="dimmed">
        {parameters.signMode === 'MANUAL' 
          ? "Upload your own certificate files for signing"
          : "Use the server's pre-configured certificate"}
      </Text>
    </Stack>
  );
};

export default CertificateTypeSettings;