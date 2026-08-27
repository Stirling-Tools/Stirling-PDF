import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { Tooltip } from "@mantine/core";
import "@app/ui/FormField.css";

export interface FormFieldProps {
  label?: ReactNode;
  /** Helper text shown under the control. Replaced by `error` when present. */
  helperText?: ReactNode;
  /**
   * Supplementary explanation shown behind an (i) affordance on the label,
   * instead of taking up permanent space under the control like `helperText`.
   */
  info?: ReactNode;
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
  info,
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
      {(label || info) && (
        <div className="sui-field__label-row">
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
          {info && (
            <Tooltip
              label={info}
              multiline
              w={260}
              withArrow
              position="top"
              events={{ hover: true, focus: true, touch: true }}
            >
              <button
                type="button"
                className="sui-field__info"
                aria-label={
                  typeof info === "string" ? info : "More information"
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
            </Tooltip>
          )}
        </div>
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
