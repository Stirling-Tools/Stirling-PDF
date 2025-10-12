import React from 'react';
import { Box } from '@mantine/core';

interface BadgeProps {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'colored';
  color?: string;
  textColor?: string;
  backgroundColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

const Badge: React.FC<BadgeProps> = ({ 
  children, 
  size = 'sm', 
  variant = 'default',
  color,
  textColor,
  backgroundColor,
  className,
  style 
}) => {
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          padding: '0.125rem 0.5rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          borderRadius: '0.5rem',
        };
      case 'md':
        return {
          padding: '0.25rem 0.75rem',
          fontSize: '0.875rem',
          fontWeight: 700,
          borderRadius: '0.625rem',
        };
      case 'lg':
        return {
          padding: '0.375rem 1rem',
          fontSize: '1rem',
          fontWeight: 700,
          borderRadius: '0.75rem',
        };
      default:
        return {};
    }
  };

  const getVariantStyles = () => {
    // If explicit colors are provided, use them
    if (textColor && backgroundColor) {
      return {
        backgroundColor,
        color: textColor,
      };
    }
    
    // If a single color is provided, use it for text and 20% opacity for background
    if (color) {
      return {
        backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
        color: color,
      };
    }
    
    // If variant is colored but no color provided, use default colored styling
    if (variant === 'colored') {
      return {
        backgroundColor: `color-mix(in srgb, var(--category-color-default) 15%, transparent)`,
        color: 'var(--category-color-default)',
        borderColor: `color-mix(in srgb, var(--category-color-default) 30%, transparent)`,
        border: '1px solid',
      };
    }
    
    // Default styling
    return {
      background: 'var(--tool-header-badge-bg)',
      color: 'var(--tool-header-badge-text)',
    };
  };

  return (
    <Box
      className={className}
      style={{
        ...getSizeStyles(),
        ...getVariantStyles(),
        ...style,
      }}
    >
      {children}
    </Box>
  );
};

export default Badge;
