import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import "@shared/components/FormField.css";

export interface FormFieldProps {
  label?: ReactNode;
  /** Helper text shown under the control. Replaced by `error` when present. */
  helperText?: ReactNode;
  /** Error string. Causes the control + helper region to swap to the error tone. */
  error?: ReactNode;
  required?: boolean;
  /** A single form control as a React element. Receives id + aria-* props. */
  children: ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    required?: boolean;
  }>;
  className?: string;
}

/**
 * Standardised label + control + helper/error wrapper. Works with the bare
 * native controls in this design system (Input, Select, Checkbox, Radio,
 * Slider) or with any third-party control that accepts `id` + `aria-*`.
 */
export function FormField({
  label,
  helperText,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const autoId = useId();
  if (!isValidElement(children)) {
    throw new Error("FormField requires exactly one React element child");
  }
  const controlId = children.props.id ?? autoId;
  const describedById = error || helperText ? `${controlId}-help` : undefined;

  const child = cloneElement(children, {
    id: controlId,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedById,
    required: required ?? children.props.required,
  });

  return (
    <div
      className={["sui-field", error ? "sui-field--error" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {label && (
        <label htmlFor={controlId} className="sui-field__label">
          {label}
          {required && (
            <span className="sui-field__required" aria-hidden>
              {" "}
              *
            </span>
          )}
        </label>
      )}
      <div className="sui-field__control">{child}</div>
      {(error || helperText) && (
        <div id={describedById} className="sui-field__help">
          {error ?? helperText}
        </div>
      )}
    </div>
  );
}
