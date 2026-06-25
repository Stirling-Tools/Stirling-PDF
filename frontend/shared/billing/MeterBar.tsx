import type { ReactNode } from "react";
import type { MeterState } from "@shared/billing/format";

interface MeterBarProps {
  state: MeterState;
  /** Fill percentage 0–100. */
  pct: number;
  /** The big figure — a used count or a spend amount ("120", "$45"). */
  figure: ReactNode;
  /** Suffix after the figure ("/ 500 free PDFs", "/ $1,000 cap", "no cap"). */
  capSuffix: ReactNode;
  /** Status-chip content; null/undefined hides the chip. */
  statusLabel?: ReactNode;
  /** Footer meta line; null/undefined hides the line entirely. */
  meta?: ReactNode;
  /** Hide the fill bar (e.g. uncapped). Shown by default. */
  showBar?: boolean;
}

/**
 * The usage-meter bar (the {@code paygf-meter} block) shared by the editor cloud
 * surface and the admin portal. Callers own the copy — the editor passes i18n
 * strings, the portal passes literals — so this carries no i18n dependency.
 * Styling comes from each app's own {@code paygf-meter}/{@code payg-bar}/{@code
 * payg-status} CSS.
 */
export function MeterBar({
  state,
  pct,
  figure,
  capSuffix,
  statusLabel,
  meta,
  showBar = true,
}: MeterBarProps) {
  return (
    <div className="paygf-meter" data-state={state}>
      <div className="paygf-meter__top">
        <div className="paygf-meter__figure">
          <span className="paygf-meter__num">{figure}</span>
          <span className="paygf-meter__cap">{capSuffix}</span>
        </div>
        {statusLabel != null && (
          <span className="payg-status" data-state={state}>
            <span className="payg-status__dot" />
            {statusLabel}
          </span>
        )}
      </div>
      {showBar && (
        <div
          className="payg-bar"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="payg-bar__fill"
            data-state={state}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {meta != null && <div className="paygf-meter__meta">{meta}</div>}
    </div>
  );
}
