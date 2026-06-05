import { forwardRef, type InputHTMLAttributes } from "react";
import "@shared/components/Slider.css";

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** Optional formatter for the value pill (e.g. "0.85", "30 days"). */
  formatValue?: (value: number) => string;
  /** Show the right-aligned value badge. Defaults to true. */
  showValue?: boolean;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    value,
    min = 0,
    max = 1,
    step = 0.01,
    onChange,
    formatValue,
    showValue = true,
    className,
    ...rest
  },
  ref,
) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <span
      className={[
        "sui-slider",
        rest.disabled ? "sui-slider--disabled" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--slider-pct": `${pct}%` } as React.CSSProperties}
    >
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sui-slider__input"
        {...rest}
      />
      {showValue && (
        <span className="sui-slider__value" aria-hidden>
          {formatValue ? formatValue(value) : value.toString()}
        </span>
      )}
    </span>
  );
});
