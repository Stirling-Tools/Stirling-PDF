import React, { forwardRef } from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import styles from "@app/components/shared/textInput/TextInput.module.css";

/**
 * Props for the TextInput component
 */
export interface TextInputProps {
  /** The input ID (required) */
  id: string;
  /** The input name (required) */
  name: string;
  /** The input value (required) */
  value: string;
  /** Callback when input value changes (required) */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Optional left icon */
  icon?: React.ReactNode;
  /** Whether to show the clear button (default: true) */
  showClearButton?: boolean;
  /** Custom clear handler (defaults to setting value to empty string) */
  onClear?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** HTML autocomplete attribute (default: 'off') */
  autoComplete?: string;
  /** Whether the input is disabled (default: false) */
  disabled?: boolean;
  /** Whether the input is read-only (default: false) */
  readOnly?: boolean;
  /** Accessibility label */
  "aria-label"?: string;
  /** Focus event handler */
  onFocus?: () => void;
  /** Allow the icon to receive pointer events (e.g. when icon is a clickable button) */
  iconClickable?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      id,
      name,
      value,
      onChange,
      placeholder,
      icon,
      showClearButton = true,
      onClear,
      className = "",
      style,
      autoComplete = "off",
      disabled = false,
      readOnly = false,
      "aria-label": ariaLabel,
      onFocus,
      iconClickable = false,
      ...props
    },
    ref,
  ) => {
    const handleClear = () => {
      if (onClear) {
        onClear();
      } else {
        onChange("");
      }
    };

    const shouldShowClearButton =
      showClearButton && value.trim().length > 0 && !disabled && !readOnly;

    return (
      <div className={`${styles.container} ${className}`} style={style}>
        {icon && (
          <span
            className={styles.icon}
            style={{
              pointerEvents: iconClickable ? "auto" : "none",
              left: "12px",
            }}
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          type="text"
          id={id}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          autoComplete={autoComplete}
          className={styles.input}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel}
          onFocus={onFocus}
          style={{
            paddingRight: shouldShowClearButton ? "40px" : "12px",
            paddingLeft: icon ? "40px" : "12px",
          }}
          {...props}
        />
        {shouldShowClearButton && (
          <button type="button" className={styles.clearButton} onClick={handleClear} aria-label="Clear input">
            <LocalIcon icon="close-rounded" width="1.25rem" height="1.25rem" />
          </button>
        )}
      </div>
    );
  },
);

TextInput.displayName = "TextInput";
