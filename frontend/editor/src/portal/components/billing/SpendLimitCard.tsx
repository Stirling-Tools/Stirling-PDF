import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Card } from "@shared/components";
import {
  currencySymbol,
  docCapForMoney,
  formatMinor,
  formatMoneyMajor,
  MeterBar,
  meterState,
  SpendCapControl as SharedSpendCapControl,
} from "@shared/billing";
import type { Wallet } from "@portal/api/billing";
import { updateCap } from "@portal/api/billing";

interface Props {
  wallet: Wallet;
  onWalletChange?: () => void;
  /** Controlled edit mode — lifted so the over-cap banner can open it. */
  adjusting: boolean;
  onAdjustingChange: (open: boolean) => void;
}

/** Local-date day count between two ISO yyyy-mm-dd strings; 0 if unparseable. */
function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00`);
  const b = Date.parse(`${bIso}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

interface Projection {
  dailyRateMajor: number;
  daysToCap: number;
  projectedEndMajor: number;
  suggestedMajor: number;
}

/**
 * Straight-line cap projection from real data: current spend over elapsed days
 * gives a daily run-rate, extrapolated across the period. Returns null unless
 * there's a live cap, a known rate, at least a day elapsed, and the trajectory
 * actually overshoots — i.e. only when there's something to warn about.
 */
function projectOverspend(wallet: Wallet): Projection | null {
  if (wallet.noCap || wallet.capUsd == null) return null;
  if (wallet.estimatedBillMinor == null || wallet.estimatedBillMinor <= 0) {
    return null;
  }
  const totalDays = daysBetween(
    wallet.billingPeriodStart,
    wallet.billingPeriodEnd,
  );
  if (totalDays <= 0) return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const rawElapsed = daysBetween(wallet.billingPeriodStart, todayIso);
  // Need at least a full day of data to extrapolate. On day 0 (or clock skew / a
  // UTC-vs-local boundary) rawElapsed is <= 0; projecting then would treat the whole
  // period's spend as one day's run-rate and falsely "project to exceed".
  if (rawElapsed < 1) return null;
  const elapsed = Math.min(totalDays, rawElapsed);

  const spentMajor = wallet.estimatedBillMinor / 100;
  const dailyRateMajor = spentMajor / elapsed;
  const projectedEndMajor = dailyRateMajor * totalDays;
  if (projectedEndMajor <= wallet.capUsd) return null;

  const daysToCap = Math.max(
    1,
    Math.ceil((wallet.capUsd - spentMajor) / dailyRateMajor),
  );
  const suggestedMajor = Math.ceil((projectedEndMajor * 1.15) / 1000) * 1000;
  return { dailyRateMajor, daysToCap, projectedEndMajor, suggestedMajor };
}

function persistedCapOf(wallet: Wallet): number | null {
  return wallet.noCap ? null : (wallet.capUsd ?? null);
}

/**
 * The cap surface (right card of the spend row). Two in-place modes — display
 * (flat spend-vs-cap meter via the shared {@link MeterBar}, % used, projection)
 * and edit (the shared bucket {@link SharedSpendCapControl} + suggested-value
 * shortcut + guardrail note + Cancel/Save) — swapping in place rather than
 * revealing a second card. Leader-only edit; members see display only.
 */
export function SpendLimitCard({
  wallet,
  onWalletChange,
  adjusting,
  onAdjustingChange,
}: Props) {
  const { t } = useTranslation();
  const isLeader = wallet.role === "leader";
  const symbol = currencySymbol(wallet.currency);
  const persistedCap = persistedCapOf(wallet);
  const proj = projectOverspend(wallet);

  const [draftCap, setDraftCap] = useState<number | null>(persistedCap);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reseed the draft whenever the editor opens or the persisted value changes.
  useEffect(() => {
    if (adjusting) {
      setDraftCap(persistedCap);
      setError(null);
    }
  }, [adjusting, persistedCap]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateCap(draftCap);
      onAdjustingChange(false);
      onWalletChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Edit mode ───────────────────────────────────────────────────────────
  if (isLeader && adjusting) {
    return (
      <Card padding="loose">
        <span className="portal-billing__eyebrow">
          {t("billing.spendLimit.eyebrow", "Spend limit")}
        </span>
        <h3 className="portal-billing__section-title">
          {t("billing.spendLimit.editTitle", "Set your monthly ceiling")}
        </h3>

        <SharedSpendCapControl
          capUsd={draftCap}
          onChange={setDraftCap}
          pricePerDocMinor={wallet.pricePerDocMinor}
          currency={wallet.currency}
          note={t(
            "billing.spendLimit.capControlNote",
            "Changes apply immediately — raise or lower the ceiling any time.",
          )}
        />

        {proj && draftCap !== proj.suggestedMajor && (
          <button
            type="button"
            className="portal-billing__suggested"
            onClick={() => setDraftCap(proj.suggestedMajor)}
          >
            {t(
              "billing.spendLimit.useSuggested",
              "Use suggested · {{amount}} / month",
              {
                amount: formatMoneyMajor(proj.suggestedMajor, wallet.currency),
              },
            )}
          </button>
        )}

        <div className="portal-billing__guardrail">
          <strong>
            {t("billing.spendLimit.guardrailLabel", "Your guardrail:")}
          </strong>{" "}
          {t(
            "billing.spendLimit.guardrailBody",
            "a hard ceiling — you're never billed past it. At the cap, metered processing pauses (unlimited PDF editing keeps working) until you raise it or the cycle resets. Nothing is lost.",
          )}
        </div>

        {error && (
          <Banner
            tone="danger"
            title={t("billing.spendLimit.saveError", "Couldn't save limit")}
          >
            {error}
          </Banner>
        )}

        <div className="portal-billing__edit-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdjustingChange(false)}
          >
            {t("billing.spendLimit.cancel", "Cancel")}
          </Button>
          <Button variant="gradient" size="sm" loading={saving} onClick={save}>
            {t("billing.spendLimit.save", "Save limit")}
          </Button>
        </div>
      </Card>
    );
  }

  // ── Display mode ────────────────────────────────────────────────────────
  const spentMinor = wallet.estimatedBillMinor ?? 0;
  const cap = wallet.capUsd ?? 0;
  const capActive = !wallet.noCap && wallet.capUsd != null;
  const { state, pct } = meterState(spentMinor / 100, cap);
  const remainingMinor = Math.max(0, Math.round(cap * 100) - spentMinor);
  const docEstimate = docCapForMoney(wallet.capUsd, wallet.pricePerDocMinor);
  const spentLabel = formatMinor(spentMinor, wallet.currency);

  return (
    <Card padding="loose" id="portal-spend-limit">
      <div className="portal-billing__subscription-head">
        <div>
          <span className="portal-billing__eyebrow">
            {t("billing.spendLimit.eyebrow", "Spend limit")}
          </span>
          <p className="portal-billing__section-sub">
            {t(
              "billing.spendLimit.displaySub",
              "You're only billed for what you process automatically — never past the ceiling.",
            )}
          </p>
        </div>
        {isLeader && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdjustingChange(true)}
          >
            {t("billing.spendLimit.adjustLimit", "Adjust limit")}
          </Button>
        )}
      </div>

      <div className="portal-billing__spend-meter">
        <MeterBar
          state={capActive ? state : "FULL"}
          pct={pct}
          figure={
            capActive ? formatMoneyMajor(cap, wallet.currency) : spentLabel
          }
          capSuffix={
            capActive
              ? docEstimate != null
                ? t(
                    "billing.spendLimit.capSuffixWithDocs",
                    "/ month · ≈ {{documents}} documents",
                    {
                      documents: docEstimate.toLocaleString(),
                    },
                  )
                : t("billing.spendLimit.capSuffix", "/ month")
              : t("billing.spendLimit.noCap", "no cap")
          }
          statusLabel={
            capActive
              ? t("billing.spendLimit.pctUsed", "{{pct}}% used", {
                  pct: Math.round(pct),
                })
              : null
          }
          showBar={capActive}
          meta={
            capActive ? (
              <>
                <span>
                  {t(
                    "billing.spendLimit.usedThisMonth",
                    "{{amount}} used this month",
                    {
                      amount: spentLabel,
                    },
                  )}
                </span>
                <span>
                  {t("billing.spendLimit.remaining", "{{amount}} remaining", {
                    amount: formatMinor(remainingMinor, wallet.currency),
                  })}
                </span>
              </>
            ) : (
              <span>
                {t(
                  "billing.spendLimit.thisPeriodUncapped",
                  "{{amount}} this period · uncapped",
                  {
                    amount: spentLabel,
                  },
                )}
              </span>
            )
          }
        />
      </div>

      {proj && (
        <p className="portal-billing__projection">
          <strong>
            {t("billing.spendLimit.projection.label", "Projected to exceed.")}
          </strong>{" "}
          {t(
            "billing.spendLimit.projection.body",
            "At {{rate}}/day you reach the cap in ~{{count}} days (~{{monthEnd}} month-end). Suggested limit ~{{suggested}}.",
            {
              count: proj.daysToCap,
              rate: `${symbol}${proj.dailyRateMajor.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`,
              monthEnd: formatMoneyMajor(
                Math.round(proj.projectedEndMajor),
                wallet.currency,
              ),
              suggested: formatMoneyMajor(proj.suggestedMajor, wallet.currency),
            },
          )}
        </p>
      )}
    </Card>
  );
}
