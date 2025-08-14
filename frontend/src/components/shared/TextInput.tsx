import React, { forwardRef } from 'react';
import { useMantineColorScheme } from '@mantine/core';
import styles from './textInput/TextInput.module.css';

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  showClearButton?: boolean;
  onClear?: () => void;
  className?: string;
  style?: React.CSSProperties;
  autoComplete?: string;
  disabled?: boolean;
  readOnly?: boolean;
  'aria-label'?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({
  value,
  onChange,
  placeholder,
  icon,
  showClearButton = true,
  onClear,
  className = '',
  style,
  autoComplete = 'off',
  disabled = false,
  readOnly = false,
  'aria-label': ariaLabel,
  ...props
}, ref) => {
  const { colorScheme } = useMantineColorScheme();

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  const shouldShowClearButton = showClearButton && value.trim().length > 0 && !disabled && !readOnly;

  return (
    <div className={`${styles.container} ${className}`} style={style}>
      {icon && (
        <span 
          className={styles.icon}
          style={{ color: colorScheme === 'dark' ? '#FFFFFF' : '#6B7382' }}
        >
          {icon}
        </span>
      )}
      <input
        ref={ref}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        autoComplete={autoComplete}
        className={styles.input}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        style={{
          backgroundColor: colorScheme === 'dark' ? '#4B525A' : '#FFFFFF',
          color: colorScheme === 'dark' ? '#FFFFFF' : '#6B7382',
          paddingRight: shouldShowClearButton ? '40px' : '12px',
          paddingLeft: icon ? '40px' : '12px',
        }}
        {...props}
      />
      {shouldShowClearButton && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClear}
          style={{ color: colorScheme === 'dark' ? '#FFFFFF' : '#6B7382' }}
          aria-label="Clear input"
        >
          <span className="material-symbols-rounded">close</span>
        </button>
      )}
    </div>
  );
});

TextInput.displayName = 'TextInput';
