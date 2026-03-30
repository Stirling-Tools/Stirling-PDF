import { Button, Stack } from '@mantine/core';
import React from 'react';

export interface ButtonToggleOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ButtonToggleProps {
  options: ButtonToggleOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  orientation?: 'vertical' | 'horizontal';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const ButtonToggle: React.FC<ButtonToggleProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  orientation = 'vertical',
  size = 'md',
  fullWidth = true,
}) => {
  const isVertical = orientation === 'vertical';

  const buttonStyle: React.CSSProperties = {
    justifyContent: 'flex-start',
    height: isVertical ? 'auto' : undefined,
    minHeight: isVertical ? '50px' : undefined,
    padding: isVertical ? '12px 16px' : undefined,
    textAlign: 'left',
  };

  const renderButton = (option: ButtonToggleOption) => {
    const isSelected = value === option.value;
    const isDisabled = disabled || option.disabled;

    return (
      <Button
        key={option.value}
        variant={isSelected ? 'filled' : 'outline'}
        onClick={() => !isDisabled && onChange(option.value)}
        disabled={isDisabled}
        size={size}
        fullWidth={fullWidth}
        style={buttonStyle}
      >
        <div style={{ width: '100%' }}>
          <div style={{ fontWeight: 600 }}>{option.label}</div>
          {option.description && (
            <div
              style={{
                fontSize: '0.85em',
                opacity: 0.8,
                marginTop: '4px',
                fontWeight: 400,
              }}
            >
              {option.description}
            </div>
          )}
        </div>
      </Button>
    );
  };

  if (isVertical) {
    return (
      <Stack gap="xs">
        {options.map(renderButton)}
      </Stack>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(renderButton)}
    </div>
  );
};
