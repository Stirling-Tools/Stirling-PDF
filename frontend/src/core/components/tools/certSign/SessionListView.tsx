import { Stack, Card, Text, Group, Badge, Button, Loader, Center } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DescriptionIcon from '@mui/icons-material/Description';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import { SessionSummary } from '@app/types/signingSession';

interface SessionListViewProps {
  sessions: SessionSummary[];
  onSessionSelect: (sessionId: string) => void;
  onCreateNew: () => void;
  loading: boolean;
}

const SessionListView = ({ sessions, onSessionSelect, onCreateNew, loading }: SessionListViewProps) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Center p="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (sessions.length === 0) {
    return (
      <Stack align="center" justify="center" gap="md" p="xl">
        <DescriptionIcon style={{ fontSize: '3rem', opacity: 0.3 }} />
        <Text size="lg" c="dimmed">
          {t('certSign.collab.sessionList.empty', 'No signing sessions yet. Upload a PDF to create one.')}
        </Text>
        <Button leftSection={<AddIcon />} onClick={onCreateNew} size="lg">
          {t('certSign.collab.sessionList.createNew', 'Create New Session')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Button leftSection={<AddIcon />} onClick={onCreateNew} size="sm">
          {t('certSign.collab.sessionList.createNew', 'Create New Session')}
      </Button>

      <Stack gap="sm">
        {sessions.map((session) => (
          <Card
            key={session.sessionId}
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() => onSessionSelect(session.sessionId)}
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <DescriptionIcon style={{ fontSize: '1.5rem', flexShrink: 0 }} />
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={600} size="sm" truncate>
                    {session.documentName}
                  </Text>
                  <Group gap="sm">
                    <Group gap={4}>
                      <PeopleIcon style={{ fontSize: '0.875rem' }} />
                      <Text size="xs" c="dimmed">
                        {session.participantCount}
                      </Text>
                    </Group>
                    <Group gap={4}>
                      <CheckCircleIcon style={{ fontSize: '0.875rem' }} />
                      <Text size="xs" c="dimmed">
                        {session.signedCount}/{session.participantCount}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </Text>
                  </Group>
                </Stack>
              </Group>
              <Badge size="sm" color={session.finalized ? 'green' : 'blue'} variant="light" style={{ flexShrink: 0 }}>
                {session.finalized
                  ? t('certSign.collab.sessionList.finalized', 'Finalized')
                  : t('certSign.collab.sessionList.active', 'Active')}
              </Badge>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};

export default SessionListView;
