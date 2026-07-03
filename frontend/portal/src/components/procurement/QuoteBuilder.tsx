import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components";
import {
  buildQuote,
  type QuoteConfigInput,
  type QuoteResult,
} from "@portal/api/procurement";
import "@portal/views/Procurement.css";

const STEPS = ["volume", "plan", "details"] as const;
const TERM_DISCOUNT = [0, 0.05, 0.1, 0.12, 0.15]; // 1..5 years
const SLA_UPLIFT: Record<string, number> = {
  standard: 0,
  priority: 0.15,
  dedicated: 0.3,
};

/**
 * The enterprise quote builder — volume → commitment &amp; service → details. A client-side preview
 * drives the live footer total; the backend is authoritative. Completing the form generates the
 * quote directly (build + issue in one step) — the issued quote is then shown as the milestone, so
 * there's no redundant in-builder preview.
 */
export function QuoteBuilder({
  deployment,
  initial,
  onGenerate,
}: {
  deployment: string;
  /** Seed the builder from an existing quote's config (re-editing a quote). */
  initial?: QuoteConfigInput;
  /** Called with the priced DRAFT quote; the parent issues it as a Stripe Quote. */
  onGenerate: (quote: QuoteResult) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<QuoteConfigInput>(
    initial ?? {
      volume: 1_000_000,
      users: 0,
      deployment,
      termYears: 3,
      serviceLevel: "priority",
      indemnification: false,
      training: false,
      qbr: false,
      currency: "USD",
      businessName: "",
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
  useEffect(() => {
    if (initial) setStep(STEPS.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <h3 className="portal-qb__title">{t("procurement.builder.title")}</h3>
        <span className="portal-qb__stepchip">
          {t("procurement.builder.stepOf", { n: step + 1, total: STEPS.length })}
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
            icon="📦"
            title={t("procurement.builder.s1Title")}
            sub={t("procurement.builder.s1Sub")}
          >
            <div className="portal-qb__row">
              <Field label={t("procurement.builder.users")}>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 250"
                  value={cfg.users || ""}
                  onChange={(e) => {
                    const users = Number(e.target.value);
                    set("users", users);
                    if (!manualVolume) set("volume", estimateVolume(users));
                  }}
                />
              </Field>
              <Field label={t("procurement.builder.volume")}>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 1,000,000"
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
                ? t("procurement.builder.volEstimated", { count: cfg.users })
                : cfg.users > 0
                  ? t("procurement.builder.volManual")
                  : t("procurement.builder.volNoUsers")}
            </p>
          </Step>
        )}

        {step === 1 && (
          <Step
            icon="🛡"
            title={t("procurement.builder.s2Title")}
            sub={t("procurement.builder.s2Sub")}
          >
            <Field label={t("procurement.builder.term")}>
              <div className="portal-qb__pills">
                {[1, 2, 3, 4, 5].map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-on={cfg.termYears === y || undefined}
                    onClick={() => set("termYears", y)}
                  >
                    {t("procurement.builder.years", { count: y })}
                  </button>
                ))}
              </div>
              {TERM_DISCOUNT[cfg.termYears - 1] > 0 && (
                <p className="portal-qb__discount">
                  {t("procurement.builder.termDiscount", {
                    pct: Math.round(TERM_DISCOUNT[cfg.termYears - 1] * 100),
                  })}
                </p>
              )}
            </Field>

            <Field label={t("procurement.builder.serviceLevel")}>
              <div className="portal-qb__opts">
                <OptCard
                  on={cfg.serviceLevel === "standard"}
                  title={t("procurement.builder.slStandard")}
                  sub={t("procurement.builder.slStandardSub")}
                  onClick={() => set("serviceLevel", "standard")}
                />
                <OptCard
                  on={cfg.serviceLevel === "priority"}
                  title={t("procurement.builder.slPriority")}
                  sub={t("procurement.builder.slPrioritySub")}
                  onClick={() => set("serviceLevel", "priority")}
                />
                <OptCard
                  on={cfg.serviceLevel === "dedicated"}
                  title={t("procurement.builder.slDedicated")}
                  sub={t("procurement.builder.slDedicatedSub")}
                  onClick={() => set("serviceLevel", "dedicated")}
                />
              </div>
            </Field>

            <Field label={t("procurement.builder.addons")}>
              <div className="portal-qb__addons">
                <AddOn
                  on={cfg.indemnification}
                  title={t("procurement.builder.indemnification")}
                  sub={t("procurement.builder.indemnificationSub")}
                  onClick={() => set("indemnification", !cfg.indemnification)}
                />
                <AddOn
                  on={cfg.training}
                  title={t("procurement.builder.training")}
                  sub={t("procurement.builder.trainingSub")}
                  onClick={() => set("training", !cfg.training)}
                />
                <AddOn
                  on={cfg.qbr}
                  title={t("procurement.builder.qbr")}
                  sub={t("procurement.builder.qbrSub")}
                  onClick={() => set("qbr", !cfg.qbr)}
                />
              </div>
            </Field>
          </Step>
        )}

        {step === 2 && (
          <Step
            icon="👤"
            title={t("procurement.builder.s3Title")}
            sub={t("procurement.builder.s3Sub")}
          >
            <Field label={t("procurement.builder.businessName")}>
              <input
                placeholder={t("procurement.builder.businessNamePlaceholder")}
                value={cfg.businessName}
                onChange={(e) => set("businessName", e.target.value)}
              />
            </Field>
            <div className="portal-qb__row">
              <Field label={t("procurement.builder.country")}>
                <select
                  value={cfg.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  <option value="USD">United States (USD $)</option>
                  <option value="GBP">United Kingdom (GBP £)</option>
                  <option value="EUR">Germany (EUR €)</option>
                  <option value="EUR">France (EUR €)</option>
                </select>
              </Field>
            </div>
            <label className="portal-qb__eula">
              <input
                type="checkbox"
                checked={eula}
                onChange={(e) => setEula(e.target.checked)}
              />
              <span>{t("procurement.builder.eula")}</span>
            </label>
          </Step>
        )}
      </div>

      <div className="portal-qb__foot">
        <span className="portal-qb__running">
          {t("procurement.builder.running", {
            annual: money(preview, cfg.currency),
            years: cfg.termYears,
            tcv: money(tcvPreview, cfg.currency),
          })}
        </span>
        <div className="portal-qb__foot-btns">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              {t("procurement.builder.back")}
            </Button>
          )}
          {step === 0 && (
            <Button
              variant="gradient"
              accent="purple"
              disabled={cfg.volume <= 0}
              onClick={() => setStep(1)}
            >
              {t("procurement.builder.continue")}
            </Button>
          )}
          {step === 1 && (
            <Button
              variant="gradient"
              accent="purple"
              onClick={() => setStep(2)}
            >
              {t("procurement.builder.continue")}
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="gradient"
              accent="purple"
              loading={busy}
              disabled={!eula}
              onClick={generate}
            >
              {t("procurement.builder.generate")}
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
  icon: string;
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

function previewAnnualMinor(cfg: QuoteConfigInput): number {
  const perPdf = cfg.volume >= 5_000_000 ? 3 : cfg.volume >= 1_000_000 ? 4 : 5;
  const usage = Math.round(cfg.volume * perPdf);
  const withSla = Math.round(usage * (1 + (SLA_UPLIFT[cfg.serviceLevel] ?? 0)));
  const withInd = cfg.indemnification ? Math.round(withSla * 1.05) : withSla;
  const disc = Math.round(
    withInd * TERM_DISCOUNT[Math.min(Math.max(cfg.termYears, 1), 5) - 1],
  );
  return withInd - disc + (cfg.qbr ? 800_000 : 0);
}

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
