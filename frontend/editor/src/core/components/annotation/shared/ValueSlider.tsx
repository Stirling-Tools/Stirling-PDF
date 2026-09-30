import { memo } from "react";
import { Slider } from "@mantine/core";
import { useRenderCount } from "@app/hooks/useRenderCount";
import { VALUE_SLIDER_RENDER_LABEL } from "@app/constants/renderLabels";

interface ValueSliderProps {
  value: number;
  min: number;
  max: number;
  /** Changing this must not rebuild the track; use `useEventCallback`. */
  onChange: (value: number) => void;
  /** Appended to the readout, e.g. "%" or "px". Omit for no label. */
  suffix?: string;
}

/**
 * A Mantine `Slider` that only rebuilds when its value moves.
 *
 * Mantine memoises nothing inside Slider, and the annotation menu sits under a
 * viewer that re-renders whenever an annotation is updated — which while a
 * slider is being dragged is once per pointer move. Rebuilding the track on
 * every one of those, alongside every sibling control, is what makes dragging
 * opacity or width stutter.
 */
export const ValueSlider = memo(function ValueSlider({
  value,
  min,
  max,
  onChange,
  suffix,
}: ValueSliderProps) {
  useRenderCount(VALUE_SLIDER_RENDER_LABEL);
  return (
    <Slider
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      label={suffix ? (v: number) => `${v}${suffix}` : undefined}
    />
  );
});
