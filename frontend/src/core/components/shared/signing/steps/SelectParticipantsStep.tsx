import { Button, Stack, Text, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UserSelector from '@app/components/shared/UserSelector';

interface SelectParticipantsStepProps {
  selectedUserIds: number[];
  onSelectedUserIdsChange: (userIds: number[]) => void;
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export const SelectParticipantsStep: React.FC<SelectParticipantsStepProps> = ({
  selectedUserIds,
  onSelectedUserIdsChange,
  onBack,
  onNext,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const hasParticipants = selectedUserIds.length > 0;

  return (
    <Stack gap="md">
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          {t('groupSigning.steps.selectParticipants.label', 'Select participants')}
        </Text>
        <UserSelector
          value={selectedUserIds}
          onChange={onSelectedUserIdsChange}
          placeholder={t(
            'groupSigning.steps.selectParticipants.placeholder',
            'Choose participants to sign...'
          )}
          disabled={disabled}
        />
      </div>

      {selectedUserIds.length > 0 && (
        <Text size="xs" c="dimmed">
          {t('groupSigning.steps.selectParticipants.count', {
            count: selectedUserIds.length,
            defaultValue: '{{count}} participant(s) selected',
          })}
        </Text>
      )}

      <Group gap="sm">
        <Button variant="default" onClick={onBack} leftSection={<ArrowBackIcon sx={{ fontSize: 16 }} />}>
          {t('groupSigning.steps.back', 'Back')}
        </Button>
        <Button onClick={onNext} disabled={!hasParticipants || disabled} style={{ flex: 1 }}>
          {t('groupSigning.steps.selectParticipants.continue', 'Continue to Signature Settings')}
        </Button>
      </Group>
    </Stack>
  );
};
