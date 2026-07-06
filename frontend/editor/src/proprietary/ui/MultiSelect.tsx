import type React from "react";
import {
  MultiSelect as MantineMultiSelect,
  type MultiSelectProps as MantineMultiSelectProps,
  type ComboboxData,
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

export interface MultiSelectProps {
  // Data
  data: ComboboxData;
  value?: string[];
  onChange?: (value: string[]) => void;
  defaultValue?: string[];

  // Behaviour
  searchable?: boolean;
  clearable?: boolean;
  limit?: number;
  maxValues?: number;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  nothingFoundMessage?: React.ReactNode;
  maxDropdownHeight?: number | string;
  filter?: MantineMultiSelectProps["filter"];

  // Dropdown escape hatch — only for zIndex / offset overrides in modals
  comboboxProps?: MantineMultiSelectProps["comboboxProps"];

  // Form
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;

  // SUI
  inputSize?: MultiSelectSize;
  invalid?: boolean;
  error?: React.ReactNode;
}

type PassthroughProps = Omit<
  Pick<
    MantineMultiSelectProps,
    | "data" | "value" | "onChange" | "defaultValue"
    | "searchable" | "clearable" | "limit" | "maxValues"
    | "searchValue" | "onSearchChange"
    | "nothingFoundMessage" | "maxDropdownHeight" | "filter"
    | "comboboxProps"
    | "placeholder" | "id" | "name" | "disabled" | "readOnly"
    | "onFocus" | "onBlur" | "onDropdownOpen" | "onDropdownClose"
  >,
  never
>;

/**
 * SUI multi-select with pill display and optional search. Use with <FormField>
 * for labels and error display. Appearance is locked to SUI tokens.
 *
 * Pass `comboboxProps={{ zIndex: Z_INDEX_MODAL }}` when rendering inside a modal.
 */
export function MultiSelect({
  inputSize = "md",
  invalid,
  error,
  data,
  value,
  onChange,
  defaultValue,
  searchable,
  clearable,
  limit,
  maxValues,
  searchValue,
  onSearchChange,
  nothingFoundMessage,
  maxDropdownHeight,
  filter,
  comboboxProps,
  placeholder,
  id,
  name,
  disabled,
  readOnly,
  onFocus,
  onBlur,
  onDropdownOpen,
  onDropdownClose,
}: MultiSelectProps) {
  const passthroughProps: PassthroughProps = {
    data, value, onChange, defaultValue,
    searchable, clearable, limit, maxValues,
    searchValue, onSearchChange,
    nothingFoundMessage, maxDropdownHeight, filter,
    comboboxProps,
    placeholder, id, name, disabled, readOnly,
    onFocus, onBlur, onDropdownOpen, onDropdownClose,
  };

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
      {...passthroughProps}
    />
  );
}
