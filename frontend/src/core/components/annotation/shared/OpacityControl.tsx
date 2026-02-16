import { ActionIcon, Tooltip, Popover, Stack, Slider, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import OpacityIcon from '@mui/icons-material/Opacity';

interface OpacityControlProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function OpacityControl({ value, onChange, disabled = false }: OpacityControlProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened} position="top" withArrow>
      <Popover.Target>
        <Tooltip label={t('annotation.opacity', 'Opacity')}>
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
            <OpacityIcon style={{ fontSize: 18 }} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" style={{ minWidth: 150 }}>
          <Text size="xs" fw={500}>
            {t('annotation.opacity', 'Opacity')}
          </Text>
          <Slider
            value={value}
            onChange={onChange}
            min={10}
            max={100}
            label={(val) => `${val}%`}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
