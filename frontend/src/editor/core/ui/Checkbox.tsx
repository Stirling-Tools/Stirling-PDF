import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import "@editor/ui/Checkbox.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label?: ReactNode;
  /** Shown under the label and read as the checkbox's description. */
  description?: ReactNode;
  /**
   * Explanation behind an (i) after the label, read as the checkbox's
   * description. The (i) sits outside the `<label>`, so clicking it does not
   * toggle the checkbox.
   */
  info?: ReactNode;
  /** Optional glyph shown between the box and the label text. */
  leadingIcon?: ReactNode;
  /** Tri-state checkbox visual (still focusable + submittable, but renders the dash). */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      label,
      description,
      info,
      leadingIcon,
      indeterminate,
      className,
      id,
      "aria-describedby": describedBy,
      ...rest
    },
    ref,
  ) {
    const { t } = useTranslation();
    const descriptionId = useId();
    const infoId = useId();
    const ariaDescribedBy =
      [
        describedBy,
        description ? descriptionId : undefined,
        info ? infoId : undefined,
      ]
        .filter(Boolean)
        .join(" ") || undefined;

    const control = (
      <label
        className={[
          "sui-check",
          rest.disabled ? "sui-check--disabled" : "",
          indeterminate ? "sui-check--mixed" : "",
          info ? "" : (className ?? ""),
        ]
          .filter(Boolean)
          .join(" ")}
        htmlFor={id}
      >
        <input
          ref={(el) => {
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
            if (el) el.indeterminate = !!indeterminate;
          }}
          type="checkbox"
          id={id}
          className="sui-check__input"
          aria-describedby={ariaDescribedBy}
          {...rest}
        />
        <span className="sui-check__box" aria-hidden>
          <Icon
            name="check"
            size={10}
            strokeWidth={3}
            className="sui-check__tick"
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
            {/* Hidden from the label's text so it is not read as part of the name. */}
            {description && (
              <span
                id={descriptionId}
                className="sui-check__desc"
                aria-hidden="true"
              >
                {description}
              </span>
            )}
          </span>
        )}
      </label>
    );

    if (!info) return control;
    return (
      <span
        className={["sui-check-field", className ?? ""]
          .filter(Boolean)
          .join(" ")}
      >
        {control}
        <span id={infoId} hidden>
          {info}
        </span>
        <InfoTooltip
          label={info}
          ariaLabel={
            typeof label === "string"
              ? t("common.aboutField", "About {{field}}", { field: label })
              : t("common.moreInformation", "More information")
          }
        />
      </span>
    );
  },
);
