import type { ReactNode } from "react";

export type MeterRowTone = "free" | "paid" | "warn";

export interface MeterRowProps {
  /** The product's name on a measuring surface: "Users", "Processor". */
  name: string;
  /**
   * The middle line. Deliberately never re-prices what the plan identity already carries: each
   * fact is printed once on this screen, and the identity is where the plan's price lives.
   */
  mid: ReactNode;
  /** The right-hand fact, e.g. "34 of 100 users". Tabular so rows align down the column. */
  fact: ReactNode;
  /** 0-100. Ignored when {@link showTrack} is false. */
  pct?: number;
  tone?: MeterRowTone;
  /**
   * Hidden when there is nothing to meter against. A track with no denominator would draw either
   * full or empty, and both are claims about headroom that an absent limit cannot support.
   */
  showTrack?: boolean;
  /** The door at the row's right. A text link: this row's whole job is a fact with its door. */
  door?: ReactNode;
  onDoor?: () => void;
  /** Tooltip on the middle line, for a fact that needs one qualifier and no more. */
  midTitle?: string;
}

/**
 * One product, as a row.
 *
 * <p>The design's central move on this screen: the meters ARE the upgrade. A row is a fact with
 * its door at the right, which is the shape that actually sold capacity, so separate upgrade rows
 * and card footer buttons are both gone. Users sells Team capacity; Processor sells activation
 * while off and governs spend while on.
 *
 * <p>The door is a link rather than a button because a button here reads as the retired upgrade
 * pattern. It is still a real {@code <button>} element, so it keeps keyboard and screen-reader
 * behaviour that a styled span would lose.
 */
export function MeterRow({
  name,
  mid,
  fact,
  pct = 0,
  tone = "free",
  showTrack = true,
  door,
  onDoor,
  midTitle,
}: MeterRowProps) {
  const cls = `billing-meter${tone === "paid" ? " billing-meter--paid" : tone === "warn" ? " billing-meter--warn" : ""}`;
  return (
    <div className={cls}>
      <span className="billing-meter__dot" aria-hidden />
      <span className="billing-meter__name">{name}</span>
      <span className="billing-meter__mid" title={midTitle}>
        {mid}
      </span>
      {showTrack ? (
        <span
          className="billing-meter__track"
          role="img"
          aria-label={`${name}: ${typeof fact === "string" ? fact : ""}`}
        >
          <span
            className="billing-meter__fill"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </span>
      ) : (
        <span
          className="billing-meter__track"
          aria-hidden
          style={{ visibility: "hidden" }}
        />
      )}
      <span className="billing-meter__fact">{fact}</span>
      {door ? (
        <button type="button" className="billing-meter__door" onClick={onDoor}>
          {door}
        </button>
      ) : (
        <span className="billing-meter__door" aria-hidden />
      )}
    </div>
  );
}
