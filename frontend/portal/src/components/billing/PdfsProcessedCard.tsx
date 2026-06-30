import { useTranslation } from "react-i18next";
import { Card } from "@shared/components";
import type { Wallet, WalletCategoryBreakdown } from "@portal/api/billing";

/**
 * "PDFs processed this period" headline + a stacked split of where the metered
 * PDFs went. The split reuses the wallet's existing {@code categoryBreakdown}
 * (API / Agents / Automation — the same buckets the entitlement service tracks;
 * the "AI" bucket surfaces as "Agents" here). Real data only: the bar hides when
 * nothing metered has run yet.
 */
const SEGMENTS: ReadonlyArray<{
  key: keyof WalletCategoryBreakdown;
  labelKey: string;
  labelDefault: string;
  descKey: string;
  descDefault: string;
  cls: string;
}> = [
  {
    key: "api",
    labelKey: "billing.pdfsProcessed.segmentApiLabel",
    labelDefault: "API",
    descKey: "billing.pdfsProcessed.segmentApiDesc",
    descDefault: "Direct API requests",
    cls: "blue",
  },
  {
    key: "ai",
    labelKey: "billing.pdfsProcessed.segmentAgentsLabel",
    labelDefault: "Agents",
    descKey: "billing.pdfsProcessed.segmentAgentsDesc",
    descDefault: "AI agent actions",
    cls: "purple",
  },
  {
    key: "automation",
    labelKey: "billing.pdfsProcessed.segmentAutomationLabel",
    labelDefault: "Automation",
    descKey: "billing.pdfsProcessed.segmentAutomationDesc",
    descDefault: "Automations & pipelines",
    cls: "teal",
  },
];

export function PdfsProcessedCard({ wallet }: { wallet: Wallet }) {
  const { t } = useTranslation();
  const b = wallet.categoryBreakdown;
  const total = b.api + b.ai + b.automation;

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">
        {t("billing.pdfsProcessed.eyebrow", "PDFs processed this period")}
      </span>
      <div className="portal-billing__bignum-row">
        <span className="portal-billing__bignum">
          {wallet.billableUsed.toLocaleString()}
        </span>
        <span className="portal-billing__bignum-unit">
          {t("billing.pdfsProcessed.unit", "metered PDFs")}
        </span>
      </div>

      {total > 0 ? (
        <>
          <div
            className="portal-billing__segbar"
            role="img"
            aria-label={t(
              "billing.pdfsProcessed.segbarAriaLabel",
              "Metered PDFs split by category",
            )}
          >
            {SEGMENTS.map((s) =>
              b[s.key] > 0 ? (
                <span
                  key={s.key}
                  className={`portal-billing__segbar-seg portal-billing__segbar-seg--${s.cls}`}
                  style={{ width: `${(b[s.key] / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="portal-billing__seglegend">
            {SEGMENTS.map((s) => (
              <div className="portal-billing__seglegend-row" key={s.key}>
                <span
                  className={`portal-billing__dot portal-billing__dot--${s.cls}`}
                  aria-hidden
                />
                <span className="portal-billing__seglegend-label">
                  {t(s.labelKey, s.labelDefault)}
                </span>
                <span className="portal-billing__seglegend-val">
                  {t(
                    "billing.pdfsProcessed.legendValue",
                    "{{formatted}} PDFs",
                    {
                      count: b[s.key],
                      formatted: b[s.key].toLocaleString(),
                    },
                  )}
                </span>
                <span className="portal-billing__seglegend-desc">
                  {t(s.descKey, s.descDefault)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="portal-billing__section-sub">
          {t(
            "billing.pdfsProcessed.emptyPeriod",
            "No metered processing yet this period.",
          )}
        </p>
      )}
    </Card>
  );
}
