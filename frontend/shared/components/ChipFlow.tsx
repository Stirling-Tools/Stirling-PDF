import { Fragment } from "react";
import type { ReactNode } from "react";
import { Chip } from "@shared/components/Chip";
import type { ChipTone, ChipSize } from "@shared/components/Chip";
import "@shared/components/ChipFlow.css";

export interface ChipFlowProps {
  /** Items rendered as chips, in order. */
  items: ReactNode[];
  /** `arrow` joins chips with a → connector (pipeline look); `none` just wraps. */
  separator?: "arrow" | "none";
  tone?: ChipTone;
  size?: ChipSize;
  className?: string;
}

/**
 * A sequence of {@link Chip}s, optionally joined by arrows to read as a
 * pipeline (A → B → C). Use `separator="arrow"` for flows, `none` for a plain
 * wrapped chip list.
 */
export function ChipFlow({
  items,
  separator = "none",
  tone = "neutral",
  size = "sm",
  className,
}: ChipFlowProps) {
  return (
    <div
      className={["sui-chipflow", className ?? ""].filter(Boolean).join(" ")}
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && separator === "arrow" && (
            <span className="sui-chipflow__sep" aria-hidden>
              →
            </span>
          )}
          <Chip tone={tone} size={size}>
            {item}
          </Chip>
        </Fragment>
      ))}
    </div>
  );
}
