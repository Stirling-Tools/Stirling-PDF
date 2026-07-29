import { useId } from "react";
import "@app/ui/ToggleSwitch.css";

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible label associated to the control. */
  label?: string;
  /** Optional helper text rendered next to the label. */
  description?: string;
  /** Accessible name when the switch sits in a row that already shows its
   *  label, so no duplicate visible text is rendered. */
  ariaLabel?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
}

/**
 * 36×20 pill toggle, matched to the prototype's SettingsRow control.
 *
 * Pair with the {@link SettingsRow} component (or a custom row) when you need
 * a label + description layout. Standalone, this is just the switch itself.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  ariaLabel,
  disabled,
  size = "md",
  id,
}: ToggleSwitchProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <label
      className={`sui-toggle sui-toggle--${size}${disabled ? " is-disabled" : ""}`}
      htmlFor={controlId}
    >
      <input
        id={controlId}
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="sui-toggle__track" aria-hidden>
        <span className="sui-toggle__thumb" />
      </span>
      {(label || description) && (
        <span className="sui-toggle__text">
          {label && <span className="sui-toggle__label">{label}</span>}
          {description && (
            <span className="sui-toggle__desc">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}
