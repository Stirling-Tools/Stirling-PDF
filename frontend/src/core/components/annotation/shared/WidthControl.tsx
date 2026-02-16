import { ActionIcon, Tooltip, Popover, Stack, Slider, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import LineWeightIcon from '@mui/icons-material/LineWeight';

interface WidthControlProps {
  value: number;
  onChange: (value: number) => void;
  min: number; // 1 for ink, 0 for shapes
  max: number; // 12 for ink, 20 for highlighter
  disabled?: boolean;
}

export function WidthControl({ value, onChange, min, max, disabled = false }: WidthControlProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened} position="top" withArrow>
      <Popover.Target>
        <Tooltip label={t('annotation.width', 'Width')}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            onClick={() => setOpened(!opened)}
            disabled={disabled}
            styles={{
              root: {
                flexShrink: 0,
                backgroundColor: 'var(--bg-raised)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                '&:hover': {
                  backgroundColor: 'var(--hover-bg)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                },
              },
            }}
          >
            <LineWeightIcon style={{ fontSize: 18 }} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" style={{ minWidth: 150 }}>
          <Text size="xs" fw={500}>
            {t('annotation.width', 'Width')}
          </Text>
          <Slider
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            label={(val) => `${val}pt`}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
