import type React from "react";
import {
  ColorInput as MantineColorInput,
  type ColorInputProps as MantineColorInputProps,
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

export type ColorInputSize = "sm" | "md";

export interface ColorInputProps
  extends Omit<MantineColorInputProps, "size"> {
  inputSize?: ColorInputSize;
  invalid?: boolean;
}

/**
 * SUI-styled color input (with swatch preview + picker popover) backed by Mantine.
 * Use with <FormField> for labels/errors.
 */
export function ColorInput({
  inputSize = "md",
  invalid,
  error,
  classNames: _classNames,
  styles: _styles,
  format = "hex",
  ...props
}: ColorInputProps) {
  return (
    <MantineColorInput
      size={inputSize}
      error={invalid ? (error ?? " ") : error}
      withAsterisk={false}
      format={format}
      classNames={{ wrapper: "sui-mantine-wrapper" }}
      styles={{ wrapper: SUI_INPUT_VARS }}
      {...props}
    />
  );
}
