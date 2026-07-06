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

export interface ColorInputProps {
  // Value
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;

  // Behaviour
  format?: "hex" | "hexa" | "rgb" | "rgba" | "hsl" | "hsla";
  swatches?: string[];
  swatchesPerRow?: number;
  withPicker?: boolean;

  // Popover escape hatch — only for zIndex / offset overrides in modals
  popoverProps?: MantineColorInputProps["popoverProps"];

  // Form
  placeholder?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;

  // SUI — invalid applies error styling; FormField renders the message itself.
  inputSize?: ColorInputSize;
  invalid?: boolean;
}

type PassthroughProps = Omit<
  Pick<
    MantineColorInputProps,
    | "value"
    | "onChange"
    | "defaultValue"
    | "format"
    | "swatches"
    | "swatchesPerRow"
    | "withPicker"
    | "popoverProps"
    | "placeholder"
    | "id"
    | "name"
    | "aria-label"
    | "aria-describedby"
    | "disabled"
    | "readOnly"
    | "onFocus"
    | "onBlur"
  >,
  never
>;

/**
 * SUI colour picker input with swatch preview and popover picker. Use with
 * <FormField> for labels and error display. Appearance is locked to SUI tokens.
 *
 * Defaults to hex format. Pass `popoverProps={{ withinPortal: true, zIndex: Z }}` when
 * rendering inside a modal.
 */
export function ColorInput({
  inputSize = "md",
  invalid,
  format = "hex",
  value,
  onChange,
  defaultValue,
  swatches,
  swatchesPerRow,
  withPicker,
  popoverProps,
  placeholder,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  disabled,
  readOnly,
  onFocus,
  onBlur,
}: ColorInputProps) {
  const passthroughProps: PassthroughProps = {
    value,
    onChange,
    defaultValue,
    format,
    swatches,
    swatchesPerRow,
    withPicker,
    popoverProps,
    placeholder,
    id,
    name,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
    disabled,
    readOnly,
    onFocus,
    onBlur,
  };

  return (
    <MantineColorInput
      size={inputSize}
      // Boolean error applies invalid styling without rendering Mantine's own
      // message element — FormField owns the visible error text.
      error={invalid || ariaInvalid || undefined}
      withAsterisk={false}
      classNames={{ wrapper: "sui-mantine-wrapper" }}
      styles={{ wrapper: SUI_INPUT_VARS }}
      {...passthroughProps}
    />
  );
}
