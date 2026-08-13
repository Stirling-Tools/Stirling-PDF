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
  const [shown, setShown] = React.useState(false);
  const tooltipId = React.useId();
  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
    >
      {/* The point of this control is to look disabled while still explaining
          why. That explanation has to reach a keyboard as well as a pointer, so
          the element stays focusable and announces itself as a disabled button
          described by its own tooltip. */}
      <div
        className={`locked-button${className ? ` ${className}` : ""}`}
        style={style}
        role="button"
        aria-disabled="true"
        aria-describedby={tooltipId}
        tabIndex={0}
        onFocus={() => setShown(true)}
        onBlur={() => setShown(false)}
      >
        {children}
      </div>
      <div
        id={tooltipId}
        role="tooltip"
        className="locked-button-tooltip"
        style={shown ? undefined : { display: "none" }}
      >
        {tooltip}
        <div className="locked-button-tooltip-arrow" />
      </div>
    </div>
  );
}
