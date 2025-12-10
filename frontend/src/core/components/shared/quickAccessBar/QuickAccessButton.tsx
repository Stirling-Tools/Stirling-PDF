import React from 'react';
import { ActionIcon } from '@mantine/core';
import FitText from '@app/components/shared/FitText';

interface QuickAccessButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  ariaLabel: string;
  textClassName?: 'button-text' | 'all-tools-text';
  backgroundColor?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  component?: 'a' | 'button';
  dataTestId?: string;
  dataTour?: string;
}

const QuickAccessButton: React.FC<QuickAccessButtonProps> = ({
  icon,
  label,
  isActive,
  onClick,
  href,
  ariaLabel,
  textClassName = 'button-text',
  backgroundColor,
  color,
  size,
  className,
  component = 'button',
  dataTestId,
  dataTour,
}) => {
  const buttonSize = size || (isActive ? 'lg' : 'md');
  const bgColor = backgroundColor || (isActive ? 'var(--icon-tools-bg)' : 'var(--icon-inactive-bg)');
  const textColor = color || (isActive ? 'var(--icon-tools-color)' : 'var(--icon-inactive-color)');

  const actionIconProps = component === 'a' && href
    ? {
        component: 'a' as const,
        href,
        onClick,
        'aria-label': ariaLabel,
      }
    : {
        onClick,
        'aria-label': ariaLabel,
      };

  return (
    <div className="flex flex-col items-center gap-1" data-tour={dataTour}>
      <ActionIcon
        {...actionIconProps}
        size={buttonSize}
        variant="subtle"
        style={{
          backgroundColor: bgColor,
          color: textColor,
          border: 'none',
          borderRadius: '8px',
          textDecoration: 'none',
        }}
        className={className || (isActive ? 'activeIconScale' : '')}
        data-testid={dataTestId}
      >
        <span className="iconContainer">{icon}</span>
      </ActionIcon>
      <div style={{ width: '100%' }}>
        <FitText
          as="span"
          text={label}
          lines={2}
          minimumFontScale={0.5}
          className={`${textClassName} ${isActive ? 'active' : 'inactive'}`}
          style={{
            fontSize: '0.75rem',
            textAlign: 'center',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};

export default QuickAccessButton;
