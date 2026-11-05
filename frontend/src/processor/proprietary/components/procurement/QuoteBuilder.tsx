import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { errorMessage, HttpError } from "@processor/api/http";
import { money } from "@processor/components/procurement/format";
import {
  buildQuote,
  QUOTE_BELOW_MINIMUM,
  recordLegalConsent,
  type QuoteConfigInput,
  type RateCard,
  type QuoteResult,
} from "@processor/api/procurement";
import {
  DetailsStep,
  PlanStep,
  SizingStep,
} from "@processor/components/procurement/QuoteBuilderSteps";
import { QuotePaper } from "@processor/components/procurement/QuotePaper";
import {
  estimateVolume,
  previewAnnualMinor,
} from "@processor/components/procurement/quotePricing";
import { LegalDocumentModal } from "@processor/components/procurement/ProcurementExtras";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
import { useProcurementPrefill } from "@processor/components/procurement/prefill";
import {
  focusFirstInvalid,
  isEmail,
  isFilled,
} from "@processor/components/procurement/formField";
import "@processor/theme/surface.css";
import "@processor/views/Procurement.css";

const STEPS = ["volume", "plan", "details", "review"] as const;
const DETAILS_STEP = 2;
const REVIEW_STEP = 3;
/** Share of the minimum from which a quote counts as nearly there, so the nudge is to top up. */
const NEAR_MINIMUM_RATIO = 0.75;
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
  rates,
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
  /** The server's rate card, which the live estimate is priced from. */
  rates: RateCard;
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
  const [emailTouched, setEmailTouched] = useState(false);
  // Same for the sizing step: Continue stays clickable and says what is missing.
  const [triedSizing, setTriedSizing] = useState(false);

  function set<K extends keyof QuoteConfigInput>(k: K, v: QuoteConfigInput[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  // Required buyer details before a quote can be generated (Order Form / invoice need these).
  const valid = {
    businessName: isFilled(cfg.businessName),
    contactName: isFilled(cfg.contactName),
    contactEmail: isEmail(cfg.contactEmail),
    addressLine1: isFilled(cfg.addressLine1),
    city: isFilled(cfg.city),
    region: isFilled(cfg.region),
    postalCode: isFilled(cfg.postalCode),
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

  const preview = previewAnnualMinor(cfg, rates);
  const tcvPreview =
    preview * cfg.termYears + (cfg.training ? rates.trainingOneTimeMinor : 0);
  // Priced off the usage fee, so its figure moves with the rest of the quote.
  const indemnityPreview =
    previewAnnualMinor({ ...cfg, indemnification: true }, rates) -
    previewAnnualMinor({ ...cfg, indemnification: false }, rates);

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
      ? money(rates.trainingOneTimeMinor)
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
      previewAnnualMinor({ ...cfg, volume: high }, rates) < minAnnualMinor &&
      high < MAX_VOLUME
    ) {
      low = high;
      high *= 2;
    }
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (previewAnnualMinor({ ...cfg, volume: mid }, rates) >= minAnnualMinor)
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
      focusFirstInvalid();
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
        (e.body as { error?: string } | null)?.error === QUOTE_BELOW_MINIMUM;
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
      />

      <div className="portal-qb__body">
        {step === 0 && (
          <SizingStep
            cfg={cfg}
            set={set}
            manualVolume={manualVolume}
            setManualVolume={setManualVolume}
            volumeInvalid={triedSizing && cfg.volume <= 0}
          />
        )}
        {step === 1 && (
          <PlanStep
            cfg={cfg}
            set={set}
            rates={rates}
            indemnityPreview={indemnityPreview}
          />
        )}
        {step === DETAILS_STEP && (
          <DetailsStep
            cfg={cfg}
            set={set}
            valid={valid}
            showErrors={showErrors}
            emailTouched={emailTouched}
            onEmailBlur={() => setEmailTouched(true)}
            eulaAlreadyAgreed={eulaAlreadyAgreed}
            eula={eula}
            setEula={setEula}
            onViewEula={() => setLegalDoc("eula")}
            canGenerate={canGenerate}
          />
        )}

        {/* No step heading here, unlike the form steps: the quote is the content, and a heading over
            it only repeats what the paper already says. The real issued figures, not the footer's
            client-side preview — this is the document the buyer circulates, so it has to match the
            PDF and the Stripe quote exactly. */}
        {step === REVIEW_STEP && issued && (
          <QuotePaper
            issued={issued}
            rates={rates}
            downloading={downloading}
            onDownload={onDownload}
          />
        )}
      </div>

      {showMinimum && (
        <MinimumNotice
          near={nearMinimum}
          minMinor={minAnnualMinor}
          previewMinor={preview}
          onScheduleCall={onScheduleCall}
          onRaise={raiseToMinimum}
          onEditUsage={() => setStep(0)}
          onComparePlans={onComparePlans}
        />
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
              onClick={() => {
                if (cfg.volume <= 0) {
                  setTriedSizing(true);
                  focusFirstInvalid();
                  return;
                }
                advance(1);
              }}
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

/** Why a quote under the Enterprise minimum can't go ahead, and the ways on from there. */
function MinimumNotice({
  near,
  minMinor,
  previewMinor,
  onScheduleCall,
  onRaise,
  onEditUsage,
  onComparePlans,
}: {
  /** Close enough that a little more usage clears it. */
  near: boolean;
  minMinor: number;
  previewMinor: number;
  onScheduleCall?: () => void;
  onRaise: () => void;
  onEditUsage: () => void;
  onComparePlans?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Banner
      tone="warning"
      className="portal-qb__minimum-callout"
      title={
        near
          ? t(
              "portal.procurement.builder.minimumNearTitle",
              "You're {{gap}} a year short of Enterprise.",
              { gap: money(minMinor - previewMinor) },
            )
          : t(
              "portal.procurement.builder.minimum",
              "Enterprise requires a minimum yearly spend of {{min}}.",
              { min: money(minMinor) },
            )
      }
      action={
        <div className="portal-qb__minimum-actions">
          {near ? (
            <>
              {onScheduleCall && (
                <Button variant="secondary" onClick={onScheduleCall}>
                  {t("portal.procurement.hero.scheduleCall")}
                </Button>
              )}
              <Button variant="primary" onClick={onRaise}>
                {t(
                  "portal.procurement.builder.raiseUsage",
                  "Raise estimated usage",
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onEditUsage}>
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
      {near
        ? t(
            "portal.procurement.builder.minimumNear",
            "Enterprise requires a minimum yearly spend of {{min}}. Raise your estimated usage to reach it, or talk it through with us.",
            { min: money(minMinor) },
          )
        : t(
            "portal.procurement.builder.minimumBelow",
            "This quote comes to {{annual}} a year. If you expect to use more, raise your estimated usage; otherwise the Team plan is likely a better fit.",
            { annual: money(previewMinor) },
          )}
    </Banner>
  );
}
