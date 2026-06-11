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
import React, { useState } from "react";
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
import {
  FreeMeterPanel,
  useFreeSnapshot,
  type FreeSnapshot,
} from "@app/components/shared/config/configSections/usageMeters";

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
                {" — "}
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
