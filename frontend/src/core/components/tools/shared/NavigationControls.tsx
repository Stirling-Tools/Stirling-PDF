import { Stack, Group, ActionIcon, Text } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';

export interface NavigationControlsProps {
  currentIndex: number;
  totalFiles: number;
  onPrevious: () => void;
  onNext: () => void;
}

const NavigationControls = ({
  currentIndex,
  totalFiles,
  onPrevious,
  onNext,
}: NavigationControlsProps) => {
  if (totalFiles <= 1) return null;

  return (
    <Stack align="center" gap="xs" mt="xs">
      <Group justify="center" gap="xs">
        <ActionIcon
          variant="light"
          size="sm"
          onClick={onPrevious}
          disabled={totalFiles <= 1}
          data-testid="review-panel-prev"
        >
          <LocalIcon icon="chevron-left-rounded" width="1rem" height="1rem" />
        </ActionIcon>
        <Text size="xs" c="dimmed">
        {currentIndex + 1} of {totalFiles}
        </Text>

        <ActionIcon
          variant="light"
          size="sm"
          onClick={onNext}
          disabled={totalFiles <= 1}
          data-testid="review-panel-next"
        >
          <LocalIcon icon="chevron-right-rounded" width="1rem" height="1rem" />
        </ActionIcon>
      </Group>
    </Stack>
  );
};

export default NavigationControls;
