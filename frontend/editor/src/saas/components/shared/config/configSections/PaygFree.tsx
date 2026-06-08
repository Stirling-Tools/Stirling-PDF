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
 * AI also have UI surfaces. The 500/month free allowance applies <em>only</em>
 * to the three billable categories. Backend design doc + pricing schema will
 * catch up to this in a follow-up; this is the FE source of truth in the
 * meantime.
 *
 * <p>Two variants:
 *   - {@link PaygFreeLeader} — visible to the team owner; includes the "Turn
 *     on Processor" CTA that opens the upgrade modal.
 *   - {@link PaygFreeMember} — read-only; surfaces the team's free-tier
 *     consumption and explains that the owner can enable Processor.
 */
import React, { useMemo, useState } from "react";
import { Group, Stack } from "@mantine/core";
import BoltIcon from "@mui/icons-material/BoltRounded";
import CheckIcon from "@mui/icons-material/CheckRounded";
import LockIcon from "@mui/icons-material/LockOutlined";
// eslint-disable-next-line no-restricted-imports
import "./Payg.css";
// eslint-disable-next-line no-restricted-imports
import "./PaygFree.css";
import UpgradeModal from "./UpgradeModal";

// ─── Shared free-tier snapshot (mock for now) ────────────────────────────

interface FreeSnapshot {
  /** ISO yyyy-mm-dd. */
  billingPeriodStart: string;
  billingPeriodEnd: string;
  /** Automation + AI + API operations used this cycle. */
  billableUsed: number;
  /** Free-tier ceiling. Hard-coded 500 for V1; will come from pricing_policy. */
  billableLimit: number;
}

function useFreeMock(): FreeSnapshot {
  return useMemo(() => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const isoDay = (d: Date) => d.toISOString().slice(0, 10);
    return {
      billingPeriodStart: isoDay(periodStart),
      billingPeriodEnd: isoDay(periodEnd),
      billableUsed: 62,
      billableLimit: 500,
    };
  }, []);
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function daysUntil(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000),
  );
}

// ─── Hero usage panel (shared by leader + member) ─────────────────────────

interface FreeHeroProps {
  snap: FreeSnapshot;
}

function FreeHero({ snap }: FreeHeroProps) {
  const pct = Math.min(100, (snap.billableUsed / snap.billableLimit) * 100);
  const daysLeft = daysUntil(snap.billingPeriodEnd);
  const state =
    pct >= 100 ? "DEGRADED" : pct >= 80 ? "WARNED" : "FULL";
  const stateLabel =
    state === "DEGRADED"
      ? "Limit reached"
      : state === "WARNED"
        ? "Approaching limit"
        : "Plenty left";

  return (
    <div className="payg-hero" data-state={state}>
      <div className="payg-hero__inner">
        <div className="payg-hero__head-row">
          <div>
            <div className="payg-hero__eyebrow">This billing period</div>
            <div className="payg-hero__figure">
              <span className="payg-hero__spend">
                {snap.billableUsed.toLocaleString()}
              </span>
              <span className="payg-hero__cap">
                / {snap.billableLimit.toLocaleString()} free operations
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
          <span>Automation · AI · API requests</span>
          <span className="payg-hero__meta-dot">•</span>
          <span>
            {daysLeft === 1
              ? "Resets tomorrow"
              : `Resets in ${daysLeft} days`}
          </span>
        </div>
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
  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      <div className="payg-header__subtitle">
        Editor plan — manual tools are always free. Pay only for automation,
        AI &amp; API. Billing period{" "}
        {formatPeriod(snap.billingPeriodStart, snap.billingPeriodEnd)}.
      </div>
      <span className="payg-role-pill" data-leader={leader ? "true" : "false"}>
        {pill}
      </span>
    </Group>
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

export function PaygFreeLeader({ onUpgraded }: PaygFreeLeaderProps = {}) {
  const snap = useFreeMock();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div className="payg">
      <Stack gap="lg">
        <SectionHeader snap={snap} pill="Team owner" leader />

        <FreeHero snap={snap} />

        <div className="paygf-cta">
          <div className="paygf-cta__heading-row">
            <BoltIcon className="paygf-cta__icon" />
            <div className="paygf-cta__heading-text">
              <h3 className="paygf-cta__title">Turn on the Processor plan</h3>
              <p className="paygf-cta__subtitle">
                Unlock more than 500 automation, AI, and API operations per
                month. Set a monthly ceiling — you stay in control.
              </p>
            </div>
          </div>

          <ul className="paygf-cta__benefits">
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>Automation pipelines</strong> — chain tools, schedule
                runs, batch process
              </span>
            </li>
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>AI tools</strong> — summarise, classify, redact, AI-OCR
              </span>
            </li>
            <li>
              <CheckIcon className="paygf-cta__check" fontSize="small" />
              <span>
                <strong>API access</strong> — call any Stirling endpoint
                programmatically
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
              Turn on Processor →
            </button>
            <span className="paygf-cta__reassurance">
              No minimum · Set a $0 cap to test · Cancel anytime
            </span>
          </div>
        </div>

        <div className="paygf-explainer">
          <div className="paygf-explainer__col">
            <div className="paygf-explainer__label">
              <CheckIcon
                className="paygf-explainer__icon paygf-explainer__icon--free"
                fontSize="small"
              />
              Always free
            </div>
            <p className="paygf-explainer__text">
              Manual tools — viewing, editing, merging, splitting, signing,
              watermarks, compression, conversion, manual OCR. Use them as
              much as you want, no matter where you trigger them from.
            </p>
          </div>
          <div className="paygf-explainer__col">
            <div className="paygf-explainer__label">
              <BoltIcon
                className="paygf-explainer__icon paygf-explainer__icon--paid"
                fontSize="small"
              />
              Counts toward 500/month
            </div>
            <p className="paygf-explainer__text">
              Automation pipelines (chained tools, scheduled runs), AI tools
              (summaries, classification, AI-OCR), and API calls (programmatic
              access). Above 500 you'll need Processor.
            </p>
          </div>
        </div>
      </Stack>

      <UpgradeModal
        open={upgradeOpen}
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
    </div>
  );
}

// ─── Free MEMBER: hero + ask-owner note (no CTA) ─────────────────────────

export function PaygFreeMember() {
  const snap = useFreeMock();

  return (
    <div className="payg">
      <Stack gap="lg">
        <SectionHeader snap={snap} pill="Team member" />

        <FreeHero snap={snap} />

        <div className="paygf-member-note">
          <LockIcon className="paygf-member-note__icon" />
          <div>
            <h3 className="paygf-member-note__title">
              Want more than 500 automation, AI, or API operations a month?
            </h3>
            <p className="paygf-member-note__body">
              Your team owner can enable the Processor plan and set a monthly
              ceiling. Until then, manual tools are free for you to use as
              much as you like — automation, AI, and API access are limited
              to the team's 500/month free allowance.
            </p>
          </div>
        </div>

        <div className="paygf-explainer">
          <div className="paygf-explainer__col">
            <div className="paygf-explainer__label">
              <CheckIcon
                className="paygf-explainer__icon paygf-explainer__icon--free"
                fontSize="small"
              />
              Always free for you
            </div>
            <p className="paygf-explainer__text">
              Manual tools — viewing, editing, merging, splitting, signing,
              watermarks, compression, conversion, manual OCR. Use them as
              much as you want, never counted.
            </p>
          </div>
          <div className="paygf-explainer__col">
            <div className="paygf-explainer__label">
              <BoltIcon
                className="paygf-explainer__icon paygf-explainer__icon--paid"
                fontSize="small"
              />
              Shared with the team
            </div>
            <p className="paygf-explainer__text">
              Automation pipelines, AI tools, and API calls share a single
              500/month allowance across the whole team. If it's full, ask
              your owner to enable Processor.
            </p>
          </div>
        </div>
      </Stack>
    </div>
  );
}
