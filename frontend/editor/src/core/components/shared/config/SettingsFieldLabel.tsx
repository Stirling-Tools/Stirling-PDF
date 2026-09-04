import type { ReactNode } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import "@app/components/shared/config/SettingsFieldLabel.css";

export interface SettingsFieldLabelProps {
  /** The explanation that used to sit under the control as standing text. */
  info: ReactNode;
  children: ReactNode;
}

/**
 * A settings field's label with its help text folded behind an (i).
 *
 * Every field carrying a sentence of guidance made the pages scroll far more
 * than the controls themselves warranted, so the guidance moved to hover/focus.
 */
export function SettingsFieldLabel({
  info,
  children,
}: SettingsFieldLabelProps) {
  return (
    <span className="settings-field-label">
      {children}
      <InfoTooltip label={info} />
    </span>
  );
}
