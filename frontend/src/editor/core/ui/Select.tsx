import type React from "react";
import {
  Select as MantineSelect,
  type OptionsFilter,
  type SelectProps as MantineSelectProps,
} from "@mantine/core";
import { useInputAria } from "@editor/ui/ariaForwarding";
import "@editor/ui/MantineForms.css";

const SUI_INPUT_VARS = {
  "--input-bg": "var(--c-input-bg)",
  "--input-bd": "var(--c-border)",
  "--input-bd-focus": "var(--c-primary)",
  "--input-radius": "var(--radius-md)",
  "--input-color": "var(--c-text)",
  "--input-placeholder-color": "var(--color-text-placeholder)",
  "--input-height-sm": "1.75rem",
  "--input-height-md": "2.25rem",
} as React.CSSProperties;

// On the input, not the wrapper: Mantine sets --input-color on the input itself.
const MUTED_INPUT = { color: "var(--c-text-muted)" };

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Options listed under a heading. */
export interface SelectOptionGroup {
  group: string;
  options: SelectOption[];
}

export type SelectSize = "sm" | "md";

export interface SelectProps {
  // Data
  options: SelectOption[] | SelectOptionGroup[];
  value?: string | null;
  onChange?: (value: string | null) => void;
  defaultValue?: string;

  // Behaviour
  searchable?: boolean;
  /** Called with the text typed into a searchable select. */
  onSearchChange?: (search: string) => void;
  /** Which options a search shows; by default those whose label contains it. */
  filter?: OptionsFilter;
  /** False keeps picking the selected option from clearing it. */
  allowDeselect?: boolean;
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
  "aria-labelledby"?: string;
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
  /** Shows the value in the muted text colour, for a value the field has by default. */
  muted?: boolean;
}

type PassthroughProps = Omit<
  Pick<
    MantineSelectProps,
    | "value"
    | "onChange"
    | "defaultValue"
    | "searchable"
    | "onSearchChange"
    | "filter"
    | "allowDeselect"
    | "clearable"
    | "placeholder"
    | "nothingFoundMessage"
    | "maxDropdownHeight"
    | "comboboxProps"
    | "id"
    | "name"
    | "aria-label"
    | "aria-labelledby"
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
  muted,
  options,
  value,
  onChange,
  defaultValue,
  searchable,
  onSearchChange,
  filter,
  allowDeselect,
  clearable,
  placeholder,
  nothingFoundMessage,
  maxDropdownHeight,
  comboboxProps,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
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
    onSearchChange,
    filter,
    allowDeselect,
    clearable,
    placeholder,
    nothingFoundMessage,
    maxDropdownHeight,
    comboboxProps,
    id,
    name,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    required,
    disabled,
    readOnly,
    onFocus,
    onBlur,
  };

  return (
    <MantineSelect
      data={options.map((option) =>
        "group" in option
          ? { group: option.group, items: option.options }
          : option,
      )}
      size={inputSize}
      // Boolean error applies invalid styling without rendering Mantine's own
      // message element — FormField owns the visible error text.
      error={invalid || ariaInvalid || undefined}
      // required sets the input attribute only; FormField renders the asterisk.
      withAsterisk={false}
      ref={inputRef}
      classNames={{
        wrapper: "sui-mantine-wrapper",
        dropdown: "sui-mantine-dropdown",
      }}
      styles={{
        wrapper: SUI_INPUT_VARS,
        input: muted ? MUTED_INPUT : undefined,
      }}
      {...passthroughProps}
    />
  );
}
