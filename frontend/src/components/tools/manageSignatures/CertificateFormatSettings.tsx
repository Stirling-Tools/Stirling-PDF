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
        {/* First row - PKCS#12 and PEM */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.certType === 'PKCS12' ? 'filled' : 'outline'}
            color={parameters.certType === 'PKCS12' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('certType', 'PKCS12')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              PKCS#12<br />(Single file)
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
              PEM<br />(Key + Cert files)
            </div>
          </Button>
        </div>
        {/* Second row - JKS spanning full width */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.certType === 'JKS' ? 'filled' : 'outline'}
            color={parameters.certType === 'JKS' ? 'blue' : 'var(--text-muted)'}
            onClick={() => onParameterChange('certType', 'JKS')}
            disabled={disabled}
            style={{ width: '100%', height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              JKS<br />(Java KeyStore)
            </div>
          </Button>
        </div>
      </div>
      <Text size="xs" c="dimmed">
        {parameters.certType === 'PKCS12' && "Upload a single .p12/.pfx file containing both certificate and private key"}
        {parameters.certType === 'PEM' && "Upload separate certificate (.crt/.pem) and private key (.key/.pem) files"}  
        {parameters.certType === 'JKS' && "Upload a Java KeyStore (.jks) file"}
        {!parameters.certType && "Choose the format of your certificate files"}
      </Text>
    </Stack>
  );
};

export default CertificateFormatSettings;