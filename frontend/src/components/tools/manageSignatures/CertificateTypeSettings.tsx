import { Stack, Button } from "@mantine/core";
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
      {/* Certificate Type Selection */}
      <Stack gap="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant={parameters.certType === 'PKCS12' ? 'filled' : 'outline'}
              color={parameters.certType === 'PKCS12' ? 'blue' : 'var(--text-muted)'}
              onClick={() => onParameterChange('certType', 'PKCS12')}
              disabled={disabled}
              style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
            >
              <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                PKCS#12
              </div>
            </Button>
            <Button
              variant={parameters.certType === 'PEM' ? 'filled' : 'outline'}
              color={parameters.certType === 'PEM' ? 'blue' : 'var(--text-muted)'}
              onClick={() => onParameterChange('certType', 'PEM')}
              disabled={disabled}
              style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
            >
              <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                PEM
              </div>
            </Button>
          </div>
          <Button
            variant={parameters.certType === 'JKS' ? 'filled' : 'outline'}
            color={parameters.certType === 'JKS' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('certType', 'JKS')}
            disabled={disabled}
            style={{ width: '100%', height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              JKS
            </div>
          </Button>
        </div>
      </Stack>
    </Stack>
  );
};

export default CertificateTypeSettings;