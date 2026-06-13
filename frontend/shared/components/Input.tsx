import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import "@shared/components/Input.css";

export type InputSize = "sm" | "md";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  /** Visual size. Distinct from the HTML `size` attribute (which is for character width). */
  inputSize?: InputSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Force the error tone independently of FormField. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = "md", leadingIcon, trailingIcon, invalid, className, ...rest },
  ref,
) {
  return (
    <span
      className={[
        "sui-input",
        `sui-input--${inputSize}`,
        invalid ? "sui-input--invalid" : "",
        rest.disabled ? "sui-input--disabled" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {leadingIcon && (
        <span className="sui-input__icon sui-input__icon--leading" aria-hidden>
          {leadingIcon}
        </span>
      )}
      <input ref={ref} className="sui-input__el" {...rest} />
      {trailingIcon && (
        <span className="sui-input__icon sui-input__icon--trailing" aria-hidden>
          {trailingIcon}
        </span>
      )}
    </span>
  );
});
