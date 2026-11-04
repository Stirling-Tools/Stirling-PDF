import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { errorMessage, HttpError } from "@processor/api/http";
import { money } from "@processor/components/procurement/format";
import {
  buildQuote,
  recordLegalConsent,
  type QuoteConfigInput,
  type QuoteResult,
} from "@processor/api/procurement";
import { LegalDocumentModal } from "@processor/components/procurement/ProcurementExtras";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
import { useProcurementPrefill } from "@processor/components/procurement/prefill";
import "@processor/theme/surface.css";
import "@processor/views/Procurement.css";

const STEPS = ["volume", "plan", "details", "review"] as const;
const DETAILS_STEP = 2;
const REVIEW_STEP = 3;
const TERM_DISCOUNT = [0, 0.03, 0.05, 0.06, 0.07]; // 1..5 years — meter-only discount (D71)
// Governance posture: the intensity (runs per PDF) fed to the committed-volume curve.
const POSTURES = [
  { intensity: 2, key: "essentials" },
  { intensity: 4, key: "governed" },
  { intensity: 7, key: "regulated" },
] as const;
// PDF-size tiers (D93): a multiplier on the rate. Default Standard (×1.4). Mirrors the server.
const SIZE_TIERS = [
  { mult: 1.0, key: "compact" },
  { mult: 1.4, key: "standard" },
  { mult: 2.4, key: "heavy" },
] as const;

/** Share of the minimum from which a quote counts as nearly there, so the nudge is to top up. */
const NEAR_MINIMUM_RATIO = 0.75;

/** Flat add-on prices, in cents; must equal the server's PricingRates.defaults(). */
const QBR_ANNUAL_MINOR = 800_000;
const TRAINING_MINOR = 750_000;
/** Upper bound for the volume search, far past any real estimate. */
const MAX_VOLUME = 1_000_000_000_000;

/**
 * The enterprise quote builder — volume → commitment &amp; service → details → review. A client-side
 * preview drives the live footer total; the backend is authoritative. Generating builds and issues in
 * one go, and the issued quote comes back as the fourth step: the buyer reads the real itemised paper
 * and can download it, but does not accept here. Accepting is a decision taken from the deal card,
 * deliberately, so circulating the quote internally is not a dead end in a modal.
 */
export function QuoteBuilder({
  deployment,
  seats = 0,
  email,
  onClose,
  dealDetails,
  initial,
  eulaAlreadyAgreed = false,
  minAnnualMinor = 0,
  onComparePlans,
  onScheduleCall,
  onGenerate,
  issued,
  downloading = false,
  onDownload,
}: {
  deployment: string;
  /** Seat count from the trial setup; seeds the users field + volume estimate on a fresh quote. */
  seats?: number;
  /** Linked-account email; prefills the contact email on a fresh quote's details step. */
  email?: string | null;
  /** Dismiss the builder. It draws its own header, so it carries the close too. */
  onClose?: () => void;
  /**
   * The buying entity captured at trial setup. Seeds a fresh quote's details step so it confirms
   * what is already known rather than asking twice; the buyer can still correct it here, since a
   * deal can change hands between trial and quote.
   */
  dealDetails?: {
    businessName?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
  };
  /** Smallest annual fee the server will quote; 0 when there is no floor. */
  minAnnualMinor?: number;
  /** Where a buyer too small for Enterprise goes instead: the self-serve plans. */
  onComparePlans?: () => void;
  /** Talk it through with us, offered when a quote falls just short of the minimum. */
  onScheduleCall?: () => void;
  /** Seed the builder from an existing quote's config (re-editing a quote). */
  initial?: QuoteConfigInput;
  /**
   * The issued quote, which is what the review step shows. Its arrival is also what opens that step:
   * the parent issues the quote and it lands by snapshot refresh, so there is no synchronous result
   * to advance on. Null while re-editing, so editing reopens the form rather than the paper.
   */
  issued?: QuoteResult | null;
  downloading?: boolean;
  onDownload?: () => void;
  /**
   * The buyer already accepted the EULA (e.g. at trial start). When true, the EULA clickwrap is
   * hidden here and no consent is recorded at quote time — it's only collected once.
   */
  eulaAlreadyAgreed?: boolean;
  /** Called with the priced DRAFT quote; the parent issues it as a Stripe Quote. */
  onGenerate: (quote: QuoteResult) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const prefill = useProcurementPrefill();
  const [cfg, setCfg] = useState<QuoteConfigInput>(
    initial ?? {
      // Users-first: with no seats from the trial, leave volume empty so entering the team size
      // auto-fills it (rather than pre-seeding a figure that hides the users → volume estimate).
      volume: seats > 0 ? estimateVolume(seats) : 0,
      users: Math.max(0, seats),
      intensity: 4, // Governed — the default governance posture per the pricing alignment
      sizeMult: 1.4, // Standard — the default PDF-size tier (D93)
      deployment,
      // One year: the sizing step prices the base rate, and longer terms' discounts belong to the
      // commitment step where the term is chosen.
      termYears: 1,
      serviceLevel: "priority",
      indemnification: false,
      training: false,
      qbr: false,
      businessName: dealDetails?.businessName ?? "",
      contactName: dealDetails?.contactName ?? "",
      contactEmail: dealDetails?.contactEmail ?? email ?? "",
      addressLine1: prefill?.addressLine1 ?? "",
      addressLine2: "",
      city: prefill?.city ?? "",
      region: prefill?.region ?? "",
      postalCode: prefill?.postalCode ?? "",
      poNumber: "",
      taxId: "",
    },
  );
  // A seeded quote's volume may have been typed rather than estimated, so keep it as is.
  const [manualVolume, setManualVolume] = useState(initial != null);
  // Never pre-ticked, even when re-editing a quote: a consent the buyer did not tick in this session
  // is not a consent, and recordLegalConsent would have logged one as though they had.
  const [eula, setEula] = useState(false);
  const [legalDoc, setLegalDoc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generateError, setGenerateError] = useState<{
    message: string;
    /** The server declined the deal for its size, so the self-serve plans are the way on. */
    tooSmall: boolean;
  } | null>(null);
  // Set by moving on (or generating) under the floor, so the warning answers that step rather than
  // nagging while the buyer is still sizing the quote.
  const [triedBelowMinimum, setTriedBelowMinimum] = useState(false);
  // Only surface field errors once the buyer tries to generate — no red fields on first sight.
  const [showErrors, setShowErrors] = useState(false);

  function set<K extends keyof QuoteConfigInput>(k: K, v: QuoteConfigInput[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  // Required buyer details before a quote can be generated (Order Form / invoice need these).
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    (cfg.contactEmail ?? "").trim(),
  );
  const valid = {
    businessName: cfg.businessName.trim().length > 0,
    contactName: (cfg.contactName ?? "").trim().length > 0,
    contactEmail: emailOk,
    addressLine1: (cfg.addressLine1 ?? "").trim().length > 0,
    city: (cfg.city ?? "").trim().length > 0,
    region: (cfg.region ?? "").trim().length > 0,
    postalCode: (cfg.postalCode ?? "").trim().length > 0,
  };
  const detailsValid = Object.values(valid).every(Boolean);
  const eulaOk = eulaAlreadyAgreed || eula;
  const canGenerate = detailsValid && eulaOk;

  // Re-editing an existing quote: everything is seeded, so jump to the details step with the
  // agreement pre-accepted — one click re-generates, or Back to change a field. No walking from step 1.
  // Mount-only: seed the step from `initial` once (deliberately no deps).
  useEffect(() => {
    if (initial) setStep(DETAILS_STEP);
  }, []);

  // Issuing lands by snapshot refresh rather than as a return value, so the arrival of the issued
  // quote is what opens the review step. Keyed on the quote's id, not the object: React Query hands
  // back a fresh object on every refetch, which would yank a buyer who had walked Back to the form.
  useEffect(() => {
    if (issued) setStep(REVIEW_STEP);
  }, [issued?.quoteId]);

  const preview = previewAnnualMinor(cfg);
  const tcvPreview =
    preview * cfg.termYears + (cfg.training ? TRAINING_MINOR : 0);
  // Priced off the usage fee, so its figure moves with the rest of the quote.
  const indemnityPreview =
    previewAnnualMinor({ ...cfg, indemnification: true }) -
    previewAnnualMinor({ ...cfg, indemnification: false });

  // On the review step the footer quotes the issued figures rather than the client-side preview, so
  // the running total never disagrees with the paper directly above it.
  const onPaper = issued != null && step === REVIEW_STEP;
  const running = onPaper
    ? {
        annual: money(issued.annualNetMinor, issued.currency),
        years: issued.config.termYears,
        tcv: money(issued.tcvMinor, issued.currency),
      }
    : {
        annual: money(preview),
        years: cfg.termYears,
        tcv: money(tcvPreview),
      };
  // Onboarding is one-time, so over a single year it shows beside the yearly price; on paper as
  // the issued quote charged it, in its currency.
  const trainingLine = onPaper
    ? issued.lineItems.find((li) => li.key === "training")
    : undefined;
  const oneTime = onPaper
    ? trainingLine
      ? money(trainingLine.amountMinor, issued.currency)
      : null
    : cfg.training
      ? money(TRAINING_MINOR)
      : null;

  // The preview uses the server's rates, so a draft under the floor is caught here rather than by
  // the server refusing to price it.
  const belowMinimum =
    !onPaper && minAnnualMinor > 0 && preview < minAnnualMinor;
  const showMinimum = belowMinimum && triedBelowMinimum;
  // Close enough that a little more usage clears it: help them over rather than away.
  const nearMinimum =
    belowMinimum && preview >= minAnnualMinor * NEAR_MINIMUM_RATIO;

  /** Lift the estimated volume just far enough for the quote to clear the minimum. */
  function raiseToMinimum() {
    let low = cfg.volume;
    let high = Math.max(cfg.volume, 1) * 2;
    while (
      previewAnnualMinor({ ...cfg, volume: high }) < minAnnualMinor &&
      high < MAX_VOLUME
    ) {
      low = high;
      high *= 2;
    }
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (previewAnnualMinor({ ...cfg, volume: mid }) >= minAnnualMinor)
        high = mid;
      else low = mid;
    }
    setManualVolume(true);
    set("volume", high);
  }

  // Fully filled → price + hand the draft to the parent to issue as a Stripe Quote (which then shows
  // as the milestone). No separate in-builder preview step.
  // Moving on never waits on the minimum; it only raises the warning, which stays until the
  // quote clears it.
  function advance(next: number) {
    if (belowMinimum) setTriedBelowMinimum(true);
    setStep(next);
  }

  async function generate() {
    if (!canGenerate) {
      setShowErrors(true);
      return;
    }
    if (belowMinimum) {
      setTriedBelowMinimum(true);
      return;
    }
    setBusy(true);
    setGenerateError(null);
    try {
      const quote = await buildQuote(cfg);
      // Record the EULA clickwrap only when it's collected here — i.e. the buyer didn't already
      // accept it at trial start. Best-effort.
      if (!eulaAlreadyAgreed) void recordLegalConsent("eula", "quote");
      onGenerate(quote);
    } catch (e) {
      // The server names a quote under the minimum Enterprise size; any other conflict is the deal
      // having moved on elsewhere (accepted in another tab, say).
      const conflict = e instanceof HttpError && e.status === 409;
      const tooSmall =
        conflict &&
        (e.body as { error?: string } | null)?.error === "quote_below_minimum";
      setGenerateError({
        tooSmall,
        message: tooSmall
          ? t(
              "portal.procurement.builder.belowMinimum",
              "This quote is below the minimum size for an Enterprise deal.",
            )
          : conflict
            ? t(
                "portal.procurement.builder.conflict",
                "This deal has changed since you opened it. Close the builder and reload the page to see where it stands.",
              )
            : errorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-qb">
      <StepModalHeader
        title={t("portal.procurement.builder.title")}
        step={step + 1}
        total={STEPS.length}
        stepLabel={t("portal.procurement.builder.stepOf", {
          n: step + 1,
          total: STEPS.length,
        })}
        onClose={onClose}
      />

      <div className="portal-qb__body">
        {step === 0 && (
          <Step
            icon={<Icon name="file-text" size={22} />}
            title={t("portal.procurement.builder.s1Title")}
            sub={t("portal.procurement.builder.s1Sub")}
          >
            <div className="portal-qb__row">
              <Field label={t("portal.procurement.builder.users")}>
                <input
                  type="number"
                  min={0}
                  placeholder={t("portal.procurement.builder.usersPlaceholder")}
                  value={cfg.users || ""}
                  onChange={(e) => {
                    const users = Number(e.target.value);
                    set("users", users);
                    // A manual figure gives way here, as the hint under the fields promises.
                    setManualVolume(false);
                    set("volume", estimateVolume(users));
                  }}
                />
              </Field>
              <Field label={t("portal.procurement.builder.volume")}>
                <input
                  type="number"
                  min={0}
                  placeholder={t(
                    "portal.procurement.builder.volumePlaceholder",
                  )}
                  value={cfg.volume || ""}
                  onChange={(e) => {
                    setManualVolume(true);
                    set("volume", Number(e.target.value));
                  }}
                />
              </Field>
            </div>
            <p className="portal-qb__hint">
              {cfg.users > 0 && !manualVolume
                ? t("portal.procurement.builder.volEstimated", {
                    count: cfg.users,
                  })
                : cfg.users > 0
                  ? t("portal.procurement.builder.volManual")
                  : t("portal.procurement.builder.volNoUsers")}
            </p>
            <Field label={t("portal.procurement.builder.posture")}>
              <div className="portal-qb__opts">
                {POSTURES.map((p) => (
                  <OptCard
                    key={p.key}
                    on={cfg.intensity === p.intensity}
                    title={t(`portal.procurement.builder.posture_${p.key}`)}
                    sub={`${t("portal.procurement.builder.posture_count", {
                      count: p.intensity,
                    })} · ${t(`portal.procurement.builder.posture_${p.key}Sub`)}`}
                    onClick={() => set("intensity", p.intensity)}
                  />
                ))}
              </div>
            </Field>

            <Field label={t("portal.procurement.builder.pdfSize")}>
              <div className="portal-qb__opts">
                {SIZE_TIERS.map((s) => (
                  <OptCard
                    key={s.key}
                    on={cfg.sizeMult === s.mult}
                    title={t(`portal.procurement.builder.size_${s.key}`)}
                    // The multiplier stays in the price, not on the card: it is rate detail buyers
                    // need not weigh, and the running estimate already shows its effect.
                    sub={t(`portal.procurement.builder.size_${s.key}Sub`)}
                    onClick={() => set("sizeMult", s.mult)}
                  />
                ))}
              </div>
            </Field>
          </Step>
        )}

        {step === 1 && (
          <Step
            icon={<Icon name="shield-check" size={22} />}
            title={t("portal.procurement.builder.s2Title")}
            sub={t("portal.procurement.builder.s2Sub")}
          >
            <Field label={t("portal.procurement.builder.term")}>
              <div className="portal-qb__pills">
                {[1, 2, 3, 4, 5].map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-on={cfg.termYears === y || undefined}
                    onClick={() => set("termYears", y)}
                  >
                    {t("portal.procurement.builder.years", { count: y })}
                  </button>
                ))}
              </div>
              {TERM_DISCOUNT[cfg.termYears - 1] > 0 && (
                <p className="portal-qb__discount">
                  {t("portal.procurement.builder.termDiscount", {
                    pct: Math.round(TERM_DISCOUNT[cfg.termYears - 1] * 100),
                  })}
                </p>
              )}
            </Field>

            <Field label={t("portal.procurement.builder.serviceLevel")}>
              <div className="portal-qb__opts">
                <OptCard
                  on={cfg.serviceLevel === "standard"}
                  title={t("portal.procurement.builder.slStandard")}
                  sub={t("portal.procurement.builder.slStandardSub")}
                  onClick={() => set("serviceLevel", "standard")}
                />
                <OptCard
                  on={cfg.serviceLevel === "priority"}
                  title={t("portal.procurement.builder.slPriority")}
                  sub={t("portal.procurement.builder.slPrioritySub")}
                  onClick={() => set("serviceLevel", "priority")}
                />
                <OptCard
                  on={cfg.serviceLevel === "dedicated"}
                  title={t("portal.procurement.builder.slDedicated")}
                  sub={t("portal.procurement.builder.slDedicatedSub")}
                  onClick={() => set("serviceLevel", "dedicated")}
                />
              </div>
            </Field>

            <Field label={t("portal.procurement.builder.addons")}>
              <div className="portal-qb__addons">
                <AddOn
                  on={cfg.indemnification}
                  title={t("portal.procurement.builder.indemnification")}
                  sub={`${t("portal.procurement.builder.indemnificationSub")} · ${t(
                    "portal.procurement.builder.addonPerYear",
                    { amount: money(indemnityPreview) },
                  )}`}
                  onClick={() => set("indemnification", !cfg.indemnification)}
                />
                <AddOn
                  on={cfg.training}
                  title={t("portal.procurement.builder.training")}
                  sub={`${t("portal.procurement.builder.trainingSub")} · ${t(
                    "portal.procurement.builder.addonOneTime",
                    { amount: money(TRAINING_MINOR) },
                  )}`}
                  onClick={() => set("training", !cfg.training)}
                />
                <AddOn
                  on={cfg.qbr}
                  title={t("portal.procurement.builder.qbr")}
                  sub={`${t("portal.procurement.builder.qbrSub")} · ${t(
                    "portal.procurement.builder.addonPerYear",
                    { amount: money(QBR_ANNUAL_MINOR) },
                  )}`}
                  onClick={() => set("qbr", !cfg.qbr)}
                />
              </div>
            </Field>
          </Step>
        )}

        {step === 2 && (
          <Step
            icon={<Icon name="users" size={22} />}
            title={t("portal.procurement.builder.s3Title")}
            sub={t("portal.procurement.builder.s3Sub")}
          >
            <div className="portal-qb__row">
              <Field
                label={t("portal.procurement.builder.businessName")}
                required
                invalid={showErrors && !valid.businessName}
              >
                <input
                  placeholder={t(
                    "portal.procurement.builder.businessNamePlaceholder",
                  )}
                  value={cfg.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                />
              </Field>
              <Field
                label={t("portal.procurement.builder.contactName")}
                required
                invalid={showErrors && !valid.contactName}
              >
                <input
                  placeholder={t(
                    "portal.procurement.builder.contactNamePlaceholder",
                  )}
                  value={cfg.contactName ?? ""}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              </Field>
            </div>
            <Field
              label={t("portal.procurement.builder.contactEmail")}
              required
              invalid={showErrors && !valid.contactEmail}
            >
              <input
                type="email"
                placeholder={t(
                  "portal.procurement.builder.contactEmailPlaceholder",
                )}
                value={cfg.contactEmail ?? ""}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field
              label={t("portal.procurement.builder.addressLine1")}
              required
              invalid={showErrors && !valid.addressLine1}
            >
              <input
                placeholder={t(
                  "portal.procurement.builder.addressLine1Placeholder",
                )}
                value={cfg.addressLine1 ?? ""}
                onChange={(e) => set("addressLine1", e.target.value)}
              />
            </Field>
            <Field label={t("portal.procurement.builder.addressLine2")}>
              <input
                placeholder={t(
                  "portal.procurement.builder.addressLine2Placeholder",
                )}
                value={cfg.addressLine2 ?? ""}
                onChange={(e) => set("addressLine2", e.target.value)}
              />
            </Field>
            <div className="portal-qb__row">
              <Field
                label={t("portal.procurement.builder.city")}
                required
                invalid={showErrors && !valid.city}
              >
                <input
                  placeholder={t("portal.procurement.builder.cityPlaceholder")}
                  value={cfg.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field
                label={t("portal.procurement.builder.region")}
                required
                invalid={showErrors && !valid.region}
              >
                <input
                  placeholder={t(
                    "portal.procurement.builder.regionPlaceholder",
                  )}
                  value={cfg.region ?? ""}
                  onChange={(e) => set("region", e.target.value)}
                />
              </Field>
              <Field
                label={t("portal.procurement.builder.postalCode")}
                required
                invalid={showErrors && !valid.postalCode}
              >
                <input
                  placeholder={t(
                    "portal.procurement.builder.postalCodePlaceholder",
                  )}
                  value={cfg.postalCode ?? ""}
                  onChange={(e) => set("postalCode", e.target.value)}
                />
              </Field>
            </div>
            <div className="portal-qb__row">
              <Field label={t("portal.procurement.builder.poNumber")}>
                <input
                  placeholder={t(
                    "portal.procurement.builder.poNumberPlaceholder",
                  )}
                  value={cfg.poNumber ?? ""}
                  onChange={(e) => set("poNumber", e.target.value)}
                />
              </Field>
              <Field label={t("portal.procurement.builder.taxId")}>
                <input
                  placeholder={t("portal.procurement.builder.taxIdPlaceholder")}
                  value={cfg.taxId ?? ""}
                  onChange={(e) => set("taxId", e.target.value)}
                />
              </Field>
            </div>
            {!eulaAlreadyAgreed && (
              <label className="portal-qb__eula">
                <input
                  type="checkbox"
                  checked={eula}
                  onChange={(e) => setEula(e.target.checked)}
                />
                <span>
                  {t("portal.procurement.builder.eula")}{" "}
                  <button
                    type="button"
                    className="portal-legal__link"
                    onClick={() => setLegalDoc("eula")}
                  >
                    {t("portal.procurement.builder.viewEula")}
                  </button>
                </span>
              </label>
            )}
            {showErrors && !canGenerate && (
              <p className="portal-qb__error">
                {t("portal.procurement.builder.completeRequired")}
              </p>
            )}
          </Step>
        )}

        {/* No step heading here, unlike the form steps: the quote is the content, and a heading over
            it only repeats what the paper already says. The real issued figures, not the footer's
            client-side preview — this is the document the buyer circulates, so it has to match the
            PDF and the Stripe quote exactly. */}
        {step === REVIEW_STEP && issued && (
          <div className="portal-qb__papertray">
            <div className="portal-surface portal-qb__paper">
              <div className="portal-qb__paper-head">
                <div>
                  <div className="portal-qb__paper-brand">Stirling PDF</div>
                  <div className="portal-qb__paper-eyebrow">
                    {t("portal.procurement.builder.paperEyebrow")}
                  </div>
                </div>
                <div className="portal-qb__paper-meta">
                  <div className="portal-qb__quote-number">
                    {issued.quoteNumber}
                  </div>
                  {issued.validUntil && (
                    <div>
                      {t("portal.procurement.review.validUntil", {
                        date: new Date(issued.validUntil).toLocaleDateString(),
                      })}
                    </div>
                  )}
                  {/* On the document rather than in the footer: it downloads this paper, so it
                        belongs to it, and the footer stays the flow's own Back/Done. */}
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="portal-qb__paper-download"
                    leftSection={<Icon name="download" size={14} />}
                    loading={downloading}
                    onClick={onDownload}
                  >
                    {t("portal.procurement.review.downloadCta")}
                  </Button>
                </div>
              </div>

              {issued.config.businessName?.trim() && (
                <div className="portal-qb__paper-for">
                  <div className="portal-qb__paper-eyebrow">
                    {t("portal.procurement.builder.paperFor")}
                  </div>
                  <div className="portal-qb__paper-company">
                    {issued.config.businessName}
                  </div>
                </div>
              )}

              <ul className="portal-qb__lines">
                {issued.lineItems.map((li) => (
                  <li key={li.key} data-kind={li.kind}>
                    <span>{li.label}</span>
                    <span>
                      {/* Marked, since one-off charges sit outside the yearly fee totalled below. */}
                      {li.kind === "ONE_TIME" && (
                        <span className="portal-qb__line-note">
                          {t("portal.procurement.review.oneTime")}
                        </span>
                      )}
                      {money(li.amountMinor, issued.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="portal-qb__total">
                <div>
                  <div className="portal-qb__total-label">
                    {t("portal.procurement.review.annual")}
                  </div>
                  <div className="portal-qb__total-tcv">
                    {t("portal.procurement.review.tcv", {
                      years: issued.config.termYears,
                      tcv: money(issued.tcvMinor, issued.currency),
                    })}
                  </div>
                  <div className="portal-qb__total-tcv">
                    {t("portal.procurement.review.renewal", {
                      amount: money(
                        issued.renewalAnnualNetMinor,
                        issued.currency,
                      ),
                      pct: issued.cpiRatePct,
                    })}
                  </div>
                  {issued.config.poNumber?.trim() && (
                    <div className="portal-qb__total-tcv">
                      {t("portal.procurement.review.poNumber", {
                        po: issued.config.poNumber.trim(),
                      })}
                    </div>
                  )}
                </div>
                <div className="portal-qb__total-num">
                  <strong>
                    {money(issued.annualNetMinor, issued.currency)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showMinimum && (
        <Banner
          tone="warning"
          className="portal-qb__minimum-callout"
          title={
            nearMinimum
              ? t(
                  "portal.procurement.builder.minimumNearTitle",
                  "You're {{gap}} a year short of Enterprise.",
                  { gap: money(minAnnualMinor - preview) },
                )
              : t(
                  "portal.procurement.builder.minimum",
                  "Enterprise requires a minimum yearly spend of {{min}}.",
                  { min: money(minAnnualMinor) },
                )
          }
          action={
            <div className="portal-qb__minimum-actions">
              {nearMinimum ? (
                <>
                  {onScheduleCall && (
                    <Button variant="secondary" onClick={onScheduleCall}>
                      {t("portal.procurement.hero.scheduleCall")}
                    </Button>
                  )}
                  <Button variant="primary" onClick={raiseToMinimum}>
                    {t(
                      "portal.procurement.builder.raiseUsage",
                      "Raise estimated usage",
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setStep(0)}>
                    {t("portal.procurement.builder.editUsage", "Edit usage")}
                  </Button>
                  {onComparePlans && (
                    <Button
                      variant="primary"
                      rightSection={<Icon name="arrow-right" size={16} />}
                      onClick={onComparePlans}
                    >
                      {t("portal.billing.compare.open", "Compare plans")}
                    </Button>
                  )}
                </>
              )}
            </div>
          }
        >
          {nearMinimum
            ? t(
                "portal.procurement.builder.minimumNear",
                "Enterprise requires a minimum yearly spend of {{min}}. Raise your estimated usage to reach it, or talk it through with us.",
                { min: money(minAnnualMinor) },
              )
            : t(
                "portal.procurement.builder.minimumBelow",
                "This quote comes to {{annual}} a year. If you expect to use more, raise your estimated usage; otherwise the Team plan is likely a better fit.",
                { annual: money(preview) },
              )}
        </Banner>
      )}

      {generateError && (
        <Banner
          tone="danger"
          title={t("portal.procurement.error.title")}
          onDismiss={() => setGenerateError(null)}
          action={
            generateError.tooSmall &&
            onComparePlans && (
              <Button size="sm" onClick={onComparePlans}>
                {t("portal.billing.compare.open", "Compare plans")}
              </Button>
            )
          }
        >
          {generateError.message}
        </Banner>
      )}

      <div className="portal-qb__foot">
        <div className="portal-qb__totals">
          <span className="portal-qb__running-label">
            {onPaper
              ? t("portal.procurement.builder.runningLabelIssued")
              : t("portal.procurement.builder.runningLabel")}
          </span>
          <span className="portal-qb__running">
            {t("portal.procurement.builder.runningOneYear", {
              annual: running.annual,
            })}
          </span>
          {/* A one-year term's total is its yearly price; repeating it says nothing. */}
          {running.years > 1 && (
            <span className="portal-qb__running-total">
              {t("portal.procurement.builder.runningTotal", running)}
            </span>
          )}
          {/* Over one year there is no term total to fold onboarding into, so it shows on its own. */}
          {running.years === 1 && oneTime && (
            <span className="portal-qb__running-total">
              {t("portal.procurement.builder.addonOneTime", {
                amount: oneTime,
              })}
            </span>
          )}
          {belowMinimum && !showMinimum && (
            <span className="portal-qb__minimum">
              {t(
                "portal.procurement.builder.minimum",
                "Enterprise requires a minimum yearly spend of {{min}}.",
                { min: money(minAnnualMinor) },
              )}
            </span>
          )}
        </div>
        <div className="portal-qb__foot-btns">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              {t("portal.procurement.builder.back")}
            </Button>
          )}
          {step === 0 && (
            <Button
              variant="primary"
              disabled={cfg.volume <= 0}
              onClick={() => advance(1)}
            >
              {t("portal.procurement.builder.continue")}
            </Button>
          )}
          {step === 1 && (
            <Button variant="primary" onClick={() => advance(2)}>
              {t("portal.procurement.builder.continue")}
            </Button>
          )}
          {step === DETAILS_STEP && (
            <Button
              variant={showMinimum ? "secondary" : "primary"}
              loading={busy}
              onClick={generate}
            >
              {t("portal.procurement.builder.generate")}
            </Button>
          )}
          {/* No Accept here: the review step ends on the deal card, where accepting is one of two
              deliberate choices rather than the only way out of a modal. Download lives on the
              document itself. */}
          {step === REVIEW_STEP && (
            <Button variant="primary" onClick={onClose}>
              {t("portal.procurement.builder.done")}
            </Button>
          )}
        </div>
      </div>
      <LegalDocumentModal docId={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}

function Step({
  icon,
  title,
  sub,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="portal-qb__intro">
        <span className="portal-qb__intro-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <div className="portal-qb__intro-title">{title}</div>
          <div className="portal-qb__intro-sub">{sub}</div>
        </div>
      </div>
      {children}
    </>
  );
}

function Field({
  label,
  required,
  invalid,
  children,
}: {
  label: string;
  required?: boolean;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="portal-qb__field" data-invalid={invalid || undefined}>
      <span className="portal-qb__field-label">
        {label}
        {required && (
          <span className="portal-qb__req" aria-hidden>
            {" *"}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function OptCard({
  on,
  title,
  sub,
  onClick,
}: {
  on: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="portal-qb__opt"
      data-on={on || undefined}
      onClick={onClick}
    >
      <span className="portal-qb__opt-title">{title}</span>
      <span className="portal-qb__opt-sub">{sub}</span>
    </button>
  );
}

function AddOn({
  on,
  title,
  sub,
  onClick,
}: {
  on: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="portal-qb__addon"
      data-on={on || undefined}
      onClick={onClick}
    >
      <span className="portal-qb__addon-box" aria-hidden>
        {on ? "✓" : ""}
      </span>
      <span>
        <span className="portal-qb__addon-title">{title}</span>
        <span className="portal-qb__addon-sub">{sub}</span>
      </span>
    </button>
  );
}

function estimateVolume(users: number): number {
  const raw = Math.max(0, users) * 5 * 230 * 1.75;
  const stepSize = raw >= 1_000_000 ? 50_000 : raw >= 100_000 ? 25_000 : 5_000;
  // A small team still processes something: rounding it to zero would leave nothing to price.
  return raw > 0
    ? Math.max(stepSize, Math.round(raw / stepSize) * stepSize)
    : 0;
}

// Client mirror of the server pricing curve (ProcurementPricingService / quotePricing). The server
// is authoritative; this only drives the live footer estimate. Minor units (cents); the meter
// rounds to whole dollars, exactly like the backend, so the preview matches the issued quote.
// Exported for the pricing-parity test, which pins this client estimate to the mock and the
// server's published fixtures so a rate-card change can't silently desync the footer from the
// issued quote. This copy stays non-authoritative — the backend prices the real quote.
export function previewAnnualMinor(cfg: QuoteConfigInput): number {
  const LIST = 0.01;
  const FLOOR = 0.005;
  const runVol = Math.max(0, cfg.volume) * Math.max(1, cfg.intensity);
  const volDisc =
    runVol > 1_000_000
      ? Math.min(0.5, 0.06 * Math.log2(runVol / 1_000_000))
      : 0;
  const rate = Math.max(FLOOR, LIST * (1 - volDisc)) * (cfg.sizeMult || 1);
  const termDisc = TERM_DISCOUNT[Math.min(Math.max(cfg.termYears, 1), 5) - 1];
  const meterNet = Math.round(runVol * rate * (1 - termDisc)) * 100; // whole $ → minor units
  const support = cfg.serviceLevel === "dedicated" ? 3_000_000 : 0; // std + priority included
  const deploy =
    cfg.deployment === "airgap"
      ? 3_600_000
      : cfg.deployment === "selfhost"
        ? 1_200_000
        : 0;
  const indemnity = cfg.indemnification ? Math.round(meterNet * 0.05) : 0;
  const qbr = cfg.qbr ? QBR_ANNUAL_MINOR : 0;
  return meterNet + support + deploy + indemnity + qbr;
}
