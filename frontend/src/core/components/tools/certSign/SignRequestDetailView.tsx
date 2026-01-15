import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Stack,
  Paper,
  Text,
  Group,
  Button,
  Divider,
  Alert,
  Radio,
  FileInput,
  PasswordInput,
  Loader,
} from '@mantine/core';
import { alert } from '@app/components/toast';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import InfoIcon from '@mui/icons-material/Info';
import { SignRequestDetail } from '@app/types/signingSession';

interface SignRequestDetailViewProps {
  signRequest: SignRequestDetail;
  onSign: (certificateData: FormData) => Promise<void>;
  onDecline: () => Promise<void>;
  onBack: () => void;
  canSign: boolean; // based on status
  onLoadPdf: (sessionId: string, documentName: string) => Promise<File>;
}

const SignRequestDetailView = ({ signRequest, onSign, onDecline, onBack, canSign, onLoadPdf }: SignRequestDetailViewProps) => {
  const { t } = useTranslation();
  const [certType, setCertType] = useState<'SERVER' | 'UPLOAD'>('SERVER');
  const [uploading, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(true);

  // Upload certificate fields
  const [p12File, setP12File] = useState<File | null>(null);
  const [password, setPassword] = useState('');

  // Load PDF on mount
  useEffect(() => {
    const loadPdf = async () => {
      setLoadingPdf(true);
      try {
        await onLoadPdf(signRequest.sessionId, signRequest.documentName);
      } catch (error) {
        console.error('Failed to load PDF:', error);
        alert({
          alertType: 'error',
          title: t('error'),
          body: t('certSign.collab.signRequest.pdfLoadError', 'Failed to load document'),
        });
      } finally {
        setLoadingPdf(false);
      }
    };

    loadPdf();
  }, [signRequest.sessionId, signRequest.documentName, onLoadPdf, t]);

  const handleSign = async () => {
    setSigning(true);
    try {
      const formData = new FormData();
      formData.append('certType', certType);

      if (certType === 'UPLOAD') {
        if (!p12File) {
          alert({
            alertType: 'error',
            title: t('error'),
            body: t('certSign.collab.signRequest.noCertificate', 'Please select a certificate file'),
          });
          setSigning(false);
          return;
        }
        formData.append('p12File', p12File);
        formData.append('password', password);
      }

      await onSign(formData);
      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.signRequest.signed', 'Document signed successfully'),
      });
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.signRequest.signError', 'Failed to sign document'),
      });
    } finally {
      setSigning(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await onDecline();
      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.signRequest.declined', 'Sign request declined'),
      });
    } catch (_error) {
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.collab.signRequest.declineError', 'Failed to decline request'),
      });
      setDeclining(false);
    }
  };

  if (loadingPdf) {
    return (
      <Stack gap="sm" align="center" justify="center" style={{ minHeight: '200px' }}>
        <Loader size="lg" />
        <Text size="sm" c="dimmed">
          {t('certSign.collab.signRequest.loadingPdf', 'Loading document...')}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Button leftSection={<ArrowBackIcon />} variant="subtle" onClick={onBack} size="sm">
          {t('certSign.collab.signRequest.backToList', 'Back to Sign Requests')}
        </Button>
      </Group>

      <Paper p="sm" withBorder>
        <Stack gap={4}>
          <Text size="md" fw={700}>
            {signRequest.documentName}
          </Text>
          <Group gap="sm">
            <Text size="xs" c="dimmed">
              {t('certSign.collab.signRequest.from', 'From')}: {signRequest.ownerUsername}
            </Text>
            <Text size="xs" c="dimmed">
              {new Date(signRequest.createdAt).toLocaleDateString()}
            </Text>
          </Group>
          {signRequest.dueDate && (
            <Text size="xs" c="dimmed">
              {t('certSign.collab.signRequest.dueDate', 'Due Date')}: {signRequest.dueDate}
            </Text>
          )}
          {signRequest.message && (
            <Alert icon={<InfoIcon />} color="blue" variant="light" p="xs" mt="xs">
              <Text size="xs">{signRequest.message}</Text>
            </Alert>
          )}
        </Stack>
      </Paper>

      {/* Signature Settings (Read-Only) */}
      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {t('certSign.collab.signRequest.signatureSettings', 'Signature Settings')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('certSign.collab.signRequest.signatureInfo', 'These settings are configured by the document owner')}
          </Text>
          <Stack gap={4}>
            <Text size="xs">
              {t('certSign.appearance.visibility', 'Visibility')}:{' '}
              <strong>
                {signRequest.showSignature
                  ? t('certSign.appearance.visible', 'Visible')
                  : t('certSign.appearance.invisible', 'Invisible')}
              </strong>
            </Text>
            {signRequest.showSignature && (
              <>
                {signRequest.pageNumber && (
                  <Text size="xs">
                    {t('certSign.pageNumber', 'Page Number')}: <strong>{signRequest.pageNumber}</strong>
                  </Text>
                )}
                {signRequest.reason && (
                  <Text size="xs">
                    {t('certSign.reason', 'Reason')}: <strong>{signRequest.reason}</strong>
                  </Text>
                )}
                {signRequest.location && (
                  <Text size="xs">
                    {t('certSign.location', 'Location')}: <strong>{signRequest.location}</strong>
                  </Text>
                )}
                <Text size="xs">
                  {t('certSign.logoTitle', 'Logo')}:{' '}
                  <strong>
                    {signRequest.showLogo ? t('certSign.showLogo', 'Show Logo') : t('certSign.noLogo', 'No Logo')}
                  </strong>
                </Text>
              </>
            )}
          </Stack>
        </Stack>
      </Paper>

      {canSign && (
        <>
          <Divider />
          <Paper p="sm" withBorder>
            <Stack gap="sm">
              <Text size="sm" fw={600}>
                {t('certSign.collab.signRequest.certificateChoice', 'Certificate Choice')}
              </Text>
              <Radio.Group value={certType} onChange={(value) => setCertType(value as 'SERVER' | 'UPLOAD')}>
                <Stack gap="xs">
                  <Radio
                    value="SERVER"
                    label={t('certSign.collab.signRequest.useServerCert', 'Use My Server Certificate')}
                  />
                  <Radio
                    value="UPLOAD"
                    label={t('certSign.collab.signRequest.uploadCert', 'Upload Custom Certificate')}
                  />
                </Stack>
              </Radio.Group>

              {certType === 'UPLOAD' && (
                <Stack gap="xs" mt="xs">
                  <FileInput
                    label={t('certSign.collab.signRequest.p12File', 'P12/PFX Certificate File')}
                    placeholder={t('certSign.collab.signRequest.selectFile', 'Select file...')}
                    accept=".p12,.pfx"
                    value={p12File}
                    onChange={setP12File}
                    size="xs"
                  />
                  <PasswordInput
                    label={t('certSign.collab.signRequest.password', 'Certificate Password')}
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    size="xs"
                  />
                </Stack>
              )}
            </Stack>
          </Paper>

          <Group gap="sm" mt="sm">
            <Button
              leftSection={<CheckCircleIcon />}
              color="green"
              onClick={handleSign}
              loading={uploading}
              style={{ flex: 1 }}
            >
              {t('certSign.collab.signRequest.signButton', 'Sign Document')}
            </Button>
            <Button
              leftSection={<CancelIcon />}
              color="red"
              variant="outline"
              onClick={handleDecline}
              loading={declining}
              style={{ flex: 1 }}
            >
              {t('certSign.collab.signRequest.declineButton', 'Decline')}
            </Button>
          </Group>
        </>
      )}

      {!canSign && (
        <Alert icon={<InfoIcon />} color="blue" variant="light" p="sm">
          <Text size="xs">
            {t('certSign.collab.signRequest.alreadyProcessed', 'You have already processed this sign request.')}
          </Text>
        </Alert>
      )}
    </Stack>
  );
};

export default SignRequestDetailView;
