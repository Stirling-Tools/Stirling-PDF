/**
 * Free-tier Plan views (leader + member) shown before the team subscribes to
 * Processor. Mirrors the visual language of {@code Payg.tsx} so the upgrade
 * feels like enabling a switch, not visiting a new product.
 *
 * <p><b>Free tier model (set 2026-06):</b> users only pay for
 * <em>automation</em>, <em>AI</em>, and <em>API</em> operations. Manual tools
 * — viewing, editing, signing, merging, splitting, conversion, manual OCR,
 * watermarks, compression — are unmetered, no matter where they're triggered
 * from. The distinction is the <em>type of work</em> (manual tool vs
 * automation / AI / API), not where the click happens, because automation and
 * AI also have UI surfaces. The one-time free grant (default 500) applies
 * <em>only</em> to the three billable categories — it is a lifetime allowance,
 * not a monthly one, and a team keeps any unused portion after subscribing.
 *
 * <p>Two variants:
 *   - {@link PaygFreeLeader} — visible to the team owner; includes the "Turn
 *     on Processor" CTA that opens the upgrade modal.
 *   - {@link PaygFreeMember} — read-only; surfaces the team's free-tier
 *     consumption and explains that the owner can enable Processor.
 */
import React, { useMemo, useState } from "react";
import { Stack } from "@mantine/core";
import BoltIcon from "@mui/icons-material/BoltRounded";
import AllInclusiveIcon from "@mui/icons-material/AllInclusiveRounded";
import CheckIcon from "@mui/icons-material/CheckRounded";
import LockIcon from "@mui/icons-material/LockOutlined";
import { useTranslation } from "react-i18next";
import { useRenderCount } from "@app/hooks/useRenderCount";
import { useWallet } from "@app/hooks/useWallet";
// eslint-disable-next-line no-restricted-imports
import "./Payg.css";
// eslint-disable-next-line no-restricted-imports
import "./PaygFree.css";
import UpgradeModal from "./UpgradeModal";
import { DocHelp } from "./Payg";

// ─── Shared free-tier snapshot ────────────────────────────

interface FreeSnapshot {
  /** ISO yyyy-mm-dd. */
  billingPeriodStart: string;
  billingPeriodEnd: string;
  /** One-time free documents used so far (grant − remaining). */
  billableUsed: number;
  /**
   * The team's one-time free grant size in documents. Real value from the
   * wallet endpoint (pricing_policy.free_tier_units); 500 below is only the
   * pre-load placeholder for the first paint.
   */
  billableLimit: number;
}

/**
 * Read free-tier snapshot from the real {@link useWallet} hook. Falls back to
 * a zeroed view with today's billing window if the wallet hasn't loaded yet —
 * this only happens briefly on first paint; once the snapshot arrives the
 * component re-renders with real numbers. Earlier versions returned a mock
 * "62 of 500" sentinel which leaked into the rendered UI and made the page
 * look like nothing was wired up.
 */
function useFreeSnapshot(): FreeSnapshot {
  const { wallet } = useWallet();
  return useMemo(() => {
    if (wallet) {
      return {
        billingPeriodStart: wallet.billingPeriodStart,
        billingPeriodEnd: wallet.billingPeriodEnd,
        // Used = grant − remaining, derived straight from the one-time grant so
        // the free view never depends on the per-state meaning of billableUsed.
        billableUsed: Math.max(0, wallet.freeAllowance - wallet.freeRemaining),
        // The free view's ceiling IS the one-time grant size.
        billableLimit: wallet.freeAllowance,
      };
    }
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const isoDay = (d: Date) => d.toISOString().slice(0, 10);
    return {
      billingPeriodStart: isoDay(periodStart),
      billingPeriodEnd: isoDay(periodEnd),
      billableUsed: 0,
      billableLimit: 500,
    };
  }, [wallet]);
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(s)} – ${fmt(e)}`;
}

// ─── Hero usage panel (shared by leader + member) ─────────────────────────

interface FreeHeroProps {
  snap: FreeSnapshot;
}

function FreeHero({ snap }: FreeHeroProps) {
  const { t } = useTranslation();
  const pct =
    snap.billableLimit > 0
      ? Math.min(100, (snap.billableUsed / snap.billableLimit) * 100)
      : 100;
  const state =
    pct >= 100 ? "DEGRADED" : pct >= 80 ? "WARNED" : "FULL";
  const stateLabel =
    state === "DEGRADED"
      ? t("payg.free.state.limitReached", "Limit reached")
      : state === "WARNED"
        ? t("payg.free.state.approachingLimit", "Approaching limit")
        : t("payg.free.state.plentyLeft", "Plenty left");

  return (
    <div className="payg-hero" data-state={state}>
      <div className="payg-hero__inner">
        <div className="payg-hero__head-row">
          <div>
            <div className="payg-hero__eyebrow">
              {t("payg.free.hero.eyebrow", "Your free PDFs")}
            </div>
            <div className="payg-hero__figure">
              <span className="payg-hero__spend">
                {snap.billableUsed.toLocaleString()}
              </span>
              <span className="payg-hero__cap">
                {t(
                  "payg.free.hero.capSuffix",
                  "/ {{limit}} free PDFs",
                  { limit: snap.billableLimit.toLocaleString() },
                )}
              </span>
            </div>
          </div>
          <div className="payg-status" data-state={state}>
            <span className="payg-status__dot" />
            {stateLabel}
          </div>
        </div>

        <div className="payg-bar">
          <div
            className="payg-bar__fill"
            data-state={state}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="payg-hero__meta">
          <span>
            {t("payg.free.hero.metaCategories", "Automation · AI · API requests")}
          </span>
          <span className="payg-hero__meta-dot">•</span>
          <span>
            {t("payg.free.hero.neverResets", "One-time — never resets")}
          </span>
        </div>

        <DocHelp />
      </div>
    </div>
  );
}

// ─── Section header (shared) ─────────────────────────────────────────────
// Mirrors the Mantine Group + payg-header__subtitle + role pill pattern in
// Payg.tsx so the free view reads as a continuation of the subscribed view.

interface SectionHeaderProps {
  snap: FreeSnapshot;
  /** Pill text on the right. */
  pill: string;
  /** LEADER pill colour treatment. */
  leader?: boolean;
}

function SectionHeader({ snap, pill, leader }: SectionHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="payg-planhead">
      <div className="payg-planhead__top">
        <span className="payg-planhead__eyebrow">
          {t("payg.free.header.eyebrow", "Editor plan · {{period}}", {
            period: formatPeriod(snap.billingPeriodStart, snap.billingPeriodEnd),
          })}
        </span>
        <span
          className="payg-role-pill"
          data-leader={leader ? "true" : "false"}
        >
          {pill}
        </span>
      </div>

      <div className="payg-planhead__split">
        <div className="payg-planhead__col">
          <div className="payg-planhead__lbl payg-planhead__lbl--free">
            <AllInclusiveIcon
              className="payg-planhead__lbl-icon"
              fontSize="small"
            />
            {t("payg.free.header.freeLabel", "Always free")}
          </div>
          <p className="payg-planhead__title">
            {t("payg.free.header.freeTitle", "Unlimited PDF editing")}
          </p>
          <p className="payg-planhead__body">
            {t(
              "payg.free.header.freeBody",
              "View, edit, merge, split, sign, watermark, compress, convert and manual OCR — as much as you want, no matter where you trigger it.",
            )}
          </p>
        </div>

        <div className="payg-planhead__col payg-planhead__col--meter">
          <div className="payg-planhead__lbl payg-planhead__lbl--meter">
            <BoltIcon className="payg-planhead__lbl-icon" fontSize="small" />
            {t("payg.free.header.meterLabel", "Metered")}
          </div>
          <p className="payg-planhead__title">
            {t("payg.free.header.meterTitle", "Automation · AI · API")}
          </p>
          <p className="payg-planhead__body">
            {t(
              "payg.free.header.meterBody",
              "{{limit}} free PDFs to start, then simple pay-as-you-go with Processor.",
              { limit: snap.billableLimit.toLocaleString() },
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Free LEADER: hero + upgrade CTA + what's free explainer ─────────────

export interface PaygFreeLeaderProps {
  /**
   * Called when the user finishes the {@link UpgradeModal} checkout flow.
   * Plumbed up to {@code PlanSection} so the page can flip to the subscribed
   * view immediately. When undefined we fall back to a demo {@code alert} so
   * the dev preview route still works in isolation.
   */
  onUpgraded?: (result: { capUsd: number | null }) => void;
}

function PaygFreeLeaderInner({ onUpgraded }: PaygFreeLeaderProps = {}) {
  useRenderCount("PaygFreeLeader");
  const { t } = useTranslation();
  const snap = useFreeSnapshot();
  const { wallet } = useWallet();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div className="payg">
      <Stack gap="md">
        <SectionHeader
          snap={snap}
          pill={t("payg.role.leader", "Team owner")}
          leader
        />

        <FreeHero snap={snap} />

        <div className="paygf-cta">
          <div className="paygf-cta__heading-row">
            <BoltIcon className="paygf-cta__icon" />
            <div className="paygf-cta__heading-text">
              <h3 className="paygf-cta__title">
                {t(
                  "payg.free.cta.title",
                  "Turn on the Processor plan",
                )}
              </h3>
              <p className="paygf-cta__subtitle">
                {t(
                  "payg.free.cta.subtitle",
                  "Keep going past your {{limit}} free PDFs with automation, AI, and the API. Set a monthly ceiling — you stay in control.",
                  { limit: snap.billableLimit.toLocaleString() },
                )}
              </p>
            </div>
          </div>

          <ul className="paygf-cta__benefits">
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>
                  {t(
                    "payg.free.cta.benefit1Title",
                    "Automation pipelines",
                  )}
                </strong>
                {" — "}
                {t(
                  "payg.free.cta.benefit1Body",
                  "chain tools, schedule runs, batch process",
                )}
              </span>
            </li>
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>
                  {t("payg.free.cta.benefit2Title", "AI tools")}
                </strong>
                {" — "}
                {t(
                  "payg.free.cta.benefit2Body",
                  "summarise, classify, redact, AI-OCR",
                )}
              </span>
            </li>
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>
                  {t("payg.free.cta.benefit3Title", "API access")}
                </strong>
                {" — "}
                {t(
                  "payg.free.cta.benefit3Body",
                  "call any Stirling endpoint programmatically",
                )}
              </span>
            </li>
          </ul>

          <div className="paygf-cta__footer">
            <button
              type="button"
              className="paygf-cta__button"
              onClick={() => setUpgradeOpen(true)}
              data-testid="turn-on-processor"
            >
              {t("payg.free.cta.button", "Turn on Processor →")}
            </button>
            <span className="paygf-cta__reassurance">
              {t(
                "payg.free.cta.reassurance",
                "No minimum · Set a $0 cap to test · Cancel anytime",
              )}
            </span>
          </div>
        </div>

      </Stack>

      {wallet?.teamId != null && (
        <UpgradeModal
          open={upgradeOpen}
          teamId={wallet.teamId}
          freeLimit={snap.billableLimit}
          pricePerDocMinor={wallet.pricePerDocMinor}
          rateCurrency={wallet.currency}
          onClose={() => setUpgradeOpen(false)}
          onComplete={({ capUsd }) => {
            setUpgradeOpen(false);
            if (onUpgraded) {
              onUpgraded({ capUsd });
            } else {
              // Standalone fallback (dev preview route renders without a parent
              // handler). Real flow always passes onUpgraded via PlanSection.
              // eslint-disable-next-line no-alert
              alert(
                `Demo: subscription complete. Cap = ${
                  capUsd === null ? "no cap" : `$${capUsd}/mo`
                }.`,
              );
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Free MEMBER: hero + ask-owner note (no CTA) ─────────────────────────

function PaygFreeMemberInner() {
  useRenderCount("PaygFreeMember");
  const { t } = useTranslation();
  const snap = useFreeSnapshot();

  return (
    <div className="payg">
      <Stack gap="md">
        <SectionHeader snap={snap} pill={t("payg.role.member", "Member")} />

        <FreeHero snap={snap} />

        <div className="paygf-member-note">
          <LockIcon className="paygf-member-note__icon" />
          <div>
            <h3 className="paygf-member-note__title">
              {t(
                "payg.free.member.title",
                "Need to process more than your {{limit}} free PDFs?",
                { limit: snap.billableLimit.toLocaleString() },
              )}
            </h3>
            <p className="paygf-member-note__body">
              {t(
                "payg.free.member.body",
                "Your team owner can enable the Processor plan and set a monthly ceiling. Until then, manual tools are free for you to use as much as you like — automation, AI, and API work shares the team's one-time allowance of {{limit}} free PDFs.",
                { limit: snap.billableLimit.toLocaleString() },
              )}
            </p>
          </div>
        </div>

      </Stack>
    </div>
  );
}


// React.memo so Plan re-rendering on loading/error toggles doesn't cascade
// down to these leaves. Plan passes a stable onUpgraded callback (hoisted in
// Plan.tsx) so the prop identity stays stable across wallet refetches.
export const PaygFreeLeader = React.memo(PaygFreeLeaderInner);
export const PaygFreeMember = React.memo(PaygFreeMemberInner);
