import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Paper, Group, Button, Text, Divider } from '@mantine/core';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import { SignRequestDetail } from '@app/types/signingSession';
import { LocalEmbedPDFWithAnnotations, AnnotationAPI } from '@app/components/viewer/LocalEmbedPDFWithAnnotations';
import WetSignatureInput from '@app/components/tools/certSign/WetSignatureInput';
import SignatureSettingsDisplay from '@app/components/tools/certSign/SignatureSettingsDisplay';
import { alert } from '@app/components/toast';

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

  // Ref for annotation API
  const annotationApiRef = useRef<AnnotationAPI | null>(null);

  // State for certificate selection
  const [certType, setCertType] = useState<'SERVER' | 'UPLOAD'>('SERVER');
  const [p12File, setP12File] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);

  // State for wet signature
  const [signatureType, setSignatureType] = useState<'canvas' | 'image' | 'text'>('canvas');
  const [signatureData, setSignatureData] = useState<string | undefined>();
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [placementMode, setPlacementMode] = useState(false);

  // Check if signature is ready to be placed
  const hasSignatureData = signatureData !== undefined && signatureData.trim() !== '';

  // Enable placement mode when user has signature data
  const handlePlaceSignature = () => {
    if (!hasSignatureData) return;

    setPlacementMode(true);

    alert({
      alertType: 'neutral',
      title: t('certSign.collab.signRequest.placeSignature.title', 'Place Signature'),
      body: t('certSign.collab.signRequest.placeSignature.message', 'Click on the PDF to place your signature'),
    });
  };

  // Handle signature placement when user clicks on PDF
  const handlePlaceSignatureAtPosition = (
    pageIndex: number,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    if (!signatureData) return;

    // Update annotations state with position
    setAnnotations([{ pageIndex, rect: { x, y, width, height } }]);

    // Disable placement mode
    setPlacementMode(false);

    alert({
      alertType: 'success',
      title: t('success'),
      body: t('certSign.collab.signRequest.signaturePlaced', 'Signature placed on page') + ` ${pageIndex + 1}`,
    });
  };

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

      // Add wet signature metadata if user placed a signature
      if (annotations.length > 0 && hasSignatureData) {
        const annotation = annotations[0]; // Get the first (and should be only) annotation

        // Send as individual form fields (backend expects flat structure)
        formData.append('wetSignatureType', signatureType);
        formData.append('wetSignatureData', signatureData);
        formData.append('wetSignaturePage', String(annotation.pageIndex || 0));
        formData.append('wetSignatureX', String(annotation.rect?.x || 0));
        formData.append('wetSignatureY', String(annotation.rect?.y || 0));
        formData.append('wetSignatureWidth', String(annotation.rect?.width || 100));
        formData.append('wetSignatureHeight', String(annotation.rect?.height || 50));
      }

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

          <Group gap="xs">
            <Button.Group>
              <Button
                variant="default"
                size="sm"
                onClick={() => annotationApiRef.current?.zoomOut()}
                title={t('viewer.zoomOut', 'Zoom out')}
              >
                <ZoomOutIcon fontSize="small" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => annotationApiRef.current?.resetZoom()}
                title={t('viewer.resetZoom', 'Reset zoom')}
              >
                <ZoomOutMapIcon fontSize="small" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => annotationApiRef.current?.zoomIn()}
                title={t('viewer.zoomIn', 'Zoom in')}
              >
                <ZoomInIcon fontSize="small" />
              </Button>
            </Button.Group>
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

              <Button
                leftSection={<AddCircleIcon />}
                onClick={handlePlaceSignature}
                disabled={!hasSignatureData || placementMode || signing || declining}
                fullWidth
                variant="light"
              >
                {placementMode
                  ? t('certSign.collab.signRequest.placementActive', 'Click PDF to place')
                  : t('certSign.collab.signRequest.placeSignatureButton', 'Place Signature on PDF')}
              </Button>

              {annotations.length > 0 && (
                <Text size="xs" c="green">
                  ✓ {t('certSign.collab.signRequest.signaturePlaced', 'Signature placed on page')} {annotations[0]?.pageIndex + 1 || 1}
                </Text>
              )}
            </Stack>
          </Paper>
        )}

        {/* Center - PDF Viewer */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <LocalEmbedPDFWithAnnotations
            ref={annotationApiRef}
            file={pdfFile}
            onAnnotationChange={setAnnotations}
            placementMode={placementMode}
            signatureData={signatureData}
            onPlaceSignature={handlePlaceSignatureAtPosition}
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
