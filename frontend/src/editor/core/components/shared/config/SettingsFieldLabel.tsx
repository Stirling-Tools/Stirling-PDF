import type { ReactNode } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import "@app/components/shared/config/SettingsFieldLabel.css";

export interface SettingsFieldLabelProps {
  /** Guidance for the field, revealed on hover or focus. */
  info: ReactNode;
  children: ReactNode;
}

/**
 * A settings field's label with its help text behind an (i), so a page of
 * fields stays scannable instead of a sentence deep per control.
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
