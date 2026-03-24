import React from 'react';
import { Text } from '@mantine/core';

interface StatCardProps {
  icon: React.ReactNode;
  count: React.ReactNode;
  label: string;
  hoverColor?: string;
  onClick?: (rect: DOMRect) => void;
  disabled?: boolean;
}

export function StatCard({ icon, count, label, hoverColor, onClick, disabled }: StatCardProps) {
  const isClickable = !!onClick && !disabled;

  return (
    <div
      onClick={(e) => {
        if (isClickable) onClick(e.currentTarget.getBoundingClientRect());
      }}
      style={{
        padding: '0.5rem 0.75rem 2rem',
        borderRadius: 'var(--mantine-radius-sm)',
        border: '0.0625rem solid var(--border-subtle)',
        backgroundColor: 'var(--bg-toolbar)',
        textAlign: 'center',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'border-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (isClickable && hoverColor) e.currentTarget.style.borderColor = hoverColor;
      }}
      onMouseLeave={(e) => {
        if (isClickable) e.currentTarget.style.borderColor = 'var(--border-subtle)';
      }}
    >
      <div style={{ display: 'block', marginBottom: '0.375rem' }}>{icon}</div>
      <Text fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, marginBottom: '0.25rem' }}>
        {count}
      </Text>
      <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }} c="dimmed">
        {label}
      </Text>
    </div>
  );
}
