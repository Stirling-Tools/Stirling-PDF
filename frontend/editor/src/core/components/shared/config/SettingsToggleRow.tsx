import type { ReactNode } from "react";
import { Switch, type SwitchProps } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import "@app/components/shared/config/SettingsToggleRow.css";

export interface SettingsToggleRowProps {
  label: ReactNode;
  /** Help text, shown behind the (i) that follows the label. */
  info?: ReactNode;
  /** Saved, but the server applies it on restart. */
  pending?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** The read-only cursor treatment from useLoginRequired. */
  styles?: SwitchProps["styles"];
  /** An unmet prerequisite, shown under the label. */
  note?: ReactNode;
  /** Controls this toggle reveals when it is on. */
  children?: ReactNode;
}

/**
 * One on/off setting: label left, switch hard right.
 *
 * Every settings toggle routes through this, so the side, label weight and
 * badge order cannot drift again. Row spacing is the parent Stack's job.
 */
export function SettingsToggleRow({
  label,
  info,
  pending = false,
  checked,
  onChange,
  disabled = false,
  styles,
  note,
  children,
}: SettingsToggleRowProps) {
  return (
    <div className="settings-toggle">
      <div className="settings-toggle__row">
        <span className="settings-toggle__label">
          <span className="settings-toggle__title">{label}</span>
          <PendingBadge show={pending} />
          {info && <InfoTooltip label={info} />}
        </span>
        <Switch
          className="settings-toggle__control"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          disabled={disabled}
          styles={styles}
        />
      </div>
      {note && <p className="settings-toggle__note">{note}</p>}
      {children}
    </div>
  );
}
