import { forwardRef, type SelectHTMLAttributes } from "react";
import "@shared/components/Select.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectSize = "sm" | "md";

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  inputSize?: SelectSize;
  options: SelectOption[];
  /** Optional placeholder rendered as a disabled first option. */
  placeholder?: string;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { inputSize = "md", options, placeholder, invalid, className, ...rest },
    ref,
  ) {
    return (
      <span
        className={[
          "sui-select",
          `sui-select--${inputSize}`,
          invalid ? "sui-select--invalid" : "",
          rest.disabled ? "sui-select--disabled" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <select ref={ref} className="sui-select__el" {...rest}>
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="sui-select__caret" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </span>
    );
  },
);
