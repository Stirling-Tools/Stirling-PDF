import type { ReactNode } from "react";

export type MeterRowTone = "free" | "paid" | "warn";

export interface MeterRowProps {
  /** The product's name on a measuring surface: "Users", "Processor". */
  name: string;
  /** The middle line. Never re-prices what the plan identity above already carries. */
  mid: ReactNode;
  /** The right-hand fact, e.g. "34 of 100 users". Tabular, so rows align down the column. */
  fact: ReactNode;
  /** 0-100. Ignored when {@link showTrack} is false. */
  pct?: number;
  tone?: MeterRowTone;
  /**
   * False when there is no denominator: a track would then draw full or empty, and both claim
   * headroom that an absent limit cannot support.
   */
  showTrack?: boolean;
  /** The door at the row's right. */
  door?: ReactNode;
  onDoor?: () => void;
  /** Tooltip on the middle line, for a fact that needs one qualifier and no more. */
  midTitle?: string;
}

/**
 * One product, as a row: a fact with its door at the right, which is how this screen sells.
 *
 * <p>The door is styled as a link but is a real {@code <button>}, so it keeps the keyboard and
 * screen-reader behaviour a styled span would lose.
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
