import { useTranslation } from "react-i18next";
import { Chip, StatTile } from "@shared/components";
import type { SourceView } from "@portal/api/sources";
import { Sparkline } from "@portal/components/sources/Sparkline";
import "@portal/views/Sources.css";

interface SourceDetailPanelProps {
  source: SourceView;
  /** The 30-day daily series for the sparkline, fetched per source when expanded. */
  docSeries: number[];
}

/**
 * Expanded detail for a source row: its config (key/value), the documents it has
 * fed into runs, and which policies reference it (a 0-reference source is called
 * out as safe to delete).
 */
export function SourceDetailPanel({
  source,
  docSeries,
}: SourceDetailPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="portal-sources__detail">
      {source.config.length > 0 && (
        <div className="portal-sources__stat-grid">
          {source.config.map((row) => (
            <StatTile key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      )}

      <div className="portal-sources__detail-section">
        <span className="portal-sources__detail-heading">
          {t("sources.detail.usedBy")}
        </span>
        {source.referencingPolicies.length === 0 ? (
          <p className="portal-sources__muted">
            {t("sources.detail.notReferenced")}
          </p>
        ) : (
          <div className="portal-sources__chips">
            {source.referencingPolicies.map((policy) => (
              <Chip key={policy.id} tone="blue" size="sm">
                {policy.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="portal-sources__detail-section">
        <span className="portal-sources__detail-heading">
          {t("sources.detail.documents")}
        </span>
        <div className="portal-sources__stat-grid">
          <StatTile
            label={t("sources.detail.docsTotal")}
            value={source.docsTotal.toLocaleString()}
          />
          <StatTile
            label={t("sources.detail.docs24h")}
            value={source.docs24h.toLocaleString()}
          />
          <StatTile
            label={t("sources.detail.docs30d")}
            value={source.docs30d.toLocaleString()}
          />
        </div>
        {docSeries.length > 0 && (
          <Sparkline
            data={docSeries}
            ariaLabel={t("sources.detail.docsTrend")}
          />
        )}
      </div>
    </div>
  );
}
