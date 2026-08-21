import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SettingsIcon from "@mui/icons-material/Settings";
import { Avatar, NavSurface } from "@app/ui";
import { BrandMark } from "@app/components/shared/BrandMark";
import { type AppSwitchTarget } from "@app/components/shared/AppSwitch";
import {
  NavFooterCreditsRow,
  type NavFooterCredits,
} from "@app/components/shared/navFooter/NavFooterCreditsRow";
import "@app/components/shared/navFooter/NavFooter.css";

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
  /** Opens the plan surface from the credits row; omit to leave it inert. */
  onOpenPlan?: () => void;
  /** Null/undefined hides the switch row — e.g. no access to the other app. */
  otherApp?: NavFooterAppLink | null;
  /** Extra rows above the account row (the self-hosted link-account CTA). */
  accountExtras?: ReactNode;
  /** Icon-rail state: labels collapse to tooltips. */
  collapsed?: boolean;
  className?: string;
}

/**
 * Whether the enter animation has already played this page session. The rows
 * are seeded from cache now, so they're present from first paint and every
 * later mount — switching apps, remounting a view — would otherwise replay the
 * animation on content that never changed, which reads as the UI twitching.
 */
let hasPlayedEnter = false;

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
 * gating. A row whose data is absent is dropped, and so is the separator that
 * would have sat beside it.
 */
export function NavFooter({
  displayName,
  profilePictureUrl,
  onOpenSettings,
  credits,
  onOpenPlan,
  otherApp,
  accountExtras,
  collapsed = false,
  className,
}: NavFooterProps) {
  const { t } = useTranslation();
  const [animate] = useState(() => {
    if (hasPlayedEnter) return false;
    hasPlayedEnter = true;
    return true;
  });

  const settingsLabel = t("fileSidebar.openSettings", "Open settings");
  const accountLabel = onOpenSettings
    ? `${displayName} - ${settingsLabel}`
    : displayName;

  // One surface, hairline-separated rows. Each row gets a slot; the separators
  // are drawn by CSS between adjacent NON-EMPTY slots (see NavFooter.css), so a
  // row that renders nothing — the link-account CTA returns null once the org is
  // linked, and an element is truthy even then — can't leave a line behind.
  const rows: Array<{ key: string; node: ReactNode }> = [];

  if (accountExtras) rows.push({ key: "extras", node: accountExtras });

  if (credits) {
    rows.push({
      key: "credits",
      node: (
        <NavFooterCreditsRow
          credits={credits}
          collapsed={collapsed}
          label={t("navFooter.credits.label", "Free credits")}
          onOpen={onOpenPlan}
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
            className="nav-footer__row"
            onClick={() => otherApp.onOpen()}
            // Collapsed drops the visible label, so name the button here too.
            aria-label={openAppLabel(otherApp.app, t)}
          >
            <span className="nav-footer__row-icon" aria-hidden>
              <BrandMark height="1.125rem" />
            </span>
            {!collapsed && (
              <>
                <span className="nav-footer__row-label">
                  {openAppLabel(otherApp.app, t)}
                </span>
                {/* "Takes you there", not "opens a new tab" — both apps are
                    one SPA, so this navigates in place. */}
                <span className="nav-footer__trailing" aria-hidden>
                  <ArrowForwardIcon sx={{ fontSize: "1rem" }} />
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
          className="nav-footer__row nav-footer__account"
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
            <span className="nav-footer__row-label sidebar-content-fade">
              {displayName}
            </span>
          )}
          {onOpenSettings && !collapsed && (
            <span className="nav-footer__trailing" aria-hidden>
              <SettingsIcon sx={{ fontSize: "1.1rem" }} />
            </span>
          )}
        </button>
      </Tooltip>
    ),
  });

  return (
    <NavSurface
      className={["nav-footer", className ?? ""].filter(Boolean).join(" ")}
      data-collapsed={collapsed || undefined}
      data-animate={animate || undefined}
    >
      {rows.map((row) => (
        <div key={row.key} className="nav-footer__slot">
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
