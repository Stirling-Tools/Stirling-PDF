import { useState, useEffect } from 'react';
import { Stack, Text, TextInput, Button, Alert, Paper, Title, Group, NumberInput, Switch } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import InfoIcon from '@mui/icons-material/Info';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import apiClient from '@app/services/apiClient';
import FileUploadButton from '@app/components/shared/FileUploadButton';

interface SigningParticipant {
  email: string;
  name?: string;
  shareToken: string;
  status: 'PENDING' | 'NOTIFIED' | 'VIEWED' | 'SIGNED';
}

interface SigningSession {
  sessionId: string;
  documentName: string;
  participants: SigningParticipant[];
  ownerEmail?: string;
  message?: string;
  dueDate?: string;
}

interface ParticipantCertificateSubmissionProps {
  sessionId: string;
  token: string;
}

type CertType = 'PEM' | 'PKCS12' | 'PFX' | 'JKS' | 'SERVER';

export function ParticipantCertificateSubmission({ sessionId, token }: ParticipantCertificateSubmissionProps) {
  const { t } = useTranslation();

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SigningSession | null>(null);
  const [participant, setParticipant] = useState<SigningParticipant | null>(null);

  // Form state
  const [certType, setCertType] = useState<CertType>('PEM');
  const [privateKeyFile, setPrivateKeyFile] = useState<File | undefined>(undefined);
  const [certFile, setCertFile] = useState<File | undefined>(undefined);
  const [p12File, setP12File] = useState<File | undefined>(undefined);
  const [jksFile, setJksFile] = useState<File | undefined>(undefined);
  const [password, setPassword] = useState('');

  // Signature appearance
  const [showSignature, setShowSignature] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [reason, setReason] = useState('');
  const [location, setLocation] = useState('');
  const [name, setName] = useState('');
  const [showLogo, setShowLogo] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Load session on mount
  useEffect(() => {
    loadSession();
  }, [sessionId, token]);

  const loadSession = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get<SigningSession>(`/api/v1/security/cert-sign/sessions/${sessionId}`);
      const sessionData = response.data;

      // Find participant by token
      const foundParticipant = sessionData.participants.find(p => p.shareToken === token);

      if (!foundParticipant) {
        setError(t('certSign.collab.participant.invalidToken', 'Invalid or expired session link'));
        return;
      }

      // Check if already signed
      if (foundParticipant.status === 'SIGNED') {
        setSubmitted(true);
      }

      setSession(sessionData);
      setParticipant(foundParticipant);

      // Pre-fill name if available
      if (foundParticipant.name) {
        setName(foundParticipant.name);
      }

    } catch (err: any) {
      console.error('Failed to load session:', err);
      setError(err.response?.data?.message || t('certSign.collab.participant.invalidToken', 'Invalid or expired session link'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!session || !participant) return;

    // Validate required fields
    if (certType === 'PEM' && (!privateKeyFile || !certFile)) {
      setError(t('certSign.collab.participant.submitError', 'Please upload both private key and certificate files'));
      return;
    }
    if (certType === 'PKCS12' && !p12File) {
      setError(t('certSign.collab.participant.submitError', 'Please upload PKCS12 file'));
      return;
    }
    if (certType === 'PFX' && !p12File) {
      setError(t('certSign.collab.participant.submitError', 'Please upload PFX file'));
      return;
    }
    if (certType === 'JKS' && !jksFile) {
      setError(t('certSign.collab.participant.submitError', 'Please upload JKS file'));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const formData = new FormData();
      formData.append('certType', certType);
      if (password) {
        formData.append('password', password);
      }

      // Add certificate files based on type
      if (certType === 'PEM') {
        formData.append('privateKeyFile', privateKeyFile!);
        formData.append('certFile', certFile!);
      } else if (certType === 'PKCS12' || certType === 'PFX') {
        formData.append('p12File', p12File!);
      } else if (certType === 'JKS') {
        formData.append('jksFile', jksFile!);
      }

      // Add signature appearance
      formData.append('showSignature', showSignature.toString());
      if (showSignature) {
        formData.append('pageNumber', pageNumber.toString());
        if (reason) formData.append('reason', reason);
        if (location) formData.append('location', location);
        if (name) formData.append('name', name);
        formData.append('showLogo', showLogo.toString());
      }

      await apiClient.post(
        `/api/v1/security/cert-sign/sessions/${sessionId}/participants/${participant.email}/certificate`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setSubmitted(true);

    } catch (err: any) {
      console.error('Failed to submit certificate:', err);
      setError(err.response?.data?.message || t('certSign.collab.participant.submitError', 'Failed to submit certificate'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Paper p="xl" withBorder>
        <Text>{t('certSign.collab.participant.loading', 'Loading session details...')}</Text>
      </Paper>
    );
  }

  if (error && !session) {
    return (
      <Paper p="xl" withBorder>
        <Alert icon={<ErrorIcon />} color="red">
          {error}
        </Alert>
      </Paper>
    );
  }

  if (submitted || participant?.status === 'SIGNED') {
    return (
      <Paper p="xl" withBorder>
        <Alert icon={<CheckCircleIcon />} color="green">
          {t('certSign.collab.participant.alreadySigned',
            'You have already submitted your certificate for this session. The session owner will finalize all signatures.')}
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper p="xl" withBorder>
      <Stack gap="lg">
        <div>
          <Title order={2}>{t('certSign.collab.participant.title', 'Submit your certificate')}</Title>
          <Text c="dimmed">{t('certSign.collab.participant.subtitle', 'Upload certificate to sign document')}</Text>
        </div>

        <Alert icon={<InfoIcon />} color="blue" variant="light">
          <Stack gap="xs">
            <Text size="sm"><strong>{t('certSign.collab.participant.documentName', 'Document')}:</strong> {session?.documentName}</Text>
            <Text size="sm"><strong>{t('certSign.collab.participant.yourEmail', 'Your email')}:</strong> {participant?.email}</Text>
            {participant?.name && (
              <Text size="sm"><strong>{t('certSign.collab.participant.nameLabel', 'Name')}:</strong> {participant.name}</Text>
            )}
          </Stack>
        </Alert>

        <Text size="sm">
          {t('certSign.collab.participant.instructions', 'Please upload your certificate files and provide signing details.')}
        </Text>

        {/* Certificate Type Selection */}
        <div>
          <Text size="sm" fw={500} mb="xs">
            {t('certSign.collab.participant.certTypeLabel', 'Certificate type')}
          </Text>
          <Group gap="xs">
            {(['PEM', 'PKCS12', 'PFX', 'JKS', 'SERVER'] as CertType[]).map((type) => (
              <Button
                key={type}
                variant={certType === type ? 'filled' : 'outline'}
                color={certType === type ? 'blue' : 'var(--text-muted)'}
                onClick={() => setCertType(type)}
                disabled={submitting}
                size="sm"
              >
                {type}
              </Button>
            ))}
          </Group>
        </div>

        {/* Certificate Files */}
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            {t('certSign.collab.participant.filesLabel', 'Certificate files')}
          </Text>

          {certType === 'PEM' && (
            <>
              <FileUploadButton
                file={privateKeyFile}
                onChange={(file) => setPrivateKeyFile(file || undefined)}
                accept=".pem,.der,.key"
                disabled={submitting}
                placeholder={t('certSign.choosePrivateKey', 'Choose Private Key File')}
              />
              {privateKeyFile && (
                <FileUploadButton
                  file={certFile}
                  onChange={(file) => setCertFile(file || undefined)}
                  accept=".pem,.der,.crt,.cer"
                  disabled={submitting}
                  placeholder={t('certSign.chooseCertificate', 'Choose Certificate File')}
                />
              )}
            </>
          )}

          {certType === 'PKCS12' && (
            <FileUploadButton
              file={p12File}
              onChange={(file) => setP12File(file || undefined)}
              accept=".p12"
              disabled={submitting}
              placeholder={t('certSign.chooseP12File', 'Choose PKCS12 File')}
            />
          )}

          {certType === 'PFX' && (
            <FileUploadButton
              file={p12File}
              onChange={(file) => setP12File(file || undefined)}
              accept=".pfx"
              disabled={submitting}
              placeholder={t('certSign.choosePfxFile', 'Choose PFX File')}
            />
          )}

          {certType === 'JKS' && (
            <FileUploadButton
              file={jksFile}
              onChange={(file) => setJksFile(file || undefined)}
              accept=".jks,.keystore"
              disabled={submitting}
              placeholder={t('certSign.chooseJksFile', 'Choose JKS File')}
            />
          )}

          {certType === 'SERVER' && (
            <Text c="dimmed" size="sm">
              {t('certSign.serverCertMessage', 'Using server certificate - no files required')}
            </Text>
          )}
        </Stack>

        {/* Password */}
        {certType !== 'SERVER' && (
          <TextInput
            label={t('certSign.collab.participant.passwordLabel', 'Certificate password')}
            placeholder={t('certSign.collab.participant.passwordPlaceholder', 'Leave empty if no password')}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            disabled={submitting}
          />
        )}

        {/* Signature Appearance */}
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            {t('certSign.collab.participant.appearanceLabel', 'Signature appearance')}
          </Text>

          <Group gap="xs">
            <Button
              variant={!showSignature ? 'filled' : 'outline'}
              color={!showSignature ? 'blue' : 'var(--text-muted)'}
              onClick={() => setShowSignature(false)}
              disabled={submitting}
              size="sm"
            >
              {t('certSign.appearance.invisible', 'Invisible')}
            </Button>
            <Button
              variant={showSignature ? 'filled' : 'outline'}
              color={showSignature ? 'blue' : 'var(--text-muted)'}
              onClick={() => setShowSignature(true)}
              disabled={submitting}
              size="sm"
            >
              {t('certSign.appearance.visible', 'Visible')}
            </Button>
          </Group>

          {showSignature && (
            <Stack gap="sm">
              <NumberInput
                label={t('certSign.collab.participant.pageNumberLabel', 'Page number')}
                value={pageNumber}
                onChange={(value) => setPageNumber(value as number || 1)}
                min={1}
                disabled={submitting}
              />
              <TextInput
                label={t('certSign.collab.participant.reasonLabel', 'Reason')}
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                disabled={submitting}
              />
              <TextInput
                label={t('certSign.collab.participant.locationLabel', 'Location')}
                value={location}
                onChange={(event) => setLocation(event.currentTarget.value)}
                disabled={submitting}
              />
              <TextInput
                label={t('certSign.collab.participant.nameLabel', 'Signer name')}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                disabled={submitting}
              />
              <Switch
                label={t('certSign.showLogo', 'Show Logo')}
                checked={showLogo}
                onChange={(event) => setShowLogo(event.currentTarget.checked)}
                disabled={submitting}
              />
            </Stack>
          )}
        </Stack>

        {error && (
          <Alert icon={<ErrorIcon />} color="red">
            {error}
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          loading={submitting}
          leftSection={<CheckCircleIcon />}
          fullWidth
          size="lg"
          disabled={submitted}
        >
          {t('certSign.collab.participant.submit', 'Submit certificate')}
        </Button>
      </Stack>
    </Paper>
  );
}

export default ParticipantCertificateSubmission;
