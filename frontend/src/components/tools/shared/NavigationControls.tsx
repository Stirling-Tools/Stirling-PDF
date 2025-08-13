import React from 'react';
import { Stack, Group, ActionIcon, Box, Text } from '@mantine/core';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export interface NavigationControlsProps {
  currentIndex: number;
  totalFiles: number;
  onPrevious: () => void;
  onNext: () => void;
  onIndexChange: (index: number) => void;
}

const NavigationControls = ({
  currentIndex,
  totalFiles,
  onPrevious,
  onNext,
  onIndexChange
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
          <ChevronLeftIcon style={{ fontSize: '1rem' }} />
        </ActionIcon>

        <Group gap="xs">
          {Array.from({ length: totalFiles }, (_, index) => (
            <Box
              key={index}
              style={{
                width: '0.375rem',
                height: '0.375rem',
                borderRadius: '50%',
                backgroundColor: index === currentIndex
                  ? 'var(--mantine-color-blue-6)'
                  : 'var(--mantine-color-gray-4)',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onClick={() => onIndexChange(index)}
              data-testid={`review-panel-dot-${index}`}
            />
          ))}
        </Group>

        <ActionIcon
          variant="light"
          size="sm"
          onClick={onNext}
          disabled={totalFiles <= 1}
          data-testid="review-panel-next"
        >
          <ChevronRightIcon style={{ fontSize: '1rem' }} />
        </ActionIcon>
      </Group>
      
      <Text size="xs" c="dimmed">
        {currentIndex + 1} of {totalFiles}
      </Text>
    </Stack>
  );
};

export default NavigationControls;