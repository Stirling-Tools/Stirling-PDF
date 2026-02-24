import { Button, Stack, Text, Group, Divider, Image, Paper } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DrawIcon from '@mui/icons-material/Draw';
import SecurityIcon from '@mui/icons-material/Security';
import PlaceIcon from '@mui/icons-material/Place';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { CertificateType } from '@app/components/tools/certSign/CertificateSelector';
import type { SignRequestDetail } from '@app/types/signingSession';

interface ReviewSignatureStepProps {
  signatureCount: number;
  certType: CertificateType;
  p12File: File | null;
  signRequest: SignRequestDetail;
  onBack: () => void;
  onSign: () => void;
  onDecline: () => void;
  disabled?: boolean;
}

export const ReviewSignatureStep: React.FC<ReviewSignatureStepProps> = ({
  signatureCount,
  certType,
  p12File,
  signRequest,
  onBack,
  onSign,
  onDecline,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const getCertTypeName = () => {
    switch (certType) {
      case 'USER_CERT':
        return t('certSign.collab.signRequest.usePersonalCert', 'Personal Certificate');
      case 'SERVER':
        return t('certSign.collab.signRequest.useServerCert', 'Organization Certificate');
      case 'UPLOAD':
        return p12File?.name || t('certSign.collab.signRequest.uploadCert', 'Custom Certificate');
      default:
        return '';
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" fw={600} c="dimmed">
        {t('certSign.collab.signRequest.steps.reviewTitle', 'Review Before Signing')}
      </Text>

      {/* Signatures Summary */}
      <div>
        <Group gap="xs" mb="xs">
          <DrawIcon sx={{ fontSize: 18 }} />
          <Text size="sm" fw={600}>
            {t('certSign.collab.signRequest.steps.yourSignatures', 'Your Signatures ({{count}})', {
              count: signatureCount,
            })}
          </Text>
        </Group>
        <Paper p="sm" withBorder>
          <Text size="sm">
            {signatureCount === 1
              ? t('certSign.collab.signRequest.steps.oneSignature', '1 signature will be applied to the PDF')
              : t('certSign.collab.signRequest.steps.multipleSignatures', '{{count}} signatures will be applied to the PDF', {
                  count: signatureCount,
                })}
          </Text>
        </Paper>
      </div>

      <Divider />

      {/* Certificate Info */}
      <div>
        <Group gap="xs" mb="xs">
          <SecurityIcon sx={{ fontSize: 18 }} />
          <Text size="sm" fw={600}>
            {t('certSign.collab.signRequest.steps.certificate', 'Certificate')}
          </Text>
        </Group>
        <Text size="sm">{getCertTypeName()}</Text>
      </div>

      <Divider />

      {/* Settings from Owner */}
      <div>
        <Group gap="xs" mb="xs">
          <SettingsIcon sx={{ fontSize: 18 }} />
          <Text size="sm" fw={600}>
            {t('certSign.collab.signRequest.signatureSettings', 'Signature Settings')}
          </Text>
        </Group>
        <Paper p="sm" withBorder>
          <Text size="xs" c="dimmed" mb="xs">
            {t('certSign.collab.signRequest.signatureInfo', 'These settings are configured by the document owner')}
          </Text>
          <Stack gap="xs">
            <Text size="sm">
              <strong>{t('certSign.collab.signRequest.steps.visibility', 'Visibility:')}</strong>{' '}
              {signRequest.showSignature
                ? t('certSign.collab.signRequest.steps.visible', 'Visible')
                : t('certSign.collab.signRequest.steps.invisible', 'Invisible')}
            </Text>
            {signRequest.reason && (
              <Text size="sm">
                <strong>{t('certSign.collab.signRequest.steps.reason', 'Reason:')}</strong> {signRequest.reason}
              </Text>
            )}
            {signRequest.location && (
              <Text size="sm">
                <strong>{t('certSign.collab.signRequest.steps.location', 'Location:')}</strong>{' '}
                {signRequest.location}
              </Text>
            )}
          </Stack>
        </Paper>
      </div>

      <Divider />

      {/* Action Buttons */}
      <Group gap="sm" mt="md">
        <Button variant="default" onClick={onBack} leftSection={<ArrowBackIcon sx={{ fontSize: 16 }} />}>
          {t('certSign.collab.signRequest.steps.back', 'Back')}
        </Button>
        <Button
          variant="light"
          color="red"
          onClick={onDecline}
          disabled={disabled}
          leftSection={<CancelIcon sx={{ fontSize: 16 }} />}
        >
          {t('certSign.collab.signRequest.declineButton', 'Decline')}
        </Button>
        <Button
          onClick={onSign}
          disabled={disabled}
          style={{ flex: 1 }}
          color="green"
          leftSection={<CheckCircleIcon sx={{ fontSize: 16 }} />}
        >
          {t('certSign.collab.signRequest.signButton', 'Sign Document')}
        </Button>
      </Group>
    </Stack>
  );
};
