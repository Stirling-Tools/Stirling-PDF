import type { ReactNode } from "react";
import { Icon } from "@editor/ui/Icon";
import { Tooltip, type TooltipPlacement } from "@editor/ui/Tooltip";
import { useTranslation } from "react-i18next";
import "@editor/ui/InfoTooltip.css";

export interface InfoTooltipProps {
  /** The explanation shown in the tooltip on hover/focus. */
  label: ReactNode;
  /** Accessible name for the button. Defaults to the label when it's a string. */
  ariaLabel?: string;
  /** Which side the tooltip opens on. Default "top". */
  position?: TooltipPlacement;
}

/**
 * The app's standard inline info affordance: a small, muted (i) that reveals supplementary text in a
 * hover/focus tooltip, without taking permanent space. Used behind form labels ({@link FormField})
 * and anywhere a control needs a hint - one implementation so every (i) reads and behaves the same.
 */
export function InfoTooltip({
  label,
  ariaLabel,
  position = "top",
}: InfoTooltipProps) {
  const { t } = useTranslation();
  return (
    <Tooltip content={label} placement={position}>
      <button
        type="button"
        className="sui-info"
        aria-label={
          ariaLabel ??
          (typeof label === "string"
            ? label
            : t("common.moreInformation", "More information"))
        }
      >
        <Icon name="info" size={14} strokeWidth={2} />
      </button>
    </Tooltip>
  );
}
