import type React from "react";
import {
  Select as MantineSelect,
  type SelectProps as MantineSelectProps,
} from "@mantine/core";
import { useInputAria } from "@app/ui/ariaForwarding";
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

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectSize = "sm" | "md";

export interface SelectProps {
  // Data
  options: SelectOption[];
  value?: string | null;
  onChange?: (value: string | null) => void;
  defaultValue?: string;

  // Behaviour
  searchable?: boolean;
  clearable?: boolean;
  placeholder?: string;
  nothingFoundMessage?: React.ReactNode;
  maxDropdownHeight?: number | string;

  // Dropdown escape hatch — for zIndex / offset overrides in modals
  comboboxProps?: MantineSelectProps["comboboxProps"];

  // Form
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;

  // SUI — invalid applies error styling; FormField renders the message itself.
  inputSize?: SelectSize;
  invalid?: boolean;
}

type PassthroughProps = Omit<
  Pick<
    MantineSelectProps,
    | "value"
    | "onChange"
    | "defaultValue"
    | "searchable"
    | "clearable"
    | "placeholder"
    | "nothingFoundMessage"
    | "maxDropdownHeight"
    | "comboboxProps"
    | "id"
    | "name"
    | "aria-label"
    | "aria-describedby"
    | "required"
    | "disabled"
    | "readOnly"
    | "onFocus"
    | "onBlur"
  >,
  never
>;

/**
 * SUI select / combobox backed by Mantine. Supports optional search and clear.
 * Use with <FormField> for labels and error display. Appearance is locked to SUI tokens.
 *
 * onChange receives the selected string value (or null when cleared), not a DOM event.
 */
export function Select({
  inputSize = "md",
  invalid,
  options,
  value,
  onChange,
  defaultValue,
  searchable,
  clearable,
  placeholder,
  nothingFoundMessage,
  maxDropdownHeight,
  comboboxProps,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  required,
  disabled,
  readOnly,
  onFocus,
  onBlur,
}: SelectProps) {
  const inputRef = useInputAria({ describedBy: ariaDescribedBy });
  const passthroughProps: PassthroughProps = {
    value,
    onChange,
    defaultValue,
    searchable,
    clearable,
    placeholder,
    nothingFoundMessage,
    maxDropdownHeight,
    comboboxProps,
    id,
    name,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
    required,
    disabled,
    readOnly,
    onFocus,
    onBlur,
  };

  return (
    <MantineSelect
      data={options}
      size={inputSize}
      // Boolean error applies invalid styling without rendering Mantine's own
      // message element — FormField owns the visible error text.
      error={invalid || ariaInvalid || undefined}
      // required sets the input attribute only; FormField renders the asterisk.
      withAsterisk={false}
      ref={inputRef}
      classNames={{ wrapper: "sui-mantine-wrapper" }}
      styles={{ wrapper: SUI_INPUT_VARS }}
      {...passthroughProps}
    />
  );
}
