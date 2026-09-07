import type { ReactNode } from "react";
import { Tooltip, type FloatingPosition } from "@mantine/core";
import "@app/ui/InfoTooltip.css";

export interface InfoTooltipProps {
  /** The explanation shown in the tooltip on hover/focus. */
  label: ReactNode;
  /** Accessible name for the button. Defaults to the label when it's a string. */
  ariaLabel?: string;
  /** Which side the tooltip opens on. Default "top". */
  position?: FloatingPosition;
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
  return (
    <Tooltip
      label={label}
      multiline
      w={260}
      withArrow
      position={position}
      events={{ hover: true, focus: true, touch: true }}
    >
      <button
        type="button"
        className="sui-info"
        aria-label={
          ariaLabel ?? (typeof label === "string" ? label : "More information")
        }
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
    </Tooltip>
  );
}
