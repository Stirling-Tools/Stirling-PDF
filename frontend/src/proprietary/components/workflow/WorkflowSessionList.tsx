import React, { useEffect } from 'react';
import {
  Stack,
  Card,
  Text,
  Badge,
  Group,
  Button,
  Loader,
  Alert,
} from '@mantine/core';
import { useWorkflowSession } from '@app/proprietary/hooks/workflow/useWorkflowSession';
import InfoIcon from '@mui/icons-material/Info';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface WorkflowSessionListProps {
  onSessionSelect?: (sessionId: string) => void;
}

const WorkflowSessionList: React.FC<WorkflowSessionListProps> = ({ onSessionSelect }) => {
  const {
    sessions,
    loading,
    error,
    loadSessions,
    deleteSession,
    finalizeSession,
    downloadSignedPdf,
  } = useWorkflowSession();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleFinalize = async (sessionId: string) => {
    try {
      const pdfBlob = await finalizeSession(sessionId);
      // Auto-download the finalized PDF
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sessionId}_signed.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Finalization failed:', err);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (window.confirm('Are you sure you want to delete this session?')) {
      try {
        await deleteSession(sessionId);
      } catch (err: any) {
        console.error('Delete failed:', err);
      }
    }
  };

  const getStatusBadge = (status: string, finalized: boolean) => {
    if (finalized) {
      return <Badge color="green">Finalized</Badge>;
    }
    switch (status) {
      case 'IN_PROGRESS':
        return <Badge color="blue">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge color="green">Completed</Badge>;
      case 'CANCELLED':
        return <Badge color="red">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getParticipantStatusSummary = (participants: any[]) => {
    const signed = participants.filter((p) => p.status === 'SIGNED').length;
    const declined = participants.filter((p) => p.status === 'DECLINED').length;
    const total = participants.length;
    return `${signed} signed, ${declined} declined of ${total} total`;
  };

  if (loading && sessions.length === 0) {
    return (
      <Stack align="center" justify="center" p="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading sessions...</Text>
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

  if (sessions.length === 0) {
    return (
      <Alert icon={<InfoIcon fontSize="small" />} color="blue">
        No workflow sessions found. Create a new signing session to get started.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {sessions.map((session) => (
        <Card key={session.sessionId} shadow="sm" padding="md" radius="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <div>
                <Text fw={500} size="lg">
                  {session.documentName}
                </Text>
                <Text size="xs" c="dimmed">
                  Session ID: {session.sessionId}
                </Text>
              </div>
              {getStatusBadge(session.status, session.finalized)}
            </Group>

            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Type:
              </Text>
              <Badge variant="light">{session.workflowType}</Badge>
            </Group>

            <Text size="sm" c="dimmed">
              Participants: {getParticipantStatusSummary(session.participants)}
            </Text>

            {session.message && (
              <Text size="sm" c="dimmed" lineClamp={2}>
                Message: {session.message}
              </Text>
            )}

            <Group gap="xs" mt="sm">
              {session.status === 'IN_PROGRESS' && !session.finalized && (
                <Button
                  size="xs"
                  leftSection={<CheckCircleIcon fontSize="small" />}
                  onClick={() => handleFinalize(session.sessionId)}
                  color="green"
                >
                  Finalize
                </Button>
              )}

              {session.finalized && session.hasProcessedFile && (
                <Button
                  size="xs"
                  leftSection={<DownloadIcon fontSize="small" />}
                  onClick={() => downloadSignedPdf(session.sessionId)}
                  color="blue"
                >
                  Download Signed PDF
                </Button>
              )}

              <Button
                size="xs"
                onClick={() => onSessionSelect?.(session.sessionId)}
                variant="light"
              >
                View Details
              </Button>

              <Button
                size="xs"
                leftSection={<DeleteIcon fontSize="small" />}
                onClick={() => handleDelete(session.sessionId)}
                color="red"
                variant="subtle"
              >
                Delete
              </Button>
            </Group>

            <Text size="xs" c="dimmed">
              Created: {new Date(session.createdAt).toLocaleString()}
            </Text>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
};

export default WorkflowSessionList;
