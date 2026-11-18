import type { ReactNode } from "react";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import classes from "@editor/components/tools/shared/infoLabel.module.css";

/**
 * Props to spread into a Mantine input, checkbox or segmented label so a tool field
 * carries its explanation behind an (i) instead of as text under the control.
 * Tool-panel rule: the label is a short noun phrase; the why/how goes in `info`;
 * persistent text under a control is only for live readouts, warnings and errors.
 *
 * The (i) is a button inside the field's `<label>`; clicking it opens the tooltip
 * without focusing or toggling the control, because label activation skips
 * interactive descendants.
 */
export function infoLabelProps(
  label: ReactNode,
  info?: ReactNode,
): { label: ReactNode } {
  if (!info) return { label };
  return {
    label: (
      <span className={classes.infoLabel}>
        {label}
        <InfoTooltip label={info} />
      </span>
    ),
  };
}
