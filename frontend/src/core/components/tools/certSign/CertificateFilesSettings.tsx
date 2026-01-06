import { Button, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";
import FileUploadButton from "@app/components/shared/FileUploadButton";
import DropdownListWithFooter from "@app/components/shared/DropdownListWithFooter";
import { isDesktopMode as checkDesktopMode } from "@app/utils/isDesktopMode";
import { useCertStoreEntries } from "@app/hooks/tools/certSign/useCertStoreEntries";

interface CertificateFilesSettingsProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

const CertificateFilesSettings = ({ parameters, onParameterChange, disabled = false }: CertificateFilesSettingsProps) => {
  const { t } = useTranslation();
  const isDesktopMode = checkDesktopMode();
  const isStoreCertType = ['WINDOWS_STORE', 'MAC_KEYCHAIN', 'PKCS11'].includes(parameters.certType);
  const autoFetchStoreEntries = parameters.certType === 'WINDOWS_STORE' || parameters.certType === 'MAC_KEYCHAIN';

  const {
    entries: storeEntries,
    loading: storeLoading,
    error: storeError,
    fetchEntries: refreshStoreEntries,
  } = useCertStoreEntries({
    certType: parameters.certType,
    password: parameters.password,
    pkcs11ConfigFile: parameters.pkcs11ConfigFile,
    enabled: isDesktopMode && isStoreCertType,
    autoFetch: autoFetchStoreEntries,
  });

  const selectedStoreEntry = storeEntries.find((entry) => entry.alias === parameters.certAlias);

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

      {parameters.certType === 'PKCS12' && (
        <FileUploadButton
          file={parameters.p12File}
          onChange={(file) => onParameterChange('p12File', file || undefined)}
          accept=".p12"
          disabled={disabled}
          placeholder={t('certSign.chooseP12File', 'Choose PKCS12 File')}
        />
      )}

      {parameters.certType === 'PFX' && (
        <FileUploadButton
          file={parameters.p12File}
          onChange={(file) => onParameterChange('p12File', file || undefined)}
          accept=".pfx"
          disabled={disabled}
          placeholder={t('certSign.choosePfxFile', 'Choose PFX File')}
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

      {isDesktopMode && parameters.certType === 'PKCS11' && (
        <FileUploadButton
          file={parameters.pkcs11ConfigFile}
          onChange={(file) => onParameterChange('pkcs11ConfigFile', file || undefined)}
          accept=".cfg,.conf,.txt"
          disabled={disabled}
          placeholder={t('certSign.choosePkcs11Config', 'Choose PKCS#11 Config File')}
        />
      )}

      {isDesktopMode && isStoreCertType && (
        <Stack gap="xs">
          {(parameters.certType === 'PKCS11') && (
            <TextInput
              label={t('certSign.pin', 'Token PIN / Password')}
              placeholder={t('certSign.pinOptional', 'Leave empty if not required')}
              type="password"
              value={parameters.password}
              onChange={(event) => onParameterChange('password', event.currentTarget.value)}
              disabled={disabled}
            />
          )}

          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>
              {t('certSign.storeCertificates', 'Available Certificates')}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => refreshStoreEntries()}
              disabled={disabled || (parameters.certType === 'PKCS11' && !parameters.pkcs11ConfigFile)}
            >
              {t('certSign.refreshStoreCertificates', 'Refresh')}
            </Button>
          </Group>

          {storeLoading && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm">
                {t('certSign.loadingStoreCertificates', 'Loading certificates...')}
              </Text>
            </Group>
          )}

          {!storeLoading && (
            <DropdownListWithFooter
              value={parameters.certAlias}
              onChange={(value) => onParameterChange('certAlias', value as string)}
              items={storeEntries.map((entry) => ({
                value: entry.alias,
                name: `${entry.displayName} (${entry.alias})`,
              }))}
              placeholder={t('certSign.selectStoreCertificate', 'Select a certificate')}
              disabled={disabled || storeEntries.length === 0}
              searchable={true}
              maxHeight={260}
            />
          )}

          {storeError && (
            <Text size="sm" c="red">
              {t('certSign.storeCertificatesError', 'Failed to load certificates')} ({storeError})
            </Text>
          )}

          {selectedStoreEntry && (
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                {t('certSign.storeCertificateSubject', 'Subject')}: {selectedStoreEntry.subject}
              </Text>
              <Text size="xs" c="dimmed">
                {t('certSign.storeCertificateIssuer', 'Issuer')}: {selectedStoreEntry.issuer}
              </Text>
              <Text size="xs" c="dimmed">
                {t('certSign.storeCertificateExpires', 'Expires')}: {new Date(selectedStoreEntry.notAfterEpochMs).toLocaleString()}
              </Text>
            </Stack>
          )}
        </Stack>
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
