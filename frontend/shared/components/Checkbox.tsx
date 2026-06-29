import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import "@shared/components/Checkbox.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label?: ReactNode;
  description?: ReactNode;
  /** Optional glyph shown between the box and the label text. */
  leadingIcon?: ReactNode;
  /** Tri-state checkbox visual (still focusable + submittable, but renders the dash). */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, description, leadingIcon, indeterminate, className, id, ...rest },
    ref,
  ) {
    return (
      <label
        className={[
          "sui-check",
          rest.disabled ? "sui-check--disabled" : "",
          indeterminate ? "sui-check--mixed" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        htmlFor={id}
      >
        <input
          ref={(el) => {
            if (typeof ref === "function") ref(el);
            else if (ref)
              (ref as React.MutableRefObject<HTMLInputElement | null>).current =
                el;
            if (el) el.indeterminate = !!indeterminate;
          }}
          type="checkbox"
          id={id}
          className="sui-check__input"
          {...rest}
        />
        <span className="sui-check__box" aria-hidden>
          <svg
            viewBox="0 0 16 16"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="sui-check__tick"
          >
            <polyline points="3 8.5 7 12 13 4" />
          </svg>
          <span className="sui-check__dash" />
        </span>
        {leadingIcon && (
          <span className="sui-check__icon" aria-hidden>
            {leadingIcon}
          </span>
        )}
        {(label || description) && (
          <span className="sui-check__text">
            {label && <span className="sui-check__label">{label}</span>}
            {description && (
              <span className="sui-check__desc">{description}</span>
            )}
          </span>
        )}
      </label>
    );
  },
);
