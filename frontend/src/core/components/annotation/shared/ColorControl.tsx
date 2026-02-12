import { ActionIcon, Tooltip, Popover, Stack, ColorSwatch, ColorPicker as MantineColorPicker } from '@mantine/core';
import { useState } from 'react';

interface ColorControlProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
  disabled?: boolean;
}

export function ColorControl({ value, onChange, label, disabled = false }: ColorControlProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom" withArrow withinPortal>
      <Popover.Target>
        <Tooltip label={label}>
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
            <ColorSwatch color={value} size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <MantineColorPicker
            format="hex"
            value={value}
            onChange={onChange}
            swatches={[
              '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
              '#ffff00', '#ff00ff', '#00ffff', '#ffa500', 'transparent'
            ]}
            swatchesPerRow={5}
            size="sm"
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
