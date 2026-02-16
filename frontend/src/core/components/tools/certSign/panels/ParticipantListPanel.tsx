import { Stack, Text, List, Group, Badge, ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import type { ParticipantInfo } from '@app/types/signingSession';

interface ParticipantListPanelProps {
  participants: ParticipantInfo[];
  finalized: boolean;
  onRemove: (userId: number) => void;
}

export const ParticipantListPanel: React.FC<ParticipantListPanelProps> = ({
  participants,
  finalized,
  onRemove,
}) => {
  const { t } = useTranslation();

  const getIcon = (status: string) => {
    if (status === 'SIGNED') return <CheckCircleIcon sx={{ color: 'green', fontSize: '1rem' }} />;
    if (status === 'DECLINED') return <CancelIcon sx={{ color: 'red', fontSize: '1rem' }} />;
    return <PendingIcon sx={{ color: 'orange', fontSize: '1rem' }} />;
  };

  const getColor = (status: string) => {
    if (status === 'SIGNED') return 'green';
    if (status === 'DECLINED') return 'red';
    return 'orange';
  };

  return (
    <Stack gap="md">
      <Text size="md" fw={600}>
        {t('certSign.collab.sessionDetail.participants', 'Participants')}
      </Text>

      <List spacing={8} size="sm">
        {participants.map((participant) => {
          const isSigned = participant.status === 'SIGNED';
          const isDeclined = participant.status === 'DECLINED';

          return (
            <List.Item key={participant.userId} icon={getIcon(participant.status)}>
              <Group justify="space-between" wrap="nowrap" gap={4}>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Text size="xs" truncate>
                    {participant.name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    @{participant.email}
                  </Text>
                  <Badge size="xs" color={getColor(participant.status)} variant="light">
                    {t(`certSign.collab.status.${participant.status.toLowerCase()}`, participant.status)}
                  </Badge>
                </Stack>
                {!finalized && !isSigned && !isDeclined && (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => onRemove(participant.userId)}
                    title={t('certSign.collab.sessionDetail.removeParticipant', 'Remove')}
                  >
                    <DeleteIcon sx={{ fontSize: '1rem' }} />
                  </ActionIcon>
                )}
              </Group>
            </List.Item>
          );
        })}
      </List>
    </Stack>
  );
};
