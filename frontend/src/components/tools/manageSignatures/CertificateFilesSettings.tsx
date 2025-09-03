import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ManageSignaturesParameters } from "../../../hooks/tools/manageSignatures/useManageSignaturesParameters";
import FileUploadButton from "../../shared/FileUploadButton";

interface CertificateFilesSettingsProps {
  parameters: ManageSignaturesParameters;
  onParameterChange: (key: keyof ManageSignaturesParameters, value: any) => void;
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
            accept=".pem,.der"
            disabled={disabled}
            placeholder={t('manageSignatures.signing.choosePrivateKey', 'Choose Private Key File')}
          />
          {parameters.privateKeyFile && (
            <FileUploadButton
              file={parameters.certFile}
              onChange={(file) => onParameterChange('certFile', file || undefined)}
              accept=".pem,.der"
              disabled={disabled}
              placeholder={t('manageSignatures.signing.chooseCertificate', 'Choose Certificate File')}
            />
          )}
        </Stack>
      )}

      {parameters.certType === 'PKCS12' && (
        <FileUploadButton
          file={parameters.p12File}
          onChange={(file) => onParameterChange('p12File', file || undefined)}
          accept=".p12,.pfx"
          disabled={disabled}
          placeholder={t('manageSignatures.signing.chooseP12File', 'Choose PKCS12 File')}
        />
      )}

      {parameters.certType === 'JKS' && (
        <FileUploadButton
          file={parameters.jksFile}
          onChange={(file) => onParameterChange('jksFile', file || undefined)}
          accept=".jks,.keystore"
          disabled={disabled}
          placeholder={t('manageSignatures.signing.chooseJksFile', 'Choose JKS File')}
        />
      )}

      {/* Password - only show when files are uploaded */}
      {parameters.certType && (
        (parameters.certType === 'PEM' && parameters.privateKeyFile && parameters.certFile) ||
        (parameters.certType === 'PKCS12' && parameters.p12File) ||
        (parameters.certType === 'JKS' && parameters.jksFile)
      ) && (
        <TextInput
          label={t('manageSignatures.signing.password', 'Certificate Password')}
          placeholder={t('manageSignatures.signing.passwordOptional', 'Leave empty if no password')}
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