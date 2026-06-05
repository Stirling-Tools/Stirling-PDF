import { useId } from "react";
import "@shared/components/ToggleSwitch.css";

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible label associated to the control. */
  label?: string;
  /** Optional helper text rendered next to the label. */
  description?: string;
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
