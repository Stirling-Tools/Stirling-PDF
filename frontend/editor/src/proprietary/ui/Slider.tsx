import {
  Slider as MantineSlider,
  type SliderProps as MantineSliderProps,
} from "@mantine/core";
import { useThumbAria } from "@app/ui/ariaForwarding";
import "@app/ui/MantineForms.css";

export interface SliderMark {
  value: number;
  label?: React.ReactNode;
}

export interface SliderProps {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;

  /** Tick marks along the track. */
  marks?: SliderMark[];

  /** Format the tooltip shown while dragging. Defaults to the raw number. */
  formatValue?: (value: number) => string;

  /**
   * Show the value tooltip on hover/drag. Defaults to true.
   * Pass false to hide the label entirely (useful when the value is shown elsewhere).
   */
  showValue?: boolean;

  // Form
  id?: string;
  /** Accessible name for the slider thumb — the visible FormField label can't
   * associate with Mantine's non-input thumb element, so set this too. */
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  disabled?: boolean;

  // SUI
  inputSize?: "sm" | "md";
}

type PassthroughProps = Omit<
  Pick<
    MantineSliderProps,
    | "value"
    | "onChange"
    | "min"
    | "max"
    | "step"
    | "marks"
    | "label"
    | "thumbLabel"
    | "id"
    | "disabled"
    | "size"
  >,
  never
>;

/**
 * SUI range slider backed by Mantine. Provides accessible keyboard navigation,
 * optional tick marks, and a drag tooltip. Use with <FormField> for labels.
 * Appearance is locked to SUI tokens.
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  marks,
  formatValue,
  showValue = true,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  disabled,
  inputSize = "md",
}: SliderProps) {
  const label = showValue
    ? (v: number) => (formatValue ? formatValue(v) : String(v))
    : null;

  // The role="slider" element is the thumb, not an input, so FormField's
  // injected aria wiring has to land there for AT to announce it.
  const rootRef = useThumbAria(ariaDescribedBy, ariaInvalid);

  const passthroughProps: PassthroughProps = {
    value,
    onChange,
    min,
    max,
    step,
    marks,
    label,
    thumbLabel: ariaLabel,
    id,
    disabled,
    size: inputSize,
  };

  return (
    <MantineSlider
      ref={rootRef}
      classNames={{ root: "sui-mantine-slider" }}
      {...passthroughProps}
    />
  );
}
