import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import "@app/ui/SettingsRow.css";

export interface SettingsRowProps {
  /** Left-aligned setting name. */
  label: ReactNode;
  /** Optional secondary line under the label. */
  description?: ReactNode;
  /** Right-aligned control (toggle / select / input / button). */
  control: ReactNode;
  className?: string;
}

/**
 * Horizontal settings row: label (+ optional description) on the left, control
 * right-aligned. The companion to vertical {@link FormField} — use this for the
 * label-left/control-right settings pattern (the layout ToggleSwitch's docs
 * point at). Stack rows inside a {@code Card padding="none"} for a settings list.
 */
export function SettingsRow({
  label,
  description,
  control,
  className,
}: SettingsRowProps) {
  const labelId = useId();
  // The row's label is plain text beside the control, not a <label> for it, so
  // the control is named by pointing back at it — unless the caller named it.
  const namedControl =
    isValidElement<{ "aria-label"?: string; "aria-labelledby"?: string }>(
      control,
    ) &&
    !control.props["aria-label"] &&
    !control.props["aria-labelledby"]
      ? cloneElement(control, { "aria-labelledby": labelId })
      : control;

  return (
    <div
      className={["sui-settingsrow", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className="sui-settingsrow__text">
        <span id={labelId} className="sui-settingsrow__label">
          {label}
        </span>
        {description && (
          <span className="sui-settingsrow__desc">{description}</span>
        )}
      </div>
      <div className="sui-settingsrow__control">{namedControl}</div>
    </div>
  );
}
