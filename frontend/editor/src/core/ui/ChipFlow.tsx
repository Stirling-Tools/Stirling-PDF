import { Fragment } from "react";
import type { ReactNode } from "react";
import { Chip } from "@app/ui/Chip";
import type { ChipAccent, ChipSize } from "@app/ui/Chip";
import "@app/ui/ChipFlow.css";

export interface ChipFlowProps {
  items: ReactNode[];
  /** `arrow` joins chips with a → connector. */
  separator?: "arrow" | "none";
  tone?: ChipAccent;
  size?: ChipSize;
  className?: string;
}

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
          <Chip accent={tone} size={size}>
            {item}
          </Chip>
        </Fragment>
      ))}
    </div>
  );
}
