import { Stack, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import { isDesktopMode as checkDesktopMode } from "@app/utils/isDesktopMode";

interface CertificateFormatSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const CertificateFormatSettings = ({ parameters, onParameterChange, disabled = false }: CertificateFormatSettingsProps) => {
  const { t } = useTranslation();
  const isDesktopMode = checkDesktopMode();

  const setCertType = (certType: CertSignParameters['certType']) => {
    onParameterChange('certType', certType);
    onParameterChange('certAlias', '');
    if (certType !== 'PKCS11') {
      onParameterChange('pkcs11ConfigFile', undefined);
    }
  };

  return (
    <Stack gap="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* First row - PKCS#12 and PFX */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant={parameters.certType === 'PKCS12' ? 'filled' : 'outline'}
            color={parameters.certType === 'PKCS12' ? 'blue' : 'var(--text-muted)'}
            onClick={() => setCertType('PKCS12')}
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
            onClick={() => setCertType('PFX')}
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
            onClick={() => setCertType('PEM')}
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
            onClick={() => setCertType('JKS')}
            disabled={disabled}
            style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
          >
            <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
              JKS
            </div>
          </Button>
        </div>
        {isDesktopMode && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant={parameters.certType === 'WINDOWS_STORE' ? 'filled' : 'outline'}
              color={parameters.certType === 'WINDOWS_STORE' ? 'blue' : 'var(--text-muted)'}
              onClick={() => setCertType('WINDOWS_STORE')}
              disabled={disabled}
              style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
            >
              <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                {t('certSign.certType.windowsStore', 'Windows Store')}
              </div>
            </Button>
            <Button
              variant={parameters.certType === 'MAC_KEYCHAIN' ? 'filled' : 'outline'}
              color={parameters.certType === 'MAC_KEYCHAIN' ? 'blue' : 'var(--text-muted)'}
              onClick={() => setCertType('MAC_KEYCHAIN')}
              disabled={disabled}
              style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
            >
              <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                {t('certSign.certType.macKeychain', 'macOS Keychain')}
              </div>
            </Button>
            <Button
              variant={parameters.certType === 'PKCS11' ? 'filled' : 'outline'}
              color={parameters.certType === 'PKCS11' ? 'blue' : 'var(--text-muted)'}
              onClick={() => setCertType('PKCS11')}
              disabled={disabled}
              style={{ flex: 1, height: 'auto', minHeight: '40px', fontSize: '11px' }}
            >
              <div style={{ textAlign: 'center', lineHeight: '1.1', fontSize: '11px' }}>
                {t('certSign.certType.pkcs11', 'PKCS#11')}
              </div>
            </Button>
          </div>
        )}
      </div>
    </Stack>
  );
};

export default CertificateFormatSettings;
