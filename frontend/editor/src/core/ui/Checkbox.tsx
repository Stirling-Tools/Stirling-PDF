import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import CheckIcon from "@mui/icons-material/Check";
import "@app/ui/Checkbox.css";

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
          <CheckIcon
            className="sui-check__tick"
            sx={{ fontSize: 10 }}
          />
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
