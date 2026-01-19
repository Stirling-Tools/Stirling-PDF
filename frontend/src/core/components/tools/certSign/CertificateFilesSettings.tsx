import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import FileUploadButton from "@app/components/shared/FileUploadButton";

interface CertificateFilesSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const CertificateFilesSettings = ({ parameters, onParameterChange, disabled = false }: CertificateFilesSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Certificate Files based on type */}
      {parameters.certType === 'PEM' && (
        <Stack gap="sm">
          <FileUploadButton
            file={parameters.privateKeyFile}
            onChange={(file) => onParameterChange('privateKeyFile', file || undefined)}
            accept=".pem,.der,.key"
            disabled={disabled}
            placeholder={t('certSign.choosePrivateKey', 'Choose Private Key File')}
          />
          {parameters.privateKeyFile && (
            <FileUploadButton
              file={parameters.certFile}
              onChange={(file) => onParameterChange('certFile', file || undefined)}
              accept=".pem,.der,.crt,.cer"
              disabled={disabled}
              placeholder={t('certSign.chooseCertificate', 'Choose Certificate File')}
            />
          )}
        </Stack>
      )}

      {(parameters.certType === 'PKCS12' || parameters.certType === 'PFX') && (
        <FileUploadButton
          file={parameters.p12File}
          onChange={(file) => onParameterChange('p12File', file || undefined)}
          accept=".p12,.pfx"
          disabled={disabled}
          placeholder={
            parameters.certType === 'PFX'
              ? t('certSign.choosePfxFile', 'Choose PFX File')
              : t('certSign.chooseP12File', 'Choose PKCS12 File')
          }
        />
      )}

      {parameters.certType === 'JKS' && (
        <FileUploadButton
          file={parameters.jksFile}
          onChange={(file) => onParameterChange('jksFile', file || undefined)}
          accept=".jks,.keystore"
          disabled={disabled}
          placeholder={t('certSign.chooseJksFile', 'Choose JKS File')}
        />
      )}

      {parameters.signMode === 'AUTO' && (
        <Text c="dimmed" size="sm">
          {t('certSign.serverCertMessage', 'Using server certificate - no files or password required')}
        </Text>
      )}

      {/* Password - only show when files are uploaded */}
      {parameters.certType && (
        (parameters.certType === 'PEM' && parameters.privateKeyFile && parameters.certFile) ||
        (parameters.certType === 'PKCS12' && parameters.p12File) ||
        (parameters.certType === 'PFX' && parameters.p12File) ||
        (parameters.certType === 'JKS' && parameters.jksFile)
      ) && (
        <TextInput
          label={t('certSign.password', 'Certificate Password')}
          placeholder={t('certSign.passwordOptional', 'Leave empty if no password')}
          type="password"
          value={parameters.password}
          onChange={(event) => onParameterChange('password', event.currentTarget.value)}
          disabled={disabled}
        />
      )}
    </Stack>
  );
};

export default CertificateFilesSettings;
