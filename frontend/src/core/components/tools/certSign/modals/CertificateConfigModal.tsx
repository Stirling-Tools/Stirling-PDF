import { Modal, Stack, Group, Button, Text, Collapse, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { CertificateSelector, CertificateType } from '@app/components/tools/certSign/CertificateSelector';

interface CertificateConfigModalProps {
  opened: boolean;
  onClose: () => void;
  onSign: (certType: CertificateType, p12File: File | null, password: string, reason?: string, location?: string) => Promise<void>;
  signatureCount: number;
  disabled?: boolean;
  defaultReason?: string;
  defaultLocation?: string;
}

export const CertificateConfigModal: React.FC<CertificateConfigModalProps> = ({
  opened,
  onClose,
  onSign,
  signatureCount,
  disabled = false,
  defaultReason = '',
  defaultLocation = '',
}) => {
  const { t } = useTranslation();

  const [certType, setCertType] = useState<CertificateType>('USER_CERT');
  const [p12File, setP12File] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [signing, setSigning] = useState(false);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const [location, setLocation] = useState(defaultLocation);

  // Validation: if UPLOAD type, need file and password
  const isValid =
    certType === 'USER_CERT' ||
    certType === 'SERVER' ||
    (certType === 'UPLOAD' && p12File && password);

  const handleSign = async () => {
    if (!isValid) return;

    setSigning(true);
    try {
      await onSign(certType, p12File, password, reason, location);
      // Don't close modal here - parent will handle navigation after successful signing
    } catch (error) {
      console.error('Failed to sign document:', error);
      // Parent component should handle error display
    } finally {
      setSigning(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('certSign.collab.signRequest.certModal.title', 'Configure Certificate')}
      centered
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            'certSign.collab.signRequest.certModal.description',
            'You have placed {{count}} signature(s). Choose your certificate to complete signing.',
            { count: signatureCount }
          )}
        </Text>

        <CertificateSelector
          certType={certType}
          onCertTypeChange={setCertType}
          p12File={p12File}
          onP12FileChange={setP12File}
          password={password}
          onPasswordChange={setPassword}
          disabled={disabled || signing}
        />

        {/* Advanced Settings - Optional */}
        <div>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={disabled || signing}
            style={{ marginBottom: '8px' }}
          >
            {t('certSign.collab.signRequest.advancedSettings', 'Advanced Settings')}
          </Button>

          <Collapse in={showAdvanced}>
            <Stack gap="sm">
              <TextInput
                label={t('certSign.collab.signRequest.reason', 'Reason (Optional)')}
                placeholder={t('certSign.collab.signRequest.reasonPlaceholder', 'Why are you signing?')}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
                disabled={disabled || signing}
              />
              <TextInput
                label={t('certSign.collab.signRequest.location', 'Location (Optional)')}
                placeholder={t('certSign.collab.signRequest.locationPlaceholder', 'Where are you signing from?')}
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value)}
                disabled={disabled || signing}
              />
            </Stack>
          </Collapse>
        </div>

        <Group justify="space-between" wrap="wrap" mt="md">
          <Button
            variant="default"
            onClick={onClose}
            disabled={signing}
          >
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSign}
            disabled={!isValid || disabled || signing}
            loading={signing}
          >
            {t('certSign.collab.signRequest.certModal.sign', 'Sign Document')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
