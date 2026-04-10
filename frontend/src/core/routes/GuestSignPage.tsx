import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import { DrawSignatureCanvas } from '@app/components/shared/wetSignature/DrawSignatureCanvas';
import { SignatureTypeSelector, SignatureType } from '@app/components/shared/wetSignature/SignatureTypeSelector';
import { TypeSignatureText } from '@app/components/shared/wetSignature/TypeSignatureText';
import { UploadSignatureImage } from '@app/components/shared/wetSignature/UploadSignatureImage';
import { GuestCertificateChooser, GuestCertType } from '@app/components/shared/signing/GuestCertificateChooser';
import type { WetSignatureMetadata } from '@app/types/signingSession';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionInfo {
  sessionId: string;
  documentName: string;
  ownerEmail: string;
  message?: string;
  dueDate?: string;
}

interface ParticipantDetails {
  id: number;
  email: string;
  name: string;
  status: string;
  expiresAt?: string;
}

type PageState = 'loading' | 'ready' | 'expired' | 'signed' | 'declined' | 'error';

// ─── Component ──────────────────────────────────────────────────────────────

export default function GuestSignPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();

  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [participant, setParticipant] = useState<ParticipantDetails | null>(null);

  // Signature state
  const [sigType, setSigType] = useState<SignatureType>('draw');
  const [sigData, setSigData] = useState<string | null>(null);

  // Certificate state
  const [certType, setCertType] = useState<GuestCertType>('GUEST_CERT');
  const [p12File, setP12File] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [declineOpen, { open: openDecline, close: closeDecline }] = useDisclosure(false);
  const [declining, setDeclining] = useState(false);

  // ── Load session on mount ──────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setPageState('error');
      setErrorMessage('Missing signing token.');
      return;
    }

    async function load() {
      try {
        const [sessionRes, detailsRes] = await Promise.all([
          fetch(`/api/v1/workflow/participant/session?token=${encodeURIComponent(token!)}`),
          fetch(`/api/v1/workflow/participant/details?token=${encodeURIComponent(token!)}`),
        ]);

        if (sessionRes.status === 403 || detailsRes.status === 403) {
          setPageState('expired');
          return;
        }
        if (!sessionRes.ok || !detailsRes.ok) {
          setPageState('error');
          setErrorMessage('Unable to load signing session.');
          return;
        }

        const sessionData: SessionInfo = await sessionRes.json();
        const participantData: ParticipantDetails = await detailsRes.json();

        setSession(sessionData);
        setParticipant(participantData);

        if (participantData.status === 'SIGNED') {
          setPageState('signed');
        } else if (participantData.status === 'DECLINED') {
          setPageState('declined');
        } else {
          setPageState('ready');
        }
      } catch {
        setPageState('error');
        setErrorMessage('An unexpected error occurred.');
      }
    }

    load();
  }, [token]);

  // ── Submit signature ───────────────────────────────────────────────────

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('participantToken', token);
      formData.append('certType', certType);

      if (certType === 'P12') {
        if (!p12File) {
          alert(t('guestSigning.certFileRequired', 'Please select a certificate file.'));
          setSubmitting(false);
          return;
        }
        formData.append('p12File', p12File);
        formData.append('password', certPassword);
      }

      if (sigData) {
        const wetSig: WetSignatureMetadata = {
          type: sigType === 'type' ? 'text' : sigType === 'draw' ? 'canvas' : 'image',
          data: sigData,
          page: 0,
          x: 50,
          y: 50,
          width: 200,
          height: 60,
        };
        formData.append('wetSignaturesData', JSON.stringify([wetSig]));
      }

      const res = await fetch('/api/v1/workflow/participant/submit-signature', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.text();
        setErrorMessage(body || t('guestSigning.submitError', 'Failed to submit signature.'));
        setPageState('error');
        return;
      }

      setPageState('signed');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Decline ────────────────────────────────────────────────────────────

  async function handleDecline() {
    if (!token) return;
    setDeclining(true);
    try {
      const res = await fetch(
        `/api/v1/workflow/participant/decline?token=${encodeURIComponent(token)}`,
        { method: 'POST' }
      );
      if (res.ok) {
        setPageState('declined');
      }
    } finally {
      setDeclining(false);
      closeDecline();
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text>{t('guestSigning.loadingSession', 'Loading signing session...')}</Text>
        </Stack>
      </Center>
    );
  }

  if (pageState === 'expired') {
    return (
      <Center h="100vh">
        <Paper shadow="sm" p="xl" maw={480} w="100%">
          <Stack align="center" gap="md">
            <ErrorOutlineIcon style={{ fontSize: 48, color: '#fa5252' }} />
            <Title order={3}>{t('guestSigning.expiredToken', 'This signing link has expired.')}</Title>
            <Text c="dimmed" ta="center">
              {t('guestSigning.expiredNote', 'Please contact the document owner for a new link.')}
            </Text>
          </Stack>
        </Paper>
      </Center>
    );
  }

  if (pageState === 'signed') {
    return (
      <Center h="100vh">
        <Paper shadow="sm" p="xl" maw={480} w="100%">
          <Stack align="center" gap="md">
            <CheckCircleIcon style={{ fontSize: 48, color: '#40c057' }} />
            <Title order={3}>{t('guestSigning.submitSuccess', 'Your signature has been submitted successfully.')}</Title>
            <Text c="dimmed" ta="center">
              {t('guestSigning.signedNote', 'The document owner has been notified. You may close this window.')}
            </Text>
          </Stack>
        </Paper>
      </Center>
    );
  }

  if (pageState === 'declined') {
    return (
      <Center h="100vh">
        <Paper shadow="sm" p="xl" maw={480} w="100%">
          <Stack align="center" gap="md">
            <ErrorOutlineIcon style={{ fontSize: 48, color: '#fab005' }} />
            <Title order={3}>{t('guestSigning.declineSuccess', 'You have declined this signing request.')}</Title>
            <Text c="dimmed" ta="center">
              {t('guestSigning.declinedNote', 'The document owner has been notified. You may close this window.')}
            </Text>
          </Stack>
        </Paper>
      </Center>
    );
  }

  if (pageState === 'error') {
    return (
      <Center h="100vh">
        <Paper shadow="sm" p="xl" maw={480} w="100%">
          <Stack align="center" gap="md">
            <ErrorOutlineIcon style={{ fontSize: 48, color: '#fa5252' }} />
            <Title order={3}>{t('guestSigning.errorTitle', 'Something went wrong')}</Title>
            <Text c="dimmed" ta="center">{errorMessage}</Text>
          </Stack>
        </Paper>
      </Center>
    );
  }

  // ── Main signing form ──────────────────────────────────────────────────

  return (
    <Center py="xl" px="md">
      <Paper shadow="sm" p="xl" maw={680} w="100%">
        <Stack gap="lg">
          {/* Header */}
          <Stack gap="xs">
            <Title order={2}>{t('guestSigning.pageTitle', 'Sign Document')}</Title>
            {session && (
              <>
                <Text size="lg" fw={500}>{session.documentName}</Text>
                <Text c="dimmed" size="sm">
                  {t('guestSigning.requestedBy', 'Requested by {{owner}}', {
                    owner: session.ownerEmail,
                  })}
                </Text>
                {session.dueDate && (
                  <Text c="orange" size="sm">
                    {t('guestSigning.dueDate', 'Due {{date}}', { date: session.dueDate })}
                  </Text>
                )}
                {session.message && (
                  <Alert color="gray" variant="light">
                    {session.message}
                  </Alert>
                )}
              </>
            )}
          </Stack>

          <Divider />

          {/* PDF preview */}
          {token && (
            <Stack gap="xs">
              <Text fw={500} size="sm">
                {t('guestSigning.documentPreview', 'Document')}
              </Text>
              <iframe
                src={`/api/v1/workflow/participant/document?token=${encodeURIComponent(token)}`}
                title="Document to sign"
                style={{ width: '100%', height: 400, border: '1px solid #dee2e6', borderRadius: 4 }}
              />
            </Stack>
          )}

          <Divider />

          {/* Certificate chooser */}
          <GuestCertificateChooser
            value={certType}
            onChange={setCertType}
            onFileChange={setP12File}
            onPasswordChange={setCertPassword}
            p12File={p12File}
            password={certPassword}
          />

          <Divider />

          {/* Wet signature */}
          <Stack gap="sm">
            <Text fw={500} size="sm">
              {t('guestSigning.signatureTitle', 'Your Signature')}
            </Text>
            <SignatureTypeSelector value={sigType} onChange={setSigType} />
            {sigType === 'draw' && (
              <DrawSignatureCanvas signature={sigData} onChange={setSigData} />
            )}
            {sigType === 'type' && (
              <TypeSignatureText value={sigData ?? ''} onChange={setSigData} />
            )}
            {sigType === 'upload' && (
              <UploadSignatureImage value={sigData} onChange={setSigData} />
            )}
          </Stack>

          <Divider />

          {/* Actions */}
          <Group justify="space-between">
            <Button variant="subtle" color="red" onClick={openDecline} disabled={submitting}>
              {t('guestSigning.declineButton', 'Decline')}
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {t('guestSigning.submitButton', 'Submit Signature')}
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Decline confirmation modal */}
      <Modal
        opened={declineOpen}
        onClose={closeDecline}
        title={t('guestSigning.declineConfirmTitle', 'Decline signing?')}
        centered
      >
        <Stack gap="md">
          <Text>
            {t(
              'guestSigning.declineConfirmBody',
              "Are you sure you want to decline? This action cannot be undone."
            )}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDecline}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button color="red" onClick={handleDecline} loading={declining}>
              {t('guestSigning.declineButton', 'Decline')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Center>
  );
}
