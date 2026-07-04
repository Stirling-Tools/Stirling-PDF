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

export interface NumberInputProps
  extends Omit<MantineNumberInputProps, "size"> {
  inputSize?: NumberInputSize;
  invalid?: boolean;
}

/**
 * SUI-styled number input (with increment/decrement controls) backed by Mantine.
 * Use with <FormField> for labels/errors.
 */
export function NumberInput({
  inputSize = "md",
  invalid,
  error,
  classNames: _classNames,
  styles: _styles,
  ...props
}: NumberInputProps) {
  return (
    <MantineNumberInput
      size={inputSize}
      error={invalid ? (error ?? " ") : error}
      withAsterisk={false}
      classNames={{
        wrapper: "sui-mantine-wrapper",
        control: "sui-mantine-control",
      }}
      styles={{ wrapper: SUI_INPUT_VARS }}
      {...props}
    />
  );
}
