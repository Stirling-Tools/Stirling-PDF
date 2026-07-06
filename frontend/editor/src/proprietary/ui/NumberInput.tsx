import type React from "react";
import {
  NumberInput as MantineNumberInput,
  type NumberInputProps as MantineNumberInputProps,
} from "@mantine/core";
import "@app/ui/MantineForms.css";

const SUI_INPUT_VARS = {
  "--input-bg": "var(--color-surface)",
  "--input-bd": "var(--color-border-input)",
  "--input-bd-focus": "var(--color-blue)",
  "--input-radius": "var(--radius-md)",
  "--input-color": "var(--color-text-1)",
  "--input-placeholder-color": "var(--color-text-placeholder)",
  "--input-height-sm": "1.75rem",
  "--input-height-md": "2.25rem",
} as React.CSSProperties;

export type NumberInputSize = "sm" | "md";

export interface NumberInputProps {
  // Value
  value?: number | string;
  onChange?: (value: number | string) => void;
  defaultValue?: number | string;

  // Constraints
  min?: number;
  max?: number;
  step?: number;
  decimalScale?: number;
  fixedDecimalScale?: boolean;
  allowNegative?: boolean;
  allowDecimal?: boolean;
  clampBehavior?: "strict" | "blur" | "none";

  // Display
  placeholder?: string;
  suffix?: string;
  prefix?: string;
  hideControls?: boolean;

  // Right section — escape hatch for inline unit labels
  rightSection?: React.ReactNode;
  rightSectionWidth?: React.CSSProperties["width"];

  // Form
  id?: string;
  name?: string;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;

  // SUI
  inputSize?: NumberInputSize;
  invalid?: boolean;
  error?: React.ReactNode;
}

// Narrows MantineNumberInputProps to only what our interface exposes so the
// spread below stays type-safe without manually listing every prop.
type PassthroughProps = Omit<
  Pick<
    MantineNumberInputProps,
    | "value" | "onChange" | "defaultValue"
    | "min" | "max" | "step"
    | "decimalScale" | "fixedDecimalScale" | "allowNegative" | "allowDecimal" | "clampBehavior"
    | "placeholder" | "suffix" | "prefix" | "hideControls"
    | "rightSection" | "rightSectionWidth"
    | "id" | "name" | "disabled" | "readOnly" | "autoFocus"
    | "onFocus" | "onBlur" | "onKeyDown"
  >,
  never
>;

/**
 * SUI number input with increment/decrement controls. Use with <FormField>
 * for labels and error display. Appearance is locked to SUI tokens.
 */
export function NumberInput({
  inputSize = "md",
  invalid,
  error,
  value,
  onChange,
  defaultValue,
  min,
  max,
  step,
  decimalScale,
  fixedDecimalScale,
  allowNegative,
  allowDecimal,
  clampBehavior,
  placeholder,
  suffix,
  prefix,
  hideControls,
  rightSection,
  rightSectionWidth,
  id,
  name,
  disabled,
  readOnly,
  autoFocus,
  onFocus,
  onBlur,
  onKeyDown,
}: NumberInputProps) {
  const passthroughProps: PassthroughProps = {
    value, onChange, defaultValue,
    min, max, step,
    decimalScale, fixedDecimalScale, allowNegative, allowDecimal, clampBehavior,
    placeholder, suffix, prefix, hideControls,
    rightSection, rightSectionWidth,
    id, name, disabled, readOnly, autoFocus,
    onFocus, onBlur, onKeyDown,
  };

  return (
    <MantineNumberInput
      size={inputSize}
      error={invalid ? (error ?? " ") : error}
      withAsterisk={false}
      classNames={{ wrapper: "sui-mantine-wrapper", control: "sui-mantine-control" }}
      styles={{ wrapper: SUI_INPUT_VARS }}
      {...passthroughProps}
    />
  );
}
