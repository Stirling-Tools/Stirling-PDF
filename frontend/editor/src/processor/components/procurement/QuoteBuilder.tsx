import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import {
  DocumentsIcon,
  DownloadIcon,
  PoliciesIcon,
  UsersIcon,
} from "@processor/components/icons";
import { money } from "@processor/components/procurement/format";
import {
  buildQuote,
  recordLegalConsent,
  type QuoteConfigInput,
  type QuoteResult,
} from "@processor/api/procurement";
import { LegalDocumentModal } from "@processor/components/procurement/ProcurementExtras";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
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
  /** Dismiss the dialog. The builder draws its own header, so it carries the close too. */
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
  const [cfg, setCfg] = useState<QuoteConfigInput>(
    initial ?? {
      // Users-first: with no seats from the trial, leave volume empty so entering the team size
      // auto-fills it (rather than pre-seeding a figure that hides the users → volume estimate).
      volume: seats > 0 ? estimateVolume(seats) : 0,
      users: Math.max(0, seats),
      intensity: 4, // Governed — the default governance posture per the pricing alignment
      sizeMult: 1.4, // Standard — the default PDF-size tier (D93)
      deployment,
      termYears: 3,
      serviceLevel: "priority",
      indemnification: false,
      training: false,
      qbr: false,
      businessName: dealDetails?.businessName ?? "",
      contactName: dealDetails?.contactName ?? "",
      contactEmail: dealDetails?.contactEmail ?? email ?? "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      region: "",
      postalCode: "",
      poNumber: "",
      taxId: "",
    },
  );
  // A seeded quote carries a volume but no user count, so treat it as manually set.
  const [manualVolume, setManualVolume] = useState(initial != null);
  // Never pre-ticked, even when re-editing a quote: a consent the buyer did not tick in this session
  // is not a consent, and recordLegalConsent would have logged one as though they had.
  const [eula, setEula] = useState(false);
  const [legalDoc, setLegalDoc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const tcvPreview = preview * cfg.termYears + (cfg.training ? 750_000 : 0);

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

  // Fully filled → price + hand the draft to the parent to issue as a Stripe Quote (which then shows
  // as the milestone). No separate in-builder preview step.
  async function generate() {
    if (!canGenerate) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      const quote = await buildQuote(cfg);
      // Record the EULA clickwrap only when it's collected here — i.e. the buyer didn't already
      // accept it at trial start. Best-effort.
      if (!eulaAlreadyAgreed) void recordLegalConsent("eula", "quote");
      onGenerate(quote);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="processor-qb">
      <StepModalHeader
        title={t("processor.procurement.builder.title")}
        step={step + 1}
        total={STEPS.length}
        stepLabel={t("processor.procurement.builder.stepOf", {
          n: step + 1,
          total: STEPS.length,
        })}
        onClose={onClose}
      />

      <div className="processor-qb__body">
        {step === 0 && (
          <Step
            icon={<DocumentsIcon size={22} />}
            title={t("processor.procurement.builder.s1Title")}
            sub={t("processor.procurement.builder.s1Sub")}
          >
            <div className="processor-qb__row">
              <Field label={t("processor.procurement.builder.users")}>
                <input
                  type="number"
                  min={0}
                  placeholder={t(
                    "processor.procurement.builder.usersPlaceholder",
                  )}
                  value={cfg.users || ""}
                  onChange={(e) => {
                    const users = Number(e.target.value);
                    set("users", users);
                    if (!manualVolume) set("volume", estimateVolume(users));
                  }}
                />
              </Field>
              <Field label={t("processor.procurement.builder.volume")}>
                <input
                  type="number"
                  min={0}
                  placeholder={t(
                    "processor.procurement.builder.volumePlaceholder",
                  )}
                  value={cfg.volume || ""}
                  onChange={(e) => {
                    setManualVolume(true);
                    set("volume", Number(e.target.value));
                  }}
                />
              </Field>
            </div>
            <p className="processor-qb__hint">
              {cfg.users > 0 && !manualVolume
                ? t("processor.procurement.builder.volEstimated", {
                    count: cfg.users,
                  })
                : cfg.users > 0
                  ? t("processor.procurement.builder.volManual")
                  : t("processor.procurement.builder.volNoUsers")}
            </p>
            <Field label={t("processor.procurement.builder.posture")}>
              <div className="processor-qb__opts">
                {POSTURES.map((p) => (
                  <OptCard
                    key={p.key}
                    on={cfg.intensity === p.intensity}
                    title={t(`processor.procurement.builder.posture_${p.key}`)}
                    sub={`${t("processor.procurement.builder.posture_count", {
                      count: p.intensity,
                    })} · ${t(`processor.procurement.builder.posture_${p.key}Sub`)}`}
                    onClick={() => set("intensity", p.intensity)}
                  />
                ))}
              </div>
            </Field>

            <Field label={t("processor.procurement.builder.pdfSize")}>
              <div className="processor-qb__opts">
                {SIZE_TIERS.map((s) => (
                  <OptCard
                    key={s.key}
                    on={cfg.sizeMult === s.mult}
                    title={t(`processor.procurement.builder.size_${s.key}`)}
                    sub={`×${s.mult} · ${t(`processor.procurement.builder.size_${s.key}Sub`)}`}
                    onClick={() => set("sizeMult", s.mult)}
                  />
                ))}
              </div>
            </Field>
          </Step>
        )}

        {step === 1 && (
          <Step
            icon={<PoliciesIcon size={22} />}
            title={t("processor.procurement.builder.s2Title")}
            sub={t("processor.procurement.builder.s2Sub")}
          >
            <Field label={t("processor.procurement.builder.term")}>
              <div className="processor-qb__pills">
                {[1, 2, 3, 4, 5].map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-on={cfg.termYears === y || undefined}
                    onClick={() => set("termYears", y)}
                  >
                    {t("processor.procurement.builder.years", { count: y })}
                  </button>
                ))}
              </div>
              {TERM_DISCOUNT[cfg.termYears - 1] > 0 && (
                <p className="processor-qb__discount">
                  {t("processor.procurement.builder.termDiscount", {
                    pct: Math.round(TERM_DISCOUNT[cfg.termYears - 1] * 100),
                  })}
                </p>
              )}
            </Field>

            <Field label={t("processor.procurement.builder.serviceLevel")}>
              <div className="processor-qb__opts">
                <OptCard
                  on={cfg.serviceLevel === "standard"}
                  title={t("processor.procurement.builder.slStandard")}
                  sub={t("processor.procurement.builder.slStandardSub")}
                  onClick={() => set("serviceLevel", "standard")}
                />
                <OptCard
                  on={cfg.serviceLevel === "priority"}
                  title={t("processor.procurement.builder.slPriority")}
                  sub={t("processor.procurement.builder.slPrioritySub")}
                  onClick={() => set("serviceLevel", "priority")}
                />
                <OptCard
                  on={cfg.serviceLevel === "dedicated"}
                  title={t("processor.procurement.builder.slDedicated")}
                  sub={t("processor.procurement.builder.slDedicatedSub")}
                  onClick={() => set("serviceLevel", "dedicated")}
                />
              </div>
            </Field>

            <Field label={t("processor.procurement.builder.addons")}>
              <div className="processor-qb__addons">
                <AddOn
                  on={cfg.indemnification}
                  title={t("processor.procurement.builder.indemnification")}
                  sub={t("processor.procurement.builder.indemnificationSub")}
                  onClick={() => set("indemnification", !cfg.indemnification)}
                />
                <AddOn
                  on={cfg.training}
                  title={t("processor.procurement.builder.training")}
                  sub={t("processor.procurement.builder.trainingSub")}
                  onClick={() => set("training", !cfg.training)}
                />
                <AddOn
                  on={cfg.qbr}
                  title={t("processor.procurement.builder.qbr")}
                  sub={t("processor.procurement.builder.qbrSub")}
                  onClick={() => set("qbr", !cfg.qbr)}
                />
              </div>
            </Field>
          </Step>
        )}

        {step === 2 && (
          <Step
            icon={<UsersIcon size={22} />}
            title={t("processor.procurement.builder.s3Title")}
            sub={t("processor.procurement.builder.s3Sub")}
          >
            <div className="processor-qb__row">
              <Field
                label={t("processor.procurement.builder.businessName")}
                required
                invalid={showErrors && !valid.businessName}
              >
                <input
                  placeholder={t(
                    "processor.procurement.builder.businessNamePlaceholder",
                  )}
                  value={cfg.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                />
              </Field>
              <Field
                label={t("processor.procurement.builder.contactName")}
                required
                invalid={showErrors && !valid.contactName}
              >
                <input
                  placeholder={t(
                    "processor.procurement.builder.contactNamePlaceholder",
                  )}
                  value={cfg.contactName ?? ""}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              </Field>
            </div>
            <Field
              label={t("processor.procurement.builder.contactEmail")}
              required
              invalid={showErrors && !valid.contactEmail}
            >
              <input
                type="email"
                placeholder={t(
                  "processor.procurement.builder.contactEmailPlaceholder",
                )}
                value={cfg.contactEmail ?? ""}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field
              label={t("processor.procurement.builder.addressLine1")}
              required
              invalid={showErrors && !valid.addressLine1}
            >
              <input
                placeholder={t(
                  "processor.procurement.builder.addressLine1Placeholder",
                )}
                value={cfg.addressLine1 ?? ""}
                onChange={(e) => set("addressLine1", e.target.value)}
              />
            </Field>
            <Field label={t("processor.procurement.builder.addressLine2")}>
              <input
                placeholder={t(
                  "processor.procurement.builder.addressLine2Placeholder",
                )}
                value={cfg.addressLine2 ?? ""}
                onChange={(e) => set("addressLine2", e.target.value)}
              />
            </Field>
            <div className="processor-qb__row">
              <Field
                label={t("processor.procurement.builder.city")}
                required
                invalid={showErrors && !valid.city}
              >
                <input
                  placeholder={t(
                    "processor.procurement.builder.cityPlaceholder",
                  )}
                  value={cfg.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field
                label={t("processor.procurement.builder.region")}
                required
                invalid={showErrors && !valid.region}
              >
                <input
                  placeholder={t(
                    "processor.procurement.builder.regionPlaceholder",
                  )}
                  value={cfg.region ?? ""}
                  onChange={(e) => set("region", e.target.value)}
                />
              </Field>
              <Field
                label={t("processor.procurement.builder.postalCode")}
                required
                invalid={showErrors && !valid.postalCode}
              >
                <input
                  placeholder={t(
                    "processor.procurement.builder.postalCodePlaceholder",
                  )}
                  value={cfg.postalCode ?? ""}
                  onChange={(e) => set("postalCode", e.target.value)}
                />
              </Field>
            </div>
            <div className="processor-qb__row">
              <Field label={t("processor.procurement.builder.poNumber")}>
                <input
                  placeholder={t(
                    "processor.procurement.builder.poNumberPlaceholder",
                  )}
                  value={cfg.poNumber ?? ""}
                  onChange={(e) => set("poNumber", e.target.value)}
                />
              </Field>
              <Field label={t("processor.procurement.builder.taxId")}>
                <input
                  placeholder={t(
                    "processor.procurement.builder.taxIdPlaceholder",
                  )}
                  value={cfg.taxId ?? ""}
                  onChange={(e) => set("taxId", e.target.value)}
                />
              </Field>
            </div>
            {!eulaAlreadyAgreed && (
              <label className="processor-qb__eula">
                <input
                  type="checkbox"
                  checked={eula}
                  onChange={(e) => setEula(e.target.checked)}
                />
                <span>
                  {t("processor.procurement.builder.eula")}{" "}
                  <button
                    type="button"
                    className="processor-legal__link"
                    onClick={() => setLegalDoc("eula")}
                  >
                    {t("processor.procurement.builder.viewEula")}
                  </button>
                </span>
              </label>
            )}
            {showErrors && !canGenerate && (
              <p className="processor-qb__error">
                {t("processor.procurement.builder.completeRequired")}
              </p>
            )}
          </Step>
        )}

        {/* No step heading here, unlike the form steps: the quote is the content, and a heading over
            it only repeats what the paper already says. The real issued figures, not the footer's
            client-side preview — this is the document the buyer circulates, so it has to match the
            PDF and the Stripe quote exactly. */}
        {step === REVIEW_STEP && issued && (
          <div className="processor-qb__papertray">
            <div className="processor-surface processor-qb__paper">
              <div className="processor-qb__paper-head">
                <div>
                  <div className="processor-qb__paper-brand">Stirling PDF</div>
                  <div className="processor-qb__paper-eyebrow">
                    {t("processor.procurement.builder.paperEyebrow")}
                  </div>
                </div>
                <div className="processor-qb__paper-meta">
                  <div className="processor-qb__quote-number">
                    {issued.quoteNumber}
                  </div>
                  {issued.validUntil && (
                    <div>
                      {t("processor.procurement.review.validUntil", {
                        date: new Date(issued.validUntil).toLocaleDateString(),
                      })}
                    </div>
                  )}
                  {/* On the document rather than in the footer: it downloads this paper, so it
                        belongs to it, and the footer stays the flow's own Back/Done. */}
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="processor-qb__paper-download"
                    leftSection={<DownloadIcon size={14} />}
                    loading={downloading}
                    onClick={onDownload}
                  >
                    {t("processor.procurement.review.downloadCta")}
                  </Button>
                </div>
              </div>

              {issued.config.businessName?.trim() && (
                <div className="processor-qb__paper-for">
                  <div className="processor-qb__paper-eyebrow">
                    {t("processor.procurement.builder.paperFor")}
                  </div>
                  <div className="processor-qb__paper-company">
                    {issued.config.businessName}
                  </div>
                </div>
              )}

              <ul className="processor-qb__lines">
                {issued.lineItems.map((li) => (
                  <li key={li.key} data-kind={li.kind}>
                    <span>{li.label}</span>
                    <span>{money(li.amountMinor, issued.currency)}</span>
                  </li>
                ))}
              </ul>

              <div className="processor-qb__total">
                <div>
                  <div className="processor-qb__total-label">
                    {t("processor.procurement.review.annual")}
                  </div>
                  <div className="processor-qb__total-tcv">
                    {t("processor.procurement.review.tcv", {
                      years: issued.config.termYears,
                      tcv: money(issued.tcvMinor, issued.currency),
                    })}
                  </div>
                  <div className="processor-qb__total-tcv">
                    {t("processor.procurement.review.renewal", {
                      amount: money(
                        issued.renewalAnnualNetMinor,
                        issued.currency,
                      ),
                      pct: issued.cpiRatePct,
                    })}
                  </div>
                  {issued.config.poNumber?.trim() && (
                    <div className="processor-qb__total-tcv">
                      {t("processor.procurement.review.poNumber", {
                        po: issued.config.poNumber.trim(),
                      })}
                    </div>
                  )}
                </div>
                <div className="processor-qb__total-num">
                  {money(issued.annualNetMinor, issued.currency)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="processor-qb__foot">
        <span className="processor-qb__running">
          {t("processor.procurement.builder.running", running)}
        </span>
        <div className="processor-qb__foot-btns">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              {t("processor.procurement.builder.back")}
            </Button>
          )}
          {step === 0 && (
            <Button
              variant="primary"
              disabled={cfg.volume <= 0}
              onClick={() => setStep(1)}
            >
              {t("processor.procurement.builder.continue")}
            </Button>
          )}
          {step === 1 && (
            <Button variant="primary" onClick={() => setStep(2)}>
              {t("processor.procurement.builder.continue")}
            </Button>
          )}
          {step === DETAILS_STEP && (
            <Button variant="primary" loading={busy} onClick={generate}>
              {t("processor.procurement.builder.generate")}
            </Button>
          )}
          {/* No Accept here: the review step ends on the deal card, where accepting is one of two
              deliberate choices rather than the only way out of a modal. Download lives on the
              document itself. */}
          {step === REVIEW_STEP && (
            <Button variant="primary" onClick={onClose}>
              {t("processor.procurement.builder.done")}
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
      <div className="processor-qb__intro">
        <span className="processor-qb__intro-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <div className="processor-qb__intro-title">{title}</div>
          <div className="processor-qb__intro-sub">{sub}</div>
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
    <label className="processor-qb__field" data-invalid={invalid || undefined}>
      <span className="processor-qb__field-label">
        {label}
        {required && (
          <span className="processor-qb__req" aria-hidden>
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
      className="processor-qb__opt"
      data-on={on || undefined}
      onClick={onClick}
    >
      <span className="processor-qb__opt-title">{title}</span>
      <span className="processor-qb__opt-sub">{sub}</span>
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
      className="processor-qb__addon"
      data-on={on || undefined}
      onClick={onClick}
    >
      <span className="processor-qb__addon-box" aria-hidden>
        {on ? "✓" : ""}
      </span>
      <span>
        <span className="processor-qb__addon-title">{title}</span>
        <span className="processor-qb__addon-sub">{sub}</span>
      </span>
    </button>
  );
}

function estimateVolume(users: number): number {
  const raw = Math.max(0, users) * 5 * 230 * 1.75;
  const stepSize = raw >= 1_000_000 ? 50_000 : raw >= 100_000 ? 25_000 : 5_000;
  return Math.round(raw / stepSize) * stepSize;
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
  const qbr = cfg.qbr ? 800_000 : 0;
  return meterNet + support + deploy + indemnity + qbr;
}
