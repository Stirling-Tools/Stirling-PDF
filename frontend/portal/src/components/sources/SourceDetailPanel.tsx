import { useTranslation } from "react-i18next";
import { Chip, StatTile } from "@shared/components";
import type { SourceView } from "@portal/api/sources";
import "@portal/views/Sources.css";

/**
 * Expanded detail for a source row: its config (key/value) plus which policies
 * reference it. A 0-reference source is called out as safe to delete.
 */
export function SourceDetailPanel({ source }: { source: SourceView }) {
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

      <p className="portal-sources__muted">
        {t("sources.detail.docsUntracked")}
      </p>
    </div>
  );
}
