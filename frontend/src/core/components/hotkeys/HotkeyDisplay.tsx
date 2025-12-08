import React from 'react';
import { HotkeyBinding } from '@app/utils/hotkeys';
import { useHotkeys } from '@app/contexts/HotkeyContext';

interface HotkeyDisplayProps {
  binding: HotkeyBinding | null | undefined;
  size?: 'sm' | 'md';
  muted?: boolean;
}

const baseKeyStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '0.375rem',
  background: 'var(--mantine-color-gray-1)',
  border: '1px solid var(--mantine-color-gray-3)',
  padding: '0.125rem 0.35rem',
  fontSize: '0.75rem',
  lineHeight: 1,
  fontFamily: 'var(--mantine-font-family-monospace, monospace)',
  minWidth: '1.35rem',
  color: 'var(--mantine-color-text)',
};

export const HotkeyDisplay: React.FC<HotkeyDisplayProps> = ({ binding, size = 'sm', muted = false }) => {
  const { getDisplayParts } = useHotkeys();
  const parts = getDisplayParts(binding);

  if (!binding || parts.length === 0) {
    return null;
  }

  const keyStyle = size === 'md'
    ? { ...baseKeyStyle, fontSize: '0.85rem', padding: '0.2rem 0.5rem' }
    : baseKeyStyle;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        color: muted ? 'var(--mantine-color-dimmed)' : 'inherit',
        fontWeight: muted ? 500 : 600,
      }}
    >
      {parts.map((part, index) => (
        <React.Fragment key={`${part}-${index}`}>
          <kbd style={keyStyle}>{part}</kbd>
          {index < parts.length - 1 && <span aria-hidden style={{ fontWeight: 400 }}>+</span>}
        </React.Fragment>
      ))}
    </span>
  );
};

export default HotkeyDisplay;
