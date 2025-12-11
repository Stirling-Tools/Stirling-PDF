import React from 'react';
import { Badge } from '@mantine/core';

interface PricingBadgeProps {
  type: 'current' | 'popular' | 'savings';
  label: string;
  savingsPercent?: number;
}

export const PricingBadge: React.FC<PricingBadgeProps> = ({ type, label }) => {
  const color = type === 'current' || type === 'savings' ? 'green' : 'blue';
  const size = type === 'savings' ? 'lg' : 'sm';

  return (
    <Badge
      color={color}
      variant="filled"
      size={size}
      style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
      className={type === 'current' ? 'current-plan-badge' : undefined}
    >
      {label}
    </Badge>
  );
};
