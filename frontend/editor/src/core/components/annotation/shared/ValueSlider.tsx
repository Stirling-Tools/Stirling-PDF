import { memo } from "react";
import { Slider } from "@mantine/core";
import { useRenderCount } from "@app/hooks/useRenderCount";

const RENDER_LABEL = "annotationValueSlider";

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
 * Mantine memoises nothing inside Slider, and the menu sits under a viewer that
 * re-renders on every annotation update: while a slider is dragged that is once
 * per pointer move, and rebuilding every sibling track with it is the stutter.
 */
export const ValueSlider = memo(function ValueSlider({
  value,
  min,
  max,
  onChange,
  suffix,
}: ValueSliderProps) {
  // Dev-only counter; annotationMenuSliders.test.tsx asserts the memo contract.
  useRenderCount(RENDER_LABEL);
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
