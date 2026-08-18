import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { ProgressBar, Spinner } from "@app/ui";
import "@app/components/shared/navFooter/NavFooterCreditsRow.css";

/**
 * Either the figures, or "this team is on the free plan but the wallet hasn't
 * answered yet". The loading arm exists so the row can hold its space from
 * first paint instead of appearing later and shoving the rows below it down.
 */
export type NavFooterCredits =
  | { state: "loading" }
  | {
      state: "ready";
      /** Free credits still available to spend. */
      remaining: number;
      /** Size of the free allowance — the "of N" denominator. */
      total: number;
    };

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
  /** Opens the plan surface. Omit to render the meter as inert text. */
  onOpen?: () => void;
}

/**
 * The free-credits meter as it appears in the sidebar footer: a state dot, the
 * label, "X of Y" remaining, and a fill bar underneath. Figures are clamped
 * here so a wallet that reports more remaining than the allowance (or negative)
 * can't overflow the bar.
 *
 * Rendered as a {@code nav-footer__row}, so it inherits that row's metrics
 * from NavFooter.css and only brings its own meter styling.
 */
export function NavFooterCreditsRow({
  credits,
  collapsed,
  label,
  onOpen,
}: NavFooterCreditsRowProps) {
  const { t } = useTranslation();

  if (credits.state === "loading") {
    return (
      <Row onOpen={onOpen} label={label}>
        {!collapsed && (
          <div className="nav-footer__credits-head">
            <span className="nav-footer__dot" data-tone="loading" aria-hidden />
            <span className="nav-footer__credits-label">{label}</span>
            <Spinner size="sm" label={t("loading", "Loading")} />
          </div>
        )}
        {/* Same height as the real bar, so nothing moves when it resolves. */}
        <div className="nav-footer__credits-track" aria-hidden />
      </Row>
    );
  }

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
      <Row onOpen={onOpen} label={`${label}: ${count}`}>
        {!collapsed && (
          <div className="nav-footer__credits-head">
            <span className="nav-footer__dot" data-tone={tone} aria-hidden />
            <span className="nav-footer__credits-label">{label}</span>
            <span className="nav-footer__credits-count">{count}</span>
          </div>
        )}
        <ProgressBar
          value={total > 0 ? remaining / total : 0}
          height={6}
          color={`var(--c-${tone})`}
          label={`${label}: ${count}`}
        />
      </Row>
    </Tooltip>
  );
}

/**
 * The meter is a button only where there is a plan surface to open — otherwise
 * it stays a plain div, so a build with nowhere to go doesn't advertise a
 * click that does nothing.
 */
function Row({
  onOpen,
  label,
  children,
}: {
  onOpen?: () => void;
  label: string;
  children: ReactNode;
}) {
  const className = `nav-footer__row nav-footer__credits${
    onOpen ? " nav-footer__credits--actionable" : ""
  }`;
  if (!onOpen) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      className={className}
      onClick={() => onOpen()}
      aria-label={label}
    >
      {children}
    </button>
  );
}
