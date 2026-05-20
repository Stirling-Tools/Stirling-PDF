import { type InputHTMLAttributes, type ReactNode } from "react";
import "@shared/components/Radio.css";

export interface RadioOption<V extends string = string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<V extends string = string> {
  name: string;
  value: V;
  onChange: (value: V) => void;
  options: RadioOption<V>[];
  /** Layout. `vertical` stacks options; `horizontal` lays them inline. */
  direction?: "vertical" | "horizontal";
  className?: string;
}

/** Standalone single radio — usually consumed via {@link RadioGroup}. */
export function Radio({
  label,
  description,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label
      className={[
        "sui-radio",
        rest.disabled ? "sui-radio--disabled" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input type="radio" className="sui-radio__input" {...rest} />
      <span className="sui-radio__dot" aria-hidden />
      {(label || description) && (
        <span className="sui-radio__text">
          {label && <span className="sui-radio__label">{label}</span>}
          {description && (
            <span className="sui-radio__desc">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}

export function RadioGroup<V extends string = string>({
  name,
  value,
  onChange,
  options,
  direction = "vertical",
  className,
}: RadioGroupProps<V>) {
  return (
    <div
      role="radiogroup"
      className={[
        "sui-radio-group",
        `sui-radio-group--${direction}`,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((opt) => (
        <Radio
          key={opt.value}
          name={name}
          value={opt.value}
          checked={opt.value === value}
          onChange={() => onChange(opt.value)}
          disabled={opt.disabled}
          label={opt.label}
          description={opt.description}
        />
      ))}
    </div>
  );
}
