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
 * <p>Layout: a slim <b>Editor plan</b> card (always-free tools only — no dates,
 * no metered split) on top, then a single <b>Processor plan</b> card that
 * two-columns the upgrade pitch + benefits (left) against the one-time free
 * meter stacked over the call-to-action (right).
 *
 * <p>Two variants:
 *   - {@link PaygFreeLeader} — the right column's CTA opens the upgrade modal.
 *   - {@link PaygFreeMember} — read-only; the CTA is replaced with an
 *     ask-the-owner note.
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
// eslint-disable-next-line no-restricted-imports
import UpgradeModal from "./UpgradeModal";
// eslint-disable-next-line no-restricted-imports
import { DocHelp } from "./Payg";

// ─── Shared free-tier snapshot ────────────────────────────

export interface FreeSnapshot {
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
 * a zeroed view if the wallet hasn't loaded yet — this only happens briefly on
 * first paint; once the snapshot arrives the component re-renders with real
 * numbers. Earlier versions returned a mock "62 of 500" sentinel which leaked
 * into the rendered UI and made the page look like nothing was wired up.
 */
export function useFreeSnapshot(): FreeSnapshot {
  const { wallet } = useWallet();
  return useMemo(() => {
    if (wallet) {
      return {
        // Used = grant − remaining, derived straight from the one-time grant so
        // the free view never depends on the per-state meaning of billableUsed.
        billableUsed: Math.max(0, wallet.freeAllowance - wallet.freeRemaining),
        // The free view's ceiling IS the one-time grant size.
        billableLimit: wallet.freeAllowance,
      };
    }
    return { billableUsed: 0, billableLimit: 500 };
  }, [wallet]);
}

type MeterState = "FULL" | "WARNED" | "DEGRADED";

/** Warn/degrade band for the one-time grant meter (mirrors the BE thresholds). */
function meterState(
  used: number,
  limit: number,
): { state: MeterState; pct: number } {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  const state: MeterState =
    pct >= 100 ? "DEGRADED" : pct >= 80 ? "WARNED" : "FULL";
  return { state, pct };
}

// ─── Editor plan card (always-free tools only) ────────────────────────────

interface EditorPlanCardProps {
  /** Role pill text on the right. */
  pill: string;
  /** LEADER pill colour treatment. */
  leader?: boolean;
}

/**
 * The top card: the free Editor plan. Manual tools only, no billing window —
 * the one-time grant lives in the Processor card below, so there's no period
 * to show here.
 */
function EditorPlanCard({ pill, leader }: EditorPlanCardProps) {
  const { t } = useTranslation();
  return (
    <div className="payg-planhead paygf-editorcard">
      <div className="payg-planhead__top">
        <span className="payg-planhead__lbl payg-planhead__lbl--free paygf-editorcard__eyebrow">
          <AllInclusiveIcon
            className="payg-planhead__lbl-icon"
            fontSize="small"
          />
          {t("payg.free.editor.eyebrow", "Editor plan · Always free")}
        </span>
        <span
          className="payg-role-pill"
          data-leader={leader ? "true" : "false"}
        >
          {pill}
        </span>
      </div>
      <p className="payg-planhead__title">
        {t("payg.free.header.freeTitle", "Unlimited PDF editing")}
      </p>
      <p className="payg-planhead__body">
        {t(
          "payg.free.header.freeBody",
          "View, edit, merge, split, sign, watermark, compress, convert and manual OCR, as much as you want, no matter where you trigger it.",
        )}
      </p>
    </div>
  );
}

// ─── Compact one-time free meter (right column of the Processor card) ──────

export function FreeMeterPanel({ snap }: { snap: FreeSnapshot }) {
  const { t } = useTranslation();
  const { state, pct } = meterState(snap.billableUsed, snap.billableLimit);
  const stateLabel =
    state === "DEGRADED"
      ? t("payg.free.state.limitReached", "Limit reached")
      : state === "WARNED"
        ? t("payg.free.state.approachingLimit", "Approaching limit")
        : t("payg.free.state.plentyLeft", "Plenty left");

  return (
    <div className="paygf-meter" data-state={state}>
      <div className="paygf-meter__top">
        <div className="paygf-meter__figure">
          <span className="paygf-meter__num">
            {snap.billableUsed.toLocaleString()}
          </span>
          <span className="paygf-meter__cap">
            {t("payg.free.hero.capSuffix", "/ {{limit}} free PDFs", {
              limit: snap.billableLimit.toLocaleString(),
            })}
          </span>
        </div>
        <span className="payg-status" data-state={state}>
          <span className="payg-status__dot" />
          {stateLabel}
        </span>
      </div>

      <div className="payg-bar">
        <div
          className="payg-bar__fill"
          data-state={state}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="paygf-meter__meta">
        <span>
          {t("payg.free.hero.metaCategories", "Automation · AI · API requests")}
        </span>
        <span className="payg-hero__meta-dot">•</span>
        <span>
          {t("payg.free.hero.neverResets", "One-time — never resets")}
        </span>
      </div>
    </div>
  );
}

// ─── Processor plan card (two-column: pitch + benefits | meter + CTA) ──────

interface ProcessorCardProps {
  snap: FreeSnapshot;
  /** Leaders get the live CTA; members get the ask-owner note. */
  isLeader: boolean;
  /** Opens the upgrade modal — leader only. */
  onTurnOn?: () => void;
}

function ProcessorCard({ snap, isLeader, onTurnOn }: ProcessorCardProps) {
  const { t } = useTranslation();
  return (
    <div className="paygf-cta paygf-proc">
      <span className="paygf-proc__eyebrow">
        <BoltIcon className="payg-planhead__lbl-icon" fontSize="small" />
        {t("payg.free.proc.eyebrow", "Processor plan · metered")}
      </span>

      <div className="paygf-proc__split">
        <div className="paygf-proc__pitch">
          <h3 className="paygf-cta__title">
            {t("payg.free.cta.title", "Turn on the Processor plan")}
          </h3>
          <p className="paygf-cta__subtitle">
            {t(
              "payg.free.cta.subtitle",
              "Keep going past your {{limit}} free PDFs with automation, AI, and the API. Set a monthly ceiling, so you stay in control.",
              { limit: snap.billableLimit.toLocaleString() },
            )}
          </p>

          <ul className="paygf-cta__benefits paygf-proc__benefits">
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>
                  {t("payg.free.cta.benefit1Title", "Automation pipelines")}
                </strong>
                {": "}
                {t(
                  "payg.free.cta.benefit1Body",
                  "chain tools, schedule runs, batch process",
                )}
              </span>
            </li>
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>{t("payg.free.cta.benefit2Title", "AI tools")}</strong>
                {": "}
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
<<<<<<< HEAD
                {": "}
=======
                {" — "}
>>>>>>> 33026e1a82750450b4f4bd8079da687a463a3b52
                {t(
                  "payg.free.cta.benefit3Body",
                  "call any Stirling endpoint programmatically",
                )}
              </span>
            </li>
          </ul>

          <DocHelp />
        </div>

        <div className="paygf-proc__aside">
          <FreeMeterPanel snap={snap} />
          {isLeader ? (
            <>
              <button
                type="button"
                className="paygf-cta__button paygf-proc__cta"
                onClick={onTurnOn}
                data-testid="turn-on-processor"
              >
                {t("payg.free.cta.button", "Turn on Processor →")}
              </button>
              <span className="paygf-cta__reassurance paygf-proc__reassure">
                {t(
                  "payg.free.cta.reassurance",
                  "No minimum · Set a $0 cap to test · Cancel anytime",
                )}
              </span>
            </>
          ) : (
            <div className="paygf-proc__membernote">
              <LockIcon
                className="paygf-proc__membernote-icon"
                fontSize="small"
              />
              <span>
                {t(
                  "payg.free.member.ownerOnly",
                  "Only your team owner can turn on Processor. Manual tools stay free for you to use as much as you like.",
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Free LEADER ──────────────────────────────────────────────────────────

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
        <EditorPlanCard pill={t("payg.role.leader", "Team owner")} leader />
        <ProcessorCard
          snap={snap}
          isLeader
          onTurnOn={() => setUpgradeOpen(true)}
        />
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

// ─── Free MEMBER ──────────────────────────────────────────────────────────

function PaygFreeMemberInner() {
  useRenderCount("PaygFreeMember");
  const { t } = useTranslation();
  const snap = useFreeSnapshot();

  return (
    <div className="payg">
      <Stack gap="md">
        <EditorPlanCard pill={t("payg.role.member", "Member")} />
        <ProcessorCard snap={snap} isLeader={false} />
      </Stack>
    </div>
  );
}

// React.memo so Plan re-rendering on loading/error toggles doesn't cascade
// down to these leaves. Plan passes a stable onUpgraded callback (hoisted in
// Plan.tsx) so the prop identity stays stable across wallet refetches.
export const PaygFreeLeader = React.memo(PaygFreeLeaderInner);
export const PaygFreeMember = React.memo(PaygFreeMemberInner);
