import {
  type FocusEventHandler,
  type CSSProperties,
  useEffect,
  useState,
} from "react";
import {
  ColorInput as MantineColorInput,
  type ColorInputProps as MantineColorInputProps,
} from "@mantine/core";
import { useInputAria } from "@app/ui/ariaForwarding";
import "@app/ui/MantineForms.css";

const SUI_INPUT_VARS = {
  "--input-bg": "var(--c-surface)",
  "--input-bd": "var(--c-border)",
  "--input-bd-focus": "var(--c-primary)",
  "--input-radius": "var(--radius-md)",
  "--input-color": "var(--c-text)",
  "--input-placeholder-color": "var(--color-text-placeholder)",
  "--input-height-sm": "1.75rem",
  "--input-height-md": "2.25rem",
} as CSSProperties;

export type ColorInputSize = "sm" | "md";

export interface ColorInputProps {
  // Value
  value?: string;
  onChange?: (value: string) => void;
  /** Fires once when picking finishes (pointer up / blur), not every drag frame — for committing expensive updates. */
  onChangeEnd?: (value: string) => void;
  defaultValue?: string;

  // Behaviour
  format?: "hex" | "hexa" | "rgb" | "rgba" | "hsl" | "hsla";
  swatches?: string[];
  swatchesPerRow?: number;
  withPicker?: boolean;
  /** Restrict the gamut live: every change is run through this (handle sticks at the boundary), receiving the previous in-gamut value so a clamp can preserve hue at achromatic extremes. */
  clampValue?: (value: string, previous: string) => string;

  // Popover escape hatch — only for zIndex / offset overrides in modals
  popoverProps?: MantineColorInputProps["popoverProps"];

  // Form
  placeholder?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;

  // SUI — invalid applies error styling; FormField renders the message itself.
  inputSize?: ColorInputSize;
  invalid?: boolean;
}

type PassthroughProps = Pick<
  MantineColorInputProps,
  | "value"
  | "onChange"
  | "onChangeEnd"
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
  | "required"
  | "disabled"
  | "readOnly"
  | "onFocus"
  | "onBlur"
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
  onChangeEnd,
  clampValue,
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
  required,
  disabled,
  readOnly,
  onFocus,
  onBlur,
}: ColorInputProps) {
  const inputRef = useInputAria({ describedBy: ariaDescribedBy });

  // With a clamp, this component owns the displayed value so the picker reflects the constraint live (clamped and mirrored back each frame); without one, value/handlers pass straight through.
  const [clamped, setClamped] = useState(value ?? defaultValue ?? "");
  useEffect(() => {
    if (value !== undefined) setClamped(value);
  }, [value]);

  const constrainedProps = clampValue
    ? {
        value: clamped,
        onChange: (next: string) => {
          const c = clampValue(next, clamped);
          setClamped(c);
          onChange?.(c);
        },
        onChangeEnd: (next: string) => onChangeEnd?.(clampValue(next, clamped)),
      }
    : { value, onChange, onChangeEnd };

  const passthroughProps: PassthroughProps = {
    ...constrainedProps,
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
    required,
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
      // required sets the input attribute only; FormField renders the asterisk.
      withAsterisk={false}
      ref={inputRef}
      classNames={{ wrapper: "sui-mantine-wrapper" }}
      styles={{ wrapper: SUI_INPUT_VARS }}
      {...passthroughProps}
    />
  );
}
