import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@shared/components";
import {
  buildQuote,
  type QuoteConfigInput,
  type QuoteResult,
} from "@portal/api/procurement";

/**
 * The enterprise quote builder: volume -> commitment &amp; service -> the itemised, server-priced
 * quote. Pricing is authoritative on the backend ({@code POST /quote}); this only collects the
 * config and renders what comes back. Accepting hands the quote up to the caller, which advances
 * the deal and kicks off checkout.
 */
export function QuoteBuilder({
  deployment,
  onAccept,
}: {
  deployment: string;
  onAccept: (quote: QuoteResult) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [cfg, setCfg] = useState<QuoteConfigInput>({
    volume: 1_000_000,
    users: 0,
    deployment,
    termYears: 3,
    serviceLevel: "standard",
    indemnification: false,
    training: false,
    qbr: false,
    currency: "USD",
  });
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof QuoteConfigInput>(k: K, v: QuoteConfigInput[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  async function toQuote() {
    setBusy(true);
    try {
      setQuote(await buildQuote(cfg));
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="loose" className="portal-proc__builder">
      <div className="portal-proc__builder-head">
        <h3 className="portal-proc__builder-title">
          {t("procurement.builder.title")}
        </h3>
        <span className="portal-proc__builder-step">
          {t("procurement.builder.stepOf", { n: step + 1, total: 3 })}
        </span>
      </div>

      {step === 0 && (
        <div className="portal-proc__builder-body">
          <label className="portal-proc__field">
            <span>{t("procurement.builder.volume")}</span>
            <input
              type="number"
              min={0}
              value={cfg.volume}
              onChange={(e) => set("volume", Number(e.target.value))}
            />
          </label>
          <label className="portal-proc__field">
            <span>{t("procurement.builder.users")}</span>
            <input
              type="number"
              min={0}
              value={cfg.users}
              onChange={(e) => set("users", Number(e.target.value))}
            />
          </label>
          <div className="portal-proc__builder-actions">
            <Button
              variant="gradient"
              accent="purple"
              onClick={() => setStep(1)}
            >
              {t("procurement.builder.next")}
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="portal-proc__builder-body">
          <label className="portal-proc__field">
            <span>{t("procurement.builder.term")}</span>
            <select
              value={cfg.termYears}
              onChange={(e) => set("termYears", Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  {t("procurement.builder.years", { count: y })}
                </option>
              ))}
            </select>
          </label>
          <label className="portal-proc__field">
            <span>{t("procurement.builder.serviceLevel")}</span>
            <select
              value={cfg.serviceLevel}
              onChange={(e) => set("serviceLevel", e.target.value)}
            >
              <option value="standard">
                {t("procurement.builder.slStandard")}
              </option>
              <option value="priority">
                {t("procurement.builder.slPriority")}
              </option>
              <option value="dedicated">
                {t("procurement.builder.slDedicated")}
              </option>
            </select>
          </label>
          <div className="portal-proc__builder-addons">
            <label>
              <input
                type="checkbox"
                checked={cfg.indemnification}
                onChange={(e) => set("indemnification", e.target.checked)}
              />
              {t("procurement.builder.indemnification")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={cfg.qbr}
                onChange={(e) => set("qbr", e.target.checked)}
              />
              {t("procurement.builder.qbr")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={cfg.training}
                onChange={(e) => set("training", e.target.checked)}
              />
              {t("procurement.builder.training")}
            </label>
          </div>
          <div className="portal-proc__builder-actions">
            <Button variant="ghost" onClick={() => setStep(0)}>
              {t("procurement.builder.back")}
            </Button>
            <Button
              variant="gradient"
              accent="purple"
              loading={busy}
              onClick={toQuote}
            >
              {t("procurement.builder.review")}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && quote && (
        <div className="portal-proc__builder-body">
          <div className="portal-proc__quote-head">
            <span className="portal-proc__quote-number">
              {quote.quoteNumber}
            </span>
            {quote.validUntil && (
              <span className="portal-proc__quote-valid">
                {t("procurement.builder.validUntil", {
                  date: quote.validUntil,
                })}
              </span>
            )}
          </div>
          <ul className="portal-proc__quote-lines">
            {quote.lineItems.map((li) => (
              <li key={li.key} data-kind={li.kind}>
                <span>{li.label}</span>
                <span>
                  {li.kind === "INCLUDED"
                    ? t("procurement.builder.included")
                    : money(li.amountMinor, quote.currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="portal-proc__quote-total">
            <span>{t("procurement.builder.annualTotal")}</span>
            <strong>{money(quote.annualNetMinor, quote.currency)}</strong>
          </div>
          <div className="portal-proc__quote-tcv">
            {t("procurement.builder.tcv", {
              value: money(quote.tcvMinor, quote.currency),
              years: cfg.termYears,
            })}
          </div>
          <div className="portal-proc__builder-actions">
            <Button variant="ghost" onClick={() => setStep(1)}>
              {t("procurement.builder.back")}
            </Button>
            <Button
              variant="gradient"
              accent="purple"
              onClick={() => onAccept(quote)}
            >
              {t("procurement.builder.accept")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
