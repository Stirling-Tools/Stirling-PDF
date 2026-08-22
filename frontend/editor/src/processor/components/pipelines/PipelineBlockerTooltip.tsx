import type { ReactElement } from "react";
import { Tooltip } from "@mantine/core";
import "@processor/components/pipelines/PipelineBlockerTooltip.css";

export interface PipelineBlockerTooltipProps {
  /** Short line above the list, e.g. "To create this pipeline:" / "To save your changes:". */
  heading: string;
  /** Everything still owed before the action is possible; empty means the action is allowed. */
  blockers: string[];
  /** The disabled control (wrapped so its hover still reaches the tooltip - see below). */
  children: ReactElement;
}

/**
 * Explains why a disabled save/create control can't be used yet, by listing what is still owed.
 *
 * A disabled button swallows its own pointer events, so the caller must pass a NON-disabled wrapper
 * (a span/div around the button) as the child - that wrapper is what the pointer lands on. The
 * tooltip hides itself when there is nothing to list (the action is allowed, or it is only
 * mid-save), so callers can wire it unconditionally.
 */
export function PipelineBlockerTooltip({
  heading,
  blockers,
  children,
}: PipelineBlockerTooltipProps) {
  return (
    <Tooltip
      label={
        <div className="processor-pipeline-blockers">
          <p className="processor-pipeline-blockers__heading">{heading}</p>
          <ul>
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      }
      disabled={blockers.length === 0}
      position="bottom-end"
      withinPortal
      multiline
      w={280}
    >
      {children}
    </Tooltip>
  );
}
