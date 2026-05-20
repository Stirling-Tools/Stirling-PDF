import React from "react";
import "@app/components/shared/DisabledButtonWithTooltip.css";

interface DisabledButtonWithTooltipProps {
  /** Tooltip text shown on hover */
  tooltip: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A visually disabled button that still responds to hover (showing a tooltip).
 * Mantine's disabled prop prevents pointer events entirely, so this is a plain
 * div styled to match a disabled button with a custom hover tooltip.
 */
export function DisabledButtonWithTooltip({
  tooltip,
  children,
  className,
  style,
}: DisabledButtonWithTooltipProps) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`locked-button${className ? ` ${className}` : ""}`}
        style={style}
      >
        {children}
      </div>
      {hovered && (
        <div className="locked-button-tooltip">
          {tooltip}
          <div className="locked-button-tooltip-arrow" />
        </div>
      )}
    </div>
  );
}
