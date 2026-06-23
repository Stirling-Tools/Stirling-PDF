import { useTranslation } from "react-i18next";
import { Button, Chip, ProgressBar, StatTile } from "@shared/components";
import type { ApiClientDetail } from "@portal/api/sources";
import { pct } from "@portal/components/sources/format";
import "@portal/views/Sources.css";

export function ApiClientPanel({ d }: { d: ApiClientDetail }) {
  const { t } = useTranslation();
  return (
    <div className="portal-sources__detail">
      <div className="portal-sources__stat-grid">
        <StatTile
          label={t("sources.apiClient.secretKey")}
          value={<code>{d.maskedKey}</code>}
        />
        <StatTile
          label={t("sources.apiClient.rateLimit")}
          value={d.rateLimit}
        />
        <StatTile
          label={t("sources.apiClient.createdBy")}
          value={d.createdBy}
        />
        <StatTile
          label={t("sources.apiClient.lastRotated")}
          value={d.lastRotated}
        />
      </div>

      <div className="portal-sources__bar-row">
        <div className="portal-sources__bar-head">
          <span>{t("sources.apiClient.rateLimitWindow")}</span>
          <strong>
            {t("sources.apiClient.usedPct", { pct: pct(d.rateUsedPct) })}
          </strong>
        </div>
        <ProgressBar
          value={d.rateUsedPct}
          thresholded
          label={t("sources.apiClient.rateLimitUsage")}
        />
      </div>

      <div className="portal-sources__detail-section">
        <span className="portal-sources__detail-heading">
          {t("sources.apiClient.topEndpoints")}
        </span>
        <div className="portal-sources__endpoints">
          {d.endpoints.map((e) => (
            <div key={e.path} className="portal-sources__endpoint">
              <Chip
                tone={e.method === "GET" ? "green" : "blue"}
                size="sm"
                className="portal-sources__method"
              >
                {e.method}
              </Chip>
              <code className="portal-sources__endpoint-path">{e.path}</code>
              <span className="portal-sources__endpoint-calls">
                {t("sources.apiClient.callsPer24h", {
                  count: e.calls24h.toLocaleString(),
                })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* TODO(backend): wire to POST /v1/sources/{id}/rotate-key and
          DELETE /v1/sources/{id} — currently inert demo controls. */}
      <div className="portal-sources__detail-actions">
        <Button size="sm" variant="outline" accent="amber">
          {t("sources.apiClient.rotateKey")}
        </Button>
        <Button size="sm" variant="ghost" accent="red">
          {t("sources.apiClient.revoke")}
        </Button>
      </div>
    </div>
  );
}
