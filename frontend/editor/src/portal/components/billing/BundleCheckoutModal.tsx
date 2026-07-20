import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Checkbox,
  Modal,
  NumberInput,
  SegmentedControl,
  Spinner,
} from "@app/ui";
import {
  BUNDLE_PIPELINE_TIERS,
  BUNDLE_POLICY_POSTURES,
  BUNDLE_SIZE_TIERS,
  computeBundleQuote,
  formatMinor,
} from "@app/billing";
import type { Wallet } from "@portal/api/billing";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import {
  createBundleCheckoutSession,
  createBundleInvoice,
  getStripePublishableKey,
  loadStripeOnce,
  StripeFunctionError,
  upsertBundleQuote,
  type BundleQuote,
} from "@portal/billing/stripe";
import { CardPlaceholder } from "@portal/components/billing/CardPlaceholder";
import { downloadProformaPdf } from "@portal/components/billing/proformaPdf";

/**
 * Prepaid-bundle purchase modal for the Processor billing page — "12 months for
 * the price of 10". Three steps inside the shared portal {@link Modal}:
 *
 *   1. Size your year — buyers size the purchase in PEOPLE. Team size drives an
 *      estimated volume (≈80 PDFs/user/mo), provisioned ~3× above expected; the
 *      finer settings (governance posture, file size, pipelines) scale it up. All
 *      local, via the shared {@code computeBundleQuote} brain.
 *   2. Pay — one-time Stripe Embedded Checkout. The pool ({@code units}) is sent
 *      straight to the checkout edge fn (billed quantity × unit_amount + coupon).
 *   3. Confirm — brief "your prepaid year is active" beat; the parent refetches
 *      the wallet (the pool lands via the Stripe webhook, never here).
 *
 * The pool is denominated in size-folded RUNS — the same currency the meter charges
 * on consumption — so a flat per-run rate reproduces the marketing calculator's
 * total. The run-based brain (policy-count posture, pipelines, 1¢/run, 10/12) lives
 * in {@code @app/billing}, shared with the backend.
 */

/** Default team size the calculator opens on. */
const DEFAULT_USERS = 25;

/**
 * EULA version the prepay consent is recorded against (ARL/EULA §7.2). Legal owns
 * the final value + copy; placeholder until the terms are finalised. Sent to the
 * checkout edge fn as proof of what was agreed, and recorded in the session metadata.
 */
const CONSENT_EULA_VERSION = "2026-07-draft";

function policiesFor(id: string): number {
  return (
    BUNDLE_POLICY_POSTURES.find((p) => p.id === id)?.policies ??
    BUNDLE_POLICY_POSTURES[0].policies
  );
}
function sizeMultFor(id: string): number {
  return BUNDLE_SIZE_TIERS.find((s) => s.id === id)?.mult ?? 1;
}
function pipelineMultFor(id: string): number {
  return BUNDLE_PIPELINE_TIERS.find((p) => p.id === id)?.mult ?? 1;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Drives teamId, per-run rate, currency, and top-up vs first-buy copy. */
  wallet: Wallet;
  /** Fired after a completed purchase so the parent can refetch the wallet. */
  onComplete?: () => void;
}

type Phase = "calc" | "pay" | "done";

export function BundleCheckoutModal({
  open,
  onClose,
  wallet,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const teamId = wallet.teamId;
  const currency = wallet.currency ?? "usd";
  const pricePerDocMinor = wallet.pricePerDocMinor;
  const topUp = wallet.prepaidUnitsTotal > 0;

  const [phase, setPhase] = useState<Phase>("calc");
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [postureId, setPostureId] = useState<string>("governed");
  const [sizeId, setSizeId] = useState<string>("standard");
  const [pipelineId, setPipelineId] = useState<string>("none");
  const [consented, setConsented] = useState(false);
  // The persisted quote id, reused across Download + Continue so both edit ONE quote (rather than
  // spawning a new one on every click). Null until first persisted (or when there's no SaaS backend).
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // How the payment resolved: card = active now; bank = an invoice awaiting payment.
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null);

  // Reset to step 1 whenever the modal closes so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setPhase("calc");
      setUsers(DEFAULT_USERS);
      setPostureId("governed");
      setSizeId("standard");
      setPipelineId("none");
      setConsented(false);
      setQuoteId(null);
      setQuoteBusy(false);
      setQuoteError(null);
      setOutcome(null);
    }
  }, [open]);

  const quote = useMemo(
    () =>
      computeBundleQuote({
        users,
        posturePolicies: policiesFor(postureId),
        sizeMult: sizeMultFor(sizeId),
        pipelineMult: pipelineMultFor(pipelineId),
        ratePerRunMinor: pricePerDocMinor,
      }),
    [users, postureId, sizeId, pipelineId, pricePerDocMinor],
  );

  if (!open || teamId == null) return null;

  const canContinue =
    quote.poolCredits > 0 && consented && !quote.overEnterprise && !quoteBusy;

  // Persist (create or edit) the quote so Download can stamp a real number and Continue can check out
  // against it. Returns null when there's no SaaS backend (Storybook/preview) — the flow then falls
  // back to the direct-units checkout + a number-less proforma.
  async function ensureQuote(): Promise<BundleQuote | null> {
    if (teamId == null || quote.poolCredits <= 0) return null;
    try {
      const q = await upsertBundleQuote({
        teamId,
        users,
        posturePolicies: policiesFor(postureId),
        sizeMult: sizeMultFor(sizeId),
        pipelineMult: pipelineMultFor(pipelineId),
        provisionedMonthlyVolume: quote.provisionedMonthlyVolume,
        poolCredits: quote.poolCredits,
        priceMinor: quote.priceMinor,
        currency,
        consented,
        eulaVersion: CONSENT_EULA_VERSION,
        quoteId: quoteId ?? undefined,
      });
      setQuoteId(q.quoteId);
      setQuoteError(null);
      return q;
    } catch (e) {
      if (e instanceof StripeFunctionError && e.code === "unconfigured") {
        return null; // no backend (Storybook/preview) — fall back to the direct path
      }
      setQuoteError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function handleContinue() {
    if (!canContinue) return;
    setQuoteBusy(true);
    try {
      await ensureQuote();
      setPhase("pay");
    } catch {
      // Surfaced via the quoteError banner; stay on the calculator.
    } finally {
      setQuoteBusy(false);
    }
  }

  function finish() {
    onClose();
    onComplete?.();
  }

  const title =
    phase === "done"
      ? outcome?.invoicePending
        ? t("portal.billing.prepaid.buy.invoiceSentTitle", "Invoice sent")
        : t(
            "portal.billing.prepaid.buy.doneTitle",
            "Your prepaid year is active",
          )
      : topUp
        ? t("portal.billing.prepaid.buy.topUpTitle", "Top up prepaid capacity")
        : t(
            "portal.billing.prepaid.buy.title",
            "Get 12 months for the price of 10",
          );
  const subtitle =
    phase === "calc"
      ? t(
          "portal.billing.prepaid.buy.subtitle",
          "Prepay a year of PDF processing up front at a discount. Prepaid capacity is used before metered billing and sits outside your spend limit; unused capacity expires after 12 months.",
        )
      : undefined;

  const footer =
    phase === "calc" ? (
      <div className="portal-billing__checkout-cap-actions">
        <Button variant="quiet" onClick={onClose}>
          {t("portal.billing.prepaid.buy.cancel", "Cancel")}
        </Button>
        <Button
          accent="premium"
          disabled={!canContinue}
          onClick={handleContinue}
          rightSection={<span aria-hidden>›</span>}
        >
          {t("portal.billing.prepaid.buy.continue", "Continue to payment")}
        </Button>
      </div>
    ) : phase === "done" ? (
      <div className="portal-billing__bundle-foot-end">
        <Button accent="premium" onClick={finish}>
          {t("portal.billing.prepaid.buy.finish", "Done")}
        </Button>
      </div>
    ) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      className="portal-billing__checkout-modal"
      title={title}
      subtitle={subtitle}
      footer={footer}
    >
      {phase === "calc" && (
        <CalculatorStep
          users={users}
          setUsers={setUsers}
          postureId={postureId}
          setPostureId={setPostureId}
          sizeId={sizeId}
          setSizeId={setSizeId}
          pipelineId={pipelineId}
          setPipelineId={setPipelineId}
          quote={quote}
          currency={currency}
          consented={consented}
          setConsented={setConsented}
          ensureQuote={ensureQuote}
          quoteError={quoteError}
        />
      )}
      {phase === "pay" && (
        <PaymentStep
          key={`bundle:${quoteId ?? quote.poolCredits}`}
          teamId={teamId}
          quoteId={quoteId}
          units={quote.poolCredits}
          consented={consented}
          eulaVersion={CONSENT_EULA_VERSION}
          onComplete={(o) => {
            setOutcome(o ?? null);
            setPhase("done");
          }}
        />
      )}
      {phase === "done" && (
        <ConfirmationStep
          credits={quote.poolCredits}
          priceMinor={quote.priceMinor}
          currency={currency}
          invoicePending={outcome?.invoicePending ?? false}
          hostedInvoiceUrl={outcome?.hostedInvoiceUrl ?? null}
        />
      )}
    </Modal>
  );
}

// ─── Step 1: users-first calculator ──────────────────────────────────────────

interface CalcProps {
  users: number;
  setUsers: (v: number) => void;
  postureId: string;
  setPostureId: (v: string) => void;
  sizeId: string;
  setSizeId: (v: string) => void;
  pipelineId: string;
  setPipelineId: (v: string) => void;
  quote: ReturnType<typeof computeBundleQuote>;
  currency: string;
  consented: boolean;
  setConsented: (v: boolean) => void;
  /** Persist (create/edit) the quote; returns it, or null when there's no SaaS backend. */
  ensureQuote: () => Promise<BundleQuote | null>;
  /** Last quote-persist error (create/download), surfaced inline. */
  quoteError: string | null;
}

interface PickerCard {
  id: string;
  title: string;
  meta?: string;
  desc: string;
}

function CalculatorStep({
  users,
  setUsers,
  postureId,
  setPostureId,
  sizeId,
  setSizeId,
  pipelineId,
  setPipelineId,
  quote,
  currency,
  consented,
  setConsented,
  ensureQuote,
  quoteError,
}: CalcProps) {
  const { t } = useTranslation();
  // Deployment is a display-only finer setting (same rate self-serve); expanded
  // tracks which row's card picker is bloomed (demo: one open at a time).
  const [deployId, setDeployId] = useState<string>("cloud");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const deployCards: PickerCard[] = [
    {
      id: "cloud",
      title: t("portal.billing.prepaid.deploy.cloud", "Stirling Cloud"),
      desc: t(
        "portal.billing.prepaid.deploy.cloudDesc",
        "Managed by Stirling. Live in minutes.",
      ),
    },
    {
      id: "selfhost",
      title: t("portal.billing.prepaid.deploy.selfhost", "Self-hosted"),
      desc: t(
        "portal.billing.prepaid.deploy.selfhostDesc",
        "Runs on private infrastructure. Same rate.",
      ),
    },
  ];
  const sizeCards: PickerCard[] = [
    {
      id: "compact",
      title: t("portal.billing.prepaid.size.compact", "Compact"),
      meta: "×1",
      desc: t(
        "portal.billing.prepaid.size.compactDesc",
        "Files under 25 MB, no data charges",
      ),
    },
    {
      id: "standard",
      title: t("portal.billing.prepaid.size.standard", "Standard"),
      meta: "×1.2",
      desc: t(
        "portal.billing.prepaid.size.standardDesc",
        "Mostly small, some scans past 25 MB",
      ),
    },
    {
      id: "heavy",
      title: t("portal.billing.prepaid.size.heavy", "Heavy"),
      meta: "×2",
      desc: t(
        "portal.billing.prepaid.size.heavyDesc",
        "Scanned or image-heavy, routinely 50 MB+",
      ),
    },
  ];
  const postureCards: PickerCard[] = [
    {
      id: "essentials",
      title: t("portal.billing.prepaid.posture.essentials", "Essentials"),
      meta: t(
        "portal.billing.prepaid.calc.policiesMeta",
        "{{count}} policies",
        {
          count: 2,
        },
      ),
      desc: t(
        "portal.billing.prepaid.posture.essentialsDesc",
        "Classification, the default, plus Sharing",
      ),
    },
    {
      id: "governed",
      title: t("portal.billing.prepaid.posture.governed", "Governed"),
      meta: t(
        "portal.billing.prepaid.calc.policiesMeta",
        "{{count}} policies",
        {
          count: 4,
        },
      ),
      desc: t(
        "portal.billing.prepaid.posture.governedDesc",
        "Adds Security and Routing",
      ),
    },
    {
      id: "regulated",
      title: t("portal.billing.prepaid.posture.regulated", "Regulated"),
      meta: t(
        "portal.billing.prepaid.calc.policiesMeta",
        "{{count}} policies",
        {
          count: 7,
        },
      ),
      desc: t(
        "portal.billing.prepaid.posture.regulatedDesc",
        "Every category, incl. Compliance, Retention, Ingestion",
      ),
    },
  ];
  const pipelineCards: PickerCard[] = [
    {
      id: "none",
      title: t("portal.billing.prepaid.pipelines.none", "None"),
      desc: t(
        "portal.billing.prepaid.pipelines.noneDesc",
        "Not running pipelines yet. Turn them on any time.",
      ),
    },
    {
      id: "standard",
      title: t("portal.billing.prepaid.pipelines.standard", "Standard"),
      desc: t(
        "portal.billing.prepaid.pipelines.standardDesc",
        "A few pipelines re-process arriving PDFs.",
      ),
    },
    {
      id: "advanced",
      title: t("portal.billing.prepaid.pipelines.advanced", "Advanced"),
      desc: t(
        "portal.billing.prepaid.pipelines.advancedDesc",
        "Pipelines drive most of your processing.",
      ),
    },
  ];

  const find = (cards: PickerCard[], id: string) =>
    cards.find((c) => c.id === id) ?? cards[0];
  const size = find(sizeCards, sizeId);
  const posture = find(postureCards, postureId);
  const pipeline = find(pipelineCards, pipelineId);
  const policies =
    BUNDLE_POLICY_POSTURES.find((p) => p.id === postureId)?.policies ?? 0;

  const deployValue =
    deployId === "cloud"
      ? t(
          "portal.billing.prepaid.deploy.cloudValue",
          "Stirling Cloud · Managed",
        )
      : t(
          "portal.billing.prepaid.deploy.selfhostValue",
          "Self-hosted · Private infrastructure",
        );
  const sizeValue = t(
    "portal.billing.prepaid.calc.sizingValue",
    "{{label}} · {{desc}}",
    { label: size.title, desc: size.desc },
  );
  const postureValue = t(
    "portal.billing.prepaid.calc.governanceValue",
    "{{label}} · {{count}} policies",
    { label: posture.title, count: policies },
  );

  const rows = [
    {
      id: "deploy",
      label: t("portal.billing.prepaid.calc.deployRow", "Deployment"),
      value: deployValue,
      cards: deployCards,
      activeId: deployId,
      onPick: setDeployId,
    },
    {
      id: "size",
      label: t("portal.billing.prepaid.calc.sizingRow", "Sizing"),
      value: sizeValue,
      cards: sizeCards,
      activeId: sizeId,
      onPick: setSizeId,
    },
    {
      id: "posture",
      label: t("portal.billing.prepaid.calc.governanceRow", "Governance"),
      value: postureValue,
      cards: postureCards,
      activeId: postureId,
      onPick: setPostureId,
    },
    {
      id: "pipes",
      label: t("portal.billing.prepaid.calc.pipelinesLabel", "Pipelines"),
      value: pipeline.title,
      cards: pipelineCards,
      activeId: pipelineId,
      onPick: setPipelineId,
    },
  ];

  const canDownload = quote.priceMinor != null && quote.poolCredits > 0;
  const handleDownload = async () => {
    if (quote.priceMinor == null || downloading) return;
    setDownloading(true);
    try {
      // Persist first so the proforma carries a real quote number to share for approval; ensureQuote
      // returns null with no SaaS backend (Storybook/preview) — the PDF then omits the number.
      const persisted = await ensureQuote();
      await downloadProformaPdf({
        filename: "stirling-prepaid-quote.pdf",
        reference: persisted?.quoteNumber,
        heading: t(
          "portal.billing.prepaid.proforma.heading",
          "Prepaid processing quote",
        ),
        subheading: t(
          "portal.billing.prepaid.proforma.subheading",
          "12 months of prepaid PDF processing capacity",
        ),
        lines: [
          {
            label: t("portal.billing.prepaid.calc.usersLabel", "Total users"),
            value: users.toLocaleString(),
          },
          {
            label: t("portal.billing.prepaid.calc.deployRow", "Deployment"),
            value: deployValue,
          },
          {
            label: t("portal.billing.prepaid.calc.sizingRow", "Sizing"),
            value: sizeValue,
          },
          {
            label: t("portal.billing.prepaid.calc.governanceRow", "Governance"),
            value: postureValue,
          },
          {
            label: t("portal.billing.prepaid.calc.pipelinesLabel", "Pipelines"),
            value: pipeline.title,
          },
          {
            label: t(
              "portal.billing.prepaid.calc.handlesLabel",
              "Your Processor",
            ),
            value: t(
              "portal.billing.prepaid.calc.handlesValue",
              "handles {{volume}} PDFs / mo",
              { volume: quote.provisionedMonthlyVolume.toLocaleString() },
            ),
          },
          {
            label: t(
              "portal.billing.prepaid.proforma.poolLabel",
              "Prepaid pool",
            ),
            value: t(
              "portal.billing.prepaid.proforma.poolValue",
              "{{credits}} credits",
              { credits: quote.poolCredits.toLocaleString() },
            ),
          },
        ],
        totalLabel: t(
          "portal.billing.prepaid.calc.priceLabel",
          "Your year · 12 months for the price of 10",
        ),
        totalValue: formatMinor(quote.priceMinor, currency),
        footer: t(
          "portal.billing.prepaid.proforma.footer",
          "Proforma for purchase approval. Capacity is billed only once payment is received; valid 30 days.",
        ),
      });
    } catch {
      // Surfaced via the quoteError banner; leave the button re-enabled to retry.
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="portal-billing__bundle-calc">
      {quoteError && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.prepaid.buy.quoteErrorTitle",
            "Couldn't save your quote",
          )}
        >
          {quoteError}
        </Banner>
      )}
      <div className="portal-billing__bundle-field">
        <div className="portal-billing__bundle-field-label">
          {t("portal.billing.prepaid.calc.usersLabel", "Total users")}
        </div>
        <div className="portal-billing__bundle-users">
          <NumberInput
            value={users}
            onChange={(v) => setUsers(typeof v === "number" ? v : 0)}
            min={0}
            step={1}
            allowNegative={false}
            aria-label={t(
              "portal.billing.prepaid.calc.usersLabel",
              "Total users",
            )}
          />
        </div>
        <p className="portal-billing__bundle-field-hint">
          {t(
            "portal.billing.prepaid.calc.usersHint",
            "Estimated at ≈ 80 PDFs per user a month of people-driven traffic. Edit the finer settings if you know better.",
          )}
        </p>
      </div>

      {/* Finer settings as progressive-disclosure rows — a "Change" blooms the card picker. */}
      <div className="portal-billing__bundle-rows">
        {rows.map((row) => {
          const open = expanded === row.id;
          return (
            <div key={row.id} className="portal-billing__bundle-row">
              <div
                role="button"
                tabIndex={0}
                className="portal-billing__bundle-row-head"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpanded(open ? null : row.id);
                  }
                }}
              >
                <span className="portal-billing__bundle-row-label">
                  {row.label}
                </span>
                <span className="portal-billing__bundle-row-value">
                  {row.value}
                  <span className="portal-billing__bundle-row-change">
                    {open
                      ? t("portal.billing.prepaid.calc.done", "Done")
                      : t("portal.billing.prepaid.calc.change", "Change")}
                  </span>
                </span>
              </div>
              {open && (
                <div className="portal-billing__bundle-row-body">
                  <div className="portal-billing__bundle-cards">
                    {row.cards.map((card) => {
                      const active = card.id === row.activeId;
                      const pick = () => {
                        row.onPick(card.id);
                        setExpanded(null);
                      };
                      return (
                        <div
                          key={card.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                          className={
                            "portal-billing__bundle-card" +
                            (active
                              ? " portal-billing__bundle-card--active"
                              : "")
                          }
                          onClick={pick}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              pick();
                            }
                          }}
                        >
                          <span className="portal-billing__bundle-card-head">
                            <span className="portal-billing__bundle-card-title">
                              {card.title}
                            </span>
                            {card.meta && (
                              <span className="portal-billing__bundle-card-meta">
                                {card.meta}
                              </span>
                            )}
                          </span>
                          <span className="portal-billing__bundle-card-desc">
                            {card.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Receipt — the sized plan, its price, the credit pool, and a shareable proforma. */}
      <div className="portal-billing__bundle-receipt">
        <div className="portal-billing__bundle-receipt-row">
          <span>
            {t("portal.billing.prepaid.calc.handlesLabel", "Your Processor")}
          </span>
          <strong>
            {t(
              "portal.billing.prepaid.calc.handlesValue",
              "handles {{volume}} PDFs / mo",
              { volume: quote.provisionedMonthlyVolume.toLocaleString() },
            )}
          </strong>
        </div>
        {quote.priceMinor != null ? (
          <>
            <div className="portal-billing__bundle-receipt-row">
              <span>
                {t(
                  "portal.billing.prepaid.calc.priceLabel",
                  "Your year · 12 months for the price of 10",
                )}
              </span>
              <strong className="portal-billing__bundle-receipt-price">
                {formatMinor(quote.priceMinor, currency)}
              </strong>
            </div>
            {quote.savingsMinor != null && quote.savingsMinor > 0 && (
              <p className="portal-billing__bundle-savings">
                {t(
                  "portal.billing.prepaid.calc.savings",
                  "You save {{amount}} — 2 months free.",
                  { amount: formatMinor(quote.savingsMinor, currency) },
                )}
              </p>
            )}
          </>
        ) : (
          <p className="portal-billing__bundle-savings">
            {t(
              "portal.billing.prepaid.calc.rateUnknown",
              "We'll show the exact price at checkout.",
            )}
          </p>
        )}
        {quote.poolCredits > 0 && (
          <p className="portal-billing__bundle-pool">
            {t(
              "portal.billing.prepaid.calc.poolCaption",
              "One pool of {{credits}} credits for the year. Heavy months borrow from light ones.",
              { credits: quote.poolCredits.toLocaleString() },
            )}
          </p>
        )}
        {canDownload && (
          <div
            role="button"
            tabIndex={0}
            aria-disabled={downloading}
            className="portal-billing__bundle-download"
            onClick={handleDownload}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleDownload();
              }
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
            </svg>
            {downloading
              ? t(
                  "portal.billing.prepaid.calc.downloadPreparing",
                  "Preparing quote…",
                )
              : t(
                  "portal.billing.prepaid.calc.downloadQuote",
                  "Download quote (PDF)",
                )}
            {!downloading && (
              <span className="portal-billing__bundle-download-share">
                ·{" "}
                {t(
                  "portal.billing.prepaid.calc.downloadShare",
                  "share for approval",
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {quote.overEnterprise && (
        <p className="portal-billing__bundle-savings">
          {t(
            "portal.billing.prepaid.calc.enterpriseHint",
            "This is enterprise scale — at this volume, enterprise rates beat any self-serve discount. Rate lock, terms, and a quote in minutes.",
          )}
        </p>
      )}

      {/* Affirmative consent to the prepaid→metered auto-transition, captured before
          payment (ARL/EULA §7.2). Un-pre-checked; gates Continue. Copy is legal-owned. */}
      <div className="portal-billing__bundle-consent">
        <Checkbox
          checked={consented}
          onChange={(e) => setConsented(e.currentTarget.checked)}
          label={t(
            "portal.billing.prepaid.consent.label",
            "I understand that when my prepaid capacity is used up or expires after 12 months, processing automatically continues at the standard metered pay-as-you-go rate (up to my spend limit) unless I cancel, and that I can cancel anytime from the billing portal.",
          )}
        />
      </div>
    </div>
  );
}

// ─── Step 2: Stripe embedded checkout ────────────────────────────────────────

/** How a completed payment step resolved — card is live now; bank is an invoice awaiting payment. */
interface PaymentOutcome {
  invoicePending: boolean;
  hostedInvoiceUrl?: string | null;
}

function PaymentStep({
  teamId,
  quoteId,
  units,
  consented,
  eulaVersion,
  onComplete,
}: {
  teamId: number;
  /** Preferred: check out / invoice against this persisted quote (carries pool + consent). */
  quoteId: number | null;
  /** Direct-path fallback for the card route when quoteId is null (quote persistence unavailable). */
  units: number;
  consented: boolean;
  eulaVersion: string;
  onComplete: (outcome?: PaymentOutcome) => void;
}) {
  const { t } = useTranslation();
  // The demo's card-vs-bank fork: card = pay now (embedded checkout); bank = raise an invoice (net
  // terms) and activate when it's paid.
  const [method, setMethod] = useState<"card" | "bank">("card");
  return (
    <div className="portal-billing__checkout-pay">
      <SegmentedControl
        fullWidth
        options={[
          {
            value: "card",
            label: t("portal.billing.prepaid.pay.card", "Card"),
          },
          {
            value: "bank",
            label: t("portal.billing.prepaid.pay.bank", "Bank transfer"),
          },
        ]}
        value={method}
        onChange={(m) => setMethod(m as "card" | "bank")}
        ariaLabel={t("portal.billing.prepaid.pay.method", "Payment method")}
      />
      {method === "card" ? (
        <CardPay
          teamId={teamId}
          quoteId={quoteId}
          units={units}
          consented={consented}
          eulaVersion={eulaVersion}
          onComplete={() => onComplete()}
        />
      ) : (
        <BankPay
          teamId={teamId}
          quoteId={quoteId}
          onComplete={(hostedInvoiceUrl) =>
            onComplete({ invoicePending: true, hostedInvoiceUrl })
          }
        />
      )}
    </div>
  );
}

// ─── Step 2a: card (embedded Stripe checkout, pay now) ───────────────────────

function CardPay({
  teamId,
  quoteId,
  units,
  consented,
  eulaVersion,
  onComplete,
}: {
  teamId: number;
  quoteId: number | null;
  units: number;
  consented: boolean;
  eulaVersion: string;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const publishableKey = getStripePublishableKey();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No publishable key (Storybook / preview / mis-config): skip minting and let
    // the mock placeholder drive the completion path so the flow stays testable.
    if (!publishableKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Prefer the quote path (the edge fn reads pool + consent off it and settles it on payment). When
    // quote persistence was unavailable (quoteId null), fall back to sending units + consent inline so
    // the request is still valid — createBundleCheckoutSession sends quote_id XOR the inline trio.
    createBundleCheckoutSession(
      quoteId != null
        ? {
            teamId,
            quoteId,
            successUrl: window.location.href,
            cancelUrl: window.location.href,
          }
        : {
            teamId,
            units,
            consented,
            eulaVersion,
            successUrl: window.location.href,
            cancelUrl: window.location.href,
          },
    )
      .then((session) => {
        if (cancelled) return;
        // Bundle checkout is embedded-only (the edge fn returns a client_secret, never a redirect
        // URL), so there's no hosted-redirect branch to handle here.
        setClientSecret(session.clientSecret);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publishableKey, teamId, quoteId, units, consented, eulaVersion]);

  const stripe = publishableKey ? loadStripeOnce(publishableKey) : null;

  if (!publishableKey) {
    return (
      <div className="portal-billing__checkout-pay">
        <CardPlaceholder />
        <div className="portal-billing__bundle-foot-end">
          <Button accent="premium" onClick={onComplete}>
            {t("portal.billing.prepaid.buy.mockPay", "Complete purchase")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-billing__checkout-pay">
      {error && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.prepaid.buy.payErrorTitle",
            "Couldn't start checkout",
          )}
        >
          {error}
        </Banner>
      )}
      {loading && !error && (
        <div className="portal-billing__checkout-loading" role="status">
          <Spinner size="lg" />
        </div>
      )}
      {!loading && !error && stripe && clientSecret && (
        <EmbeddedCheckoutProvider
          stripe={stripe}
          options={{ clientSecret, onComplete }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
    </div>
  );
}

// ─── Step 2b: bank transfer (raise an invoice, activate on payment) ──────────

function BankPay({
  teamId,
  quoteId,
  onComplete,
}: {
  teamId: number;
  quoteId: number | null;
  onComplete: (hostedInvoiceUrl: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // No persisted quote (Storybook / preview / no SaaS backend) → simulate the invoice-sent
      // outcome so the flow stays demoable without a network.
      if (quoteId == null) {
        onComplete(null);
        return;
      }
      const inv = await createBundleInvoice({ teamId, quoteId });
      onComplete(inv.hostedInvoiceUrl);
    } catch (e) {
      if (e instanceof StripeFunctionError && e.code === "unconfigured") {
        onComplete(null);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-billing__checkout-bank">
      {error && (
        <Banner
          tone="danger"
          title={t(
            "portal.billing.prepaid.buy.invoiceErrorTitle",
            "Couldn't generate the invoice",
          )}
        >
          {error}
        </Banner>
      )}
      <p className="portal-billing__bundle-field-hint">
        {t(
          "portal.billing.prepaid.pay.bankHint",
          "We'll email a Stripe invoice (net 30). Your prepaid year activates as soon as payment clears.",
        )}
      </p>
      <div className="portal-billing__bundle-foot-end">
        <Button accent="premium" disabled={busy} onClick={generate}>
          {t("portal.billing.prepaid.pay.generateInvoice", "Generate invoice")}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: confirmation ─────────────────────────────────────────────────────

function ConfirmationStep({
  credits,
  priceMinor,
  currency,
  invoicePending,
  hostedInvoiceUrl,
}: {
  credits: number;
  priceMinor: number | null;
  currency: string;
  invoicePending: boolean;
  hostedInvoiceUrl: string | null;
}) {
  const { t } = useTranslation();
  if (invoicePending) {
    return (
      <div className="portal-billing__bundle-confirm">
        <p className="portal-billing__bundle-confirm-body">
          {t(
            "portal.billing.prepaid.buy.invoiceSentBody",
            "Your invoice is on its way. Your prepaid year activates as soon as payment clears — no need to keep this open.",
          )}
        </p>
        {hostedInvoiceUrl && (
          <a
            className="portal-billing__bundle-invoice-link"
            href={hostedInvoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("portal.billing.prepaid.buy.viewInvoice", "View invoice")}
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="portal-billing__bundle-confirm">
      <p className="portal-billing__bundle-confirm-body">
        {t(
          "portal.billing.prepaid.buy.doneBody",
          "{{credits}} credits of prepaid capacity are ready. They're used before metered billing and expire 12 months from today.",
          { credits: credits.toLocaleString() },
        )}
      </p>
      {priceMinor != null && (
        <div className="portal-billing__bundle-summary-row">
          <span>{t("portal.billing.prepaid.buy.paidLabel", "Paid today")}</span>
          <strong>{formatMinor(priceMinor, currency)}</strong>
        </div>
      )}
    </div>
  );
}
