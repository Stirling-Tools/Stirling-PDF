import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import {
  DocumentsIcon,
  PoliciesIcon,
  UsersIcon,
} from "@portal/components/icons";
import { money } from "@portal/components/procurement/format";
import {
  buildQuote,
  type QuoteConfigInput,
  type QuoteResult,
} from "@portal/api/procurement";
import "@portal/views/Procurement.css";

const STEPS = ["volume", "plan", "details"] as const;
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
 * The enterprise quote builder — volume → commitment &amp; service → details. A client-side preview
 * drives the live footer total; the backend is authoritative. Completing the form generates the
 * quote directly (build + issue in one step) — the issued quote is then shown as the milestone, so
 * there's no redundant in-builder preview.
 */
export function QuoteBuilder({
  deployment,
  seats = 0,
  initial,
  onGenerate,
}: {
  deployment: string;
  /** Seat count from the trial setup; seeds the users field + volume estimate on a fresh quote. */
  seats?: number;
  /** Seed the builder from an existing quote's config (re-editing a quote). */
  initial?: QuoteConfigInput;
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
      businessName: "",
      contactName: "",
      contactEmail: "",
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
  const [eula, setEula] = useState(initial != null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof QuoteConfigInput>(k: K, v: QuoteConfigInput[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  // Re-editing an existing quote: everything is seeded, so jump to the last step (details) with the
  // agreement pre-accepted — one click re-generates, or Back to change a field. No walking from step 1.
  // Mount-only: seed the step from `initial` once (deliberately no deps).
  useEffect(() => {
    if (initial) setStep(STEPS.length - 1);
  }, []);

  const preview = previewAnnualMinor(cfg);
  const tcvPreview = preview * cfg.termYears + (cfg.training ? 750_000 : 0);

  // Fully filled → price + hand the draft to the parent to issue as a Stripe Quote (which then shows
  // as the milestone). No separate in-builder preview step.
  async function generate() {
    setBusy(true);
    try {
      onGenerate(await buildQuote(cfg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-qb">
      <div className="portal-qb__head">
        <h3 className="portal-qb__title">
          {t("portal.procurement.builder.title")}
        </h3>
        <span className="portal-qb__stepchip">
          {t("portal.procurement.builder.stepOf", {
            n: step + 1,
            total: STEPS.length,
          })}
        </span>
      </div>
      <div className="portal-qb__progress">
        {STEPS.map((s, i) => (
          <span key={s} data-on={i <= step || undefined} />
        ))}
      </div>

      <div className="portal-qb__body">
        {step === 0 && (
          <Step
            icon={<DocumentsIcon size={22} />}
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
                    if (!manualVolume) set("volume", estimateVolume(users));
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
          </Step>
        )}

        {step === 1 && (
          <Step
            icon={<PoliciesIcon size={22} />}
            title={t("portal.procurement.builder.s2Title")}
            sub={t("portal.procurement.builder.s2Sub")}
          >
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
                    sub={`×${s.mult} · ${t(`portal.procurement.builder.size_${s.key}Sub`)}`}
                    onClick={() => set("sizeMult", s.mult)}
                  />
                ))}
              </div>
            </Field>

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
                  sub={t("portal.procurement.builder.indemnificationSub")}
                  onClick={() => set("indemnification", !cfg.indemnification)}
                />
                <AddOn
                  on={cfg.training}
                  title={t("portal.procurement.builder.training")}
                  sub={t("portal.procurement.builder.trainingSub")}
                  onClick={() => set("training", !cfg.training)}
                />
                <AddOn
                  on={cfg.qbr}
                  title={t("portal.procurement.builder.qbr")}
                  sub={t("portal.procurement.builder.qbrSub")}
                  onClick={() => set("qbr", !cfg.qbr)}
                />
              </div>
            </Field>
          </Step>
        )}

        {step === 2 && (
          <Step
            icon={<UsersIcon size={22} />}
            title={t("portal.procurement.builder.s3Title")}
            sub={t("portal.procurement.builder.s3Sub")}
          >
            <div className="portal-qb__row">
              <Field label={t("portal.procurement.builder.businessName")}>
                <input
                  placeholder={t(
                    "portal.procurement.builder.businessNamePlaceholder",
                  )}
                  value={cfg.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                />
              </Field>
              <Field label={t("portal.procurement.builder.contactName")}>
                <input
                  placeholder={t(
                    "portal.procurement.builder.contactNamePlaceholder",
                  )}
                  value={cfg.contactName ?? ""}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              </Field>
            </div>
            <Field label={t("portal.procurement.builder.contactEmail")}>
              <input
                type="email"
                placeholder={t(
                  "portal.procurement.builder.contactEmailPlaceholder",
                )}
                value={cfg.contactEmail ?? ""}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field label={t("portal.procurement.builder.addressLine1")}>
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
              <Field label={t("portal.procurement.builder.city")}>
                <input
                  placeholder={t("portal.procurement.builder.cityPlaceholder")}
                  value={cfg.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field label={t("portal.procurement.builder.region")}>
                <input
                  placeholder={t(
                    "portal.procurement.builder.regionPlaceholder",
                  )}
                  value={cfg.region ?? ""}
                  onChange={(e) => set("region", e.target.value)}
                />
              </Field>
              <Field label={t("portal.procurement.builder.postalCode")}>
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
            <label className="portal-qb__eula">
              <input
                type="checkbox"
                checked={eula}
                onChange={(e) => setEula(e.target.checked)}
              />
              <span>{t("portal.procurement.builder.eula")}</span>
            </label>
          </Step>
        )}
      </div>

      <div className="portal-qb__foot">
        <span className="portal-qb__running">
          {t("portal.procurement.builder.running", {
            annual: money(preview),
            years: cfg.termYears,
            tcv: money(tcvPreview),
          })}
        </span>
        <div className="portal-qb__foot-btns">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              {t("portal.procurement.builder.back")}
            </Button>
          )}
          {step === 0 && (
            <Button
              variant="primary"
              accent="premium"
              disabled={cfg.volume <= 0}
              onClick={() => setStep(1)}
            >
              {t("portal.procurement.builder.continue")}
            </Button>
          )}
          {step === 1 && (
            <Button
              variant="primary"
              accent="premium"
              onClick={() => setStep(2)}
            >
              {t("portal.procurement.builder.continue")}
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="primary"
              accent="premium"
              loading={busy}
              disabled={!eula}
              onClick={generate}
            >
              {t("portal.procurement.builder.generate")}
            </Button>
          )}
        </div>
      </div>
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="portal-qb__field">
      <span className="portal-qb__field-label">{label}</span>
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
  return Math.round(raw / stepSize) * stepSize;
}

// Client mirror of the server pricing curve (ProcurementPricingService / quotePricing). The server
// is authoritative; this only drives the live footer estimate. Minor units (cents); the meter
// rounds to whole dollars, exactly like the backend, so the preview matches the issued quote.
function previewAnnualMinor(cfg: QuoteConfigInput): number {
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
