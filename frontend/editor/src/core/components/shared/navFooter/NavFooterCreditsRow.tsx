import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { ProgressBar } from "@app/ui";
import "@app/components/shared/navFooter/NavFooterCreditsRow.css";

export interface NavFooterCredits {
  /** Free credits still available to spend. */
  remaining: number;
  /** Size of the free allowance — the "of N" denominator. */
  total: number;
}

/** Remaining-credit bands, mirroring the usage meters' 80% / 100% thresholds. */
function creditsTone(remaining: number, total: number): string {
  if (remaining <= 0) return "danger";
  return total > 0 && remaining / total <= 0.2 ? "warning" : "success";
}

interface NavFooterCreditsRowProps {
  credits: NavFooterCredits;
  /** Icon rail: the figures drop and the bar alone carries the state. */
  collapsed: boolean;
  /** Row label, passed in so the meter owns no copy of its own. */
  label: string;
}

/**
 * The free-credits meter as it appears in the sidebar footer: a state dot, the
 * label, "X of Y" remaining, and a fill bar underneath. Figures are clamped
 * here so a wallet that reports more remaining than the allowance (or negative)
 * can't overflow the bar.
 *
 * Rendered as a {@code sui-nav-footer__row}, so it inherits that row's metrics
 * from NavFooter.css and only brings its own meter styling.
 */
export function NavFooterCreditsRow({
  credits,
  collapsed,
  label,
}: NavFooterCreditsRowProps) {
  const { t } = useTranslation();
  const total = Math.max(0, credits.total);
  const remaining = Math.min(Math.max(0, credits.remaining), total);
  const tone = creditsTone(remaining, total);
  const count = t("navFooter.credits.count", "{{remaining}} of {{total}}", {
    remaining: remaining.toLocaleString(),
    total: total.toLocaleString(),
  });

  return (
    <Tooltip
      label={`${label}: ${count}`}
      position="right"
      withinPortal
      disabled={!collapsed}
    >
      <div className="sui-nav-footer__row sui-nav-footer__credits">
        {!collapsed && (
          <div className="sui-nav-footer__credits-head">
            <span
              className="sui-nav-footer__dot"
              data-tone={tone}
              aria-hidden
            />
            <span className="sui-nav-footer__credits-label">{label}</span>
            <span className="sui-nav-footer__credits-count">{count}</span>
          </div>
        )}
        <ProgressBar
          value={total > 0 ? remaining / total : 0}
          height={6}
          color={`var(--c-${tone})`}
          label={`${label}: ${count}`}
        />
      </div>
    </Tooltip>
  );
}
