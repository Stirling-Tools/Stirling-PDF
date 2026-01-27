import React, { useState } from 'react';
import {
  Stack,
  Card,
  Text,
  Badge,
  Group,
  Button,
  Loader,
  Alert,
  TextInput,
  FileInput,
  Select,
  Textarea,
} from '@mantine/core';
import { useParticipantSession } from '@app/proprietary/hooks/workflow/useParticipantSession';
import InfoIcon from '@mui/icons-material/Info';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

interface ParticipantViewProps {
  token: string;
}

const ParticipantView: React.FC<ParticipantViewProps> = ({ token }) => {
  const { session, participant, loading, error, submitSignature, decline, downloadDocument } =
    useParticipantSession(token);

  const [certType, setCertType] = useState<string>('P12');
  const [password, setPassword] = useState<string>('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [location, setLocation] = useState<string>('');
  const [reason, setReason] = useState<string>('Document Signing');
  const [showSignature, setShowSignature] = useState<boolean>(true);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [declineReason, setDeclineReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmitSignature = async () => {
    if (!certFile && certType !== 'SERVER') {
      alert('Please select a certificate file');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitSignature({
        participantToken: token,
        certType,
        password,
        p12File: certType === 'P12' ? certFile || undefined : undefined,
        jksFile: certType === 'JKS' ? certFile || undefined : undefined,
        showSignature,
        pageNumber,
        location,
        reason,
        showLogo: true,
      });
      alert('Signature submitted successfully!');
    } catch (err: any) {
      alert('Failed to submit signature: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (window.confirm('Are you sure you want to decline signing this document?')) {
      try {
        await decline(token, declineReason || 'Declined by participant');
        alert('You have declined this signing request.');
      } catch (err: any) {
        alert('Failed to decline: ' + err.message);
      }
    }
  };

  if (loading && !session) {
    return (
      <Stack align="center" justify="center" p="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading session...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert icon={<InfoIcon fontSize="small" />} color="red" title="Error">
        {error}
      </Alert>
    );
  }

  if (!session || !participant) {
    return (
      <Alert icon={<InfoIcon fontSize="small" />} color="orange">
        Session not found or access denied.
      </Alert>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SIGNED':
        return <Badge color="green">Signed</Badge>;
      case 'DECLINED':
        return <Badge color="red">Declined</Badge>;
      case 'VIEWED':
        return <Badge color="blue">Viewed</Badge>;
      case 'NOTIFIED':
        return <Badge color="yellow">Notified</Badge>;
      case 'PENDING':
        return <Badge color="gray">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const canSign = !participant.hasCompleted && !participant.isExpired && session.status === 'IN_PROGRESS';

  return (
    <Stack gap="md">
      <Card shadow="sm" padding="md" radius="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={500} size="lg">
                {session.documentName}
              </Text>
              <Text size="sm" c="dimmed">
                From: {session.ownerUsername}
              </Text>
            </div>
            {getStatusBadge(participant.status)}
          </Group>

          {session.message && (
            <Alert icon={<InfoIcon fontSize="small" />} color="blue" variant="light">
              <Text size="sm">{session.message}</Text>
            </Alert>
          )}

          {session.dueDate && (
            <Text size="sm" c="dimmed">
              Due Date: {session.dueDate}
            </Text>
          )}

          <Group gap="xs" mt="sm">
            <Button
              size="sm"
              leftSection={<DownloadIcon fontSize="small" />}
              onClick={() => downloadDocument(token)}
              variant="light"
            >
              Download Document
            </Button>
          </Group>
        </Stack>
      </Card>

      {canSign && (
        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Stack gap="md">
            <Text fw={500} size="lg">
              Sign Document
            </Text>

            <Select
              label="Certificate Type"
              value={certType}
              onChange={(value) => setCertType(value || 'P12')}
              data={[
                { value: 'P12', label: 'P12/PKCS12 Certificate' },
                { value: 'JKS', label: 'JKS Keystore' },
                { value: 'SERVER', label: 'Server Certificate (if available)' },
              ]}
              size="sm"
            />

            {certType !== 'SERVER' && (
              <>
                <FileInput
                  label="Certificate File"
                  placeholder="Select certificate file"
                  value={certFile}
                  onChange={setCertFile}
                  accept=".p12,.pfx,.jks"
                  size="sm"
                />

                <TextInput
                  label="Certificate Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  size="sm"
                />
              </>
            )}

            <TextInput
              label="Location"
              placeholder="e.g., San Francisco, CA"
              value={location}
              onChange={(e) => setLocation(e.currentTarget.value)}
              size="sm"
            />

            <TextInput
              label="Reason"
              placeholder="e.g., Document approval"
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              size="sm"
            />

            <TextInput
              label="Page Number (optional)"
              type="number"
              value={pageNumber}
              onChange={(e) => setPageNumber(parseInt(e.currentTarget.value) || 1)}
              size="sm"
              min={1}
            />

            <Group gap="xs">
              <Button
                leftSection={<CheckCircleIcon fontSize="small" />}
                onClick={handleSubmitSignature}
                loading={isSubmitting}
                color="green"
              >
                Submit Signature
              </Button>

              <Button
                leftSection={<CancelIcon fontSize="small" />}
                onClick={handleDecline}
                color="red"
                variant="light"
              >
                Decline
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {participant.hasCompleted && (
        <Alert icon={<CheckCircleIcon fontSize="small" />} color="green">
          You have {participant.status === 'SIGNED' ? 'signed' : 'declined'} this document.
        </Alert>
      )}

      {participant.isExpired && (
        <Alert icon={<InfoIcon fontSize="small" />} color="orange">
          Your access to this document has expired.
        </Alert>
      )}
    </Stack>
  );
};

export default ParticipantView;
