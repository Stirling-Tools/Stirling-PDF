import { Group, Kbd } from '@mantine/core';
import React from 'react';
import { useHotkeys } from '../../contexts/HotkeyContext';

interface ShortcutDisplayProps {
  shortcut?: string;
}

export function ShortcutDisplay({ shortcut }: ShortcutDisplayProps) {
  const { formatShortcut } = useHotkeys();

  if (!shortcut) return null;

  const parts = formatShortcut(shortcut);
  if (!parts.length) return null;

  return (
    <Group gap={4} wrap="nowrap" align="center" style={{ flexWrap: 'nowrap' }}>
      {parts.map((part, index) => (
        <Kbd key={`${part}-${index}`} style={{ fontSize: '0.75rem' }}>
          {part}
        </Kbd>
      ))}
    </Group>
  );
}

export default ShortcutDisplay;
