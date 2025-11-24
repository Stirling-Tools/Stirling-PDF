import React from 'react';
import { Badge } from '@mantine/core';

interface PricingBadgeProps {
  type: 'current' | 'popular' | 'savings';
  label: string;
  savingsPercent?: number;
}

export const PricingBadge: React.FC<PricingBadgeProps> = ({ type, label, savingsPercent }) => {
  const color = type === 'current' || type === 'savings' ? 'green' : 'blue';
  const size = type === 'savings' ? 'lg' : 'sm';

  return (
    <Badge
      color={color}
      variant="filled"
      size={size}
      style={{ position: 'absolute', top: '1rem', right: '1rem' }}
    >
      {label}
    </Badge>
  );
};
