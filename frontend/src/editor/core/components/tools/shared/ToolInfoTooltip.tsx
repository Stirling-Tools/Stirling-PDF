import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Icon } from "@editor/ui/Icon";
import "@editor/ui/InfoTooltip.css";

export interface ToolInfoTooltipProps {
  label: ReactNode;
  /** Defaults to the label when it is a string. */
  ariaLabel?: string;
  position?: "top" | "bottom" | "left" | "right";
}

/**
 * The (i) behind a tool field or control. Tool panels use the app Tooltip rather
 * than Mantine's so every tooltip in a tool reads the same as the step tooltips;
 * this one stays a plain anchored tooltip, never the sidebar variant, which is
 * reserved for a tool's major help sections.
 */
export function ToolInfoTooltip({
  label,
  ariaLabel,
  position = "top",
}: ToolInfoTooltipProps) {
  const { t } = useTranslation();
  return (
    <Tooltip content={label} position={position} maxWidth={260} arrow>
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
