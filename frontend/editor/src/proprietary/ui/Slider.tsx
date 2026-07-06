import {
  Slider as MantineSlider,
  type SliderProps as MantineSliderProps,
} from "@mantine/core";
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
  disabled?: boolean;

  // SUI
  inputSize?: "sm" | "md";
}

type PassthroughProps = Omit<
  Pick<
    MantineSliderProps,
    | "value" | "onChange" | "min" | "max" | "step"
    | "marks" | "label"
    | "id" | "disabled" | "size"
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
  disabled,
  inputSize = "md",
}: SliderProps) {
  const label = showValue
    ? (v: number) => (formatValue ? formatValue(v) : String(v))
    : null;

  const passthroughProps: PassthroughProps = {
    value,
    onChange,
    min,
    max,
    step,
    marks,
    label,
    id,
    disabled,
    size: inputSize,
  };

  return (
    <MantineSlider
      classNames={{ root: "sui-mantine-slider" }}
      {...passthroughProps}
    />
  );
}
