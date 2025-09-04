import { Stack, Button, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ManageSignaturesParameters } from "../../../hooks/tools/manageSignatures/useManageSignaturesParameters";

interface CertificateFormatSettingsProps {
  parameters: ManageSignaturesParameters;
  onParameterChange: (key: keyof ManageSignaturesParameters, value: any) => void;
  disabled?: boolean;
}

const CertificateFormatSettings = ({ parameters, onParameterChange, disabled = false }: CertificateFormatSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* First row - PKCS#12 and PFX */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.certType === 'PKCS12' ? 'filled' : 'outline'}
            color={parameters.certType === 'PKCS12' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('certType', 'PKCS12')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              PKCS12
            </div>
          </Button>
          <Button
            variant={parameters.certType === 'PFX' ? 'filled' : 'outline'}
            color={parameters.certType === 'PFX' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('certType', 'PFX')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              PFX
            </div>
          </Button>
        </div>
        {/* Second row - PEM and JKS */}
        <div style={{ display: 'flex', gap: '4px' }}>
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
          <Button
            variant={parameters.certType === 'JKS' ? 'filled' : 'outline'}
            color={parameters.certType === 'JKS' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('certType', 'JKS')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              JKS
            </div>
          </Button>
        </div>
      </div>
    </Stack>
  );
};

export default CertificateFormatSettings;