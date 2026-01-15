import { Stack, Card, Text, Group, Badge, Loader, Center } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DescriptionIcon from '@mui/icons-material/Description';
import PersonIcon from '@mui/icons-material/Person';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CancelIcon from '@mui/icons-material/Cancel';
import { SignRequestSummary } from '@app/types/signingSession';

interface SignRequestListViewProps {
  signRequests: SignRequestSummary[];
  onRequestSelect: (sessionId: string) => void;
  loading: boolean;
}

const SignRequestListView = ({ signRequests, onRequestSelect, loading }: SignRequestListViewProps) => {
  const { t } = useTranslation();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SIGNED':
        return 'green';
      case 'DECLINED':
        return 'red';
      case 'VIEWED':
        return 'blue';
      case 'NOTIFIED':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SIGNED':
        return <CheckCircleIcon style={{ fontSize: '1rem' }} />;
      case 'DECLINED':
        return <CancelIcon style={{ fontSize: '1rem' }} />;
      default:
        return <PendingIcon style={{ fontSize: '1rem' }} />;
    }
  };

  if (loading) {
    return (
      <Center p="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (signRequests.length === 0) {
    return (
      <Stack align="center" justify="center" gap="md" p="xl">
        <DescriptionIcon style={{ fontSize: '3rem', opacity: 0.3 }} />
        <Text size="lg" c="dimmed">
          {t('certSign.collab.signRequests.empty', 'No pending sign requests.')}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {signRequests.map((request) => (
        <Card
          key={request.sessionId}
          shadow="sm"
          padding="md"
          radius="md"
          withBorder
          style={{ cursor: 'pointer' }}
          onClick={() => onRequestSelect(request.sessionId)}
        >
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <DescriptionIcon style={{ fontSize: '1.5rem', flexShrink: 0 }} />
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {request.documentName}
                </Text>
                <Group gap="sm">
                  <Group gap={4}>
                    <PersonIcon style={{ fontSize: '0.875rem' }} />
                    <Text size="xs" c="dimmed">
                      {t('certSign.collab.signRequests.from', 'From')}: {request.ownerUsername}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {new Date(request.createdAt).toLocaleDateString()}
                  </Text>
                  {request.dueDate && (
                    <Text size="xs" c="dimmed">
                      {t('certSign.collab.signRequests.due', 'Due')}: {request.dueDate}
                    </Text>
                  )}
                </Group>
              </Stack>
            </Group>
            <Badge
              size="sm"
              color={getStatusColor(request.myStatus)}
              variant="light"
              style={{ flexShrink: 0 }}
              leftSection={getStatusIcon(request.myStatus)}
            >
              {t(`certSign.collab.status.${request.myStatus.toLowerCase()}`, request.myStatus)}
            </Badge>
          </Group>
        </Card>
      ))}
    </Stack>
  );
};

export default SignRequestListView;
