import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Paper, Group, Button, Text, Divider } from '@mantine/core';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { SignRequestDetail } from '@app/types/signingSession';
import { LocalEmbedPDFWithAnnotations } from '@app/components/viewer/LocalEmbedPDFWithAnnotations';
import WetSignatureInput from '@app/components/tools/certSign/WetSignatureInput';
import SignatureSettingsDisplay from '@app/components/tools/certSign/SignatureSettingsDisplay';

export interface SignRequestWorkbenchData {
  signRequest: SignRequestDetail;
  pdfFile: File;
  onSign: (certificateData: FormData) => Promise<void>;
  onDecline: () => Promise<void>;
  onBack: () => void;
  canSign: boolean;
}

interface SignRequestWorkbenchViewProps {
  data: SignRequestWorkbenchData;
}

const SignRequestWorkbenchView = ({ data }: SignRequestWorkbenchViewProps) => {
  const { t } = useTranslation();
  const { signRequest, pdfFile, onSign, onDecline, onBack, canSign } = data;

  // State for certificate selection
  const [certType, setCertType] = useState<'SERVER' | 'UPLOAD'>('SERVER');
  const [p12File, setP12File] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);

  // State for wet signature
  const [_signatureType, setSignatureType] = useState<'canvas' | 'image' | 'text'>('canvas');
  const [_signatureData, setSignatureData] = useState<string | undefined>();
  const [_annotations, setAnnotations] = useState<any[]>([]);

  const handleSign = async () => {
    setSigning(true);
    try {
      const formData = new FormData();
      formData.append('certType', certType);

      if (certType === 'UPLOAD') {
        if (!p12File) {
          // TODO: Show error alert
          setSigning(false);
          return;
        }
        formData.append('p12File', p12File);
        formData.append('password', password);
      }

      // TODO: Export annotated PDF if wet signature was placed
      // const annotatedPdf = await exportAnnotatedPdf();
      // if (annotatedPdf) {
      //   formData.append('annotatedPdf', annotatedPdf);
      // }

      await onSign(formData);
    } catch (error) {
      console.error('Failed to sign document:', error);
    } finally {
      setSigning(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await onDecline();
    } catch (error) {
      console.error('Failed to decline request:', error);
      setDeclining(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Control Bar */}
      <Paper p="sm" shadow="sm" style={{ flexShrink: 0, zIndex: 10 }}>
        <Group justify="space-between">
          <Group gap="md">
            <Button
              leftSection={<ArrowBackIcon />}
              variant="subtle"
              onClick={onBack}
              size="sm"
            >
              {t('certSign.collab.signRequest.backToList', 'Back to Sign Requests')}
            </Button>
            <Divider orientation="vertical" />
            <Stack gap={2}>
              <Text size="sm" fw={600}>
                {signRequest.documentName}
              </Text>
              <Text size="xs" c="dimmed">
                {t('certSign.collab.signRequest.from', 'From')}: {signRequest.ownerUsername} • {new Date(signRequest.createdAt).toLocaleDateString()}
              </Text>
            </Stack>
          </Group>
          {canSign && (
            <Group gap="sm">
              <Button
                leftSection={<CheckCircleIcon />}
                color="green"
                onClick={handleSign}
                loading={signing}
              >
                {t('certSign.collab.signRequest.signButton', 'Sign Document')}
              </Button>
              <Button
                leftSection={<CancelIcon />}
                color="red"
                variant="outline"
                onClick={handleDecline}
                loading={declining}
              >
                {t('certSign.collab.signRequest.declineButton', 'Decline')}
              </Button>
            </Group>
          )}
        </Group>
      </Paper>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel - Signature Input */}
        {canSign && (
          <Paper
            p="md"
            shadow="sm"
            style={{
              width: '360px',
              flexShrink: 0,
              overflowY: 'auto',
              borderRight: '1px solid var(--mantine-color-gray-3)'
            }}
          >
            <Stack gap="md">
              <Text size="md" fw={600}>
                {t('certSign.collab.signRequest.addSignature', 'Add Your Signature')}
              </Text>

              <WetSignatureInput
                onSignatureDataChange={setSignatureData}
                onSignatureTypeChange={setSignatureType}
                onCertTypeChange={setCertType}
                onP12FileChange={setP12File}
                onPasswordChange={setPassword}
                certType={certType}
                p12File={p12File}
                password={password}
                disabled={signing || declining}
              />
            </Stack>
          </Paper>
        )}

        {/* Center - PDF Viewer */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <LocalEmbedPDFWithAnnotations
            file={pdfFile}
            onAnnotationChange={setAnnotations}
          />
        </div>

        {/* Right Panel - Signature Settings Display */}
        <Paper
          p="md"
          shadow="sm"
          style={{
            width: '320px',
            flexShrink: 0,
            overflowY: 'auto',
            borderLeft: '1px solid var(--mantine-color-gray-3)'
          }}
        >
          <Stack gap="md">
            <Text size="md" fw={600}>
              {t('certSign.collab.signRequest.signatureSettings', 'Signature Settings')}
            </Text>

            <SignatureSettingsDisplay
              showSignature={signRequest.showSignature ?? false}
              pageNumber={signRequest.pageNumber}
              reason={signRequest.reason}
              location={signRequest.location}
              showLogo={signRequest.showLogo ?? false}
            />

            {signRequest.message && (
              <Paper p="sm" withBorder>
                <Text size="xs" fw={600} mb="xs">
                  {t('certSign.collab.signRequest.message', 'Message')}
                </Text>
                <Text size="xs">{signRequest.message}</Text>
              </Paper>
            )}

            {signRequest.dueDate && (
              <Paper p="sm" withBorder>
                <Text size="xs" fw={600} mb="xs">
                  {t('certSign.collab.signRequest.dueDate', 'Due Date')}
                </Text>
                <Text size="xs">{signRequest.dueDate}</Text>
              </Paper>
            )}
          </Stack>
        </Paper>
      </div>
    </div>
  );
};

export default SignRequestWorkbenchView;
