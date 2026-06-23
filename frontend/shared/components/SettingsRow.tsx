import type { ReactNode } from "react";
import "@shared/components/SettingsRow.css";

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
  return (
    <div
      className={["sui-settingsrow", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className="sui-settingsrow__text">
        <span className="sui-settingsrow__label">{label}</span>
        {description && (
          <span className="sui-settingsrow__desc">{description}</span>
        )}
      </div>
      <div className="sui-settingsrow__control">{control}</div>
    </div>
  );
}
