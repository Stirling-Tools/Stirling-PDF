import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Avatar, NavSurface, ProgressBar } from "@app/ui";
import { BrandMark } from "@app/components/shared/BrandMark";
import { type AppSwitchTarget } from "@app/components/shared/AppSwitch";
import "@app/components/shared/navFooter/NavFooter.css";

export interface NavFooterCredits {
  /** Free credits still available to spend. */
  remaining: number;
  /** Size of the free allowance — the "of N" denominator. */
  total: number;
}

export interface NavFooterAppLink {
  /** The app this footer is NOT in — the one the row opens. */
  app: AppSwitchTarget;
  onOpen: () => void;
}

export interface NavFooterProps {
  /** Name shown next to the avatar, and the source of its initials fallback. */
  displayName: string;
  /** Profile picture; initials are drawn when absent or the URL fails to load. */
  profilePictureUrl?: string | null;
  /** Omit to render the account row as static text (no settings affordance). */
  onOpenSettings?: () => void;
  /** Null/undefined hides the meter — builds with no wallet never show it. */
  credits?: NavFooterCredits | null;
  /** Null/undefined hides the switch row — e.g. no access to the other app. */
  otherApp?: NavFooterAppLink | null;
  /** Extra rows above the account row (the self-hosted link-account CTA). */
  accountExtras?: ReactNode;
  /** Icon-rail state: labels collapse to tooltips. */
  collapsed?: boolean;
  className?: string;
}

/** Remaining-credit bands, mirroring the usage meters' 80% / 100% thresholds. */
function creditsTone(remaining: number, total: number): string {
  if (remaining <= 0) return "danger";
  return total > 0 && remaining / total <= 0.2 ? "warning" : "success";
}

/**
 * The bottom section every sidebar ends with, shared by the editor and the
 * processor so both present the same rows. ONE surface, hairline-separated, in
 * this order:
 *
 *   1. caller-contributed rows (the self-hosted link-account CTA)
 *   2. free credits remaining
 *   3. "Open <the other app>"
 *   4. the account row — avatar, name, settings
 *
 * Purely presentational: each app resolves its own identity, wallet and
 * app-switch access and passes them in, so this file carries no build-specific
 * gating. A row whose data is absent is dropped along with its divider rather
 * than rendered empty.
 */
export function NavFooter({
  displayName,
  profilePictureUrl,
  onOpenSettings,
  credits,
  otherApp,
  accountExtras,
  collapsed = false,
  className,
}: NavFooterProps) {
  const { t } = useTranslation();

  const settingsLabel = t("fileSidebar.openSettings", "Open settings");
  const accountLabel = onOpenSettings
    ? `${displayName} - ${settingsLabel}`
    : displayName;

  // One surface, hairline-separated rows. Built as a list so only the rows this
  // build actually shows get a divider between them — an absent row must not
  // leave a stray line behind.
  const rows: Array<{ key: string; node: ReactNode }> = [];

  if (accountExtras) rows.push({ key: "extras", node: accountExtras });

  if (credits) {
    rows.push({
      key: "credits",
      node: (
        <CreditsRow
          credits={credits}
          collapsed={collapsed}
          label={t("navFooter.credits.label", "Free credits")}
        />
      ),
    });
  }

  if (otherApp) {
    rows.push({
      key: "switch",
      node: (
        <Tooltip
          label={openAppLabel(otherApp.app, t)}
          position="right"
          withinPortal
          disabled={!collapsed}
        >
          <button
            type="button"
            className="sui-nav-footer__row"
            onClick={() => otherApp.onOpen()}
            // Collapsed drops the visible label, so name the button here too.
            aria-label={openAppLabel(otherApp.app, t)}
          >
            <span className="sui-nav-footer__row-icon" aria-hidden>
              <BrandMark height="1.125rem" />
            </span>
            {!collapsed && (
              <>
                <span className="sui-nav-footer__row-label">
                  {openAppLabel(otherApp.app, t)}
                </span>
                {/* Same leaving-this-app cue the file rail uses for "Browse all
                    files & folders". */}
                <span className="sui-nav-footer__trailing" aria-hidden>
                  <OpenInNewIcon sx={{ fontSize: "1rem" }} />
                </span>
              </>
            )}
          </button>
        </Tooltip>
      ),
    });
  }

  rows.push({
    key: "account",
    node: (
      <Tooltip
        label={accountLabel}
        position="right"
        withinPortal
        disabled={!collapsed}
      >
        <button
          type="button"
          className="sui-nav-footer__row sui-nav-footer__account"
          // Called with no args: handlers that take optional params (the
          // processor's openSettings(section?)) must not receive the event.
          onClick={onOpenSettings ? () => onOpenSettings() : undefined}
          disabled={!onOpenSettings}
          data-testid={onOpenSettings ? "config-button" : undefined}
          data-tour={onOpenSettings ? "config-button" : undefined}
          aria-label={accountLabel}
        >
          {/* Decorative: the button's own label already names the account, so
              an alt/label here would just repeat it to a screen reader. */}
          <span aria-hidden>
            <Avatar
              size="sm"
              name={displayName}
              src={profilePictureUrl ?? undefined}
            />
          </span>
          {!collapsed && (
            <span className="sui-nav-footer__row-label sidebar-content-fade">
              {displayName}
            </span>
          )}
          {onOpenSettings && !collapsed && (
            <span className="sui-nav-footer__trailing" aria-hidden>
              <GearIcon />
            </span>
          )}
        </button>
      </Tooltip>
    ),
  });

  return (
    <NavSurface
      className={["sui-nav-footer", className ?? ""].filter(Boolean).join(" ")}
      data-collapsed={collapsed || undefined}
    >
      {rows.map((row, i) => (
        <div key={row.key} className="sui-nav-footer__slot">
          {i > 0 && (
            <div className="sui-nav-footer__divider" role="separator" />
          )}
          {row.node}
        </div>
      ))}
    </NavSurface>
  );
}

function openAppLabel(
  app: AppSwitchTarget,
  t: (key: string, fallback: string) => string,
): string {
  return app === "editor"
    ? t("navFooter.openEditor", "Open PDF Editor")
    : t("navFooter.openProcessor", "Open PDF Processor");
}

function CreditsRow({
  credits,
  collapsed,
  label,
}: {
  credits: NavFooterCredits;
  collapsed: boolean;
  label: string;
}) {
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

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
