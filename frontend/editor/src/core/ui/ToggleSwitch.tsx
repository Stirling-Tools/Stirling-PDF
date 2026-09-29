import { useId } from "react";
import "@app/ui/ToggleSwitch.css";

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible label associated to the control. */
  label?: string;
  /** Names the switch from text rendered elsewhere (e.g. a SettingsRow label). */
  "aria-labelledby"?: string;
  /** Optional helper text rendered next to the label. */
  description?: string;
  /** Accessible name when the label lives outside the switch (e.g. a SettingsRow's label). */
  "aria-label"?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  /** Placed on the <label>, which is what a click has to land on to toggle. */
  "data-testid"?: string;
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
  "aria-labelledby": ariaLabelledBy,
  description,
  "aria-label": ariaLabel,
  disabled,
  size = "md",
  id,
  "data-testid": testId,
}: ToggleSwitchProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <label
      className={`sui-toggle sui-toggle--${size}${disabled ? " is-disabled" : ""}`}
      htmlFor={controlId}
      data-testid={testId}
    >
      <input
        id={controlId}
        type="checkbox"
        role="switch"
        aria-labelledby={ariaLabelledBy}
        checked={checked}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
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
