import type React from "react";
import {
  MultiSelect as MantineMultiSelect,
  type MultiSelectProps as MantineMultiSelectProps,
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

export type MultiSelectSize = "sm" | "md";

export interface MultiSelectProps
  extends Omit<MantineMultiSelectProps, "size"> {
  inputSize?: MultiSelectSize;
  invalid?: boolean;
}

/**
 * SUI-styled multi-select backed by Mantine. Use with <FormField> for labels/errors.
 * Accepts `inputSize` to match other SUI form elements.
 */
export function MultiSelect({
  inputSize = "md",
  invalid,
  error,
  classNames: _classNames,
  styles: _styles,
  ...props
}: MultiSelectProps) {
  return (
    <MantineMultiSelect
      size={inputSize}
      error={invalid ? (error ?? " ") : error}
      withAsterisk={false}
      classNames={{
        wrapper: "sui-mantine-wrapper",
        pill: "sui-mantine-pill",
        pillsList: "sui-mantine-pills-list",
      }}
      styles={{ wrapper: SUI_INPUT_VARS }}
      {...props}
    />
  );
}
