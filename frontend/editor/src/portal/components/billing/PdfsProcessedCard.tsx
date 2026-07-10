import { useTranslation } from "react-i18next";
import { Card } from "@app/ui";
import type { Wallet, WalletCategoryBreakdown } from "@portal/api/billing";
import type { LocalUsage } from "@portal/api/link";

/**
 * "PDFs processed this period" headline + a stacked split of where the metered
 * PDFs went. The split reuses the wallet's existing {@code categoryBreakdown}
 * (API / Agents / Automation — the same buckets the entitlement service tracks;
 * the "AI" bucket surfaces as "Agents" here). Real data only: the bar hides when
 * nothing metered has run yet.
 *
 * <p>When a linked instance has accrued usage SaaS hasn't billed yet ({@code
 * unsynced}), it's folded into the headline + split so "current usage" reflects
 * work done since the last daily sync. The synced-vs-pending split is an internal
 * detail the customer doesn't need, so it's not surfaced — just the combined total.
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
    labelKey: "portal.billing.pdfsProcessed.segmentApiLabel",
    labelDefault: "API",
    descKey: "portal.billing.pdfsProcessed.segmentApiDesc",
    descDefault: "Direct API requests",
    cls: "blue",
  },
  {
    key: "ai",
    labelKey: "portal.billing.pdfsProcessed.segmentAgentsLabel",
    labelDefault: "Agents",
    descKey: "portal.billing.pdfsProcessed.segmentAgentsDesc",
    descDefault: "AI agent actions",
    cls: "purple",
  },
  {
    key: "automation",
    labelKey: "portal.billing.pdfsProcessed.segmentAutomationLabel",
    labelDefault: "Automation",
    descKey: "portal.billing.pdfsProcessed.segmentAutomationDesc",
    descDefault: "Automations & pipelines",
    cls: "teal",
  },
];

export function PdfsProcessedCard({
  wallet,
  unsynced,
}: {
  wallet: Wallet;
  unsynced?: LocalUsage | null;
}) {
  const { t } = useTranslation();
  // The count dimension (PDFs) is shown separately from the size-scaled meter
  // units. Instance-local unsynced usage (combined-billing) is units-only, so it
  // folds into the meter-units figure; the PDF count reflects synced processing.
  const pendingUnits = unsynced?.totalUnsyncedUnits ?? 0;
  const docs = wallet.docsProcessedThisPeriod;
  const uniquePdfs = wallet.uniquePdfsThisPeriod;
  const meterUnits = wallet.spendUnitsThisPeriod + pendingUnits;
  const sizeMultiplierPdfs = wallet.sizeMultiplierPdfsThisPeriod;

  // Per-category PDF counts drive the split ("this many PDFs ran automation / AI /
  // API"); units are surfaced in the aggregate summary line, not per bucket.
  const perDocs: WalletCategoryBreakdown = wallet.categoryDocs;
  const totalDocs = perDocs.api + perDocs.ai + perDocs.automation;
  const avgUnitsPerPdf = docs > 0 ? meterUnits / docs : 0;

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">
        {t(
          "portal.billing.pdfsProcessed.eyebrow",
          "PDFs processed this period",
        )}
      </span>
      <div className="portal-billing__bignum-row">
        <span className="portal-billing__bignum">{docs.toLocaleString()}</span>
        <span className="portal-billing__bignum-unit">
          {t("portal.billing.pdfsProcessed.unit", "PDFs")}
        </span>
      </div>

      {docs > 0 ? (
        <>
          <p className="portal-billing__section-sub">
            {t(
              "portal.billing.pdfsProcessed.summary",
              "{{unique}} unique · {{units}} meter units · {{avg}} avg units/PDF",
              {
                unique: uniquePdfs.toLocaleString(),
                units: meterUnits.toLocaleString(),
                avg: avgUnitsPerPdf.toFixed(1),
              },
            )}
          </p>
          {totalDocs > 0 ? (
            <>
              <div
                className="portal-billing__segbar"
                role="img"
                aria-label={t(
                  "portal.billing.pdfsProcessed.segbarAriaLabel",
                  "PDFs split by category",
                )}
              >
                {SEGMENTS.map((s) =>
                  perDocs[s.key] > 0 ? (
                    <span
                      key={s.key}
                      className={`portal-billing__segbar-seg portal-billing__segbar-seg--${s.cls}`}
                      style={{
                        width: `${(perDocs[s.key] / totalDocs) * 100}%`,
                      }}
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
                        "portal.billing.pdfsProcessed.legendValue",
                        "{{formatted}} PDFs",
                        {
                          count: perDocs[s.key],
                          formatted: perDocs[s.key].toLocaleString(),
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
          ) : null}
          {sizeMultiplierPdfs > 0 ? (
            <p className="portal-billing__section-sub">
              {t(
                "portal.billing.pdfsProcessed.sizeMultiplier",
                "{{formatted}} PDFs used a size multiplier",
                { formatted: sizeMultiplierPdfs.toLocaleString() },
              )}
            </p>
          ) : null}
        </>
      ) : (
        <p className="portal-billing__section-sub">
          {t(
            "portal.billing.pdfsProcessed.emptyPeriod",
            "No processing yet this period.",
          )}
        </p>
      )}
    </Card>
  );
}
